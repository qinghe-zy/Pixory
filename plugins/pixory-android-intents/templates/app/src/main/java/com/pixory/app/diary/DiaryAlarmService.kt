package com.pixory.app.diary

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class DiaryAlarmService : HeadlessJsTaskService() {
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "角色日记生成", NotificationManager.IMPORTANCE_LOW).apply {
          description = "在预定时间继续完成角色日记"
          setSound(null, null)
          enableVibration(false)
        },
      )
    }
    val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val notification = notificationBuilder
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("Pixory")
      .setContentText("正在完成角色日记")
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
    startForeground(NOTIFICATION_ID, notification)
  }

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

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_ID = "pixory_diary_generation"
    private const val NOTIFICATION_ID = 2408
  }
}
