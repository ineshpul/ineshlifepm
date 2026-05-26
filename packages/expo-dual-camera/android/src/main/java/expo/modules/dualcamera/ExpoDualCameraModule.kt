package expo.modules.dualcamera

import android.Manifest
import android.content.pm.PackageManager
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoDualCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoDualCamera")

    // MARK: - Support Check

    AsyncFunction("isSupported") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false); return@AsyncFunction
      }
      val future = ProcessCameraProvider.getInstance(context)
      future.addListener({
        val provider = future.get()
        val supported = provider.availableConcurrentCameraInfos.isNotEmpty()
        promise.resolve(supported)
      }, ContextCompat.getMainExecutor(context))
    }

    // MARK: - Permissions

    AsyncFunction("getCameraPermissionsAsync") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("E_CONTEXT", "Context not available", null); return@AsyncFunction
      }
      val granted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.CAMERA
      ) == PackageManager.PERMISSION_GRANTED
      promise.resolve(permissionResponse(granted, canAskAgain = true))
    }

    AsyncFunction("requestCameraPermissionsAsync") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("E_CONTEXT", "Context not available", null); return@AsyncFunction
      }
      val alreadyGranted = ContextCompat.checkSelfPermission(
        context, Manifest.permission.CAMERA
      ) == PackageManager.PERMISSION_GRANTED

      if (alreadyGranted) {
        promise.resolve(permissionResponse(true, canAskAgain = true))
        return@AsyncFunction
      }

      val permissions = appContext.permissions
      if (permissions == null) {
        promise.reject("E_PERMISSIONS", "Permissions module not available", null)
        return@AsyncFunction
      }

      permissions.askForPermissionsWithPermissionsManager(
        promise,
        Manifest.permission.CAMERA
      )
    }

    // MARK: - Photo Capture

    AsyncFunction("takePictureAsync") { side: String, options: Map<String, Any>?, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("E_CONTEXT", "Context not available", null); return@AsyncFunction
      }
      DualCameraSessionManager.takePicture(side, options, context) { result ->
        result.onSuccess { data -> promise.resolve(data) }
        result.onFailure { error ->
          promise.reject("E_CAPTURE", error.message ?: "Capture failed", error)
        }
      }
    }

    // MARK: - Session Control

    Function("pausePreview") {
      DualCameraSessionManager.pausePreview()
    }

    Function("resumePreview") {
      DualCameraSessionManager.resumePreview()
    }

    // MARK: - View

    View(DualCameraView::class) {
      Events("onCameraReady", "onMountError")

      Prop("side") { view: DualCameraView, side: String ->
        view.setSide(side)
      }
      Prop("lens") { view: DualCameraView, lens: String ->
        view.setLens(lens)
      }
      Prop("zoom") { view: DualCameraView, zoom: Double ->
        view.setZoom(zoom)
      }
      Prop("enableTorch") { view: DualCameraView, enabled: Boolean ->
        view.setEnableTorch(enabled)
      }
      Prop("flash") { view: DualCameraView, mode: String ->
        view.setFlash(mode)
      }
      Prop("mirror") { view: DualCameraView, mirror: Boolean ->
        view.setMirror(mirror)
      }
      Prop("autofocus") { view: DualCameraView, mode: String ->
        view.setAutofocus(mode)
      }
    }
  }

  private fun permissionResponse(granted: Boolean, canAskAgain: Boolean): Map<String, Any> {
    return mapOf(
      "status" to if (granted) "granted" else "denied",
      "granted" to granted,
      "canAskAgain" to canAskAgain,
      "expires" to "never"
    )
  }
}
