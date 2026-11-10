package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.Calendar
import java.util.Locale
import kotlin.concurrent.thread

// Is the TV on? From anywhere: each TV of the home posts «on / off» (and a sign of life every half hour while on) to a
// secret address at the free service ntfy.sh; the family's phones read it every 15 minutes, show it in a widget and
// notify when it changes. The address («home code») is a random secret the phone and the TVs agree on once, on the
// home Wi-Fi. Only the TV's name and its state are sent.
object TvStatus {
    private const val BASE = "https://ntfy.sh/"
    private const val BEAT = 30 * 60_000L   // the TV: a sign of life while it is on
    private const val STALE = 70 * 60_000L  // the phone: «on» with no sign of life for this long = not connected
    private const val EVERY = 15 * 60_000L  // the phone: how often it looks

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
    fun code(ctx: Context): String = prefs(ctx).getString("homeCode", "") ?: ""
    private fun random(n: Int): String {
        val r = SecureRandom(); val a = "abcdefghijklmnopqrstuvwxyz0123456789"
        return (1..n).map { a[r.nextInt(a.length)] }.joinToString("")
    }

    // ---------------- the TV ----------------
    private var receiver: BroadcastReceiver? = null
    private val handler = Handler(Looper.getMainLooper())

    private fun tvId(ctx: Context): String {
        val p = prefs(ctx)
        var id = p.getString("tvId", "") ?: ""
        if (id.isEmpty()) { id = random(8); p.edit().putString("tvId", id).apply() }
        return id
    }
    // the name the owner gave the TV in its settings (e.g. «تلفزيون الصالة»), otherwise its model
    private fun tvName(ctx: Context): String {
        val n = try { Settings.Global.getString(ctx.contentResolver, "device_name") } catch (_: Exception) { null }
        return (if (n.isNullOrBlank()) Build.MODEL ?: "TV" else n).take(40)
    }
    private fun screenOn(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
    } catch (_: Exception) { true }

    // a phone gave this TV the home code (or asked for it): the TV keeps the first one, unless told to replace it
    fun home(ctx: Context, c: String, set: Boolean): String {
        val clean = c.filter { it.isLetterOrDigit() }.take(40)
        if (clean.length >= 16 && (set || code(ctx).isEmpty())) {
            prefs(ctx).edit().putString("homeCode", clean).apply()
            report(ctx, screenOn(ctx))
        }
        return code(ctx)
    }

