package com.dromaia.prayertv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : Activity() {

    companion object {
        @Volatile var visible = false
    }

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Device.isTv(this)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            packageManager.setComponentEnabledSetting(ComponentName(this, "$packageName.HomeAlias"),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        } else if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#F5F3EF"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        web.addJavascriptInterface(Bridge(), "Android")
        setContentView(web)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
        web.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        visible = true
        web.evaluateJavascript("window.App && App.onResume()", null)
    }

    override fun onPause() {
        visible = false
        super.onPause()
    }

    // Back is handled by the page (close a screen); on the main screen: nothing on a TV, leave the app on a phone
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.App ? App.back() : false") { handled ->
                    if (handled != "true" && !Device.isTv(this)) moveTaskToBack(true)
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

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

        @JavascriptInterface
        fun widgetData(json: String) = Widgets.save(this@MainActivity, json)

        @JavascriptInterface
        fun isTv(): Boolean = Device.isTv(this@MainActivity)

        @JavascriptInterface
        fun canOverlay(): Boolean =
            Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this@MainActivity)

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

        @JavascriptInterface
        fun setOpenOnBoot(on: Boolean) {
            getSharedPreferences(Schedule.PREFS, MODE_PRIVATE).edit().putBoolean("openOnBoot", on).apply()
        }

        @JavascriptInterface
        fun version(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
    }

    private fun iconData(d: android.graphics.drawable.Drawable): String {
        val w = if (d.intrinsicWidth > 0) d.intrinsicWidth.coerceAtMost(320) else 160
        val h = if (d.intrinsicHeight > 0) (w * d.intrinsicHeight / d.intrinsicWidth.coerceAtLeast(1)).coerceAtMost(320) else 160
        val bmp = Bitmap.createBitmap(w, h.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        d.setBounds(0, 0, c.width, c.height)
        d.draw(c)
        val bos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
        return "data:image/png;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    }
}
