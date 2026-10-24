package com.dromaia.prayertv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AlertReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val s = Intent(ctx, AlertService::class.java)
            .putExtra("title", intent.getStringExtra("title"))
            .putExtra("sub", intent.getStringExtra("sub"))
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s) else ctx.startService(s)
        } catch (_: Exception) {
        }
        Schedule.armNext(ctx)
    }
}
