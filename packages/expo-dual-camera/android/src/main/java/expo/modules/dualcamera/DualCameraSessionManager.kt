package expo.modules.dualcamera

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.io.FileOutputStream
import java.lang.ref.WeakReference
import java.util.UUID

object DualCameraSessionManager {
    private var frontView: WeakReference<DualCameraView>? = null
    private var backView: WeakReference<DualCameraView>? = null
    private var cameraProvider: ProcessCameraProvider? = null

    private var frontCamera: Camera? = null
    private var backCamera: Camera? = null

    private var frontImageCapture: ImageCapture? = null
    private var backImageCapture: ImageCapture? = null

    private var currentBackLens: String = "wide"
    private var currentFlashMode: Int = ImageCapture.FLASH_MODE_OFF

    var isRunning = false
        private set
    private var isPaused = false

    private var lastContext: WeakReference<Context>? = null

    fun register(view: DualCameraView, side: String, context: Context) {
        if (side == "front") frontView = WeakReference(view)
        else backView = WeakReference(view)

        lastContext = WeakReference(context)

        if (cameraProvider == null) {
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener({
                cameraProvider = future.get()
                startIfReady(context)
            }, ContextCompat.getMainExecutor(context))
        } else {
            startIfReady(context)
        }
    }

    fun unregister(view: DualCameraView) {
        if (frontView?.get() === view) frontView = null
        if (backView?.get() === view) backView = null
        stop()
    }

    fun setBackLens(lens: String, context: Context) {
        if (lens == currentBackLens) return
        currentBackLens = lens
        if (isRunning) {
            stop()
            startIfReady(context)
        }
    }

    // MARK: - Props forwarded from views

    fun setZoom(side: String, normalizedZoom: Float) {
        val camera = if (side == "front") frontCamera else backCamera
        camera ?: return
        val zoomState = camera.cameraInfo.zoomState.value ?: return
        val minZoom = zoomState.minZoomRatio
        val maxZoom = zoomState.maxZoomRatio
        val ratio = minZoom + normalizedZoom * (maxZoom - minZoom)
        camera.cameraControl.setZoomRatio(ratio.coerceIn(minZoom, maxZoom))
    }

    fun setTorch(enabled: Boolean) {
        val camera = backCamera ?: return
        if (camera.cameraInfo.hasFlashUnit()) {
            camera.cameraControl.enableTorch(enabled)
        }
    }

    fun setFlash(mode: String) {
        currentFlashMode = when (mode) {
            "on" -> ImageCapture.FLASH_MODE_ON
            "auto" -> ImageCapture.FLASH_MODE_AUTO
            else -> ImageCapture.FLASH_MODE_OFF
        }
    }

    fun setAutofocus(side: String, mode: String) {
        val camera = if (side == "front") frontCamera else backCamera
        camera ?: return
        if (mode == "on") {
            // Focus once at center and lock
            val factory = camera.cameraInfo.zoomState.value?.let { null } // no-op for now
            // CameraX defaults to continuous autofocus; explicit lock requires FocusMeteringAction
            // which needs a MeteringPointFactory from the PreviewView. For simplicity, we leave
            // CameraX's default continuous autofocus active. Full tap-to-focus can be added later
            // by passing the PreviewView's MeteringPointFactory through.
        }
        // mode == "off" → CameraX default continuous autofocus (no action needed)
    }

    // MARK: - Session Lifecycle

