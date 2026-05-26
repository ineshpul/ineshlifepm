import AVFoundation
import ExpoModulesCore
import Foundation

/// TurboModule entry hardening: Swift `Error` **and** Objective-C `NSException` (Swift cannot catch the latter).
enum DualCameraTurboSafe {

  static func invokeAsync(promise: Promise, _ work: () throws -> Void) {
    var nsException: NSError?
    let ok = ObjcPerformCatching({
      do {
        try work()
      } catch {
        promise.reject("E_DUAL_CAMERA_SWIFT", error.localizedDescription)
      }
    }, &nsException)
    if !ok {
      promise.reject(
        "E_DUAL_CAMERA_NS_EXCEPTION",
        (nsException as NSError?)?.localizedDescription ?? "NSException"
      )
    }
  }

  static func invokeSync(_ work: () throws -> Void) {
    var nsException: NSError?
    let ok = ObjcPerformCatching({
      do {
        try work()
      } catch {
        NSLog("[ExpoDualCamera] Swift error: %@", error.localizedDescription)
      }
    }, &nsException)
    if !ok {
      NSLog("[ExpoDualCamera] NSException: %@", (nsException as NSError?)?.localizedDescription ?? "unknown")
    }
  }

  static func isMultiCamSupported() -> Bool {
    var value = false
    var nsException: NSError?
    let ok = ObjcPerformCatching({
      value = AVCaptureMultiCamSession.isMultiCamSupported
    }, &nsException)
    return ok && value
  }
}
