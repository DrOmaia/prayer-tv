package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

// The page sends the coming adhan times (about 60 days); we keep them and arm one alarm at a time.
object Schedule {
    const val PREFS = "prayer"

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("events", json).apply()
        armNext(ctx)
    }

    // Never throws: a bad stored list must not break the boot or the alert chain
    fun armNext(ctx: Context) {
        try {
            arm(ctx)
        } catch (_: Exception) {
        }
    }

    // true when the alarm may run exactly (needed to start the alert service from the background)
    fun exactAllowed(ctx: Context): Boolean {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    }

    private fun arm(ctx: Context) {
        val json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", null) ?: return
        val arr = JSONArray(json)
        val now = System.currentTimeMillis()
        var best: JSONObject? = null
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            val at = e.optLong("at", 0L)
            if (at > now + 1000 && (best == null || at < best.optLong("at"))) best = e
        }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(ctx, AlertReceiver::class.java)
        if (best != null) {
            intent.putExtra("title", best.optString("title"))
            intent.putExtra("sub", best.optString("sub"))
            intent.putExtra("at", best.optLong("at"))
        }
        val pi = PendingIntent.getBroadcast(ctx, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        if (best == null) {
            // the list has run out (the app has not been opened for a long time): ask to open it
            if (arr.length() > 0 && !Device.isTv(ctx)) Device.notifyRefresh(ctx)
            return
        }
        val at = best.getLong("at")
        if (exactAllowed(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
}
