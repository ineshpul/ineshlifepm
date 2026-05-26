import AVFoundation
import ExpoModulesCore

/// JS-facing module: **no** capture logic here — only delegates to `DualCameraCaptureController` behind `DualCameraTurboSafe`.
public class ExpoDualCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDualCamera")

    AsyncFunction("isSupported") { () -> Bool in
      DualCameraTurboSafe.isMultiCamSupported()
    }

    AsyncFunction("getCameraPermissionsAsync") { () -> [String: Any] in
      DualCameraCaptureController.permissionResponse()
    }

    AsyncFunction("requestCameraPermissionsAsync") { (promise: Promise) in
      DualCameraTurboSafe.invokeAsync(promise: promise) {
        if AVCaptureDevice.authorizationStatus(for: .video) == .authorized {
          promise.resolve(DualCameraCaptureController.permissionResponse())
          return
        }
        AVCaptureDevice.requestAccess(for: .video) { _ in
          var innerNs: NSError?
          let innerOk = ObjcExceptionCatcher.try(block: {
            promise.resolve(DualCameraCaptureController.permissionResponse())
          }, outError: &innerNs)
          if !innerOk {
            promise.reject(
              "E_DUAL_CAMERA_NS_EXCEPTION",
              (innerNs as NSError?)?.localizedDescription ?? "NSException"
            )
          }
        }
      }
    }

    AsyncFunction("takePictureAsync") { (side: String, options: [String: Any]?, promise: Promise) in
      DualCameraTurboSafe.invokeAsync(promise: promise) {
        let opts = CaptureOptions(from: options)
        DualCameraCaptureController.shared.takePicture(side: side, options: opts) { result in
          switch result {
          case .success(let data):
            promise.resolve(data)
          case .failure(let error):
            promise.reject("E_CAPTURE", error.localizedDescription)
          }
        }
      }
    }

    Function("pausePreview") {
      DualCameraTurboSafe.invokeSync {
        DualCameraCaptureController.shared.pausePreview()
      }
    }

    Function("resumePreview") {
      DualCameraTurboSafe.invokeSync {
        DualCameraCaptureController.shared.resumePreview()
      }
    }

    AsyncFunction("startRecording") { (options: [String: Any]?, promise: Promise) in
      DualCameraTurboSafe.invokeAsync(promise: promise) {
        DualCameraCaptureController.shared.startRecording(options: options) { result in
          switch result {
          case .success:
            promise.resolve(true)
          case .failure(let error):
            promise.reject("E_RECORDING_START", error.localizedDescription)
          }
        }
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      DualCameraTurboSafe.invokeAsync(promise: promise) {
        DualCameraCaptureController.shared.stopRecording { result in
          switch result {
          case .success(let data):
            promise.resolve(data)
          case .failure(let error):
            promise.reject("E_RECORDING_STOP", error.localizedDescription)
          }
        }
      }
    }

    View(DualCameraView.self) {
      Events("onCameraReady", "onMountError")

      Prop("side") { (view: DualCameraView, side: String) in
        view.setSide(side)
      }
      Prop("lens") { (view: DualCameraView, lens: String) in
        view.setLens(lens)
      }
      Prop("zoom") { (view: DualCameraView, zoom: Double) in
        view.setZoom(zoom)
      }
      Prop("enableTorch") { (view: DualCameraView, enabled: Bool) in
        view.setEnableTorch(enabled)
      }
      Prop("flash") { (view: DualCameraView, mode: String) in
        view.setFlash(mode)
      }
      Prop("mirror") { (view: DualCameraView, mirror: Bool) in
        view.setMirror(mirror)
      }
      Prop("autofocus") { (view: DualCameraView, mode: String) in
        view.setAutofocus(mode)
      }
    }
  }
}
