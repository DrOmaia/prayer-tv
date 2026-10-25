package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos

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

    private val PROVIDERS = listOf(PrayerWidget::class.java, RingWidget::class.java, StripWidget::class.java, EventWidget::class.java)

    fun updateAll(ctx: Context) {
        val am = AppWidgetManager.getInstance(ctx)
        val now = System.currentTimeMillis()
        val d = data(ctx)
        d?.optString("tz")?.takeIf { it.isNotEmpty() }?.let { TZ = TimeZone.getTimeZone(it) }
        val st = state(d, now)
        // refresh at the next prayer time and at midnight; every 10 minutes for the progress bar and ring
        var nextChange = minOf(st?.nextAt ?: Long.MAX_VALUE, nextMidnight(now), now + 30 * 60_000L)
        am.getAppWidgetIds(ComponentName(ctx, PrayerWidget::class.java)).forEach { id ->
            am.updateAppWidget(id, prayerViews(ctx, d, st, now))
            nextChange = minOf(nextChange, now + 10 * 60_000L)
        }
        am.getAppWidgetIds(ComponentName(ctx, RingWidget::class.java)).forEach { id ->
            am.updateAppWidget(id, ringViews(ctx, st, now))
            nextChange = minOf(nextChange, now + 10 * 60_000L)
        }
        am.getAppWidgetIds(ComponentName(ctx, StripWidget::class.java)).forEach { id ->
            am.updateAppWidget(id, stripViews(ctx, st, now))
        }
        am.getAppWidgetIds(ComponentName(ctx, EventWidget::class.java)).forEach { id ->
            am.updateAppWidget(id, eventViews(ctx, d, now))
        }
        // refresh again only while there is a widget on the home screen
        if (PROVIDERS.any { am.getAppWidgetIds(ComponentName(ctx, it)).isNotEmpty() }) arm(ctx, nextChange)
    }

    // where we are in the day: the next time, the one before it, and today's entry (for the date and Ramadan)
    private class State(val names: JSONArray, val at: JSONArray, val next: Int, val prevAt: Long, val prevName: String, val today: JSONObject) {
        val nextAt: Long get() = at.getLong(next)
    }

    private fun state(d: JSONObject?, now: Long): State? {
        val days = d?.optJSONArray("days") ?: return null
        val nowDay = dayNumber(now)
        var today: JSONObject? = null
        var prev: JSONObject? = null
        for (i in 0 until days.length()) {
            val o = days.optJSONObject(i) ?: continue
            val at = o.optJSONArray("at") ?: continue
            val names = o.optJSONArray("names") ?: continue
            if (at.length() < 6 || names.length() < 6) continue
            if (today == null && dayNumber(at.getLong(0)) == nowDay) today = o
            for (k in 0 until 6) if (at.getLong(k) > now) {
                val p = prev
                val prevAt = if (k > 0) at.getLong(k - 1) else p?.getJSONArray("at")?.getLong(5) ?: -1L
                val prevName = if (k > 0) names.getString(k - 1) else p?.getJSONArray("names")?.getString(5) ?: ""
                return State(names, at, k, prevAt, prevName, today ?: o)
            }
            prev = o
        }
        return null
    }

    // the colour of the card follows the time of day: dawn, day, Asr, sunset (Maghrib → Isha), night
    private val BG = intArrayOf(R.drawable.widget_bg_fajr, R.drawable.widget_bg_day, R.drawable.widget_bg_asr,
        R.drawable.widget_bg_sunset, R.drawable.widget_bg_night)
    private val DISC = intArrayOf(R.drawable.widget_disc_fajr, R.drawable.widget_disc_day, R.drawable.widget_disc_asr,
        R.drawable.widget_disc_sunset, R.drawable.widget_disc_night)
    private fun period(st: State?): Int = when (st?.next) { 1 -> 0; 2, 3 -> 1; 4 -> 2; 5 -> 3; else -> 4 }

    private val NAME_IDS = intArrayOf(R.id.n0, R.id.n1, R.id.n2, R.id.n3, R.id.n4, R.id.n5)
    private val TIME_IDS = intArrayOf(R.id.t0, R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5)
    private val COL_IDS = intArrayOf(R.id.col0, R.id.col1, R.id.col2, R.id.col3, R.id.col4, R.id.col5)

    // next prayer, its time and the countdown (the same ids in the three prayer widgets)
    private fun putNext(rv: RemoteViews, st: State, now: Long) {
        rv.setTextViewText(R.id.next_name, st.names.getString(st.next))
        rv.setTextViewText(R.id.next_time, hm(st.nextAt))
        rv.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + (st.nextAt - now), null, true)
        rv.setChronometerCountDown(R.id.countdown, true)
    }

    private fun progress(st: State, now: Long): Int =
        if (st.prevAt <= 0) 0 else ((now - st.prevAt) * 1000 / maxOf(1L, st.nextAt - st.prevAt)).toInt().coerceIn(0, 1000)

    private fun putDate(ctx: Context, rv: RemoteViews, st: State) {
        rv.setTextViewText(R.id.hijri, st.today.optString("hijri"))
        val day = st.today.optInt("hday", 0)
        if (day > 0) rv.setImageViewBitmap(R.id.moon, moon(day, (18 * ctx.resources.displayMetrics.density).toInt()))
    }

    private fun prayerViews(ctx: Context, d: JSONObject?, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_prayer)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        rv.setInt(R.id.root, "setBackgroundResource", BG[period(st)])
        if (st == null) {
            rv.setTextViewText(R.id.next_name, "افتح التطبيق مرة")
            rv.setTextViewText(R.id.next_time, "")
            return rv
        }
        rv.setTextViewText(R.id.city, d?.optString("city") ?: "")
        putNext(rv, st, now)
        for (k in 0 until 6) {
            rv.setTextViewText(NAME_IDS[k], st.names.getString(k))
            rv.setTextViewText(TIME_IDS[k], hm(st.at.getLong(k)))
            rv.setInt(COL_IDS[k], "setBackgroundResource", if (k == st.next) R.drawable.widget_hl else 0)
        }
        // the time passed since the last prayer, like «العشاء +3:04:23»
        rv.setProgressBar(R.id.progress, 1000, progress(st, now), false)
        if (st.prevAt > 0) {
            rv.setTextViewText(R.id.cur_name, st.prevName)
            rv.setChronometer(R.id.elapsed, SystemClock.elapsedRealtime() - (now - st.prevAt), "+%s", true)
            rv.setChronometerCountDown(R.id.elapsed, false)
            rv.setViewVisibility(R.id.elapsed, View.VISIBLE)
        } else rv.setViewVisibility(R.id.elapsed, View.GONE)
        rv.setTextViewText(R.id.dua, st.today.optString("dua"))
        putInfo(rv, d, st, now)
        putDate(ctx, rv, st)
        rv.setTextViewText(R.id.greg, st.today.optString("greg"))
        return rv
    }

    // the second line of the flipper: time left to iftar in Ramadan, the time of the morning / evening adhkar,
    // otherwise the nearest occasion
    private fun putInfo(rv: RemoteViews, d: JSONObject?, st: State, now: Long) {
        val t = st.today.getJSONArray("at")
        val fajr = t.getLong(0); val sunrise = t.getLong(1); val asr = t.getLong(3); val maghrib = t.getLong(4)
        var until = 0L
        val label = when {
            st.today.optBoolean("ram") && now >= fajr && now < maghrib -> { until = maghrib; "متبقٍّ للإفطار" }
            now >= fajr && now < sunrise + 3_600_000L -> "وقت أذكار الصباح"
            now >= asr && now < maghrib -> "وقت أذكار المساء"
            else -> nearestEvent(d, now) ?: "سبحان الله وبحمده، سبحان الله العظيم"
        }
        rv.setTextViewText(R.id.info_label, label)
        if (until > 0) {
            rv.setChronometer(R.id.info_chrono, SystemClock.elapsedRealtime() + (until - now), null, true)
            rv.setChronometerCountDown(R.id.info_chrono, true)
            rv.setViewVisibility(R.id.info_chrono, View.VISIBLE)
        } else rv.setViewVisibility(R.id.info_chrono, View.GONE)
    }

    private fun nearestEvent(d: JSONObject?, now: Long): String? {
        val events = d?.optJSONArray("events") ?: return null
        val today = dayNumber(now)
        for (i in 0 until events.length()) {
            val e = events.optJSONObject(i) ?: continue
            val left = (dayNumber(e.optLong("at")) - today).toInt()
            if (left < 0) continue
            val name = e.optString("name")
            return when (left) {
                0 -> "$name اليوم"
                1 -> "$name غدًا"
                2 -> "$name بعد يومين"
                in 3..10 -> "$name بعد $left أيام"
                else -> "$name بعد $left يومًا"
            }
        }
        return null
    }

    private fun ringViews(ctx: Context, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_ring)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        rv.setInt(R.id.disc, "setBackgroundResource", DISC[period(st)])
        if (st == null) {
            rv.setTextViewText(R.id.next_name, "افتح التطبيق")
            return rv
        }
        putNext(rv, st, now)
        rv.setProgressBar(R.id.progress, 1000, progress(st, now), false)
        return rv
    }

    private fun stripViews(ctx: Context, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_strip)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        rv.setInt(R.id.root, "setBackgroundResource", BG[period(st)])
        if (st == null) {
            rv.setTextViewText(R.id.hijri, "افتح التطبيق مرة")
            return rv
        }
        putNext(rv, st, now)
        putDate(ctx, rv, st)
        return rv
    }

    // the moon of the Hijri day: a faint disc with its lit part (waxing on the right, waning on the left)
    private fun moon(day: Int, px: Int): Bitmap {
        val size = maxOf(px, 8)
        val b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        val cx = size / 2f; val cy = size / 2f; val r = size / 2f * 0.92f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = Color.argb(70, 255, 255, 255)
        c.drawCircle(cx, cy, r, paint)
        val f = minOf(day.toFloat(), 29.5f) / 29.53f
        val rx = abs(cos(2 * PI * f)).toFloat() * r
        val circle = RectF(cx - r, cy - r, cx + r, cy + r)
        val ell = RectF(cx - rx, cy - r, cx + rx, cy + r)
        val path = Path()
        path.moveTo(cx, cy - r)
        if (f < 0.5f) {
            path.arcTo(circle, -90f, 180f)
            path.arcTo(ell, 90f, if (f < 0.25f) -180f else 180f)
        } else {
            path.arcTo(circle, -90f, -180f)
            path.arcTo(ell, 90f, if (f > 0.75f) 180f else -180f)
        }
        path.close()
        paint.color = Color.parseColor(GOLD)
        c.drawPath(path, paint)
        return b
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

class RingWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.updateAll(ctx)
}

class StripWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.updateAll(ctx)
}

class EventWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.updateAll(ctx)
}
