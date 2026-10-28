package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

// Phone: every two hours, the weather of the two cities (Open-Meteo); a notification for dust, rain, extreme heat
// or severe cold, each at most once in 12 hours for a city.
object Weather {
    private const val EVERY = 2 * 3_600_000L
    private const val AGAIN = 12 * 3_600_000L

    // the page sends the cities ([] when the alerts are off)
    fun watch(ctx: Context, json: String) {
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString("wxCities", json).apply()
        arm(ctx)
    }

    fun arm(ctx: Context) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = PendingIntent.getBroadcast(ctx, 11, Intent(ctx, WeatherReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            am.cancel(pi)
            if (cities(ctx).length() == 0 || Device.isTv(ctx)) return
            // keep the time already planned (opening the app often must not push the check away); the first one soon
            val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            var at = prefs.getLong("wxNext", 0L)
            if (at <= now || at > now + EVERY) { at = now + if (at == 0L) 60_000L else EVERY; prefs.edit().putLong("wxNext", at).apply() }
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (_: Exception) {}
    }

    private fun cities(ctx: Context): JSONArray = try {
        JSONArray(ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString("wxCities", "[]") ?: "[]")
    } catch (_: Exception) { JSONArray() }

    private fun get(url: String): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000; c.readTimeout = 15_000
        try { return JSONObject(c.inputStream.bufferedReader().use { it.readText() }) } finally { c.disconnect() }
    }

    private fun hm(t: Long, tz: String): String {
        val c = Calendar.getInstance(TimeZone.getTimeZone(tz)).apply { timeInMillis = t }
        return String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
    }

    // runs off the main thread
    fun check(ctx: Context) {
        val list = cities(ctx)
        val now = System.currentTimeMillis()
        for (i in 0 until list.length()) {
            val c = list.optJSONObject(i) ?: continue
            val name = c.optString("name"); val lat = c.optDouble("lat"); val lon = c.optDouble("lon")
            if (name.isEmpty() || lat.isNaN() || lon.isNaN()) continue
            try {
                val f = get("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                    "&hourly=temperature_2m,precipitation_probability&forecast_days=2&timezone=GMT&timeformat=unixtime")
                val tz = TimeZone.getDefault().id
                val h = f.getJSONObject("hourly")
                val times = h.getJSONArray("time"); val temp = h.getJSONArray("temperature_2m"); val rain = h.getJSONArray("precipitation_probability")
                // the next 6 hours: the hottest hour and the first hour of rain at 60% or more; the next 12: the coldest
                var hot = -99.0; var cold = 99.0; var wet = 0; var wetAt = 0L
                for (k in 0 until times.length()) {
                    val at = times.getLong(k) * 1000L
                    if (at < now - 3_600_000L || at > now + 12 * 3_600_000L) continue
                    val t = temp.optDouble(k)
                    if (!t.isNaN() && t < cold) cold = t
                    if (at > now + 6 * 3_600_000L) continue
                    if (!t.isNaN() && t > hot) hot = t
                    val p = rain.optInt(k, 0)
                    if (p >= 60 && wetAt == 0L) wetAt = at
                    if (p > wet) wet = p
                }
                if (hot >= 45) send(ctx, i, "heat", "$name: حرارة شديدة", "تصل إلى ${Math.round(hot)}° خلال الساعات القادمة. اشرب الماء وتجنّب الشمس.")
                if (cold <= 3) send(ctx, i, "cold", "$name: " + (if (cold <= 0) "صقيع" else "برد شديد"),
                    "تنخفض إلى ${Math.round(cold)}° خلال الساعات القادمة. تدفّأ جيدًا.")
                if (wetAt > 0) send(ctx, i, "rain", "$name: مطر متوقع", "احتمال المطر $wet% ابتداءً من الساعة ${hm(wetAt, tz)} تقريبًا.")
            } catch (_: Exception) {}
            try {
                val a = get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=$lat&longitude=$lon&current=dust")
                val dust = a.optJSONObject("current")?.optDouble("dust") ?: 0.0
                if (dust >= 1000) send(ctx, i, "dust", "$name: عاصفة غبارية", "الغبار كثيف الآن. خفّف الخروج وأغلق النوافذ.")
                else if (dust >= 400) send(ctx, i, "dust", "$name: غبار", "في الهواء غبار الآن.")
            } catch (_: Exception) {}
        }
    }

    // each kind for each city at most once in 12 hours
    private fun send(ctx: Context, city: Int, kind: String, title: String, text: String) {
        val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
        val key = "wxSent_${city}_$kind"
        val now = System.currentTimeMillis()
        if (now - prefs.getLong(key, 0L) < AGAIN) return
        prefs.edit().putLong(key, now).apply()
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val b = if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("weather", "تنبيهات الطقس", NotificationManager.IMPORTANCE_DEFAULT))
            Notification.Builder(ctx, "weather")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(ctx)
        }
        val open = PendingIntent.getActivity(ctx, 12, Intent(ctx, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_SCREEN, "weather").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = b.setSmallIcon(R.drawable.ic_moon).setContentTitle(title).setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text)).setContentIntent(open).setAutoCancel(true).build()
        try { nm.notify(20 + city * 10 + listOf("heat", "cold", "rain", "dust").indexOf(kind), n) } catch (_: SecurityException) {}
    }
}

class WeatherReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val done = goAsync()
        Thread {
            try { Weather.check(ctx) } catch (_: Exception) {}
            Weather.arm(ctx)
            done.finish()
        }.start()
    }
}
