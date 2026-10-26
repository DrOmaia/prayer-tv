package com.dromaia.prayertv

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

// When a timer widget is added (or its settings are opened): choose which of the app's timers it shows.
class TimerPickActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val timers = Widgets.timers(this)
        if (timers.isEmpty()) {
            Toast.makeText(this, "افتح التطبيق مرة، ثم أضف العدّاد من جديد", Toast.LENGTH_LONG).show()
            finish(); return
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("اختر العدّاد")
            .setItems(timers.map { it.second }.toTypedArray()) { _, which ->
                Widgets.setTimer(this, id, timers[which].first)
                setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
                finish()
            }
            .setOnCancelListener { finish() }
            .show()
    }
}
