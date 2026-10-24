package com.dromaia.prayertv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AlertReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        try {
            val title = intent.getStringExtra("title") ?: return
            val sub = intent.getStringExtra("sub") ?: ""
            // a late alarm (the clock was wrong and has just been corrected) is dropped
            val at = intent.getLongExtra("at", 0L)
            if (at > 0 && System.currentTimeMillis() - at > 3 * 60_000L) return
            if (!Device.isTv(ctx)) {
                // phone: an ordinary notification with the soft chime
                Device.notify(ctx, title, sub)
                return
            }
            val s = Intent(ctx, AlertService::class.java).putExtra("title", title).putExtra("sub", sub)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s) else ctx.startService(s)
            } catch (_: Exception) {
                // the system did not allow the service (no exact alarm): show a notification instead
                Device.notify(ctx, title, sub)
            }
        } finally {
            Schedule.armNext(ctx)
        }
    }
}
