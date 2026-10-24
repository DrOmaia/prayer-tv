package com.dromaia.prayertv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

// At adhan time: the chosen sound (tone, full or short adhan, or none), and a banner on top of any app for 15 seconds
class AlertService : Service() {

    companion object {
        const val ACTION_STOP = "com.dromaia.prayertv.STOP_ADHAN"
    }

    private var view: View? = null
    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) return stopNow()
        startAsForeground()
        val title = intent?.getStringExtra("title") ?: return stopNow()
        val sub = intent.getStringExtra("sub") ?: ""
        playSound(Device.soundRes(intent.getStringExtra("snd") ?: "tone"))
        if (!MainActivity.visible && (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this))) {
            showBanner(title, sub)
        }
        handler.removeCallbacksAndMessages(null)
        // the banner goes after 15 seconds; the service stays until the sound ends
        handler.postDelayed({ removeBanner(); if (player?.isPlaying != true) stopNow() }, 15000)
        handler.postDelayed({ stopNow() }, 6 * 60_000L)
        return START_NOT_STICKY
    }

    private fun stopNow(): Int {
        handler.removeCallbacksAndMessages(null)
        removeBanner()
        if (Build.VERSION.SDK_INT >= 26) focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        focus = null
        player?.release()
        player = null
        stopForeground(true)
        stopSelf()
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        val b = if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("adhan", "تنبيه الأذان", NotificationManager.IMPORTANCE_LOW))
            Notification.Builder(this, "adhan")
        } else {
            @Suppress("DEPRECATION") Notification.Builder(this)
        }
        val stop = PendingIntent.getService(this, 5, Intent(this, AlertService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE)
        @Suppress("DEPRECATION")
        val n = b.setContentTitle(getString(R.string.app_name))
            .setSmallIcon(R.drawable.ic_moon)
            .addAction(Notification.Action.Builder(null, "إيقاف الأذان", stop).build())
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(7, n)
        }
    }

    // the chime lowers other sound (YouTube) for a moment instead of playing over it
    private var focus: AudioFocusRequest? = null

    private fun playSound(res: Int) {
        if (res == 0) return
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .build()
                getSystemService(AudioManager::class.java).requestAudioFocus(req)
                focus = req
            }
            player?.release()
            player = MediaPlayer.create(this, res, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(), 0)
            player?.setOnCompletionListener { if (view == null) stopNow() }
            player?.start()
        } catch (_: Exception) {
        }
    }

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private fun showBanner(title: String, sub: String) {
        removeBanner()
        val regular = Typeface.DEFAULT
        val bold = Typeface.DEFAULT_BOLD

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(20f), dp(16f), dp(20f), dp(16f))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F5F3EF"))
                cornerRadius = dp(20f).toFloat()
                setStroke(dp(2f), Color.parseColor("#87642A"))
            }
            elevation = dp(12f).toFloat()
        }
        val icon = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#87642A"))
            }
            addView(ImageView(this@AlertService).apply { setImageResource(R.drawable.ic_moon) },
                FrameLayout.LayoutParams(dp(30f), dp(30f), Gravity.CENTER))
        }
        card.addView(icon, LinearLayout.LayoutParams(dp(56f), dp(56f)))
        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16f), 0, dp(16f), 0)
            addView(TextView(this@AlertService).apply {
                text = title; textSize = 24f; typeface = bold; setTextColor(Color.parseColor("#1C1E21"))
            })
            if (sub.isNotEmpty()) addView(TextView(this@AlertService).apply {
                text = sub; textSize = 16f; typeface = regular; setTextColor(Color.parseColor("#5F5A52"))
            })
        }
        card.addView(texts, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        @Suppress("DEPRECATION")
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(28f)
        }
        try {
            getSystemService(WindowManager::class.java).addView(card, lp)
            view = card
        } catch (_: Exception) {
        }
    }

    private fun removeBanner() {
        view?.let { try { getSystemService(WindowManager::class.java).removeView(it) } catch (_: Exception) {} }
        view = null
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        removeBanner()
        player?.release()
        super.onDestroy()
    }
}
