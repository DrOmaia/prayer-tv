package com.dromaia.prayertv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import org.json.JSONObject
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

// A short message from a family phone to the TV at home, on the same Wi-Fi: the TV announces itself on the network
// (no setup), the phone finds it and sends one line; the TV shows it over any app for a minute with a soft tone.
object TvLink {
    private const val TYPE = "_prayertv._tcp"
    private const val PORT = 47120
    @Volatile private var server: ServerSocket? = null
    private var nsdReg: NsdManager.RegistrationListener? = null

    // ---- the TV
    fun listen(ctx: Context) {
        if (server != null) return
        val app = ctx.applicationContext
        val ss = try { ServerSocket(PORT) } catch (_: Exception) { try { ServerSocket(0) } catch (_: Exception) { return } }
        server = ss
        thread(isDaemon = true) {
            while (true) {
                val c = try { ss.accept() } catch (_: Exception) { break }
                thread(isDaemon = true) { handle(app, c) }
            }
            server = null
        }
        try {
            val nsd = app.getSystemService(Context.NSD_SERVICE) as NsdManager
            val info = NsdServiceInfo().apply { serviceName = "prayertv"; serviceType = TYPE; port = ss.localPort }
            val reg = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(i: NsdServiceInfo) {}
                override fun onRegistrationFailed(i: NsdServiceInfo, e: Int) {}
                override fun onServiceUnregistered(i: NsdServiceInfo) {}
                override fun onUnregistrationFailed(i: NsdServiceInfo, e: Int) {}
            }
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, reg)
            nsdReg = reg
        } catch (_: Exception) {}
    }

    private fun handle(ctx: Context, c: Socket) {
        try {
            c.use {
                it.soTimeout = 8000
                val line = it.getInputStream().bufferedReader(Charsets.UTF_8).readLine()?.take(400_000) ?: return
                val o = JSONObject(line)
                // a phone's settings (occasions, family, timers, prayer settings): kept until the page takes them
                if (o.optString("k") == "sync") {
                    val st = o.optJSONObject("s") ?: return
                    ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).edit().putString("pendingSync", st.toString()).apply()
                    it.getOutputStream().write("ok\n".toByteArray(Charsets.UTF_8))
                    it.getOutputStream().flush()
                    Handler(Looper.getMainLooper()).post { MainActivity.syncArrived() }
                    return
                }
                val title = o.optString("t").take(40).ifEmpty { "رسالة" }
                val text = o.optString("x").take(160)
                if (text.isBlank()) return
                it.getOutputStream().write("ok\n".toByteArray(Charsets.UTF_8))
                it.getOutputStream().flush()
                show(ctx, title, text)
            }
        } catch (_: Exception) {}
    }

    // on the app's own screen when it is open; over any other app with the alert banner (and its tone)
    private fun show(ctx: Context, title: String, text: String) {
        Handler(Looper.getMainLooper()).post {
            MainActivity.message(title, text)
            val s = Intent(ctx, AlertService::class.java).putExtra("title", title).putExtra("sub", text)
                .putExtra("snd", "tone").putExtra("keep", 60_000L)
            try { ctx.startService(s) } catch (_: Exception) {
                try { if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s) } catch (_: Exception) {}
            }
        }
    }

    fun takeSync(ctx: Context): String {
        val prefs = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
        val s = prefs.getString("pendingSync", "") ?: ""
        if (s.isNotEmpty()) prefs.edit().remove("pendingSync").apply()
        return s
    }

    // ---- the phone: the TV found last time first, otherwise look for it on the network (a few seconds)
    fun send(ctx: Context, payload: String, done: (String) -> Unit) {
        val app = ctx.applicationContext
        thread {
            val prefs = app.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE)
            val last = prefs.getString("tvHost", "") ?: ""
            if (last.isNotEmpty() && trySend(last, payload)) { done("ok"); return@thread }
            val host = discover(app, 7000)
            if (host == null) { done("none"); return@thread }
            if (trySend(host, payload)) { prefs.edit().putString("tvHost", host).apply(); done("ok") } else done("fail")
        }
    }

    private fun trySend(host: String, payload: String): Boolean = try {
        val ip = host.substringBeforeLast(':'); val port = host.substringAfterLast(':').toInt()
        Socket().use { s ->
            s.connect(InetSocketAddress(ip, port), 3000)
            s.soTimeout = 8000
            s.getOutputStream().write((payload.replace('\n', ' ') + "\n").toByteArray(Charsets.UTF_8))
            s.getOutputStream().flush()
            s.getInputStream().bufferedReader(Charsets.UTF_8).readLine() == "ok"
        }
    } catch (_: Exception) { false }

    private fun discover(ctx: Context, ms: Long): String? {
        val nsd = ctx.getSystemService(Context.NSD_SERVICE) as NsdManager
        val latch = CountDownLatch(1)
        var found: String? = null
        var resolving = false
        val listener = object : NsdManager.DiscoveryListener {
            override fun onServiceFound(info: NsdServiceInfo) {
                if (resolving || !info.serviceName.startsWith("prayertv")) return
                resolving = true
                @Suppress("DEPRECATION")
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(i: NsdServiceInfo, e: Int) { resolving = false }
                    override fun onServiceResolved(i: NsdServiceInfo) {
                        @Suppress("DEPRECATION")
                        val h = i.host?.hostAddress
                        if (h != null && found == null) { found = "$h:${i.port}"; latch.countDown() }
                    }
                })
            }
            override fun onDiscoveryStarted(t: String) {}
            override fun onDiscoveryStopped(t: String) {}
            override fun onServiceLost(i: NsdServiceInfo) {}
            override fun onStartDiscoveryFailed(t: String, e: Int) { latch.countDown() }
            override fun onStopDiscoveryFailed(t: String, e: Int) {}
        }
        try { nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, listener) } catch (_: Exception) { return null }
        latch.await(ms, TimeUnit.MILLISECONDS)
        try { nsd.stopServiceDiscovery(listener) } catch (_: Exception) {}
        return found
    }
}

// The TV keeps listening for messages while it is on (started with the app and after a restart).
class TvLinkService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            val b = if (Build.VERSION.SDK_INT >= 26) {
                nm.createNotificationChannel(NotificationChannel("tvlink", "رسائل العائلة", NotificationManager.IMPORTANCE_MIN))
                Notification.Builder(this, "tvlink")
            } else {
                @Suppress("DEPRECATION") Notification.Builder(this)
            }
            val n = b.setContentTitle("رسائل العائلة").setSmallIcon(R.drawable.ic_moon).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(8, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
            else startForeground(8, n)
        } catch (_: Exception) {}
        TvLink.listen(this)
        return START_STICKY
    }

    companion object {
        fun start(ctx: Context) {
            if (!Device.isTv(ctx)) return
            val i = Intent(ctx, TvLinkService::class.java)
            try { if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i) } catch (_: Exception) {
                // not allowed now: listen at least while the app is running
                TvLink.listen(ctx)
            }
        }
    }
}
