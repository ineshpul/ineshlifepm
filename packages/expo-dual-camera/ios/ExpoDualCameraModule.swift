import AVFoundation
import ExpoModulesCore

/// JS-facing module: thin delegate to `DualCameraCaptureController` with exactly-once Promise settlement.
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
      let settled = DualCameraPromiseGuard(promise)
      DualCameraTurboSafe.invokeAsync(guard: settled) { settled in
        if AVCaptureDevice.authorizationStatus(for: .video) == .authorized {
          settled.resolve(DualCameraCaptureController.permissionResponse())
          return
        }
        AVCaptureDevice.requestAccess(for: .video) { _ in
          var innerNs: NSError?
          let innerOk = ObjcPerformCatching({
            settled.resolve(DualCameraCaptureController.permissionResponse())
          }, &innerNs)
          if !innerOk {
            settled.reject(
              "E_DUAL_CAMERA_NS_EXCEPTION",
              (innerNs as NSError?)?.localizedDescription ?? "NSException"
            )
          }
        }
      }
    }

    AsyncFunction("takePictureAsync") { (side: String, options: [String: Any]?, promise: Promise) in
      let settled = DualCameraPromiseGuard(promise)
      DualCameraTurboSafe.invokeAsync(guard: settled) { settled in
        let opts = CaptureOptions(from: options)
        DualCameraCaptureController.shared.takePicture(side: side, options: opts) { result in
          switch result {
          case .success(let data):
            settled.resolve(data)
          case .failure(let error):
            settled.reject("E_CAPTURE", error.localizedDescription)
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

    Function("swapRecordingLayout") {
      DualCameraTurboSafe.invokeSync {
        DualCameraCaptureController.shared.swapRecordingLayout()
      }
    }

    AsyncFunction("concatVideoSegments") { (options: [String: Any]?, promise: Promise) in
      let settled = DualCameraPromiseGuard(promise)
      DualCameraTurboSafe.invokeAsync(guard: settled) { settled in
        let rawUris = options?["uris"] as? [String] ?? []
        let urls = rawUris.compactMap { URL(string: $0) }
        guard !urls.isEmpty else {
          settled.reject("E_CONCAT", "No video segments to merge")
          return
        }
        DualCameraVideoConcat.concat(urls: urls) { result in
          switch result {
          case .success(let data):
            settled.resolve(data)
          case .failure(let error):
            settled.reject("E_CONCAT", error.localizedDescription)
          }
        }
      }
    }

    AsyncFunction("startRecording") { (options: [String: Any]?, promise: Promise) in
      guard let settled = DualCameraTurboSafe.acquireStartRecordingPromise(promise) else {
        DualCameraPromiseGuard(promise).reject(
          "E_RECORDING_BUSY",
          "startRecording already in progress"
        )
        return
      }
      DualCameraTurboSafe.invokeAsync(guard: settled) { settled in
        DualCameraCaptureController.shared.startRecording(options: options) { result in
          switch result {
          case .success:
            settled.resolve(true)
          case .failure(let error):
            settled.reject("E_RECORDING_START", error.localizedDescription)
          }
        }
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      guard let settled = DualCameraTurboSafe.acquireStopRecordingPromise(promise) else {
        DualCameraPromiseGuard(promise).reject(
          "E_RECORDING_BUSY",
          "stopRecording already in progress"
        )
        return
      }
      DualCameraTurboSafe.invokeAsync(guard: settled) { settled in
        DualCameraCaptureController.shared.stopRecording { result in
          switch result {
          case .success(let data):
            settled.resolve(data)
          case .failure(let error):
            settled.reject("E_RECORDING_STOP", error.localizedDescription)
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
