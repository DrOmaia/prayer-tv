package com.dromaia.prayertv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Schedule.armNext(ctx)
        val openOnBoot = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getBoolean("openOnBoot", true)
        val allowed = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Device.isTv(ctx) && openOnBoot && allowed) {
            try {
                ctx.startActivity(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
            }
        }
    }
}
