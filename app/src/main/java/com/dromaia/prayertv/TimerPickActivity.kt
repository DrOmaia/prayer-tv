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
        val items = Widgets.rotateChoices(this)
        if (items.isEmpty()) {
            Toast.makeText(this, "افتح التطبيق مرة، ثم أضف الويدجت من جديد", Toast.LENGTH_LONG).show()
            finish(); return
        }
        val chosen = Widgets.rotateKeys(this, id)
        val checked = BooleanArray(items.size) { items[it].first in chosen }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("اختر عدّادًا أو أكثر")
            .setMultiChoiceItems(items.map { it.second }.toTypedArray(), checked) { _, which, on -> checked[which] = on }
            .setPositiveButton("تم") { _, _ ->
                val keys = items.indices.filter { checked[it] }.map { items[it].first }
                if (keys.isNotEmpty()) {
                    Widgets.setRotate(this, id, keys)
                    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                }
                finish()
            }
            .setNegativeButton("إلغاء") { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }
}
