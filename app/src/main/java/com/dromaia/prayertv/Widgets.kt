package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

// Home-screen widgets. The page sends the times of the coming days and the nearest occasions (Widgets.save);
// the widgets show them and refresh themselves at each prayer time and at midnight.
object Widgets {
    private const val KEY = "widget"
    private const val GOLD = "#F2CF8A"

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
        updateAll(ctx)
    }

    private fun data(ctx: Context): JSONObject? =
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let {
            try { JSONObject(it) } catch (_: Exception) { null }
        }

    private fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(ctx, 3,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)

    fun updateAll(ctx: Context) {
        val am = AppWidgetManager.getInstance(ctx)
        val now = System.currentTimeMillis()
        val d = data(ctx)
        d?.optString("tz")?.takeIf { it.isNotEmpty() }?.let { TZ = TimeZone.getTimeZone(it) }
        var nextChange = now + 30 * 60_000L
        am.getAppWidgetIds(ComponentName(ctx, PrayerWidget::class.java)).forEach { id ->
            val (rv, change) = prayerViews(ctx, d, now)
            nextChange = minOf(nextChange, change)
            am.updateAppWidget(id, rv)
        }
        am.getAppWidgetIds(ComponentName(ctx, EventWidget::class.java)).forEach { id ->
            am.updateAppWidget(id, eventViews(ctx, d, now))
        }
        nextChange = minOf(nextChange, nextMidnight(now))
        // refresh again only while there is a widget on the home screen
        val any = am.getAppWidgetIds(ComponentName(ctx, PrayerWidget::class.java)).isNotEmpty() ||
            am.getAppWidgetIds(ComponentName(ctx, EventWidget::class.java)).isNotEmpty()
        if (any) arm(ctx, nextChange)
    }

    private val NAME_IDS = intArrayOf(R.id.n0, R.id.n1, R.id.n2, R.id.n3, R.id.n4, R.id.n5)
    private val TIME_IDS = intArrayOf(R.id.t0, R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5)

    private fun prayerViews(ctx: Context, d: JSONObject?, now: Long): Pair<RemoteViews, Long> {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_prayer)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        val days = d?.optJSONArray("days")
        // today = the first day whose last time (Isha) has not passed; its next time is the next prayer
        var day: JSONObject? = null
        var next = -1
        if (days != null) for (i in 0 until days.length()) {
            val o = days.optJSONObject(i) ?: continue
            val at = o.optJSONArray("at") ?: continue
            if (at.length() < 6 || (o.optJSONArray("names")?.length() ?: 0) < 6) continue
            for (k in 0 until 6) if (at.getLong(k) > now) { day = o; next = k; break }
            if (day != null) break
        }
        if (day == null) {
            rv.setTextViewText(R.id.next_name, "افتح التطبيق مرة")
            rv.setTextViewText(R.id.next_time, "")
            return Pair(rv, now + 30 * 60_000L)
        }
        val names = day.getJSONArray("names")
        val at = day.getJSONArray("at")
        for (k in 0 until 6) {
            rv.setTextViewText(NAME_IDS[k], names.getString(k))
            rv.setTextViewText(TIME_IDS[k], hm(at.getLong(k)))
            val c = if (k == next) Color.parseColor(GOLD) else Color.WHITE
            rv.setTextColor(NAME_IDS[k], c)
            rv.setTextColor(TIME_IDS[k], c)
        }
        val nextAt = at.getLong(next)
        rv.setTextViewText(R.id.next_name, names.getString(next))
        rv.setTextViewText(R.id.next_time, hm(nextAt))
        rv.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + (nextAt - now), null, true)
        rv.setChronometerCountDown(R.id.countdown, true)
        return Pair(rv, nextAt)
    }

    private fun eventViews(ctx: Context, d: JSONObject?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_event)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        val events = d?.optJSONArray("events")
        val today = dayNumber(now)
        var shown = false
        if (events != null) for (i in 0 until events.length()) {
            val e = events.getJSONObject(i)
            val left = (dayNumber(e.getLong("at")) - today).toInt()
            if (left < 0) continue
            rv.setTextViewText(R.id.days, if (left == 0) "اليوم" else left.toString())
            rv.setTextViewText(R.id.unit, if (left == 0) "" else if (left in 3..10) "أيام" else "يوم")
            rv.setTextViewText(R.id.name, e.getString("name"))
            shown = true
            break
        }
        if (!shown) {
            rv.setTextViewText(R.id.days, "—")
            rv.setTextViewText(R.id.unit, "")
            rv.setTextViewText(R.id.name, "افتح التطبيق مرة")
        }
        return rv
    }

    // the time zone of the city chosen in the app (Riyadh until the page says otherwise)
    private var TZ: TimeZone = TimeZone.getTimeZone("Asia/Riyadh")
    private fun hm(t: Long): String {
        val c = Calendar.getInstance(TZ).apply { timeInMillis = t }
        return String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
    }
    private fun dayNumber(t: Long): Long = (t + TZ.getOffset(t)) / 86_400_000L
    private fun nextMidnight(now: Long): Long = (dayNumber(now) + 1) * 86_400_000L - TZ.getOffset(now) + 5_000L

    private fun arm(ctx: Context, at: Long) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(ctx, 2, Intent(ctx, PrayerWidget::class.java).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val when_ = at + 1_000L
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC, when_, pi)
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC, when_, pi)
    }

    const val ACTION = "com.dromaia.prayertv.WIDGET_UPDATE"
}

class PrayerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.updateAll(ctx)
    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == Widgets.ACTION) Widgets.updateAll(ctx)
    }
}

class EventWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.updateAll(ctx)
}
