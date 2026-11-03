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
    // the interface language chosen in the app: 'en' when the page saved lang = en with the widget data
    fun isEn(ctx: Context): Boolean = try {
        val j = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getString("widget", null)
        j != null && org.json.JSONObject(j).optString("lang") == "en"
    } catch (_: Exception) { false }
    fun en(ctx: Context, ar: String, en: String) = if (isEn(ctx)) en else ar

    fun isTv(ctx: Context): Boolean {
        val ui = ctx.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        return ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    // the sound of each choice: tone, the full adhan, its opening, or none (0)
    fun soundRes(snd: String): Int = when (snd) {
        "adhan" -> R.raw.adhan
        "short" -> R.raw.adhan_short
        "none" -> 0
        else -> R.raw.chime
    }

    // Phone alert: a notification with the chosen sound (each sound has its own channel, as Android requires)
    fun notify(ctx: Context, title: String, sub: String, snd: String = "tone") {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val res = soundRes(snd)
        val sound = if (res != 0) Uri.parse("android.resource://" + ctx.packageName + "/" + res) else null
        val (id, name) = when (snd) {
            "adhan" -> Pair("adhan_full", en(ctx, "الأذان كاملًا", "Full adhan"))
            "short" -> Pair("adhan_short", en(ctx, "الأذان مختصرًا", "Short adhan"))
            "none" -> Pair("adhan_silent", en(ctx, "التنبيه بدون صوت", "Silent alert"))
            else -> Pair("adhan_phone", en(ctx, "الأذان", "Adhan"))
        }
        val b = if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH)
            ch.setSound(sound, if (sound == null) null else AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
            nm.createNotificationChannel(ch)
            Notification.Builder(ctx, id)
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

    // the alert list has run out: a quiet reminder to open the app once
    fun notifyRefresh(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val b = if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("refresh", en(ctx, "تحديث المواقيت", "Prayer-times refresh"), NotificationManager.IMPORTANCE_LOW))
            Notification.Builder(ctx, "refresh")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(ctx)
        }
        val open = PendingIntent.getActivity(ctx, 4,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val n = b.setSmallIcon(R.drawable.ic_moon)
            .setContentTitle(en(ctx, "افتح «مواقيت الصلاة»", "Open \"Prayer Times\""))
            .setContentText(en(ctx, "لتحديث مواقيت الأيام القادمة وتنبيهاتها", "To refresh the coming days' times and alerts"))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { nm.notify(3, n) } catch (_: SecurityException) {}
    }
}
