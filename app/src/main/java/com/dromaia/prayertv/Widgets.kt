package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.os.SystemClock
import android.text.SpannableString
import android.text.SpannableStringBuilder
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.view.Gravity
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

    private fun lastError(ctx: Context, text: String) {
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString("widgetError", text.take(300)).apply()
    }
    fun error(ctx: Context): String = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString("widgetError", "") ?: ""

    // a provider's own update: never let an error reach the launcher
    fun safeUpdate(ctx: Context) { try { updateAll(ctx) } catch (e: Exception) { lastError(ctx, e.toString()) } }

    private fun data(ctx: Context): JSONObject? =
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString(KEY, null)?.let {
            try { JSONObject(it) } catch (_: Exception) { null }
        }

    private fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(ctx, 3,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)

    // opens the app on one of its screens (e.g. the date converter)
    fun openScreen(ctx: Context, screen: String, code: Int): PendingIntent = PendingIntent.getActivity(ctx, code,
        Intent(ctx, MainActivity::class.java).putExtra(MainActivity.EXTRA_SCREEN, screen)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private val PROVIDERS = listOf(PrayerWidget::class.java, RingWidget::class.java, StripWidget::class.java,
        EventWidget::class.java, MonthWidget::class.java, ConvertWidget::class.java, TimerWidget::class.java)

    // ---- timers (since / until a date): the page sends them; each timer widget remembers which one it shows
    fun timers(ctx: Context): List<Pair<String, String>> {
        val a = data(ctx)?.optJSONArray("timers") ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { it.optString("id") to it.optString("name") }
    }
    // how many of each kind are on the home screen (for the app's «الويدجت» screen)
    fun placedCounts(ctx: Context): String {
        val am = AppWidgetManager.getInstance(ctx)
        val out = JSONObject()
        mapOf("prayer" to PrayerWidget::class.java, "ring" to RingWidget::class.java, "strip" to StripWidget::class.java,
            "month" to MonthWidget::class.java, "convert" to ConvertWidget::class.java, "event" to EventWidget::class.java,
            "timer" to TimerWidget::class.java).forEach { (k, c) -> out.put(k, am.getAppWidgetIds(ComponentName(ctx, c)).size) }
        return out.toString()
    }
    // the timer widgets on the home screen and the timer each shows (for the app's «الويدجت» screen)
    fun placedTimers(ctx: Context): String {
        val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
        val out = JSONArray()
        AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, TimerWidget::class.java)).forEach { id ->
            val keys = rotateKeys(ctx, id)
            out.put(JSONObject().put("id", id).put("n", keys.size).put("timer", keys.firstOrNull()?.removePrefix("t:") ?: ""))
        }
        return out.toString()
    }
    // a button in the app puts a widget on the home screen: the phone asks «إضافة؟» and adds it.
    // For a timer widget the timers ticked in the app are kept until the new widget has its number.
    fun pin(ctx: Context, kind: String, keys: String): String {
        if (Build.VERSION.SDK_INT < 26) return "no"
        val am = AppWidgetManager.getInstance(ctx)
        if (!am.isRequestPinAppWidgetSupported) return "no"
        val cls = when (kind) {
            "prayer" -> PrayerWidget::class.java; "ring" -> RingWidget::class.java; "strip" -> StripWidget::class.java
            "month" -> MonthWidget::class.java; "convert" -> ConvertWidget::class.java; "event" -> EventWidget::class.java
            "timer" -> TimerWidget::class.java; else -> return "no"
        }
        var done: PendingIntent? = null
        if (kind == "timer") {
            ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit()
                .putString("rot_pending", keys).putLong("rot_pending_at", System.currentTimeMillis()).apply()
            done = PendingIntent.getBroadcast(ctx, 9, Intent(ctx, TimerWidget::class.java).setAction(PINNED),
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0))
        }
        return try { if (am.requestPinAppWidget(ComponentName(ctx, cls), null, done)) "ok" else "no" } catch (_: Exception) { "no" }
    }
    // the timers ticked before the phone added the widget (asked for in the last 10 minutes); used once
    fun takePending(ctx: Context, widgetId: Int): Boolean {
        val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
        val keys = (prefs.getString("rot_pending", "") ?: "").split("\n").filter { it.isNotEmpty() }
        val fresh = System.currentTimeMillis() - prefs.getLong("rot_pending_at", 0L) < 10 * 60_000L
        if (keys.isEmpty() || !fresh || rotateKeys(ctx, widgetId).isNotEmpty()) return false
        prefs.edit().remove("rot_pending").apply()
        setRotate(ctx, widgetId, keys)
        return true
    }
    const val PINNED = "com.dromaia.prayertv.TIMER_PINNED"

    fun setTimer(ctx: Context, widgetId: Int, timerId: String) = setRotate(ctx, widgetId, listOf("t:$timerId"))

    // ---- the timer widget: the timers ("t:" + id) and occasions ("e:" + name) chosen for it; more than one turn every 5 s
    fun rotateChoices(ctx: Context): List<Pair<String, String>> {
        val d = data(ctx) ?: return emptyList()
        val out = timers(ctx).map { ("t:" + it.first) to it.second }.toMutableList()
        val ev = d.optJSONArray("events")
        val now = System.currentTimeMillis()
        if (ev != null) for (i in 0 until ev.length()) {
            val e = ev.optJSONObject(i) ?: continue
            val n = e.optString("name")
            if (n.isNotEmpty() && e.optLong("at") >= now - 86_400_000L && out.none { it.first == "e:$n" }) out.add("e:$n" to n)
        }
        return out
    }
    fun rotateKeys(ctx: Context, widgetId: Int): List<String> {
        val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
        val keys = (prefs.getString("rot_$widgetId", "") ?: "").split("\n").filter { it.isNotEmpty() }
        // a widget placed before: the one timer it was showing
        val old = prefs.getString("timer_$widgetId", "") ?: ""
        return if (keys.isEmpty() && old.isNotEmpty()) listOf("t:$old") else keys
    }
    fun setRotate(ctx: Context, widgetId: Int, keys: List<String>) {
        ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString("rot_$widgetId", keys.joinToString("\n")).apply()
        updateAll(ctx)
    }

    private fun rotateViews(ctx: Context, d: JSONObject?, widgetId: Int, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_rotate)
        rv.setOnClickPendingIntent(R.id.root, openScreen(ctx, "timers", 8))
        val navy = Color.parseColor("#1E2A78")
        val ta = d?.optJSONArray("timers")
        val timers = (0 until (ta?.length() ?: 0)).mapNotNull { ta?.optJSONObject(it) }
        val ea = d?.optJSONArray("events")
        val events = (0 until (ea?.length() ?: 0)).mapNotNull { ea?.optJSONObject(it) }
        val wg = d?.optJSONObject("timerWg")
        val k = when (wg?.optString("font")) { "s" -> 0.8f; "l" -> 1.25f; "xl" -> 1.5f; else -> 1f }
        // each card: background, ink, the count and the line under it
        class Card(val bg: Int, val ink: Int, val count: CharSequence, val line: String, val dua: String = "")
        val cards = mutableListOf<Card>()
        for (key in rotateKeys(ctx, widgetId)) {
            if (key.startsWith("t:")) {
                val x = timers.firstOrNull { it.optString("id") == key.substring(2) } ?: continue
                val bg = try { Color.parseColor(x.optString("color")) } catch (_: Exception) { navy }
                val ink = try { Color.parseColor(x.optString("ink")) } catch (_: Exception) { Color.WHITE }
                val at = x.optLong("at"); val date = x.optString("date")
                cards.add(Card(bg, ink, bigNumbers(timerText(at, x.optString("unit"), now)),
                    (if (at <= now) "منذ " else "حتى ") + x.optString("name") + if (date.isNotEmpty()) " · $date" else "", x.optString("dua")))
            } else if (key.startsWith("e:")) {
                val e = events.firstOrNull { it.optString("name") == key.substring(2) } ?: continue
                val left = (dayNumber(e.optLong("at")) - dayNumber(now)).toInt()
                if (left < 0) continue
                val date = e.optString("date")
                cards.add(Card(navy, Color.WHITE, bigNumbers(if (left == 0) "اليوم" else tw(left.toLong(), "يوم", "يومان", "أيام", "يومًا")),
                    (if (left == 0) "" else "حتى ") + e.optString("name") + if (date.isNotEmpty()) " · $date" else ""))
            }
            if (cards.size == 12) break
        }
        if (cards.isEmpty()) cards.add(Card(navy, Color.WHITE, "عدّاد", "اضغط مطولًا ← الإعدادات لاختياره"))
        rv.removeAllViews(R.id.rot_flip) // the launcher keeps the old cards between refreshes
        cards.forEachIndexed { i, c ->
            val item = RemoteViews(ctx.packageName, R.layout.widget_rotate_item)
            item.setInt(R.id.rt_bg, "setColorFilter", c.bg)
            item.setTextViewTextSize(R.id.rt_count, TypedValue.COMPLEX_UNIT_SP, 30f * k)
            item.setTextViewTextSize(R.id.rt_line, TypedValue.COMPLEX_UNIT_SP, 14f * k)
            item.setTextViewText(R.id.rt_count, c.count)
            item.setTextViewText(R.id.rt_line, c.line)
            item.setViewVisibility(R.id.rt_line, if (wg?.optBoolean("name", true) != false) View.VISIBLE else View.GONE)
            item.setTextViewText(R.id.rt_dua, c.dua)
            item.setTextViewTextSize(R.id.rt_dua, TypedValue.COMPLEX_UNIT_SP, 12f * k)
            item.setViewVisibility(R.id.rt_dua, if (c.dua.isEmpty()) View.GONE else View.VISIBLE)
            // dots: where this card is among them
            item.setTextViewText(R.id.rt_dots, cards.indices.joinToString(" ") { if (it == i) "●" else "○" })
            item.setViewVisibility(R.id.rt_dots, if (cards.size > 1) View.VISIBLE else View.GONE)
            for (id in intArrayOf(R.id.rt_count, R.id.rt_line, R.id.rt_dua, R.id.rt_dots)) item.setTextColor(id, c.ink)
            rv.addView(R.id.rot_flip, item)
        }
        // continue the turn where it was (each refresh rebuilds the cards)
        rv.setDisplayedChild(R.id.rot_flip, ((now / 5_000L) % cards.size).toInt())
        return rv
    }

    private fun tw(n: Long, one: String, two: String, few: String, many: String) =
        "$n " + when { n == 1L -> one; n == 2L -> two; n in 3L..10L -> few; else -> many }

    // the count in the unit chosen (the same words as the app's screen)
    private fun timerText(at: Long, unit: String, now: Long): String {
        val from = minOf(at, now); val to = maxOf(at, now); val ms = to - from
        val day = 86_400_000L
        when (unit) {
            "minutes" -> return tw(ms / 60_000L, "دقيقة", "دقيقتان", "دقائق", "دقيقة")
            "hours" -> return tw(ms / 3_600_000L, "ساعة", "ساعتان", "ساعات", "ساعة")
            "days" -> return tw(ms / day, "يوم", "يومان", "أيام", "يومًا")
            "weeks" -> return tw(ms / day / 7, "أسبوع", "أسبوعان", "أسابيع", "أسبوعًا")
            "workdays" -> {
                val da = dayNumber(from); val days = dayNumber(to) - da
                var n = days / 7 * 5
                for (k in 1L..(days % 7)) {
                    // day number 0 was a Thursday (1 Jan 1970): Friday and Saturday are the weekend
                    val dw = Math.floorMod(da + days / 7 * 7 + k + 4, 7L) // 0 = Sunday
                    if (dw != 5L && dw != 6L) n++
                }
                return tw(n, "يوم عمل", "يوما عمل", "أيام عمل", "يوم عمل")
            }
        }
        val f = Calendar.getInstance(TZ).apply { timeInMillis = from }
        val t = Calendar.getInstance(TZ).apply { timeInMillis = to }
        var months = (t.get(Calendar.YEAR) - f.get(Calendar.YEAR)) * 12 + t.get(Calendar.MONTH) - f.get(Calendar.MONTH)
        fun addM(m: Int) = (f.clone() as Calendar).apply { add(Calendar.MONTH, m) }.timeInMillis
        if (addM(months) > to) months--
        if (unit == "months") return tw(months.toLong(), "شهر", "شهران", "أشهر", "شهرًا")
        val years = months / 12
        val rest = to - addM(years * 12)
        val d = rest / day; val h = rest % day / 3_600_000L; val m = rest % 3_600_000L / 60_000L
        val parts = mutableListOf<String>()
        if (years > 0) parts.add(tw(years.toLong(), "سنة", "سنتان", "سنوات", "سنة"))
        if (years > 0 || d > 0) parts.add(tw(d, "يوم", "يومان", "أيام", "يومًا"))
        parts.add(tw(h, "ساعة", "ساعتان", "ساعات", "ساعة"))
        parts.add(tw(m, "دقيقة", "دقيقتان", "دقائق", "دقيقة"))
        return parts.joinToString("  ")
    }

    // numbers large, unit words smaller
    private fun bigNumbers(text: String): CharSequence {
        val sp = SpannableString(text)
        var i = 0
        while (i < text.length) {
            if (!text[i].isDigit()) {
                val j = i
                while (i < text.length && !text[i].isDigit()) i++
                sp.setSpan(RelativeSizeSpan(0.5f), j, i, 0)
            } else i++
        }
        return sp
    }

    // the look chosen in the app's settings (the same for all widgets): background, transparency, text size,
    // accent colour and the parts shown on «مواقيت اليوم»
    private class Style(o: JSONObject?) {
        val dark = o?.optString("bg") == "dark"
        val alpha = 255 - 255 * (o?.optInt("clear", 0) ?: 0).coerceIn(0, 100) / 100
        val scale = when (o?.optString("font")) { "s" -> 0.88f; "l" -> 1.15f; else -> 1f }
        val accent: Int = Color.parseColor(when (o?.optString("accent")) {
            "white" -> "#FFFFFF"; "green" -> "#8FE3A8"; "sky" -> "#8FD3FF"; else -> GOLD })
        val city = o?.optBoolean("city", true) ?: true
        val prog = o?.optBoolean("prog", true) ?: true
        val line = o?.optBoolean("line", true) ?: true
        val date = o?.optBoolean("date", true) ?: true
        // «مواقيت اليوم»: the place of each part of the top line ('r' right, 'c' centre, 'l' left) and of the changing line,
        // and the size of each part (the next prayer with the times and the date · the time left · the occasions · the line)
        val posNext = o?.optString("posNext").takeUnless { it.isNullOrEmpty() } ?: "r"
        val posEv = o?.optString("posEv").takeUnless { it.isNullOrEmpty() } ?: "c"
        val posLeft = o?.optString("posLeft").takeUnless { it.isNullOrEmpty() } ?: "l"
        val posLine = o?.optString("posLine").takeUnless { it.isNullOrEmpty() } ?: "c"
        private val k: (String) -> Float = { key -> when (o?.optString(key)) { "s" -> 0.85f; "m" -> 1f; "l" -> 1.2f; "xl" -> 1.45f; else -> scale } }
        val kMain = k("fMain"); val kLeft = k("fLeft"); val kEv = k("fEv"); val kLine = k("fLine")
    }

    private fun putBg(rv: RemoteViews, sty: Style, res: Int) {
        rv.setImageViewResource(R.id.bg, res)
        rv.setInt(R.id.bg, "setImageAlpha", sty.alpha)
    }

    private fun sizes(rv: RemoteViews, sty: Style, list: List<Pair<Int, Float>>) {
        if (sty.scale != 1f) list.forEach { (id, sp) -> rv.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * sty.scale) }
    }

    private fun tint(rv: RemoteViews, id: Int, color: Int) {
        if (Build.VERSION.SDK_INT >= 31) rv.setColorStateList(id, "setProgressTintList", ColorStateList.valueOf(color))
    }

    fun updateAll(ctx: Context) {
        val am = AppWidgetManager.getInstance(ctx)
        val now = System.currentTimeMillis()
        val d = data(ctx)
        d?.optString("tz")?.takeIf { it.isNotEmpty() }?.let { TZ = TimeZone.getTimeZone(it) }
        val st = state(d, now)
        // each kind of widget has its own look (chosen in the app's «الويدجت» screen); older data: one look for all
        fun styleOf(kind: String) = Style(d?.optJSONObject("styles")?.optJSONObject(kind) ?: d?.optJSONObject("style"))
        // refresh at the next prayer time and at midnight; every 10 minutes for the progress bar and ring
        var nextChange = minOf(st?.nextAt ?: Long.MAX_VALUE, nextMidnight(now), now + 30 * 60_000L)
        // each widget on its own: a failure in one never stops the others (the last error is kept for the settings)
        fun each(cls: Class<*>, build: () -> RemoteViews): Boolean {
            val ids = am.getAppWidgetIds(ComponentName(ctx, cls))
            ids.forEach { id ->
                try { am.updateAppWidget(id, build()) } catch (e: Exception) { lastError(ctx, cls.simpleName + ": " + e) }
            }
            return ids.isNotEmpty()
        }
        if (each(PrayerWidget::class.java) { prayerViews(ctx, d, styleOf("prayer"), st, now) }) nextChange = minOf(nextChange, now + 10 * 60_000L)
        if (each(RingWidget::class.java) { ringViews(ctx, styleOf("ring"), st, now) }) nextChange = minOf(nextChange, now + 10 * 60_000L)
        each(StripWidget::class.java) { stripViews(ctx, styleOf("strip"), st, now) }
        each(MonthWidget::class.java) { monthViews(ctx, d, styleOf("month"), st, now) }
        each(ConvertWidget::class.java) { convertViews(ctx, styleOf("convert"), st) }
        each(EventWidget::class.java) { eventViews(ctx, d, now) }
        // timers count minutes: refresh at the next minute while one is on the home screen
        am.getAppWidgetIds(ComponentName(ctx, TimerWidget::class.java)).forEach { id ->
            try { am.updateAppWidget(id, rotateViews(ctx, d, id, now)) } catch (e: Exception) { lastError(ctx, "TimerWidget: $e") }
            nextChange = minOf(nextChange, now - now % 60_000L + 60_000L)
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
    private fun bgOf(sty: Style, st: State?): Int = if (sty.dark) R.drawable.widget_bg_dark else BG[period(st)]
    private fun period(st: State?): Int = when (st?.next) { 1 -> 0; 2, 3 -> 1; 4 -> 2; 5 -> 3; else -> 4 }

    private val NAME_IDS = intArrayOf(R.id.n0, R.id.n1, R.id.n2, R.id.n3, R.id.n4, R.id.n5)
    private val TIME_IDS = intArrayOf(R.id.t0, R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5)
    private val COL_IDS = intArrayOf(R.id.col0, R.id.col1, R.id.col2, R.id.col3, R.id.col4, R.id.col5)
    private val NOW_IDS = intArrayOf(R.id.now0, R.id.now1, R.id.now2, R.id.now3, R.id.now4, R.id.now5)
    private val NOWF_IDS = intArrayOf(R.id.nowf0, R.id.nowf1, R.id.nowf2, R.id.nowf3, R.id.nowf4, R.id.nowf5)

    // next prayer, its time and the countdown (the same ids in the three prayer widgets)
    private fun putNext(rv: RemoteViews, sty: Style, st: State, now: Long) {
        rv.setTextColor(R.id.countdown, sty.accent)
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

    private fun prayerViews(ctx: Context, d: JSONObject?, sty: Style, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_prayer)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        putBg(rv, sty, bgOf(sty, st))
        // the three parts of the top line in the places chosen (two parts on one place: the other moves to the free one)
        val want = listOf(R.layout.widget_part_next to sty.posNext, R.layout.widget_part_events to sty.posEv, R.layout.widget_part_left to sty.posLeft)
        val free = mutableListOf("r", "c", "l")
        val placed = mutableMapOf<Int, String>()
        want.forEach { (lay, pos) -> if (pos in free) { placed[lay] = pos; free.remove(pos) } }
        want.forEach { (lay, _) -> if (lay !in placed) { placed[lay] = free.removeAt(0) } }
        val gravity = mapOf("r" to Gravity.START, "c" to Gravity.CENTER_HORIZONTAL, "l" to Gravity.END)
        // the launcher keeps the widget's views between refreshes: empty the three places first, or the parts pile up
        for (slot in intArrayOf(R.id.slot_r, R.id.slot_c, R.id.slot_l)) rv.removeAllViews(slot)
        placed.forEach { (lay, pos) ->
            rv.addView(when (pos) { "r" -> R.id.slot_r; "c" -> R.id.slot_c; else -> R.id.slot_l }, RemoteViews(ctx.packageName, lay))
        }
        val gNext = gravity[placed[R.layout.widget_part_next]] ?: Gravity.START
        val gEv = gravity[placed[R.layout.widget_part_events]] ?: Gravity.CENTER_HORIZONTAL
        rv.setInt(R.id.part_next, "setGravity", gNext or Gravity.CENTER_VERTICAL)
        rv.setInt(R.id.part_left, "setGravity", (gravity[placed[R.layout.widget_part_left]] ?: Gravity.END) or Gravity.CENTER_VERTICAL)
        for (id in intArrayOf(R.id.ev_box0, R.id.ev_box1, R.id.ev_box2)) rv.setInt(id, "setGravity", gEv)
        val gLine = gravity[sty.posLine] ?: Gravity.CENTER_HORIZONTAL
        rv.setInt(R.id.dua, "setGravity", gLine or Gravity.CENTER_VERTICAL)
        rv.setInt(R.id.info_row, "setGravity", gLine or Gravity.CENTER_VERTICAL)
        // each part in its own size
        fun size(k: Float, list: List<Pair<Int, Float>>) = list.forEach { (id, sp) -> rv.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * k) }
        size(sty.kMain, listOf(R.id.city to 12f, R.id.next_name to 24f, R.id.next_time to 17f, R.id.hijri to 13f, R.id.greg to 13f) +
            NAME_IDS.map { it to 13f } + TIME_IDS.map { it to 17f })
        size(sty.kLeft, listOf(R.id.left_label to 12f, R.id.countdown to 24f))
        size(sty.kEv, listOf(R.id.ev0n to 17f, R.id.ev1n to 17f, R.id.ev2n to 17f, R.id.ev0d to 17f, R.id.ev1d to 17f, R.id.ev2d to 17f))
        size(sty.kLine, listOf(R.id.dua to 13f, R.id.info_label to 13f, R.id.info_chrono to 14f))
        rv.setViewVisibility(R.id.city, if (sty.city) View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.progress, if (sty.prog) View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.flip, if (sty.line) View.VISIBLE else View.GONE)
        rv.setViewVisibility(R.id.foot, if (sty.date) View.VISIBLE else View.GONE)
        // the date line's own shade fades with the background
        rv.setInt(R.id.foot, "setBackgroundResource", if (sty.alpha < 128) 0 else R.drawable.widget_foot)
        tint(rv, R.id.progress, sty.accent)
        rv.setTextColor(R.id.info_chrono, sty.accent)
        if (st == null) {
            rv.setTextViewText(R.id.next_name, "افتح التطبيق مرة")
            rv.setTextViewText(R.id.next_time, "")
            return rv
        }
        rv.setTextViewText(R.id.city, d?.optString("city") ?: "")
        putNext(rv, sty, st, now)
        for (k in 0 until 6) {
            rv.setTextViewText(NAME_IDS[k], st.names.getString(k))
            rv.setTextViewText(TIME_IDS[k], hm(st.at.getLong(k)))
            // one mark only: the time we are in (its frame below); the next prayer is named at the top
            rv.setTextColor(TIME_IDS[k], Color.WHITE)
            rv.setInt(COL_IDS[k], "setBackgroundResource", 0)
        }
        // the time we are in (sunrise too, until Dhuhr): a thin frame that fades in and out slowly
        val cur = (st.next + 5) % 6
        for (k in 0 until 6) {
            rv.setViewVisibility(NOW_IDS[k], if (k == cur) View.VISIBLE else View.GONE)
            rv.setInt(NOWF_IDS[k], "setColorFilter", sty.accent)
            rv.setInt(NOWF_IDS[k], "setImageAlpha", 150)
        }
        rv.setProgressBar(R.id.progress, 1000, progress(st, now), false)
        putEvents(rv, d, sty, now)
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

    // the coming occasions in the middle of the top line: name, then the days left (up to three, in turn)
    private val EV_N = intArrayOf(R.id.ev0n, R.id.ev1n, R.id.ev2n)
    private val EV_D = intArrayOf(R.id.ev0d, R.id.ev1d, R.id.ev2d)
    private fun daysLeft(left: Int): String = when (left) {
        0 -> "اليوم"; 1 -> "غدًا"; 2 -> "بعد يومين"; in 3..10 -> "بعد $left أيام"; else -> "بعد $left يومًا"
    }
    private fun putEvents(rv: RemoteViews, d: JSONObject?, sty: Style, now: Long) {
        val list = mutableListOf<Pair<String, String>>()
        val events = d?.optJSONArray("events")
        val today = dayNumber(now)
        if (events != null) for (i in 0 until events.length()) {
            val e = events.optJSONObject(i) ?: continue
            val left = (dayNumber(e.optLong("at")) - today).toInt()
            if (left < 0) continue
            list.add(e.optString("name") to daysLeft(left))
            if (list.size == 3) break
        }
        rv.setViewVisibility(R.id.ev_flip, if (list.isEmpty()) View.INVISIBLE else View.VISIBLE)
        if (list.isEmpty()) return
        for (k in 0 until 3) {
            val (n, l) = list[k % list.size]
            rv.setTextViewText(EV_N[k], n)
            rv.setTextViewText(EV_D[k], l)
            rv.setTextColor(EV_N[k], sty.accent)
        }
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

    private fun ringViews(ctx: Context, sty: Style, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_ring)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        putBg(rv, sty, if (sty.dark) R.drawable.widget_disc_dark else DISC[period(st)])
        sizes(rv, sty, listOf(R.id.next_name to 17f, R.id.countdown to 19f, R.id.next_time to 13f))
        tint(rv, R.id.progress, sty.accent)
        if (st == null) {
            rv.setTextViewText(R.id.next_name, "افتح التطبيق")
            return rv
        }
        putNext(rv, sty, st, now)
        rv.setProgressBar(R.id.progress, 1000, progress(st, now), false)
        return rv
    }

    private fun stripViews(ctx: Context, sty: Style, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_strip)
        rv.setOnClickPendingIntent(R.id.root, openApp(ctx))
        putBg(rv, sty, bgOf(sty, st))
        sizes(rv, sty, listOf(R.id.hijri to 14f, R.id.next_name to 17f, R.id.next_time to 14f, R.id.countdown to 18f))
        if (st == null) {
            rv.setTextViewText(R.id.hijri, "افتح التطبيق مرة")
            return rv
        }
        putNext(rv, sty, st, now)
        putDate(ctx, rv, st)
        return rv
    }

    // ---- the Hijri month (4x4): the page sends the current Hijri month and the next ones, each day with its
    // Gregorian date, season (ram / eid / arafah / hajj / ashura, or the white days), Monday / Thursday and occasion
    private val CELL_BG = mapOf("ram" to R.drawable.wm_ram, "eid" to R.drawable.wm_eid, "arafah" to R.drawable.wm_arafah,
        "hajj" to R.drawable.wm_hajj, "ashura" to R.drawable.wm_ashura, "white" to R.drawable.wm_white)
    private val CELL_COLOR = mapOf("ram" to "#A88BE8", "eid" to "#4FD1C1", "arafah" to "#F5A066", "hajj" to "#F5C98E",
        "ashura" to "#7FB0EE", "white" to "#E8E8E8")

    private fun monthViews(ctx: Context, d: JSONObject?, sty: Style, st: State?, now: Long): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_month)
        rv.setOnClickPendingIntent(R.id.root, openScreen(ctx, "calendar", 5))
        putBg(rv, sty, bgOf(sty, st))
        val months = d?.optJSONArray("months")
        if (months == null || months.length() == 0) {
            rv.setTextViewText(R.id.m_title, "افتح التطبيق مرة")
            return rv
        }
        val today = dayNumber(now)
        var m = months.getJSONObject(months.length() - 1)
        for (i in 0 until months.length()) {
            val o = months.optJSONObject(i) ?: continue
            val c = o.optJSONArray("cells") ?: continue
            if (c.length() == 0) continue
            if (today <= dayNumber(c.getJSONObject(c.length() - 1).getLong("ts"))) { m = o; break }
        }
        val cells = m.getJSONArray("cells")
        val first = m.optInt("first")
        rv.setTextViewText(R.id.m_title, m.optString("title"))
        rv.setTextViewText(R.id.m_sub, m.optString("sub"))
        val res = ctx.resources
        val pkg = ctx.packageName
        fun id(n: String) = res.getIdentifier(n, "id", pkg)
        val sizeList = mutableListOf(R.id.m_title to 17f, R.id.m_sub to 12f, R.id.m_legend to 10f)
        for (i in 0 until 7) sizeList.add(id("wd$i") to 10f)
        var todayDay = 0
        for (i in 0 until 42) {
            val ci = id("c$i"); val hi = id("h$i"); val gi = id("g$i"); val ki = id("k$i")
            sizeList.add(hi to 15f); sizeList.add(gi to 9f); sizeList.add(ki to 8f)
            val n = i - first
            if (n < 0 || n >= cells.length()) { rv.setViewVisibility(ci, View.INVISIBLE); continue }
            rv.setViewVisibility(ci, View.VISIBLE)
            val c = cells.getJSONObject(n)
            val isToday = dayNumber(c.getLong("ts")) == today
            if (isToday) todayDay = c.optInt("h")
            val k = c.optString("k")
            rv.setInt(ci, "setBackgroundResource", CELL_BG[k] ?: if (isToday) R.drawable.wm_today else 0)
            val h = SpannableString(c.optInt("h").toString())
            if (isToday) h.setSpan(UnderlineSpan(), 0, h.length, 0)
            rv.setTextViewText(hi, h)
            rv.setTextColor(hi, if (isToday) sty.accent else Color.WHITE)
            rv.setTextViewText(gi, c.optInt("g").toString())
            // a star on an occasion (accent colour), a dot under Mondays and Thursdays
            val ev = c.optString("ev").isNotEmpty()
            rv.setTextViewText(ki, if (ev) "★" else if (c.optBoolean("mt")) "•" else " ")
            rv.setTextColor(ki, if (ev) sty.accent else Color.WHITE)
        }
        for (r in 0 until 6) rv.setViewVisibility(id("r$r"), if (r * 7 < first + cells.length()) View.VISIBLE else View.GONE)
        sizes(rv, sty, sizeList)
        // legend: the colours of this month's seasons, then the white days, the dot and the star
        val lg = SpannableStringBuilder()
        fun add(mark: String, color: Int, text: String) {
            if (lg.isNotEmpty()) lg.append("   ")
            val s0 = lg.length
            lg.append(mark)
            lg.setSpan(ForegroundColorSpan(color), s0, lg.length, 0)
            lg.append(" ").append(text)
        }
        m.optJSONArray("seasons")?.let { a ->
            for (i in 0 until a.length()) {
                val x = a.optJSONArray(i) ?: continue
                add("■", Color.parseColor(CELL_COLOR[x.optString(0)] ?: "#FFFFFF"), x.optString(1))
            }
        }
        if (m.optBoolean("white")) add("■", Color.parseColor("#E8E8E8"), "الأيام البيض")
        add("•", Color.WHITE, "الاثنين والخميس")
        if (m.optBoolean("events")) add("★", sty.accent, "مناسبة")
        rv.setTextViewText(R.id.m_legend, lg)
        if (todayDay > 0) rv.setImageViewBitmap(R.id.moon, moon(todayDay, (18 * ctx.resources.displayMetrics.density).toInt()))
        return rv
    }

    // ---- the date converter icon (1x1): today's Hijri day on a small calendar; opens the converter
    private fun convertViews(ctx: Context, sty: Style, st: State?): RemoteViews {
        val rv = RemoteViews(ctx.packageName, R.layout.widget_convert)
        rv.setOnClickPendingIntent(R.id.root, openScreen(ctx, "convert", 6))
        putBg(rv, sty, bgOf(sty, st))
        val t = st?.today
        rv.setTextViewText(R.id.cv_day, t?.optInt("hday", 0)?.takeIf { it > 0 }?.toString() ?: "هـ")
        rv.setTextColor(R.id.cv_day, sty.accent)
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
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == Widgets.ACTION) Widgets.safeUpdate(ctx)
    }
}

class RingWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
}

class StripWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
}

class TimerWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        // added from the app's button: give the new widget the timers ticked there
        if (intent.action == Widgets.PINNED) {
            val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) try { Widgets.takePending(ctx, id) } catch (_: Exception) {}
        }
    }
}

class MonthWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
}

class ConvertWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
}

class EventWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) = Widgets.safeUpdate(ctx)
}