    // started with the TV's service: follow the screen and say «still on» from time to time
    fun startTv(ctx: Context) {
        val app = ctx.applicationContext
        if (!Device.isTv(app) || receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) { report(app, i.action == Intent.ACTION_SCREEN_ON) }
        }
        val f = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF) }
        try {
            if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED) else app.registerReceiver(r, f)
            receiver = r
        } catch (_: Exception) { return }
        val beat = object : Runnable {
            override fun run() {
                if (screenOn(app)) report(app, true)
                handler.postDelayed(this, BEAT)
            }
        }
        handler.post(beat)
    }

    fun report(ctx: Context, on: Boolean) {
        val c = code(ctx)
        if (c.isEmpty() || !Device.isTv(ctx)) return
        val body = JSONObject().put("i", tvId(ctx)).put("n", tvName(ctx)).put("on", if (on) 1 else 0).toString()
        thread {
            try {
                val h = URL(BASE + c).openConnection() as HttpURLConnection
                h.connectTimeout = 8000; h.readTimeout = 8000
                h.requestMethod = "POST"; h.doOutput = true
                try { h.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }; h.responseCode } finally { h.disconnect() }
            } catch (_: Exception) {}
        }
    }

    // ---------------- the phone ----------------
    // once, on the home Wi-Fi: agree on the home code with every TV found. "ok:<number of TVs>" or "none"
    fun pair(ctx: Context, done: (String) -> Unit) {
        val app = ctx.applicationContext
        thread {
            val hosts = LinkedHashSet<String>()
            (prefs(app).getString("tvHost", "") ?: "").takeIf { it.isNotEmpty() }?.let { hosts.add(it) }
            hosts.addAll(TvLink.discoverAll(app, 6000))
            val codes = LinkedHashMap<String, String>()
            for (h in hosts) {
                val r = TvLink.ask(h, "{\"k\":\"home\"}") ?: continue
                if (r.startsWith("home:")) codes[h] = r.substring(5).trim()
            }
            if (codes.isEmpty()) { done("none"); return@thread }
            // a TV that already has a code keeps it (other phones of the family use it); otherwise this phone's, or a new one
            val code = codes.values.firstOrNull { it.length >= 16 } ?: code(app).ifEmpty { "ptv" + random(29) }
            for ((h, c) in codes) if (c != code) TvLink.ask(h, JSONObject().put("k", "home").put("c", code).put("set", true).toString())
            prefs(app).edit().putString("homeCode", code).apply()
            Thread.sleep(1500) // the TVs post their state now
            check(app); draw(app); arm(app)
            done("ok:" + codes.size)
        }
    }

    private fun states(ctx: Context): JSONObject = try { JSONObject(prefs(ctx).getString("tvStates", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }

    // "on", "off", or "gone" (it was on, then no sign of life: unplugged or no internet)
    private fun status(o: JSONObject, now: Long): String =
        if (o.optInt("on") == 0) "off" else if (now - o.optLong("t") < STALE) "on" else "gone"

    // read the TVs' posts of the last 12 hours and keep the latest of each; notify what changed. Off the main thread.
    fun check(ctx: Context) {
        val c = code(ctx)
        if (c.isEmpty() || Device.isTv(ctx)) return
        val st = states(ctx)
        val now = System.currentTimeMillis()
        val before = HashMap<String, String>()
        st.keys().forEach { k -> st.optJSONObject(k)?.let { before[k] = status(it, now) } }
        try {
            val h = URL("$BASE$c/json?poll=1&since=12h").openConnection() as HttpURLConnection
            h.connectTimeout = 15_000; h.readTimeout = 15_000
            val text = try { h.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() } } finally { h.disconnect() }
            for (line in text.lineSequence()) {
                if (line.isBlank()) continue
                val m = try { JSONObject(line) } catch (_: Exception) { continue }
                if (m.optString("event") != "message") continue
                val b = try { JSONObject(m.optString("message")) } catch (_: Exception) { continue }
                val id = b.optString("i").filter { it.isLetterOrDigit() }.take(16)
                if (id.isEmpty()) continue
                val t = m.optLong("time") * 1000L
                val old = st.optJSONObject(id)
                if (old != null && old.optLong("t") > t) continue
                val on = b.optInt("on")
                // s = since when it is in this state
                val since = if (old != null && old.optInt("on") == on) old.optLong("s", t) else t
                st.put(id, JSONObject().put("n", b.optString("n").take(40)).put("on", on).put("t", t).put("s", since))
            }
            prefs(ctx).edit().putString("tvStates", st.toString()).putLong("tvChecked", now).apply()
        } catch (_: Exception) { return }
        var k = 0
        st.keys().forEach { id ->
            val o = st.optJSONObject(id) ?: return@forEach
            val a = status(o, now); val b = before[id]
            // a TV seen for the first time, or one that only lost its connection, does not notify
            if (b != null && a != b && a != "gone") notify(ctx, k, o.optString("n"), a == "on", o.optLong("s"))
            k++
        }
    }

    private fun hm(t: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = t }
        return String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
    }

    private fun notify(ctx: Context, index: Int, name: String, on: Boolean, at: Long) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val b = if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("tvstatus", Device.en(ctx, "حالة التلفزيون", "TV status"), NotificationManager.IMPORTANCE_DEFAULT))
            Notification.Builder(ctx, "tvstatus")
        } else {
            @Suppress("DEPRECATION") Notification.Builder(ctx)
        }
        val open = PendingIntent.getActivity(ctx, 15, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val text = if (on) Device.en(ctx, "اشتغل التلفزيون الساعة ${hm(at)}", "The TV was turned on at ${hm(at)}")
        else Device.en(ctx, "أُطفئ التلفزيون الساعة ${hm(at)}", "The TV was turned off at ${hm(at)}")
        val n = b.setSmallIcon(R.drawable.ic_moon).setContentTitle(name.ifEmpty { Device.en(ctx, "التلفزيون", "TV") }).setContentText(text)
            .setContentIntent(open).setAutoCancel(true).build()
        try { nm.notify(60 + index, n) } catch (_: SecurityException) {}
    }

    // for the app's screen: {"code": true/false, "tvs": [{"n": name, "st": "on" | "off" | "gone", "s": since}], "at": last look}
    fun summary(ctx: Context): String {
        val st = states(ctx); val now = System.currentTimeMillis(); val a = JSONArray()
        st.keys().forEach { k -> st.optJSONObject(k)?.let { a.put(JSONObject().put("n", it.optString("n")).put("st", status(it, now)).put("s", it.optLong("s"))) } }
        return JSONObject().put("code", code(ctx).isNotEmpty()).put("tvs", a).put("at", prefs(ctx).getLong("tvChecked", 0L)).toString()
    }

    // look again every 15 minutes while a home code is set (phones only)
    fun arm(ctx: Context) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = PendingIntent.getBroadcast(ctx, 14, Intent(ctx, TvWatchReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            am.cancel(pi)
            if (code(ctx).isEmpty() || Device.isTv(ctx)) return
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + EVERY, pi)
        } catch (_: Exception) {}
    }

    // ---------------- the widget: each TV by its name, with its state; a tap looks again ----------------
    private val ROWS = intArrayOf(R.id.tv_row1, R.id.tv_row2, R.id.tv_row3, R.id.tv_row4)

    fun draw(ctx: Context) {
        val am = AppWidgetManager.getInstance(ctx)
        val ids = am.getAppWidgetIds(ComponentName(ctx, TvWidget::class.java))
        if (ids.isEmpty()) return
        val rv = RemoteViews(ctx.packageName, R.layout.widget_tv)
        rv.setOnClickPendingIntent(R.id.root, PendingIntent.getBroadcast(ctx, 13, Intent(ctx, TvWatchReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        rv.setTextViewText(R.id.tv_title, Device.en(ctx, "التلفزيون", "TV"))
        val st = states(ctx); val now = System.currentTimeMillis()
        val list = ArrayList<JSONObject>()
        st.keys().forEach { k -> st.optJSONObject(k)?.let { list.add(it) } }
        list.sortBy { it.optString("n") }
        ROWS.forEachIndexed { i, id ->
            if (i >= list.size) { rv.setViewVisibility(id, if (i == 0) View.VISIBLE else View.GONE); return@forEachIndexed }
            val o = list[i]; val s = status(o, now)
            val since = if (now - o.optLong("s") < 20 * 3_600_000L) Device.en(ctx, " منذ ", " since ") + hm(o.optLong("s")) else ""
            val word = when (s) {
                "on" -> Device.en(ctx, "شغّال", "On") + since
                "off" -> Device.en(ctx, "مطفأ", "Off") + since
                else -> Device.en(ctx, "غير متصل", "Not connected")
            }
            rv.setViewVisibility(id, View.VISIBLE)
            rv.setTextViewText(id, "● " + o.optString("n").ifEmpty { Device.en(ctx, "التلفزيون", "TV") } + ": " + word)
            rv.setTextColor(id, when (s) { "on" -> 0xFF6EE7A0.toInt(); "off" -> 0xFFC9C5DA.toInt(); else -> 0xFFF2C46B.toInt() })
        }
        if (list.isEmpty()) {
            rv.setTextViewText(R.id.tv_row1, if (code(ctx).isEmpty()) Device.en(ctx, "فعّله من التطبيق: زر التلفزيون ← «حالة التلفزيون»", "Turn it on in the app: TV button → \"TV status\"")
                else Device.en(ctx, "لم تصل حالة التلفزيون بعد", "No TV status yet"))
            rv.setTextColor(R.id.tv_row1, 0xFFC9C5DA.toInt())
        }
        val at = prefs(ctx).getLong("tvChecked", 0L)
        rv.setTextViewText(R.id.tv_time, if (at == 0L) "" else Device.en(ctx, "آخر تحديث ", "Updated ") + hm(at))
        ids.forEach { try { am.updateAppWidget(it, rv) } catch (_: Exception) {} }
    }
}

// the alarm every 15 minutes, a tap on the widget, or the app coming to the front: look, redraw, plan the next look
class TvWatchReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val done = goAsync()
        Thread {
            try { TvStatus.check(ctx) } catch (_: Exception) {}
            try { TvStatus.draw(ctx) } catch (_: Exception) {}
            TvStatus.arm(ctx)
            done.finish()
        }.start()
    }
}

class TvWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, am: AppWidgetManager, ids: IntArray) {
        try { TvStatus.draw(ctx) } catch (_: Exception) {}
        try { ctx.sendBroadcast(Intent(ctx, TvWatchReceiver::class.java)) } catch (_: Exception) {}
    }
}