    private fun startIfReady(context: Context) {
        if (isRunning) return
        val front = frontView?.get() ?: return
        val back = backView?.get() ?: return
        val provider = cameraProvider ?: return
        val lifecycleOwner = context as? LifecycleOwner ?: return

        try {
            provider.unbindAll()

            val backPreviewUseCase = Preview.Builder().build()
                .also { it.surfaceProvider = back.getPreviewView().surfaceProvider }
            val frontPreviewUseCase = Preview.Builder().build()
                .also { it.surfaceProvider = front.getPreviewView().surfaceProvider }

            val backCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()
            val frontCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()

            val backSelector = CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_BACK).build()
            val frontSelector = CameraSelector.Builder()
                .requireLensFacing(CameraSelector.LENS_FACING_FRONT).build()

            backCamera = provider.bindToLifecycle(
                lifecycleOwner, backSelector, backPreviewUseCase, backCapture
            )
            frontCamera = provider.bindToLifecycle(
                lifecycleOwner, frontSelector, frontPreviewUseCase, frontCapture
            )

            frontImageCapture = frontCapture
            backImageCapture = backCapture

            applyBackLensZoom()

            front.showPreview()
            back.showPreview()
            isRunning = true
            isPaused = false
            front.sessionDidStart()
            back.sessionDidStart()

        } catch (e: Exception) {
            front.showError("Failed to start cameras: ${e.message}")
            back.showError("Failed to start cameras: ${e.message}")
        }
    }

    private fun applyBackLensZoom() {
        val camera = backCamera ?: return
        val zoomState = camera.cameraInfo.zoomState.value ?: return
        val minZoom = zoomState.minZoomRatio
        val maxZoom = zoomState.maxZoomRatio

        val targetRatio = when (currentBackLens) {
            "ultraWide" -> minZoom
            "telephoto" -> minOf(maxZoom, 3.0f)
            else -> 1.0f
        }

        camera.cameraControl.setZoomRatio(targetRatio.coerceIn(minZoom, maxZoom))
    }

    private fun stop() {
        cameraProvider?.unbindAll()
        frontCamera = null
        backCamera = null
        frontImageCapture = null
        backImageCapture = null
        isRunning = false
        isPaused = false
    }

    // MARK: - Pause / Resume

    fun pausePreview() {
        if (!isRunning || isPaused) return
        isPaused = true
        cameraProvider?.unbindAll()
    }

    fun resumePreview() {
        if (!isPaused) return
        isPaused = false
        val context = lastContext?.get() ?: return
        startIfReady(context)
    }

    // MARK: - Photo Capture

    fun takePicture(
        side: String,
        options: Map<String, Any>?,
        context: Context,
        callback: (Result<Map<String, Any>>) -> Unit
    ) {
        if (!isRunning || isPaused) {
            callback(Result.failure(Exception("Camera session is not running")))
            return
        }

        val imageCapture = if (side == "front") frontImageCapture else backImageCapture
        if (imageCapture == null) {
            callback(Result.failure(Exception("Photo capture not available")))
            return
        }

        // Apply flash mode to back camera
        if (side == "back") {
            imageCapture.flashMode = currentFlashMode
        }

        val quality = (options?.get("quality") as? Double) ?: 1.0
        val wantBase64 = (options?.get("base64") as? Boolean) ?: false

        val file = File(context.cacheDir, "${UUID.randomUUID()}.jpg")
        val outputOptions = ImageCapture.OutputFileOptions.Builder(file).build()

        imageCapture.takePicture(
            outputOptions,
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    // Re-compress if quality < 1.0
                    if (quality < 1.0) {
                        try {
                            val bitmap = BitmapFactory.decodeFile(file.absolutePath)
                            FileOutputStream(file).use { out ->
                                bitmap.compress(
                                    android.graphics.Bitmap.CompressFormat.JPEG,
                                    (quality * 100).toInt(),
                                    out
                                )
                            }
                            bitmap.recycle()
                        } catch (_: Exception) {}
                    }

                    val dims = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(file.absolutePath, dims)

                    val result = mutableMapOf<String, Any>(
                        "uri" to Uri.fromFile(file).toString(),
                        "width" to dims.outWidth,
                        "height" to dims.outHeight
                    )

                    if (wantBase64) {
                        result["base64"] = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
                    }

                    callback(Result.success(result))
                }

                override fun onError(exception: ImageCaptureException) {
                    callback(Result.failure(exception))
                }
            }
        )
    }
}
