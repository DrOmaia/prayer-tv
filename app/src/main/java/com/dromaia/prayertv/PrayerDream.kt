package com.dromaia.prayertv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.service.dreams.DreamService
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

// The TV screensaver: the main screen (clock, times, countdowns) with no buttons; any key closes it.
class PrayerDream : DreamService() {

    private var web: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        val w = WebView(this)
        w.setBackgroundColor(Color.parseColor("#F5F3EF"))
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        w.addJavascriptInterface(DreamBridge(this), "Android")
        setContentView(w)
        w.loadUrl("https://appassets.androidplatform.net/assets/web/index.html?dream=1")
        web = w
    }

    override fun onDetachedFromWindow() {
        web?.destroy()
        web = null
        super.onDetachedFromWindow()
    }

    // what the page may ask for while it is the screensaver
    class DreamBridge(private val ctx: Context) {
        @JavascriptInterface fun isTv(): Boolean = true
        @JavascriptInterface fun apps(): String = "[]"
        @JavascriptInterface fun launch(pkg: String) {}
        @JavascriptInterface fun schedule(json: String) = Schedule.save(ctx, json)
        @JavascriptInterface fun widgetData(json: String) = Widgets.save(ctx, json)
        @JavascriptInterface fun canOverlay(): Boolean = true
        @JavascriptInterface fun openOverlaySettings() {}
        @JavascriptInterface fun setOpenOnBoot(on: Boolean) {}
        @JavascriptInterface fun dreamOn(): Boolean = true
        @JavascriptInterface fun setDream(on: Boolean) {}
        @JavascriptInterface fun openDreamSettings() {}
        @JavascriptInterface fun version(): String = ""
    }
}
