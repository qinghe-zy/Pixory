package com.pixory.app.media

import android.app.Activity
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.MediaStore
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.Executors
import java.util.zip.ZipFile

class PixoryMediaModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  init {
    latestInstance = this
  }

  override fun getName(): String = "PixoryMediaModule"

  private val ioExecutor = Executors.newFixedThreadPool(2)
  private var speechRecognitionPromise: Promise? = null
  private val speechActivityListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != SPEECH_RECOGNITION_REQUEST_CODE) {
        return
      }
      val promise = speechRecognitionPromise ?: return
      speechRecognitionPromise = null
      if (resultCode != Activity.RESULT_OK) {
        promise.reject("PIXORY_SPEECH_CANCELLED", "语音识别已取消。")
        return
      }
      val matches = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS).orEmpty()
      val text = matches.firstOrNull()?.trim().orEmpty()
      if (text.isEmpty()) {
        promise.reject("PIXORY_SPEECH_EMPTY", "没有识别到语音内容。")
        return
      }
      val result = Arguments.createMap()
      result.putString("text", text)
      promise.resolve(result)
    }
  }

  init {
    reactContext.addActivityEventListener(speechActivityListener)
  }

  @ReactMethod
  fun recognizeSpeech(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("PIXORY_SPEECH_NO_ACTIVITY", "当前无法打开语音识别。")
      return
    }
    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      promise.reject("PIXORY_SPEECH_UNAVAILABLE", "当前设备不支持语音识别。")
      return
    }
    if (speechRecognitionPromise != null) {
      promise.reject("PIXORY_SPEECH_BUSY", "语音识别正在进行中。")
      return
    }
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
      putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出要发送给 AI 的内容")
    }
    speechRecognitionPromise = promise
    try {
      activity.startActivityForResult(intent, SPEECH_RECOGNITION_REQUEST_CODE)
    } catch (error: Exception) {
      speechRecognitionPromise = null
      promise.reject("PIXORY_SPEECH_FAILED", error.message ?: "语音识别启动失败。")
    }
  }

  @ReactMethod
  fun copyUriToFileWithProgress(sourceUri: String, destinationUri: String, options: ReadableMap?, promise: Promise) {
    runOnIo(promise, "PIXORY_COPY_FAILED") {
      val taskId = options?.getString("taskId")
      val source = Uri.parse(sourceUri)
      val destination = fileFromUri(destinationUri)
      destination.parentFile?.mkdirs()
      val totalBytes = resolveSize(source)
      ensureEnoughSpace(destination, totalBytes)
      var copiedBytes = 0L

      openInput(source).use { input ->
        FileOutputStream(destination).use { output ->
          copiedBytes = copyStream(input, output, taskId, totalBytes)
        }
      }

      val result = Arguments.createMap()
      result.putString("uri", destination.toURI().toString())
      result.putDouble("size", copiedBytes.toDouble())
      promise.resolve(result)
    }
  }

  @ReactMethod
  fun copyFileToSafWithProgress(sourceUri: String, destinationDirUri: String, displayName: String, mimeType: String?, options: ReadableMap?, promise: Promise) {
    runOnIo(promise, "PIXORY_SAF_COPY_FAILED") {
      val resolver = reactContext.contentResolver
      val taskId = options?.getString("taskId")
      val source = Uri.parse(sourceUri)
      val totalBytes = resolveSize(source)
      val destinationUri = DocumentsContract.createDocument(
        resolver,
        toDocumentTreeUri(Uri.parse(destinationDirUri)),
        mimeType ?: resolveMimeType(source) ?: "application/octet-stream",
        displayName.ifBlank { resolveDisplayName(source) ?: "pixory-file" }
      ) ?: throw IllegalStateException("Unable to create destination file.")
      var copiedBytes = 0L

      try {
        openInput(source).use { input ->
          resolver.openOutputStream(destinationUri)?.use { output ->
            copiedBytes = copyStream(input, output, taskId, totalBytes)
          } ?: throw IllegalStateException("Unable to open SAF output.")
        }
      } catch (error: Exception) {
        resolver.delete(destinationUri, null, null)
        throw error
      }

      val result = Arguments.createMap()
      result.putString("uri", destinationUri.toString())
      result.putDouble("size", copiedBytes.toDouble())
      promise.resolve(result)
    }
  }

  @ReactMethod
  fun getVideoMetadata(sourceUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_METADATA_FAILED") {
      val retriever = MediaMetadataRetriever()
      try {
      setRetrieverSource(retriever, sourceUri)
      var width = metadataInt(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
      var height = metadataInt(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
      val rotation = metadataInt(retriever, MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
      if (rotation == 90 || rotation == 270) {
        val rotatedWidth = height
        height = width
        width = rotatedWidth
      }
      val result = Arguments.createMap()
      result.putDouble("durationMs", metadataLong(retriever, MediaMetadataRetriever.METADATA_KEY_DURATION).toDouble())
      result.putInt("width", width)
      result.putInt("height", height)
      result.putInt("rotation", rotation)
      result.putString("mimeType", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE) ?: resolveMimeType(Uri.parse(sourceUri)))
      result.putDouble("fileSize", resolveSize(Uri.parse(sourceUri)).toDouble())
      promise.resolve(result)
      } finally {
        retriever.release()
      }
    }
  }

  @ReactMethod
  fun createVideoThumbnail(sourceUri: String, destinationUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_THUMBNAIL_FAILED") {
      val retriever = MediaMetadataRetriever()
      var bitmap: Bitmap? = null
      try {
      setRetrieverSource(retriever, sourceUri)
      bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, THUMBNAIL_MAX_SIZE, THUMBNAIL_MAX_SIZE)
      } else {
        retriever.frameAtTime
      } ?: throw IllegalStateException("Unable to read a video frame.")
      val destination = fileFromUri(destinationUri)
      destination.parentFile?.mkdirs()
      FileOutputStream(destination).use { output ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)
      }

      val result = Arguments.createMap()
      result.putString("uri", destination.toURI().toString())
      result.putDouble("size", destination.length().toDouble())
      promise.resolve(result)
      } finally {
        bitmap?.recycle()
        retriever.release()
      }
    }
  }

  @ReactMethod
  fun getPdfPageCount(sourceUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_PDF_PAGE_COUNT_FAILED") {
      openPdfDescriptor(Uri.parse(sourceUri)).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          promise.resolve(renderer.pageCount)
        }
      }
    }
  }

  @ReactMethod
  fun renderPdfPageToFile(sourceUri: String, pageIndex: Int, destinationUri: String, width: Int, promise: Promise) {
    runOnIo(promise, "PIXORY_PDF_RENDER_FAILED") {
      val safeWidth = width.coerceIn(240, 2400)
      val destination = fileFromUri(destinationUri)
      destination.parentFile?.mkdirs()
      openPdfDescriptor(Uri.parse(sourceUri)).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
            throw IllegalArgumentException("Invalid PDF page index: $pageIndex")
          }
          renderer.openPage(pageIndex).use { page ->
            val safeHeight = ((page.height.toFloat() / page.width.toFloat()) * safeWidth).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(safeWidth, safeHeight, Bitmap.Config.ARGB_8888)
            try {
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              FileOutputStream(destination).use { output ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
              }
            } finally {
              bitmap.recycle()
            }
          }
        }
      }

      val result = Arguments.createMap()
      result.putString("uri", destination.toURI().toString())
      result.putDouble("size", destination.length().toDouble())
      promise.resolve(result)
    }
  }

  @ReactMethod
  fun extractPdfText(sourceUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_PDF_TEXT_EXTRACTION_FAILED") {
      PDFBoxResourceLoader.init(reactContext)
      openInput(Uri.parse(sourceUri)).use { input ->
        PDDocument.load(input).use { document ->
          val text = PDFTextStripper().getText(document).trim()
          val result = Arguments.createMap()
          result.putString("text", text)
          result.putInt("pageCount", document.numberOfPages)
          promise.resolve(result)
        }
      }
    }
  }

  @ReactMethod
  fun saveVideoToMediaStore(sourceUri: String, displayName: String, promise: Promise) {
    runOnIo(promise, "PIXORY_SAVE_VIDEO_FAILED") {
      val resolver = reactContext.contentResolver
      val safeName = displayName.ifBlank { "pixory-video.mp4" }
      val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, safeName)
        put(MediaStore.Video.Media.MIME_TYPE, resolveMimeType(Uri.parse(sourceUri)) ?: "video/mp4")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Pixory")
          put(MediaStore.Video.Media.IS_PENDING, 1)
        }
      }
      val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      }
      val destinationUri = resolver.insert(collection, values) ?: throw IllegalStateException("Unable to create system video item.")
      try {
        openInput(Uri.parse(sourceUri)).use { input ->
          resolver.openOutputStream(destinationUri)?.use { output ->
            copyStream(input, output, null, resolveSize(Uri.parse(sourceUri)))
          } ?: throw IllegalStateException("Unable to open system video output.")
        }
      } catch (error: Exception) {
        resolver.delete(destinationUri, null, null)
        throw error
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        values.clear()
        values.put(MediaStore.Video.Media.IS_PENDING, 0)
        resolver.update(destinationUri, values, null, null)
      }
      promise.resolve(destinationUri.toString())
    }
  }

  @ReactMethod
  fun saveImageToMediaStore(sourceUri: String, displayName: String, albumName: String?, promise: Promise) {
    runOnIo(promise, "PIXORY_SAVE_IMAGE_FAILED") {
      val resolver = reactContext.contentResolver
      val source = Uri.parse(sourceUri)
      val safeName = displayName.ifBlank { resolveDisplayName(source) ?: "pixory-image.jpg" }
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, safeName)
        put(MediaStore.Images.Media.MIME_TYPE, resolveMimeType(source) ?: "image/jpeg")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + sanitizeAlbumName(albumName))
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      }
      val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      }
      val destinationUri = resolver.insert(collection, values) ?: throw IllegalStateException("Unable to create system image item.")
      try {
        openInput(source).use { input ->
          resolver.openOutputStream(destinationUri)?.use { output ->
            copyStream(input, output, null, resolveSize(source))
          } ?: throw IllegalStateException("Unable to open system image output.")
        }
      } catch (error: Exception) {
        resolver.delete(destinationUri, null, null)
        throw error
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(destinationUri, values, null, null)
      }
      promise.resolve(destinationUri.toString())
    }
  }

  @ReactMethod
  fun computeFileSha256(sourceUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_HASH_FAILED") {
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(STREAM_BUFFER_SIZE)
      openInput(Uri.parse(sourceUri)).use { input ->
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
      promise.resolve(bytesToHex(digest.digest()))
    }
  }

  @ReactMethod
  fun computeImageDHash(sourceUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_DHASH_FAILED") {
      val bitmap = openInput(Uri.parse(sourceUri)).use { input ->
        BitmapFactory.decodeStream(input)
      } ?: throw IllegalArgumentException("Unable to decode image for visual hash.")
      val scaled = Bitmap.createScaledBitmap(bitmap, 9, 8, true)
      var hash = 0UL
      for (y in 0 until 8) {
        for (x in 0 until 8) {
          val left = gray(scaled.getPixel(x, y))
          val right = gray(scaled.getPixel(x + 1, y))
          if (left > right) {
            hash = hash or (1UL shl (y * 8 + x))
          }
        }
      }
      if (scaled !== bitmap) {
        scaled.recycle()
      }
      bitmap.recycle()
      promise.resolve(hash.toString(16).padStart(16, '0'))
    }
  }

  @ReactMethod
  fun getInitialExternalOpen(promise: Promise) {
    try {
      val intent = reactApplicationContext.currentActivity?.intent
      promise.resolve(intentToExternalOpen(intent))
    } catch (error: Exception) {
      promise.reject("PIXORY_EXTERNAL_OPEN_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getInitialShareIntent(promise: Promise) {
    try {
      val intent = reactApplicationContext.currentActivity?.intent
      promise.resolve(intentToShareIntent(intent))
    } catch (error: Exception) {
      promise.reject("PIXORY_SHARE_INTENT_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun finishShareActivity(promise: Promise) {
    try {
      reactApplicationContext.currentActivity?.finish()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PIXORY_SHARE_FINISH_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun listZipImageEntries(zipUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_ZIP_LIST_FAILED") {
      val zipFile = ZipFile(fileFromUri(zipUri))
      zipFile.use { zip ->
        val entries = Arguments.createArray()
        var count = 0
        var declaredBytes = 0L
        zip.entries().asSequence()
          .filter { !it.isDirectory }
          .filter { isSupportedImageName(it.name) }
          .sortedBy { it.name.lowercase(Locale.ROOT) }
          .forEach { entry ->
            count += 1
            if (count > MAX_ZIP_IMAGE_ENTRIES) {
              throw SecurityException("Zip contains too many image entries.")
            }
            if (entry.size > MAX_ZIP_ENTRY_BYTES) {
              throw SecurityException("Zip image entry is too large.")
            }
            if (entry.size > 0) {
              declaredBytes += entry.size
              if (declaredBytes > MAX_ZIP_DECLARED_BYTES) {
                throw SecurityException("Zip declared image size is too large.")
              }
            }
            val item = Arguments.createMap()
            item.putString("name", entry.name)
            item.putDouble("size", entry.size.toDouble())
            entries.pushMap(item)
          }
        promise.resolve(entries)
      }
    }
  }

  @ReactMethod
  fun extractZipEntryToTemp(zipUri: String, entryName: String, destinationUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_ZIP_EXTRACT_FAILED") {
      val destination = fileFromUri(destinationUri)
      destination.parentFile?.mkdirs()
      ZipFile(fileFromUri(zipUri)).use { zip ->
        val entry = zip.getEntry(entryName) ?: throw IllegalArgumentException("Zip entry not found.")
        if (entry.isDirectory) {
          throw IllegalArgumentException("Zip entry is a directory.")
        }
        if (entry.size > MAX_ZIP_ENTRY_BYTES) {
          throw SecurityException("Zip image entry is too large.")
        }
        val canonicalParent = destination.parentFile!!.canonicalPath
        val canonicalDestination = destination.canonicalPath
        if (!canonicalDestination.startsWith(canonicalParent)) {
          throw SecurityException("Unsafe zip extraction path.")
        }
        zip.getInputStream(entry).use { input ->
          FileOutputStream(destination).use { output ->
            copyStream(input, output, null, entry.size, MAX_ZIP_ENTRY_BYTES)
          }
        }
      }
      promise.resolve(destination.toURI().toString())
    }
  }

  @ReactMethod
  fun cleanupTempSession(tempDirUri: String, promise: Promise) {
    runOnIo(promise, "PIXORY_TEMP_CLEANUP_FAILED") {
      val file = fileFromUri(tempDirUri)
      if (file.exists()) {
        file.deleteRecursively()
      }
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  private fun intentToExternalOpen(intent: Intent?) = Arguments.createMap().apply {
    if (intent == null) {
      putBoolean("hasOpen", false)
      return@apply
    }
    putString("action", intent.action)
    val uri = extractSingleIntentUri(intent)
    putBoolean("hasOpen", uri != null)
    if (uri != null) {
      putString("uri", uri.toString())
      putString("mimeType", intent.type ?: resolveMimeType(uri))
      putString("name", resolveDisplayName(uri))
      putDouble("fileSize", resolveSize(uri).toDouble())
    }
  }

  private fun intentToShareIntent(intent: Intent?) = Arguments.createMap().apply {
    val items = Arguments.createArray()
    if (!isShareIntent(intent)) {
      putBoolean("hasShare", false)
      putString("action", intent?.action)
      putArray("items", items)
      return@apply
    }

    val uris = extractShareUris(intent!!)

    for (uri in uris) {
      val mimeType = reactContext.contentResolver.getType(uri) ?: intent.type ?: resolveMimeType(uri)
      val item = Arguments.createMap()
      item.putString("uri", uri.toString())
      item.putString("mimeType", mimeType)
      item.putString("name", resolveDisplayName(uri) ?: uri.lastPathSegment)
      item.putDouble("size", resolveSize(uri).toDouble())
      items.pushMap(item)
    }

    putBoolean("hasShare", uris.isNotEmpty())
    putString("action", intent.action)
    putString("mimeType", intent.type)
    putArray("items", items)
  }

  private fun emitIntentReceived(intent: Intent?) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }
    val payload = Arguments.createMap()
    when {
      isShareIntent(intent) -> {
        payload.putString("kind", "share")
        payload.putMap("shareIntent", intentToShareIntent(intent))
      }
      isExternalOpenIntent(intent) -> {
        payload.putString("kind", "externalOpen")
        payload.putMap("externalOpen", intentToExternalOpen(intent))
      }
      else -> {
        payload.putString("kind", "unknown")
      }
    }
    reactContext.runOnJSQueueThread {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("PixoryMediaIntentReceived", payload)
    }
  }

  private fun sendCopyProgress(taskId: String, copiedBytes: Long, totalBytes: Long) {
    val payload = Arguments.createMap()
    payload.putString("taskId", taskId)
    payload.putDouble("copiedBytes", copiedBytes.toDouble())
    payload.putDouble("totalBytes", totalBytes.toDouble())
    reactContext.runOnJSQueueThread {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("PixoryMediaCopyProgress", payload)
    }
  }

  private fun runOnIo(promise: Promise, code: String, block: () -> Unit) {
    ioExecutor.execute {
      try {
        block()
      } catch (error: Exception) {
        promise.reject(code, error.message, error)
      }
    }
  }

  private fun copyStream(
    input: InputStream,
    output: OutputStream,
    taskId: String?,
    totalBytes: Long,
    maxBytes: Long = Long.MAX_VALUE
  ): Long {
    val buffer = ByteArray(STREAM_BUFFER_SIZE)
    var copiedBytes = 0L
    var lastEventAt = 0L
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      copiedBytes += read.toLong()
      if (copiedBytes > maxBytes) {
        throw SecurityException("Output exceeds Pixory safety limit.")
      }
      output.write(buffer, 0, read)
      val now = System.currentTimeMillis()
      if (taskId != null && now - lastEventAt > PROGRESS_EVENT_INTERVAL_MS) {
        sendCopyProgress(taskId, copiedBytes, totalBytes)
        lastEventAt = now
      }
    }
    output.flush()
    if (taskId != null) {
      sendCopyProgress(taskId, copiedBytes, totalBytes)
    }
    return copiedBytes
  }

  private fun ensureEnoughSpace(destination: File, totalBytes: Long) {
    if (totalBytes <= 0) {
      return
    }
    val parent = destination.parentFile ?: return
    val requiredBytes = totalBytes + MIN_FREE_SPACE_AFTER_COPY
    if (parent.usableSpace < requiredBytes) {
      throw IllegalStateException("Insufficient storage space for this file.")
    }
  }

  private fun toDocumentTreeUri(uri: Uri): Uri {
    return if (DocumentsContract.isTreeUri(uri)) {
      DocumentsContract.buildDocumentUriUsingTree(uri, DocumentsContract.getTreeDocumentId(uri))
    } else {
      uri
    }
  }

  private fun setRetrieverSource(retriever: MediaMetadataRetriever, sourceUri: String) {
    val uri = Uri.parse(sourceUri)
    if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
      retriever.setDataSource(reactContext, uri)
      return
    }
    retriever.setDataSource(fileFromUri(sourceUri).absolutePath)
  }

  private fun metadataInt(retriever: MediaMetadataRetriever, key: Int): Int {
    return retriever.extractMetadata(key)?.toIntOrNull() ?: 0
  }

  private fun metadataLong(retriever: MediaMetadataRetriever, key: Int): Long {
    return retriever.extractMetadata(key)?.toLongOrNull() ?: 0L
  }

  private fun bytesToHex(bytes: ByteArray): String {
    return bytes.joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun gray(color: Int): Int {
    val red = (color shr 16) and 0xff
    val green = (color shr 8) and 0xff
    val blue = color and 0xff
    return (red * 299 + green * 587 + blue * 114) / 1000
  }

  private fun isExternalOpenIntent(intent: Intent?): Boolean {
    return intent?.action == Intent.ACTION_VIEW && extractSingleIntentUri(intent) != null
  }

  private fun isShareIntent(intent: Intent?): Boolean {
    return intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE
  }

  private fun extractSingleIntentUri(intent: Intent): Uri? {
    if (intent.action == Intent.ACTION_VIEW) {
      return intent.data ?: intent.clipData?.getItemAt(0)?.uri
    }
    if (intent.action == Intent.ACTION_SEND) {
      return extractParcelableExtraUri(intent) ?: intent.clipData?.getItemAt(0)?.uri
    }
    return null
  }

  private fun extractShareUris(intent: Intent): ArrayList<Uri> {
    val uris = ArrayList<Uri>()
    when (intent.action) {
      Intent.ACTION_SEND_MULTIPLE -> {
        val extraUris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }
        if (extraUris != null) {
          uris.addAll(extraUris.filterNotNull())
        }
      }
      Intent.ACTION_SEND -> {
        extractParcelableExtraUri(intent)?.let(uris::add)
      }
    }

    val clipData = intent.clipData
    if (clipData != null) {
      for (index in 0 until clipData.itemCount) {
        clipData.getItemAt(index)?.uri?.let { uri ->
          if (!uris.contains(uri)) {
            uris.add(uri)
          }
        }
      }
    }

    return uris
  }

  private fun extractParcelableExtraUri(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
  }

  private fun openInput(uri: Uri) = when (uri.scheme) {
    ContentResolver.SCHEME_CONTENT -> reactContext.contentResolver.openInputStream(uri)
    ContentResolver.SCHEME_FILE -> FileInputStream(File(uri.path ?: ""))
    null -> FileInputStream(File(uri.toString()))
    else -> reactContext.contentResolver.openInputStream(uri)
  } ?: throw IllegalArgumentException("Unable to open input: $uri")

  private fun openPdfDescriptor(uri: Uri): ParcelFileDescriptor {
    if (uri.scheme == ContentResolver.SCHEME_FILE || uri.scheme == null) {
      return ParcelFileDescriptor.open(fileFromUri(uri.toString()), ParcelFileDescriptor.MODE_READ_ONLY)
    }
    val cacheFile = File(reactContext.cacheDir, "pixory_pdf_render_${System.nanoTime()}.pdf")
    openInput(uri).use { input ->
      FileOutputStream(cacheFile).use { output ->
        input.copyTo(output)
      }
    }
    return ParcelFileDescriptor.open(cacheFile, ParcelFileDescriptor.MODE_READ_ONLY)
  }

  private fun fileFromUri(uriValue: String): File {
    val uri = Uri.parse(uriValue)
    return if (uri.scheme == ContentResolver.SCHEME_FILE) {
      File(uri.path ?: throw IllegalArgumentException("Invalid file uri: $uriValue"))
    } else {
      File(uriValue)
    }
  }

  private fun resolveSize(uri: Uri): Long {
    if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
      reactContext.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (index >= 0 && cursor.moveToFirst()) {
          return cursor.getLong(index)
        }
      }
    }
    if (uri.scheme == ContentResolver.SCHEME_FILE || uri.scheme == null) {
      return fileFromUri(uri.toString()).length()
    }
    return -1L
  }

  private fun resolveDisplayName(uri: Uri): String? {
    if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
      reactContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) {
          return cursor.getString(index)
        }
      }
    }
    return uri.lastPathSegment
  }

  private fun resolveMimeType(uri: Uri): String? {
    return reactContext.contentResolver.getType(uri)
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(uri.lastPathSegment?.substringAfterLast('.', "")?.lowercase(Locale.ROOT))
  }

  private fun sanitizeAlbumName(albumName: String?): String {
    val prepared = albumName?.trim()?.takeIf { it.isNotEmpty() } ?: "Pixory"
    return prepared.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(48).ifBlank { "Pixory" }
  }

  private fun isSupportedImageName(name: String): Boolean {
    val lower = name.lowercase(Locale.ROOT)
    return lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".bmp")
  }

  companion object {
    @Volatile
    private var latestInstance: PixoryMediaModule? = null

    @JvmStatic
    fun dispatchIntent(intent: Intent?) {
      latestInstance?.emitIntentReceived(intent)
    }

    private const val STREAM_BUFFER_SIZE = 256 * 1024
    private const val PROGRESS_EVENT_INTERVAL_MS = 180L
    private const val MIN_FREE_SPACE_AFTER_COPY = 64L * 1024L * 1024L
    private const val THUMBNAIL_MAX_SIZE = 720
    private const val MAX_ZIP_IMAGE_ENTRIES = 2000
    private const val MAX_ZIP_ENTRY_BYTES = 256L * 1024L * 1024L
    private const val MAX_ZIP_DECLARED_BYTES = 4L * 1024L * 1024L * 1024L
    private const val SPEECH_RECOGNITION_REQUEST_CODE = 7304
  }
}
