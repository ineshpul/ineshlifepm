import AVFoundation
import AVFAudio
import UIKit

// MARK: - Capture Options & Result

struct CaptureOptions {
  let quality: Double
  let base64: Bool

  init(from dict: [String: Any]?) {
    quality = dict?["quality"] as? Double ?? 1.0
    base64 = dict?["base64"] as? Bool ?? false
  }
}

private class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let options: CaptureOptions
  private let completion: (Result<[String: Any], Error>) -> Void

  init(options: CaptureOptions, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    self.options = options
    self.completion = completion
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error = error {
      completion(.failure(error))
      return
    }
    guard var data = photo.fileDataRepresentation() else {
      completion(.failure(DualCameraError.noPhotoData))
      return
    }

    let dimensions = photo.resolvedSettings.photoDimensions

    if options.quality < 1.0, let image = UIImage(data: data),
       let compressed = image.jpegData(compressionQuality: CGFloat(options.quality)) {
      data = compressed
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".jpg")
    do {
      try data.write(to: url)
      var result: [String: Any] = [
        "uri": url.absoluteString,
        "width": Int(dimensions.width),
        "height": Int(dimensions.height),
      ]
      if options.base64 {
        result["base64"] = data.base64EncodedString()
      }
      completion(.success(result))
    } catch {
      completion(.failure(error))
    }
  }
}

enum DualCameraError: LocalizedError {
  case sessionNotRunning
  case noPhotoData
  case noPhotoOutput
  case torchUnavailable
  case microphoneDenied
  case microphoneNotDetermined
  case recordingInProgress

  var errorDescription: String? {
    switch self {
    case .sessionNotRunning: return "Camera session is not running"
    case .noPhotoData: return "Failed to get photo data"
    case .noPhotoOutput: return "Photo output not available"
    case .torchUnavailable: return "Torch is not available on this device"
    case .microphoneDenied: return "Microphone permission denied"
    case .microphoneNotDetermined:
      return "Microphone permission not determined — allow mic in Settings, then try again"
    case .recordingInProgress: return "Recording already in progress"
    }
  }
}

// MARK: - Capture Controller

/// Owns the `AVCaptureMultiCamSession`. **Every** `AVCaptureSession` graph mutation runs on `captureSessionQueue`.
final class DualCameraCaptureController: NSObject {
  static let shared = DualCameraCaptureController()

  /// All `beginConfiguration` / `addInput` / `addOutput` / `addConnection` / `startRunning` / `stopRunning` happen here only.
  private let captureSessionQueue = DispatchQueue(label: "com.leap.dualcamera.captureSession")

  /// Sample buffers only — never touches the capture session graph.
  private let sampleBufferQueue = DispatchQueue(label: "com.leap.dualcamera.sampleBuffers", qos: .userInitiated)

  private weak var frontView: DualCameraView?
  private weak var backView: DualCameraView?

  private var session: AVCaptureMultiCamSession?
  private(set) var isRunning = false
  private var isPaused = false
  private var isStopping = false
  /// True while `beginConfiguration` … `commitConfiguration` (or equivalent structural work) is in flight.
  private var isConfiguringCaptureSession = false

  private var backLens: String = "wide"

  private var frontDevice: AVCaptureDevice?
  private var backDevice: AVCaptureDevice?

  private var frontPhotoOutput: AVCapturePhotoOutput?
  private var backPhotoOutput: AVCapturePhotoOutput?

  private var frontVideoOutput: AVCaptureVideoDataOutput?
  private var backVideoOutput: AVCaptureVideoDataOutput?
  private var audioOutput: AVCaptureAudioDataOutput?

  private var activePhotoDelegates: [UUID: PhotoCaptureDelegate] = [:]

  private let movieWriter = DualCameraPiPMovieWriter()
  private var maxDurationTimer: DispatchSourceTimer?
  private var lastRecordingResult: Result<[String: Any], Error>?

  private var flashMode: AVCaptureDevice.FlashMode = .off

  private static let queueKey = DispatchSpecificKey<UInt8>()
  private static let queueTag: UInt8 = 1

  private override init() {
    super.init()
    captureSessionQueue.setSpecific(key: Self.queueKey, value: Self.queueTag)
  }

