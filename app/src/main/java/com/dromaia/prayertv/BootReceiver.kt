package com.dromaia.prayertv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

// After a restart, an update, or a change of the clock / time zone / exact-alarm permission:
// arm the next alert and the weather check again and refresh the widgets; after a restart, open the app on a TV.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Schedule.armNext(ctx)
        Weather.arm(ctx)
        TvLinkService.start(ctx)
        try { Widgets.updateAll(ctx) } catch (_: Exception) {}
        if (intent.action != Intent.ACTION_BOOT_COMPLETED || !Device.isTv(ctx)) return
        val openOnBoot = ctx.getSharedPreferences(Schedule.PREFS, Context.MODE_PRIVATE).getBoolean("openOnBoot", true)
        val allowed = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)
        if (openOnBoot && allowed) {
            try {
                ctx.startActivity(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
            }
        }
    }
}
