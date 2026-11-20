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
    // screen: the app's screen a tap opens (empty: the home screen); such a reminder keeps its own place in the list
    fun notify(ctx: Context, title: String, sub: String, snd: String = "tone", screen: String = "") {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val res = soundRes(snd)
        // the sound by its name: a channel keeps its sound for good, and a numeric resource id can change from one
        // build to the next (the first channels used the id, so they are replaced once by new ones)
        val sound = if (res != 0) Uri.parse("android.resource://" + ctx.packageName + "/raw/" + ctx.resources.getResourceEntryName(res)) else null
        val (id, name) = when (snd) {
            "adhan" -> Pair("adhan_full2", en(ctx, "الأذان كاملًا", "Full adhan"))
            "short" -> Pair("adhan_short2", en(ctx, "الأذان مختصرًا", "Short adhan"))
            "none" -> Pair("adhan_silent", en(ctx, "التنبيه بدون صوت", "Silent alert"))
            else -> Pair("adhan_phone2", en(ctx, "الأذان", "Adhan"))
        }
        val b = if (Build.VERSION.SDK_INT >= 26) {
            for (old in arrayOf("adhan_full", "adhan_short", "adhan_phone")) try { nm.deleteNotificationChannel(old) } catch (_: Exception) {}
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
        val open = if (screen.isEmpty()) PendingIntent.getActivity(ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE)
        else PendingIntent.getActivity(ctx, 16,
            Intent(ctx, MainActivity::class.java).putExtra(MainActivity.EXTRA_SCREEN, screen)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = b.setSmallIcon(R.drawable.ic_moon)
            .setContentTitle(title)
            .setContentText(sub)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        // the next prayer's notification replaces the last one; a reminder with its own screen stays until it is read
        try { nm.notify(if (screen.isEmpty()) 2 else 5, n) } catch (_: SecurityException) {}
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
