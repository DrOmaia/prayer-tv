package com.dromaia.prayertv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray

// The page sends the coming adhan times (about 30 days); we keep them and arm one alarm at a time.
object Schedule {
    const val PREFS = "prayer"

    fun save(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("events", json).apply()
        armNext(ctx)
    }

    fun armNext(ctx: Context) {
        val json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", null) ?: return
        val arr = JSONArray(json)
        val now = System.currentTimeMillis()
        var best: org.json.JSONObject? = null
        for (i in 0 until arr.length()) {
            val e = arr.getJSONObject(i)
            val at = e.getLong("at")
            if (at > now + 1000 && (best == null || at < best.getLong("at"))) best = e
        }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(ctx, AlertReceiver::class.java)
        if (best != null) {
            intent.putExtra("title", best.getString("title"))
            intent.putExtra("sub", best.optString("sub"))
        }
        val pi = PendingIntent.getBroadcast(ctx, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        if (best == null) return
        val at = best.getLong("at")
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }
}
