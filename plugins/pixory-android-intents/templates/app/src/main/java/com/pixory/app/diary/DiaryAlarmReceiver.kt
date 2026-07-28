package com.pixory.app.diary

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class DiaryAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val jobId = intent?.getStringExtra(EXTRA_JOB_ID)?.trim().orEmpty()
    if (jobId.isEmpty()) {
      return
    }
    HeadlessJsTaskService.acquireWakeLockNow(context)
    context.startService(Intent(context, DiaryAlarmService::class.java).apply {
      putExtra(EXTRA_JOB_ID, jobId)
    })
  }

  companion object {
    const val ACTION_DIARY_ALARM = "com.pixory.app.DIARY_ALARM"
    const val EXTRA_JOB_ID = "jobId"
  }
}
