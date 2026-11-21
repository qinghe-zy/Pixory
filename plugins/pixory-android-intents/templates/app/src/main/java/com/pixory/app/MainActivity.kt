package com.pixory.app
import expo.modules.splashscreen.SplashScreenManager

import android.content.Intent
import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.pixory.app.media.PixoryMediaModule

import expo.modules.ReactActivityDelegateWrapper

open class MainActivity : ReactActivity() {
  private var privacyBlurOverlay: FrameLayout? = null
  private var isActivityPaused: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(getActivityThemeRes());
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  protected open fun getActivityThemeRes(): Int = R.style.AppTheme

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    PixoryMediaModule.dispatchIntent(intent)
  }

  override fun onPause() {
    super.onPause()
    isActivityPaused = true
    updatePrivacyBlurOverlay(hasFocus = false)
  }

  override fun onResume() {
    super.onResume()
    isActivityPaused = false
    updatePrivacyBlurOverlay(hasFocus = hasWindowFocus())
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    updatePrivacyBlurOverlay(hasFocus = hasFocus)
  }

  fun setPersonalRecentsBlurEnabled(enabled: Boolean) {
    sPersonalRecentsBlurEnabled = enabled
    runOnUiThread {
      updatePrivacyBlurOverlay(hasFocus = hasWindowFocus())
    }
  }

  private fun updatePrivacyBlurOverlay(hasFocus: Boolean) {
    if (this is PixoryShareActivity) {
      return
    }
    val shouldBlur = sPersonalRecentsBlurEnabled && (isActivityPaused || !hasFocus)
    val contentView = findViewById<View>(android.R.id.content)
    val decorView = window?.decorView as? ViewGroup

    if (shouldBlur) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && contentView != null) {
        contentView.setRenderEffect(
          RenderEffect.createBlurEffect(48f, 48f, Shader.TileMode.CLAMP)
        )
      }
      if (decorView != null && privacyBlurOverlay == null) {
        val overlay = FrameLayout(this).apply {
          // Android 12+ 使用半透明磨砂层配合 RenderEffect；低版本使用高不透明度遮罩
          setBackgroundColor(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
              Color.argb(130, 245, 247, 250)
            } else {
              Color.argb(245, 245, 247, 250)
            }
          )
          isClickable = false
          isFocusable = false
          val label = TextView(context).apply {
            text = "Pixory 隐私空间已保护"
            textSize = 15f
            setTextColor(Color.rgb(60, 68, 82))
            gravity = Gravity.CENTER
          }
          addView(
            label,
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.WRAP_CONTENT,
              FrameLayout.LayoutParams.WRAP_CONTENT,
              Gravity.CENTER
            )
          )
        }
        decorView.addView(
          overlay,
          ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
          )
        )
        privacyBlurOverlay = overlay
      }
    } else {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && contentView != null) {
        contentView.setRenderEffect(null)
      }
      val existing = privacyBlurOverlay
      if (existing != null) {
        (existing.parent as? ViewGroup)?.removeView(existing)
        privacyBlurOverlay = null
      }
    }
  }

  companion object {
    @Volatile
    var sPersonalRecentsBlurEnabled: Boolean = false
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