  // MARK: - Permissions

  static func permissionResponse() -> [String: Any] {
    let status = AVCaptureDevice.authorizationStatus(for: .video)
    switch status {
    case .authorized:
      return ["status": "granted", "granted": true, "canAskAgain": true, "expires": "never"]
    case .denied, .restricted:
      return ["status": "denied", "granted": false, "canAskAgain": false, "expires": "never"]
    default:
      return ["status": "undetermined", "granted": false, "canAskAgain": true, "expires": "never"]
    }
  }

  // MARK: - Registration (UIKit view refs always updated on main)

  func register(_ view: DualCameraView, side: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if side == "front" { self.frontView = view } else { self.backView = view }
      self.captureSessionQueue.async { self.syncStartIfReady() }
    }
  }

  func unregister(_ view: DualCameraView) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if view === self.frontView { self.frontView = nil }
      if view === self.backView { self.backView = nil }
      self.captureSessionQueue.async { self.syncStopIfNoViews() }
    }
  }

  func setBackLens(_ lens: String) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      guard lens != self.backLens else { return }
      self.backLens = lens
      if self.isRunning {
        self.syncTeardownSession { [weak self] in
          self?.syncStartIfReady()
        }
      }
    }
  }

  func setZoom(side: String, normalizedZoom: Double) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      let device = (side == "front") ? self.frontDevice : self.backDevice
      guard let dev = device else { return }
      let minZoom = dev.minAvailableVideoZoomFactor
      let maxZoom = dev.maxAvailableVideoZoomFactor
      let factor = minZoom + CGFloat(normalizedZoom) * (maxZoom - minZoom)
      do {
        try dev.lockForConfiguration()
        dev.videoZoomFactor = factor
        dev.unlockForConfiguration()
      } catch {}
    }
  }

  func setTorch(_ enabled: Bool) {
    captureSessionQueue.async { [weak self] in
      guard let device = self?.backDevice, device.hasTorch else { return }
      do {
        try device.lockForConfiguration()
        device.torchMode = enabled ? .on : .off
        device.unlockForConfiguration()
      } catch {}
    }
  }

  func setFlash(_ mode: String) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      switch mode {
      case "on": self.flashMode = .on
      case "auto": self.flashMode = .auto
      default: self.flashMode = .off
      }
    }
  }

  func setAutofocus(side: String, mode: String) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      let device = (side == "front") ? self.frontDevice : self.backDevice
      guard let dev = device, dev.isFocusModeSupported(.continuousAutoFocus) else { return }
      do {
        try dev.lockForConfiguration()
        dev.focusMode = (mode == "on") ? .autoFocus : .continuousAutoFocus
        dev.unlockForConfiguration()
      } catch {}
    }
  }

  private func backDeviceType() -> AVCaptureDevice.DeviceType {
    switch backLens {
    case "ultraWide": return .builtInUltraWideCamera
    case "telephoto": return .builtInTelephotoCamera
    default: return .builtInWideAngleCamera
    }
  }

  // MARK: - Session lifecycle (captureSessionQueue only)

  private func syncStartIfReady() {
    assert(DispatchQueue.getSpecific(key: Self.queueKey) != nil)

    guard frontView != nil, backView != nil else { return }
    guard !isRunning else { return }

    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        if granted {
          self?.captureSessionQueue.async { self?.syncStartIfReady() }
        } else {
          DispatchQueue.main.async {
            self?.frontView?.showError("Camera permission denied")
            self?.backView?.showError("Camera permission denied")
          }
        }
      }
      return
    }

    guard AVCaptureMultiCamSession.isMultiCamSupported else {
      DispatchQueue.main.async {
        self.frontView?.showError("Multi-camera not supported")
        self.backView?.showError("Multi-camera not supported")
      }
      return
    }

    guard let fv = frontView, let bv = backView else { return }

    let session = AVCaptureMultiCamSession()

    guard let frontDev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
          let frontInput = try? AVCaptureDeviceInput(device: frontDev) else {
      DispatchQueue.main.async {
        fv.showError("Front camera unavailable")
      }
      return
    }

    let preferredType = backDeviceType()
    guard let backDev = AVCaptureDevice.default(preferredType, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let backInput = try? AVCaptureDeviceInput(device: backDev) else {
      DispatchQueue.main.async {
        bv.showError("Back camera unavailable")
      }
      return
    }

    isConfiguringCaptureSession = true
    session.beginConfiguration()

    if session.canAddInput(frontInput) { session.addInputWithNoConnections(frontInput) }
    if session.canAddInput(backInput) { session.addInputWithNoConnections(backInput) }

    let frontOutput = AVCaptureVideoDataOutput()
    frontOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
    ]
    frontOutput.alwaysDiscardsLateVideoFrames = true
    frontOutput.setSampleBufferDelegate(self, queue: sampleBufferQueue)

    let backOutput = AVCaptureVideoDataOutput()
    backOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
    ]
    backOutput.alwaysDiscardsLateVideoFrames = true
    backOutput.setSampleBufferDelegate(self, queue: sampleBufferQueue)

    if session.canAddOutput(frontOutput) { session.addOutputWithNoConnections(frontOutput) }
    if session.canAddOutput(backOutput) { session.addOutputWithNoConnections(backOutput) }

    var audioOut: AVCaptureAudioDataOutput?
    if let mic = AVCaptureDevice.default(for: .audio),
       let micInput = try? AVCaptureDeviceInput(device: mic) {
      var micAdded = false
      if session.canAddInput(micInput) {
        session.addInputWithNoConnections(micInput)
        micAdded = true
      }
      let audio = AVCaptureAudioDataOutput()
      audio.setSampleBufferDelegate(self, queue: sampleBufferQueue)
      if micAdded, session.canAddOutput(audio) {
        session.addOutputWithNoConnections(audio)
        if let micPort = micInput.ports.first {
          let audioConn = AVCaptureConnection(inputPorts: [micPort], output: audio)
          if session.canAddConnection(audioConn) {
            session.addConnection(audioConn)
          }
        }
        audioOut = audio
      }
    }

    let frontPhoto = AVCapturePhotoOutput()
    let backPhoto = AVCapturePhotoOutput()
    if session.canAddOutput(frontPhoto) { session.addOutputWithNoConnections(frontPhoto) }
    if session.canAddOutput(backPhoto) { session.addOutputWithNoConnections(backPhoto) }

    guard let frontPort = frontInput.ports.first,
          let backPort = backInput.ports.first else {
      session.commitConfiguration()
      isConfiguringCaptureSession = false
      DispatchQueue.main.async {
        fv.showError("Could not get camera ports")
        bv.showError("Could not get camera ports")
      }
      return
    }

    let frontVideoConn = AVCaptureConnection(inputPorts: [frontPort], output: frontOutput)
    let backVideoConn = AVCaptureConnection(inputPorts: [backPort], output: backOutput)
    if session.canAddConnection(frontVideoConn) { session.addConnection(frontVideoConn) }
    if session.canAddConnection(backVideoConn) { session.addConnection(backVideoConn) }

    let frontPhotoConn = AVCaptureConnection(inputPorts: [frontPort], output: frontPhoto)
    let backPhotoConn = AVCaptureConnection(inputPorts: [backPort], output: backPhoto)
    if session.canAddConnection(frontPhotoConn) { session.addConnection(frontPhotoConn) }
    if session.canAddConnection(backPhotoConn) { session.addConnection(backPhotoConn) }

    session.commitConfiguration()
    isConfiguringCaptureSession = false

    self.session = session
    self.frontDevice = frontDev
    self.backDevice = backDev
    self.frontPhotoOutput = frontPhoto
    self.backPhotoOutput = backPhoto
    self.frontVideoOutput = frontOutput
    self.backVideoOutput = backOutput
    self.audioOutput = audioOut

    let frontPreview = AVCaptureVideoPreviewLayer()
    frontPreview.setSessionWithNoConnection(session)
    let backPreview = AVCaptureVideoPreviewLayer()
    backPreview.setSessionWithNoConnection(session)

    let frontPreviewConn = AVCaptureConnection(inputPort: frontPort, videoPreviewLayer: frontPreview)
    if session.canAddConnection(frontPreviewConn) { session.addConnection(frontPreviewConn) }
    let backPreviewConn = AVCaptureConnection(inputPort: backPort, videoPreviewLayer: backPreview)
    if session.canAddConnection(backPreviewConn) { session.addConnection(backPreviewConn) }

    DispatchQueue.main.async { [weak self] in
      fv.attachPreview(frontPreview)
      bv.attachPreview(backPreview)
      self?.captureSessionQueue.async { [weak self] in
        guard let self else { return }
        session.startRunning()
        let running = session.isRunning
        if running {
          self.isRunning = true
          self.isPaused = false
        }
        DispatchQueue.main.async {
          if running {
            fv.sessionDidStart()
            bv.sessionDidStart()
          } else {
            fv.showError("Failed to start camera session")
            bv.showError("Failed to start camera session")
          }
        }
      }
    }
  }

  private func syncStopIfNoViews() {
    assert(DispatchQueue.getSpecific(key: Self.queueKey) != nil)
    if frontView != nil || backView != nil { return }
    syncTeardownSession(completion: nil)
  }

  private func syncTeardownSession(completion: (() -> Void)?) {
    assert(DispatchQueue.getSpecific(key: Self.queueKey) != nil)
    isStopping = true
    isRunning = false
    isPaused = false
    activePhotoDelegates.removeAll()
    cancelMaxDurationTimer()
    if movieWriter.isRecording {
      movieWriter.cancel()
    }
    lastRecordingResult = nil

    let sess = session
    sess?.stopRunning()

    DispatchQueue.main.async { [weak self] in
      self?.frontView?.detachPreview()
      self?.backView?.detachPreview()
      self?.captureSessionQueue.async { [weak self] in
        guard let self else {
          completion?()
          return
        }
        self.session = nil
        self.frontDevice = nil
        self.backDevice = nil
        self.frontPhotoOutput = nil
        self.backPhotoOutput = nil
        self.frontVideoOutput = nil
        self.backVideoOutput = nil
        self.audioOutput = nil
        self.isStopping = false
        completion?()
      }
    }
  }

  func pausePreview() {
    captureSessionQueue.async { [weak self] in
      guard let self, self.isRunning, !self.isPaused else { return }
      self.isPaused = true
      self.session?.stopRunning()
    }
  }

  func resumePreview() {
    captureSessionQueue.async { [weak self] in
      guard let self, self.isPaused else { return }
      self.isPaused = false
      self.session?.startRunning()
      DispatchQueue.main.async {
        if self.session?.isRunning == true {
          self.frontView?.sessionDidStart()
          self.backView?.sessionDidStart()
        } else {
          self.frontView?.showError("Failed to resume camera session")
          self.backView?.showError("Failed to resume camera session")
        }
      }
    }
  }

  // MARK: - Photo

  func takePicture(side: String, options: CaptureOptions, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      guard self.isRunning, !self.isPaused else {
        completion(.failure(DualCameraError.sessionNotRunning))
        return
      }
      let output = (side == "front") ? self.frontPhotoOutput : self.backPhotoOutput
      guard let photoOutput = output else {
        completion(.failure(DualCameraError.noPhotoOutput))
        return
      }

      let delegateID = UUID()
      let delegate = PhotoCaptureDelegate(options: options) { [weak self] result in
        self?.activePhotoDelegates.removeValue(forKey: delegateID)
        completion(result)
      }
      self.activePhotoDelegates[delegateID] = delegate

      let settings = AVCapturePhotoSettings()
      if side == "back", photoOutput.supportedFlashModes.contains(self.flashMode) {
        settings.flashMode = self.flashMode
      }

      var photoEx: NSError?
      let photoOk = ObjcPerformCatching({
        photoOutput.capturePhoto(with: settings, delegate: delegate)
      }, &photoEx)
      if !photoOk {
        self.activePhotoDelegates.removeValue(forKey: delegateID)
        completion(.failure(photoEx ?? DualCameraError.noPhotoOutput))
      }
    }
  }

  // MARK: - Recording (orchestration on captureSessionQueue only)

  var isRecordingVideo: Bool {
    movieWriter.isRecording
  }

  func swapRecordingLayout() {
    captureSessionQueue.async { [weak self] in
      self?.movieWriter.swapRecordingLayout()
    }
  }

  func startRecording(
    options: [String: Any]?,
    completion: @escaping (Result<Void, Error>) -> Void
  ) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }

      guard !self.isConfiguringCaptureSession, !self.isStopping else {
        completion(.failure(DualCameraRecorderError.sessionNotReady))
        return
      }
      guard let session = self.session, session.isRunning, self.isRunning, !self.isPaused else {
        completion(.failure(DualCameraRecorderError.sessionNotReady))
        return
      }

      guard !self.movieWriter.isRecording else {
        completion(.failure(DualCameraError.recordingInProgress))
        return
      }

      let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
      if micStatus == .denied || micStatus == .restricted {
        completion(.failure(DualCameraError.microphoneDenied))
        return
      }
      if micStatus == .notDetermined {
        completion(.failure(DualCameraError.microphoneNotDetermined))
        return
      }

      self.lastRecordingResult = nil
      if self.audioOutput != nil {
        do {
          try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
          try AVAudioSession.sharedInstance().setActive(true)
        } catch {
          completion(.failure(error))
          return
        }
      }

      var opts = options ?? [:]
      opts["recordsAudio"] = self.audioOutput != nil
      let recordingOptions = DualCameraRecordingOptions(from: opts)
      var nsExceptionErr: NSError?
      var swiftStartError: Error?
      let objcOk = ObjcPerformCatching({
        do {
          try self.movieWriter.start(options: recordingOptions)
        } catch {
          swiftStartError = error
        }
      }, &nsExceptionErr)
      if !objcOk {
        completion(.failure(nsExceptionErr ?? NSError(
          domain: "expo.dual.camera",
          code: -1,
          userInfo: [NSLocalizedDescriptionKey: "NSException while starting recorder"]
        )))
        return
      }
      if let swiftStartError {
        completion(.failure(swiftStartError))
        return
      }
      self.scheduleMaxDurationStop(seconds: recordingOptions.maxDurationSec)
      completion(.success(()))
    }
  }

  func stopRecording(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    captureSessionQueue.async { [weak self] in
      guard let self else { return }
      self.cancelMaxDurationTimer()

      if !self.movieWriter.isRecording, let cached = self.lastRecordingResult {
        completion(cached)
        return
      }

      guard self.movieWriter.isRecording else {
        completion(.failure(DualCameraRecorderError.notRecording))
        return
      }

      self.movieWriter.finish { [weak self] result in
        guard let self else { return }
        self.captureSessionQueue.async {
          self.lastRecordingResult = result
        }
        DispatchQueue.main.async {
          try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        completion(result)
      }
    }
  }

  private func scheduleMaxDurationStop(seconds: Double) {
    cancelMaxDurationTimer()
    let timer = DispatchSource.makeTimerSource(queue: captureSessionQueue)
    timer.schedule(deadline: .now() + seconds)
    timer.setEventHandler { [weak self] in
      self?.autoStopAtMaxDuration()
    }
    timer.resume()
    maxDurationTimer = timer
  }

  private func cancelMaxDurationTimer() {
    maxDurationTimer?.cancel()
    maxDurationTimer = nil
  }

  private func autoStopAtMaxDuration() {
    guard movieWriter.isRecording else { return }
    movieWriter.finish { [weak self] result in
      guard let self else { return }
      self.captureSessionQueue.async {
        self.lastRecordingResult = result
      }
      DispatchQueue.main.async {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      }
    }
  }
}

extension DualCameraCaptureController: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard movieWriter.isRecording else { return }

    if output === backVideoOutput {
      let continueRecording = movieWriter.appendBackSample(sampleBuffer)
      if !continueRecording {
        captureSessionQueue.async { [weak self] in
          self?.autoStopAtMaxDuration()
        }
      }
      return
    }

    if output === frontVideoOutput {
      movieWriter.storeFrontSample(sampleBuffer)
      return
    }

    if output === audioOutput {
      movieWriter.appendAudioSample(sampleBuffer)
    }
  }
}
