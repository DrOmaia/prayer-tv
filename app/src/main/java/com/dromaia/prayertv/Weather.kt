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
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

// Phone: every two hours, the weather of the two cities (Open-Meteo); a notification for dust, rain, extreme heat
// or severe cold, each at most once in 12 hours for a city. The same alarm fetches the figures of the weather widgets
// while one of them is on the home screen (the second half of this object).
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
            // it runs for the alerts, or for a weather widget on the home screen
            if ((cities(ctx).length() == 0 && !Widgets.weatherPlaced(ctx)) || Device.isTv(ctx)) return
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

    private fun get(url: String, wait: Int = 15_000): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = wait; c.readTimeout = wait
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
                if (hot >= 45) send(ctx, i, "heat", Device.en(ctx, "$name: حرارة شديدة", "$name: extreme heat"), Device.en(ctx, "تصل إلى ${Math.round(hot)}° خلال الساعات القادمة. اشرب الماء وتجنّب الشمس.", "Up to ${Math.round(hot)}° in the coming hours. Drink water and avoid the sun."))
                if (cold <= 3) send(ctx, i, "cold", Device.en(ctx, "$name: " + (if (cold <= 0) "صقيع" else "برد شديد"), "$name: " + (if (cold <= 0) "frost" else "severe cold")),
                    Device.en(ctx, "تنخفض إلى ${Math.round(cold)}° خلال الساعات القادمة. تدفّأ جيدًا.", "Down to ${Math.round(cold)}° in the coming hours. Keep warm."))
                if (wetAt > 0) send(ctx, i, "rain", Device.en(ctx, "$name: مطر متوقع", "$name: rain expected"), Device.en(ctx, "احتمال المطر $wet% ابتداءً من الساعة ${hm(wetAt, tz)} تقريبًا.", "$wet% chance of rain from about ${hm(wetAt, tz)}."))
            } catch (_: Exception) {}
            try {
                val a = get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=$lat&longitude=$lon&current=dust")
                val dust = a.optJSONObject("current")?.optDouble("dust") ?: 0.0
                if (dust >= 1000) send(ctx, i, "dust", Device.en(ctx, "$name: عاصفة غبارية", "$name: dust storm"), Device.en(ctx, "الغبار كثيف الآن. خفّف الخروج وأغلق النوافذ.", "Heavy dust now. Limit going out and close the windows."))
                else if (dust >= 400) send(ctx, i, "dust", Device.en(ctx, "$name: غبار", "$name: dust"), Device.en(ctx, "في الهواء غبار الآن.", "Dust in the air now."))
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
            nm.createNotificationChannel(NotificationChannel("weather", Device.en(ctx, "تنبيهات الطقس", "Weather alerts"), NotificationManager.IMPORTANCE_DEFAULT))
            Notification.Builder(ctx, "weather")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(ctx)
        }
        // the alert opens the weather of its own city (a request code for each, so the two do not share one intent)
        val open = PendingIntent.getActivity(ctx, if (city == 1) 17 else 12, Intent(ctx, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_SCREEN, if (city == 1) "weatherb" else "weather").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = b.setSmallIcon(R.drawable.ic_moon).setContentTitle(title).setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text)).setContentIntent(open).setAutoCancel(true).build()
        try { nm.notify(20 + city * 10 + listOf("heat", "cold", "rain", "dust").indexOf(kind), n) } catch (_: SecurityException) {}
    }

    // ---------------- the weather widgets (Widgets draws them) ----------------
    // Android fetches their figures itself, so they stay right while the app is closed: with the two-hourly alarm, and,
    // when what is kept is older than half an hour, as soon as a widget is placed, the system refreshes one, or the page
    // sends the places. Nothing is fetched while no weather widget is on the home screen.
    const val FRESH = 30 * 60_000L              // figures older than this are fetched again when a widget or the page asks
    private const val NOW_FOR = 4 * 3_600_000L  // a temperature is «now» this long after its fetch; after that a dash
    private const val RETRY = 60_000L           // the same places are not asked for twice within a minute
    private const val DAY = 86_400_000L
    const val WIDGETS = "com.dromaia.prayertv.WEATHER_WIDGETS"

    // the page sends the two places ([{name, lat, lon}, …]: the city of the prayer times, then the second city) whether
    // the alerts are on or off; the widget data it sends right after draws the widgets with the names
    fun places(ctx: Context, json: String) {
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString("wxPlaces", json).apply()
        if (Widgets.weatherPlaced(ctx) && old(ctx, FRESH)) Thread { try { refresh(ctx, FRESH) } catch (_: Exception) {} }.start()
    }

    // a weather widget was placed, or the system refreshes one: the alarm runs from now on, and old figures are fetched
    // again. The fetch has its own broadcast (WeatherReceiver), so the widget's update never waits for the network.
    fun asked(ctx: Context) {
        arm(ctx)
        try {
            if (old(ctx, FRESH)) ctx.sendBroadcast(Intent(ctx, WeatherReceiver::class.java).setAction(WIDGETS))
        } catch (_: Exception) {}
    }

    private fun stored(ctx: Context, key: String): JSONArray = try {
        JSONArray(ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString(key, "[]") ?: "[]")
    } catch (_: Exception) { JSONArray() }

    // the figures kept for place i, if they were fetched for (about) the same spot: a city that was changed starts empty
    private fun kept(data: JSONArray, i: Int, p: JSONObject): JSONObject? {
        val w = data.optJSONObject(i) ?: return null
        return if (abs(w.optDouble("lat") - p.optDouble("lat")) + abs(w.optDouble("lon") - p.optDouble("lon")) <= 0.05) w else null
    }

    // true when a place has no figures, or figures older than `age`
    private fun old(ctx: Context, age: Long): Boolean {
        val list = stored(ctx, "wxPlaces"); val data = stored(ctx, "wxData")
        val now = System.currentTimeMillis()
        for (i in 0 until minOf(list.length(), 2)) {
            val p = list.optJSONObject(i) ?: continue
            val w = kept(data, i, p) ?: return true
            if (now - w.optLong("at") !in 0 until age) return true
        }
        return false
    }

    private val lock = Any()
    private var tried = ""
    private var triedAt = 0L

    // Runs off the main thread. When the figures kept are older than `age`: asks Open-Meteo for each place (a place whose
    // answer does not come keeps what it had). Then the widgets are drawn again whether anything came or not, so a «now»
    // that has grown old turns into a dash.
    fun refresh(ctx: Context, age: Long) {
        if (!Widgets.weatherPlaced(ctx)) return
        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
            val json = prefs.getString("wxPlaces", "") ?: ""
            // a fetch that ended while this one waited is enough; and the same places are not asked for twice within a minute
            if (old(ctx, age) && !(json == tried && System.currentTimeMillis() - triedAt in 0 until RETRY)) {
                tried = json; triedAt = System.currentTimeMillis()
                val list = stored(ctx, "wxPlaces"); val data = stored(ctx, "wxData"); val out = JSONArray()
                for (i in 0 until minOf(list.length(), 2)) {
                    val p = list.optJSONObject(i)
                    var w = if (p == null) null else kept(data, i, p)
                    val lat = p?.optDouble("lat") ?: Double.NaN; val lon = p?.optDouble("lon") ?: Double.NaN
                    if (!lat.isNaN() && !lon.isNaN()) try {
                        w = figures(get("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
                            "&current=temperature_2m,weather_code,is_day" +
                            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
                            "&forecast_days=6&timezone=auto", 10_000), lat, lon)
                    } catch (_: Exception) {}
                    out.put(w ?: JSONObject.NULL)
                }
                prefs.edit().putString("wxData", out.toString()).apply()
            }
        }
        Widgets.safeUpdate(ctx)
    }

    // what the widgets need of Open-Meteo's answer: the weather now, and each day under its number (the days since
    // 1 Jan 1970 in the place's own calendar), so «today» can be found again later without the phone's time zone
    private fun figures(f: JSONObject, lat: Double, lon: Double): JSONObject {
        val c = f.getJSONObject("current"); val d = f.getJSONObject("daily")
        val time = d.getJSONArray("time"); val code = d.optJSONArray("weather_code")
        val max = d.getJSONArray("temperature_2m_max"); val min = d.getJSONArray("temperature_2m_min")
        val rain = d.optJSONArray("precipitation_probability_max")
        val days = JSONArray()
        for (k in 0 until time.length()) {
            val hi = max.optDouble(k); val lo = min.optDouble(k)
            if (hi.isNaN() || lo.isNaN()) continue
            days.put(JSONObject().put("n", dayNumber(time.getString(k))).put("code", code?.optInt(k, -1) ?: -1)
                .put("max", Math.round(hi)).put("min", Math.round(lo)).put("p", rain?.optInt(k, 0) ?: 0))
        }
        return JSONObject().put("lat", lat).put("lon", lon).put("at", System.currentTimeMillis())
            .put("off", f.optLong("utc_offset_seconds")).put("t", Math.round(c.getDouble("temperature_2m")))
            .put("code", c.optInt("weather_code", -1)).put("day", c.optInt("is_day", 1)).put("days", days)
    }

    // the number of a day written YYYY-MM-DD
    private fun dayNumber(date: String): Long {
        val p = date.split("-")
        val c = GregorianCalendar(TimeZone.getTimeZone("UTC"))
        c.clear()
        c.set(p[0].toInt(), p[1].toInt() - 1, p[2].toInt())
        return c.timeInMillis / DAY
    }

    // one day of a place: its number, weather code, highest, lowest and chance of rain
    class Day(val n: Long, val code: Int, val max: Int, val min: Int, val rain: Int)

    // what a widget shows of a place at a moment. `now` is null when nothing is recent enough to be called «now»;
    // `today` is null when the figures hold nothing for the place's own today; `until` is the moment this changes by
    // itself («now» runs out, or the place's midnight comes)
    class Place(val name: String, val now: Int?, val code: Int, val byDay: Boolean, val today: Day?, val next: List<Day>, val until: Long)

    // the two places as the widgets show them at `at` (never throws; a place the page has not sent has an empty name)
    fun shown(ctx: Context, at: Long): List<Place> {
        val list = stored(ctx, "wxPlaces"); val data = stored(ctx, "wxData")
        return (0..1).map { i ->
            val p = list.optJSONObject(i)
            try { place(p, if (p == null) null else kept(data, i, p), at) }
            catch (_: Exception) { Place(p?.optString("name") ?: "", null, -1, true, null, emptyList(), Long.MAX_VALUE) }
        }
    }

    private fun place(p: JSONObject?, w: JSONObject?, at: Long): Place {
        val name = p?.optString("name") ?: ""
        if (w == null) return Place(name, null, -1, true, null, emptyList(), Long.MAX_VALUE)
        // the place's own calendar: the offset from UTC that came with the figures
        val off = w.optLong("off") * 1000L
        val today = Math.floorDiv(at + off, DAY)
        val a = w.optJSONArray("days")
        val days = (0 until (a?.length() ?: 0)).mapNotNull { a?.optJSONObject(it) }
            .map { Day(it.optLong("n"), it.optInt("code", -1), it.optInt("max"), it.optInt("min"), it.optInt("p")) }
        // a clock put back a little (a correction) does not make fresh figures old
        val age = at - w.optLong("at")
        val fresh = age > -5 * 60_000L && age < NOW_FOR
        val until = minOf(if (fresh) w.optLong("at") + NOW_FOR else Long.MAX_VALUE, (today + 1) * DAY - off)
        return Place(name, if (fresh) w.optInt("t") else null, w.optInt("code", -1), w.optInt("day", 1) != 0,
            days.firstOrNull { it.n == today }, days.filter { it.n > today }.take(5), until)
    }
}

class WeatherReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val done = goAsync()
        // a weather widget asked (it was placed, or the system refreshed it): its figures only, not the alerts
        if (intent.action == Weather.WIDGETS) {
            Thread { try { Weather.refresh(ctx, Weather.FRESH) } catch (_: Exception) {} finally { done.finish() } }.start()
            return
        }
        // the next check is planned first: if the system stops this one (no network, time limit) the chain goes on
        Weather.arm(ctx)
        // the widgets' figures on a thread of their own, so a slow answer never holds the alerts back
        val widgets = Thread { try { Weather.refresh(ctx, 0L) } catch (_: Exception) {} }
        widgets.start()
        Thread {
            try { Weather.check(ctx) } catch (_: Exception) {} finally {
                try { widgets.join() } catch (_: Exception) {}
                done.finish()
            }
        }.start()
    }
}
