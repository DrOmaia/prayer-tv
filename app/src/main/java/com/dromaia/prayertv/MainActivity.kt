package com.dromaia.prayertv

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.util.Base64
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : Activity() {

    companion object {
        @Volatile var visible = false
        // a widget can open the app on one of its screens (e.g. the date converter)
        const val EXTRA_SCREEN = "screen"
    }

    private var web: WebView? = null
    private var preview: android.media.MediaPlayer? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cleanAfterUpdate()
        if (Device.isTv(this)) {
            // keeping the screen on is a setting (it would stop the TV's screensaver)
            if (getSharedPreferences(Schedule.PREFS, MODE_PRIVATE).getBoolean("keepOn", false)) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            packageManager.setComponentEnabledSetting(ComponentName(this, "$packageName.HomeAlias"),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        } else if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        buildWebView()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView() {
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        val w = try {
            WebView(this)
        } catch (e: Exception) {
            // the system WebView is missing or being updated
            setContentView(TextView(this).apply {
                text = "تعذّر فتح الشاشة الآن (مكوّن Android System WebView غير متاح). أعد المحاولة بعد قليل."
                textSize = 22f
                gravity = Gravity.CENTER
                setPadding(48, 48, 48, 48)
            })
            return
        }
        w.setBackgroundColor(Color.parseColor("#F5F3EF"))
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.mediaPlaybackRequiresUserGesture = false
        w.isFocusable = true
        w.isFocusableInTouchMode = true
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            // the page never leaves the app's own files
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"

            // the page's process was stopped (low memory): build the screen again instead of closing the app
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                if (web === view) {
                    web = null
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                    buildWebView()
                }
                return true
            }
        }
        w.addJavascriptInterface(Bridge(), "Android")
        setContentView(w)
        val sc = intent?.getStringExtra(EXTRA_SCREEN)?.filter { it.isLetter() }
        w.loadUrl("https://appassets.androidplatform.net/assets/web/index.html" + if (sc.isNullOrEmpty()) "" else "#$sc")
        w.requestFocus()
        web = w
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val sc = intent.getStringExtra(EXTRA_SCREEN)?.filter { it.isLetter() }
        if (!sc.isNullOrEmpty()) web?.evaluateJavascript("window.App && App.open('$sc')", null)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        web?.evaluateJavascript("window.App && App.onResume()", null)
    }

    override fun onPause() {
        visible = false
        preview?.release()
        preview = null
        super.onPause()
    }

    // Back is handled by the page (close a screen); on the main screen: nothing on a TV, leave the app on a phone
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                val w = web
                if (w == null) { if (!Device.isTv(this)) moveTaskToBack(true) }
                else w.evaluateJavascript("window.App ? App.back() : false") { handled ->
                    if (handled != "true" && !Device.isTv(this)) moveTaskToBack(true)
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private var updateId = -1L
    // once the new version is installed, the downloaded update file is not needed: remove it and its downloads entry
    private fun cleanAfterUpdate() {
        try {
            val prefs = getSharedPreferences(Schedule.PREFS, MODE_PRIVATE)
            val installed = packageManager.getPackageInfo(packageName, 0).lastUpdateTime
            if (prefs.getLong("installedAt", 0L) == installed) return
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val ids = ArrayList<Long>()
            dm.query(DownloadManager.Query())?.use { c ->
                while (c.moveToNext()) ids.add(c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)))
            }
            if (ids.isNotEmpty()) dm.remove(*ids.toLongArray())
            getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.listFiles()?.forEach { it.delete() }
            prefs.edit().putLong("installedAt", installed).apply()
        } catch (_: Exception) {}
    }

    private val UPDATE_URL = "https://github.com/DrOmaia/prayer-tv/releases/latest/download/prayer-tv.apk"
    private val APK_TYPE = "application/vnd.android.package-archive"

    inner class Bridge {
        @JavascriptInterface
        fun apps(): String {
            val pm = packageManager
            val seen = HashSet<String>()
            val out = JSONArray()
            val cats = listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)
            for (cat in cats) {
                val intent = Intent(Intent.ACTION_MAIN).addCategory(cat)
                for (ri in pm.queryIntentActivities(intent, 0)) {
                    val pkg = ri.activityInfo.packageName
                    if (pkg == packageName || !seen.add(pkg)) continue
                    val o = JSONObject()
                    o.put("pkg", pkg)
                    o.put("label", ri.loadLabel(pm).toString())
                    o.put("icon", iconData(ri.activityInfo.applicationInfo.let { ai ->
                        pm.getApplicationBanner(ai) ?: ri.loadIcon(pm)
                    }))
                    out.put(o)
                }
            }
            return out.toString()
        }

        @JavascriptInterface
        fun launch(pkg: String) {
            runOnUiThread {
                val i = packageManager.getLeanbackLaunchIntentForPackage(pkg)
                    ?: packageManager.getLaunchIntentForPackage(pkg)
                if (i != null) startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }

        @JavascriptInterface
        fun schedule(json: String) = Schedule.save(this@MainActivity, json)

        // the screensaver: shown in the TV's screensaver list only while it is switched on
        @JavascriptInterface
        fun dreamOn(): Boolean = packageManager.getComponentEnabledSetting(ComponentName(this@MainActivity, PrayerDream::class.java)) !=
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED

        @JavascriptInterface
        fun setDream(on: Boolean) {
            packageManager.setComponentEnabledSetting(ComponentName(this@MainActivity, PrayerDream::class.java),
                if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP)
        }

        @JavascriptInterface
        fun openDreamSettings() {
            runOnUiThread {
                try { startActivity(Intent(Settings.ACTION_DREAM_SETTINGS)) } catch (e: Exception) {
                    try { startActivity(Intent(Settings.ACTION_SETTINGS)) } catch (_: Exception) {}
                }
            }
        }

        @JavascriptInterface
        fun widgetData(json: String) = Widgets.save(this@MainActivity, json)

        @JavascriptInterface
        fun widgetError(): String = Widgets.error(this@MainActivity)

        // the timer widgets on the home screen: which are there, and the timer each shows
        @JavascriptInterface
        fun timerWidgets(): String = Widgets.placedTimers(this@MainActivity)

        @JavascriptInterface
        fun setTimerWidget(id: Int, timerId: String) = Widgets.setTimer(this@MainActivity, id, timerId)

        // put a widget on the home screen from the app (kind: prayer, ring, strip, month, convert, event, timer)
        @JavascriptInterface
        fun pinWidget(kind: String, keys: String): String = Widgets.pin(this@MainActivity, kind, keys)

        // the phone's own location (for «تحديد تلقائي»): approximate is enough for the city
        @JavascriptInterface
        fun locOk(): Boolean = checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        @JavascriptInterface
        fun askLoc() {
            runOnUiThread { requestPermissions(arrayOf(android.Manifest.permission.ACCESS_COARSE_LOCATION), 2) }
        }

        // the newest known position; when it is old (or none), ask for a fresh one for the next call
        @SuppressLint("MissingPermission")
        @JavascriptInterface
        fun location(): String {
            if (!locOk()) return ""
            val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            var best: Location? = null
            for (p in lm.getProviders(true)) {
                val l = try { lm.getLastKnownLocation(p) } catch (_: Exception) { null } ?: continue
                if (best == null || l.time > best.time) best = l
            }
            if (best == null || System.currentTimeMillis() - best.time > 20 * 60_000L) {
                runOnUiThread {
                    try {
                        val prov = if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) LocationManager.NETWORK_PROVIDER else LocationManager.PASSIVE_PROVIDER
                        @Suppress("DEPRECATION")
                        lm.requestSingleUpdate(prov, object : LocationListener {
                            override fun onLocationChanged(location: Location) {}
                            override fun onProviderEnabled(provider: String) {}
                            override fun onProviderDisabled(provider: String) {}
                            @Deprecated("Deprecated in Java")
                            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                        }, mainLooper)
                    } catch (_: Exception) {}
                }
            }
            val b = best ?: return ""
            return JSONObject().put("lat", b.latitude).put("lon", b.longitude).put("at", b.time).toString()
        }

        // update from settings: download the latest release with the system's download manager, then open the installer
        @JavascriptInterface
        fun updateStart(): String {
            if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
                runOnUiThread {
                    try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } catch (_: Exception) {}
                }
                return "perm"
            }
            return try {
                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.listFiles()?.forEach { it.delete() }
                val req = DownloadManager.Request(Uri.parse(UPDATE_URL))
                    .setTitle("مواقيت الصلاة — آخر نسخة")
                    .setMimeType(APK_TYPE)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, "prayer-tv.apk")
                updateId = dm.enqueue(req)
                "ok"
            } catch (_: Exception) { "fail" }
        }

        @JavascriptInterface
        fun updateStatus(): String {
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            try {
                dm.query(DownloadManager.Query().setFilterById(updateId))?.use { c ->
                    if (!c.moveToFirst()) return """{"state":"fail"}"""
                    val st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    val got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    return when (st) {
                        DownloadManager.STATUS_SUCCESSFUL -> """{"state":"done"}"""
                        DownloadManager.STATUS_FAILED -> """{"state":"fail"}"""
                        else -> """{"state":"run","pct":${if (total > 0) got * 100 / total else 0}}"""
                    }
                }
            } catch (_: Exception) {}
            return """{"state":"fail"}"""
        }

        @JavascriptInterface
        fun updateInstall() {
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = dm.getUriForDownloadedFile(updateId) ?: return
            runOnUiThread {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, APK_TYPE)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {}
            }
        }

        @JavascriptInterface
        fun isTv(): Boolean = Device.isTv(this@MainActivity)

        @JavascriptInterface
        fun canOverlay(): Boolean =
            Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this@MainActivity)

        // some Google TV builds have no screen for this permission
        @JavascriptInterface
        fun overlaySettingsAvailable(): Boolean =
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")).resolveActivity(packageManager) != null

        @JavascriptInterface
        fun setKeepOn(on: Boolean) {
            getSharedPreferences(Schedule.PREFS, MODE_PRIVATE).edit().putBoolean("keepOn", on).apply()
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        // phone: what the alerts need (notifications, exact alarms, no battery restriction)
        @JavascriptInterface
        fun notifOk(): Boolean = Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        @JavascriptInterface
        fun askNotif() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
            }
        }

        @JavascriptInterface
        fun exactOk(): Boolean = Schedule.exactAllowed(this@MainActivity)

        @JavascriptInterface
        fun batteryOk(): Boolean =
            (getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)

        @SuppressLint("BatteryLife")
        @JavascriptInterface
        fun askBattery() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } catch (e: Exception) {
                    try { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) } catch (_: Exception) {}
                }
            }
        }

        @JavascriptInterface
        fun openOverlaySettings() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                } catch (e: Exception) {
                    try { startActivity(Intent(Settings.ACTION_SETTINGS)) } catch (_: Exception) {}
                }
            }
        }

        // settings: hear a sound choice; "stop" (or a second press) stops it
        @JavascriptInterface
        fun previewSound(snd: String) {
            runOnUiThread {
                val was = preview != null
                preview?.release()
                preview = null
                val res = Device.soundRes(snd)
                if (snd == "stop" || res == 0 || was) return@runOnUiThread
                preview = android.media.MediaPlayer.create(this@MainActivity, res)?.apply {
                    setOnCompletionListener { it.release(); if (preview === it) preview = null }
                    start()
                }
            }
        }

        @JavascriptInterface
        fun setOpenOnBoot(on: Boolean) {
            getSharedPreferences(Schedule.PREFS, MODE_PRIVATE).edit().putBoolean("openOnBoot", on).apply()
        }

        @JavascriptInterface
        fun version(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
    }

    private fun iconData(d: android.graphics.drawable.Drawable): String {
        // small icons keep the list fast on the TV
        val w = if (d.intrinsicWidth > 0) d.intrinsicWidth.coerceAtMost(192) else 128
        val h = if (d.intrinsicHeight > 0) (w * d.intrinsicHeight / d.intrinsicWidth.coerceAtLeast(1)).coerceAtMost(192) else 128
        val bmp = Bitmap.createBitmap(w, h.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        d.setBounds(0, 0, c.width, c.height)
        d.draw(c)
        val bos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
        return "data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    }
}
