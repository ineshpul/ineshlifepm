import AVFoundation
import ExpoModulesCore
import Foundation

// MARK: - Exactly-once Promise settlement

/// Ensures each TurboModule `Promise` is resolved or rejected at most once (Hermes crashes on double settlement).
final class DualCameraPromiseGuard {
  private let promise: Promise
  private var settled = false
  private let lock = NSLock()
  private let onSettle: (() -> Void)?

  init(_ promise: Promise, onSettle: (() -> Void)? = nil) {
    self.promise = promise
    self.onSettle = onSettle
  }

  var isSettled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return settled
  }

  func resolve(_ value: Any) {
    lock.lock()
    if settled {
      lock.unlock()
      return
    }
    settled = true
    let callback = onSettle
    lock.unlock()
    callback?()
    promise.resolve(value)
  }

  func reject(_ code: String, _ message: String) {
    lock.lock()
    if settled {
      lock.unlock()
      return
    }
    settled = true
    let callback = onSettle
    lock.unlock()
    callback?()
    promise.reject(code, message)
  }
}

// MARK: - In-flight recording promises (rapid double-call from JS)

private enum DualCameraRecordingPromiseGate {
  private static var pendingStart: DualCameraPromiseGuard?
  private static var pendingStop: DualCameraPromiseGuard?
  private static let lock = NSLock()

  /// Returns a guard for this `startRecording` call, or `nil` if one is already in flight.
  static func acquireStart(_ promise: Promise) -> DualCameraPromiseGuard? {
    lock.lock()
    defer { lock.unlock() }
    if pendingStart != nil {
      return nil
    }
    let guard_ = DualCameraPromiseGuard(promise) {
      lock.lock()
      pendingStart = nil
      lock.unlock()
    }
    pendingStart = guard_
    return guard_
  }

  /// Returns a guard for this `stopRecording` call, or `nil` if one is already in flight.
  static func acquireStop(_ promise: Promise) -> DualCameraPromiseGuard? {
    lock.lock()
    defer { lock.unlock() }
    if pendingStop != nil {
      return nil
    }
    let guard_ = DualCameraPromiseGuard(promise) {
      lock.lock()
      pendingStop = nil
      lock.unlock()
    }
    pendingStop = guard_
    return guard_
  }
}

// MARK: - TurboModule entry hardening

enum DualCameraTurboSafe {

  /// Runs `work` on the calling thread. Swift errors and NSExceptions map to a single `reject`.
  static func invokeAsync(guard settled: DualCameraPromiseGuard, _ work: (DualCameraPromiseGuard) throws -> Void) {
    var nsException: NSError?
    let ok = ObjcPerformCatching({
      do {
        try work(settled)
      } catch {
        settled.reject("E_DUAL_CAMERA_SWIFT", error.localizedDescription)
      }
    }, &nsException)
    if !ok {
      settled.reject(
        "E_DUAL_CAMERA_NS_EXCEPTION",
        (nsException as NSError?)?.localizedDescription ?? "NSException"
      )
    }
  }

  static func acquireStartRecordingPromise(_ promise: Promise) -> DualCameraPromiseGuard? {
    DualCameraRecordingPromiseGate.acquireStart(promise)
  }

  static func acquireStopRecordingPromise(_ promise: Promise) -> DualCameraPromiseGuard? {
    DualCameraRecordingPromiseGate.acquireStop(promise)
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
