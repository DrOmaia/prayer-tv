package com.dromaia.prayertv

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

// When a timer widget is added (or its settings are opened): tick one timer, or several to show in turn.
class TimerPickActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        // added from the app's «+ ويدجت»: the timers are already chosen
        if (Widgets.takePending(this, id)) {
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish(); return
        }
        val items = Widgets.rotateChoices(this)
        if (items.isEmpty()) {
            Toast.makeText(this, Device.en(this, "افتح التطبيق مرة، ثم أضف الويدجت من جديد", "Open the app once, then add the widget again"), Toast.LENGTH_LONG).show()
            finish(); return
        }
        val chosen = Widgets.rotateKeys(this, id)
        val checked = BooleanArray(items.size) { items[it].first in chosen }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle(Device.en(this, "اختر عدّادًا أو أكثر", "Choose one or more countdowns"))
            .setMultiChoiceItems(items.map { it.second }.toTypedArray(), checked) { _, which, on -> checked[which] = on }
            .setPositiveButton(Device.en(this, "تم", "Done")) { _, _ ->
                val keys = items.indices.filter { checked[it] }.map { items[it].first }
                if (keys.isNotEmpty()) {
                    Widgets.setRotate(this, id, keys)
                    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                }
                finish()
            }
            .setNegativeButton(Device.en(this, "إلغاء", "Cancel")) { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}
