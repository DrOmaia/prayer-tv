package com.dromaia.prayertv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

object Device {
    fun isTv(ctx: Context): Boolean {
        val ui = ctx.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    // Phone alert: a notification that plays the soft chime
    fun notify(ctx: Context, title: String, sub: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val sound = Uri.parse("android.resource://" + ctx.packageName + "/" + R.raw.chime)
        val b = if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel("adhan_phone", "الأذان", NotificationManager.IMPORTANCE_HIGH)
            ch.setSound(sound, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
            nm.createNotificationChannel(ch)
            Notification.Builder(ctx, "adhan_phone")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(ctx).setSound(sound).setPriority(Notification.PRIORITY_HIGH)
        }
        val open = PendingIntent.getActivity(ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE)
        val n = b.setSmallIcon(R.drawable.ic_moon)
            .setContentTitle(title)
            .setContentText(sub)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { nm.notify(2, n) } catch (_: SecurityException) {}
    }
}
