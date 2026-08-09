package com.pixory.app.diary

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService

class DiaryAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val jobId = intent?.getStringExtra(EXTRA_JOB_ID)?.trim().orEmpty()
    if (jobId.isEmpty()) {
      return
    }
    val serviceIntent = Intent(context, DiaryAlarmService::class.java).apply {
      putExtra(EXTRA_JOB_ID, jobId)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (_: IllegalStateException) {
      // The durable SQLite job remains pending. Foreground lifecycle
      // reconciliation will run it when Android rejects a background start.
    }
  }

  companion object {
    const val ACTION_DIARY_ALARM = "com.pixory.app.DIARY_ALARM"
    const val EXTRA_JOB_ID = "jobId"
  }
}
