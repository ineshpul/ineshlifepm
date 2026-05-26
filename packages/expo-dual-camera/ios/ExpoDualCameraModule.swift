import ExpoModulesCore
import AVFoundation

public class ExpoDualCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDualCamera")

    // MARK: - Support Check

    AsyncFunction("isSupported") { () -> Bool in
      AVCaptureMultiCamSession.isMultiCamSupported
    }

    // MARK: - Permissions

    AsyncFunction("getCameraPermissionsAsync") { () -> [String: Any] in
      DualCameraSessionManager.permissionResponse()
    }

    AsyncFunction("requestCameraPermissionsAsync") { (promise: Promise) in
      if AVCaptureDevice.authorizationStatus(for: .video) == .authorized {
        promise.resolve(DualCameraSessionManager.permissionResponse())
        return
      }
      AVCaptureDevice.requestAccess(for: .video) { _ in
        promise.resolve(DualCameraSessionManager.permissionResponse())
      }
    }

    // MARK: - Photo Capture

    AsyncFunction("takePictureAsync") { (side: String, options: [String: Any]?, promise: Promise) in
      var err: NSError?
      let ok = EXDualCameraTryBlock({
        let opts = CaptureOptions(from: options)
        DualCameraSessionManager.shared.takePicture(side: side, options: opts) { result in
          switch result {
          case .success(let data):
            promise.resolve(data)
          case .failure(let captureError):
            promise.reject("E_CAPTURE", captureError.localizedDescription)
          }
        }
      }, &err)
      if !ok {
        promise.reject("E_CAPTURE_EXCEPTION", (err as NSError?)?.localizedDescription ?? "Native exception")
      }
    }

    // MARK: - Session Control

    Function("pausePreview") {
      var err: NSError?
      let ok = EXDualCameraTryBlock({
        DualCameraSessionManager.shared.pausePreview()
      }, &err)
      if !ok {
        NSLog("[ExpoDualCamera] pausePreview exception: %@", (err as NSError?)?.localizedDescription ?? "unknown")
      }
    }

    Function("resumePreview") {
      var err: NSError?
      let ok = EXDualCameraTryBlock({
        DualCameraSessionManager.shared.resumePreview()
      }, &err)
      if !ok {
        NSLog("[ExpoDualCamera] resumePreview exception: %@", (err as NSError?)?.localizedDescription ?? "unknown")
      }
    }

    // MARK: - Video Recording

    AsyncFunction("startRecording") { (options: [String: Any]?, promise: Promise) in
      var err: NSError?
      let ok = EXDualCameraTryBlock({
        DualCameraSessionManager.shared.startRecording(options: options) { result in
          switch result {
          case .success:
            promise.resolve(true)
          case .failure(let recordError):
            promise.reject("E_RECORDING_START", recordError.localizedDescription)
          }
        }
      }, &err)
      if !ok {
        promise.reject("E_RECORDING_START_EXCEPTION", (err as NSError?)?.localizedDescription ?? "Native exception")
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      var err: NSError?
      let ok = EXDualCameraTryBlock({
        DualCameraSessionManager.shared.stopRecording { result in
          switch result {
          case .success(let data):
            promise.resolve(data)
          case .failure(let recordError):
            promise.reject("E_RECORDING_STOP", recordError.localizedDescription)
          }
        }
      }, &err)
      if !ok {
        promise.reject("E_RECORDING_STOP_EXCEPTION", (err as NSError?)?.localizedDescription ?? "Native exception")
      }
    }

    // MARK: - View

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
