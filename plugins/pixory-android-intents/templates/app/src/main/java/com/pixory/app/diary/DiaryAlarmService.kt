package com.pixory.app.diary

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class DiaryAlarmService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val jobId = intent?.getStringExtra(DiaryAlarmReceiver.EXTRA_JOB_ID)?.trim().orEmpty()
    if (jobId.isEmpty()) {
      return null
    }
    return HeadlessJsTaskConfig(
      "PixoryDiaryAlarm",
      Arguments.createMap().apply { putString(DiaryAlarmReceiver.EXTRA_JOB_ID, jobId) },
      8 * 60 * 1000L,
      true,
    )
  }
}
