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

// MARK: - Photo Capture Delegate

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

// MARK: - Error Types

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
        case .microphoneNotDetermined: return "Microphone permission not determined — allow mic in Settings, then try again"
        case .recordingInProgress: return "Recording already in progress"
        }
    }
}

// MARK: - Session Manager

class DualCameraSessionManager: NSObject {
    static let shared = DualCameraSessionManager()

    // Views (main thread only)
    private weak var frontView: DualCameraView?
    private weak var backView: DualCameraView?

    // Session state
    private var session: AVCaptureMultiCamSession?
  private(set) var isRunning = false
  private var isPaused = false
  /// Prevents startRecording while teardown is in progress.
  private var isStopping = false
    private var backLens: String = "wide"

    // Devices
    private var frontDevice: AVCaptureDevice?
    private var backDevice: AVCaptureDevice?

    // Photo outputs
    private var frontPhotoOutput: AVCapturePhotoOutput?
    private var backPhotoOutput: AVCapturePhotoOutput?

    // Video + audio outputs (recording)
    private var frontVideoOutput: AVCaptureVideoDataOutput?
    private var backVideoOutput: AVCaptureVideoDataOutput?
    private var audioOutput: AVCaptureAudioDataOutput?

    // In-flight photo delegates
    private var activePhotoDelegates: [UUID: PhotoCaptureDelegate] = [:]

    // Video recording
    private let videoRecorder = DualCameraVideoRecorder()
    private var maxDurationTimer: DispatchSourceTimer?
    private var lastRecordingResult: Result<[String: Any], Error>?

    // Settings (set via view props, used during capture)
    private var flashMode: AVCaptureDevice.FlashMode = .off

    private let sessionQueue = DispatchQueue(label: "com.expodualcamera.session")
    private let videoQueue = DispatchQueue(label: "com.expodualcamera.video", qos: .userInitiated)

    private override init() {
        super.init()
    }

    // MARK: - Permission Helpers

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

    // MARK: - Registration

    func register(_ view: DualCameraView, side: String) {
        if side == "front" { frontView = view }
        else { backView = view }
        startIfReady()
    }

    func unregister(_ view: DualCameraView) {
        if view === frontView { frontView = nil }
        if view === backView { backView = nil }
    stop()
    }

    func setBackLens(_ lens: String) {
        guard lens != backLens else { return }
        backLens = lens
        if isRunning {
            stop()
            startIfReady()
        }
    }

    // MARK: - Props forwarded from views

    func setZoom(side: String, normalizedZoom: Double) {
        let device = (side == "front") ? frontDevice : backDevice
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

    func setTorch(_ enabled: Bool) {
        guard let device = backDevice, device.hasTorch else { return }
        do {
            try device.lockForConfiguration()
            device.torchMode = enabled ? .on : .off
            device.unlockForConfiguration()
        } catch {}
    }

    func setFlash(_ mode: String) {
        switch mode {
        case "on": flashMode = .on
        case "auto": flashMode = .auto
        default: flashMode = .off
        }
    }

    func setAutofocus(side: String, mode: String) {
        let device = (side == "front") ? frontDevice : backDevice
        guard let dev = device, dev.isFocusModeSupported(.continuousAutoFocus) else { return }

        do {
            try dev.lockForConfiguration()
            // expo-camera: "on" = focus once and lock, "off" = continuous autofocus
            dev.focusMode = (mode == "on") ? .autoFocus : .continuousAutoFocus
            dev.unlockForConfiguration()
        } catch {}
    }

    // MARK: - Lens Selection

    private func backDeviceType() -> AVCaptureDevice.DeviceType {
        switch backLens {
        case "ultraWide": return .builtInUltraWideCamera
        case "telephoto": return .builtInTelephotoCamera
        default: return .builtInWideAngleCamera
        }
    }

    // MARK: - Session Lifecycle

    private func startIfReady() {
        guard let frontView = frontView, let backView = backView else { return }
        guard !isRunning else { return }

        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    DispatchQueue.main.async { self?.startIfReady() }
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
            frontView.showError("Multi-camera not supported")
            backView.showError("Multi-camera not supported")
            return
        }

        let session = AVCaptureMultiCamSession()

        guard let frontDev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let frontInput = try? AVCaptureDeviceInput(device: frontDev) else {
            frontView.showError("Front camera unavailable")
            return
        }

        let preferredType = backDeviceType()
        guard let backDev = AVCaptureDevice.default(preferredType, for: .video, position: .back)
                ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let backInput = try? AVCaptureDeviceInput(device: backDev) else {
            backView.showError("Back camera unavailable")
            return
        }

        // Capture strong refs for the closure
        let capturedFrontView = frontView
        let capturedBackView = backView

        sessionQueue.async { [weak self] in
            guard let self else { return }

            session.beginConfiguration()

            // --- Inputs ---
            if session.canAddInput(frontInput) { session.addInputWithNoConnections(frontInput) }
            if session.canAddInput(backInput) { session.addInputWithNoConnections(backInput) }

            // --- Video data outputs ---
            let frontOutput = AVCaptureVideoDataOutput()
            frontOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
            ]
            frontOutput.alwaysDiscardsLateVideoFrames = true
            frontOutput.setSampleBufferDelegate(self, queue: self.videoQueue)

            let backOutput = AVCaptureVideoDataOutput()
            backOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)
            ]
            backOutput.alwaysDiscardsLateVideoFrames = true
            backOutput.setSampleBufferDelegate(self, queue: self.videoQueue)

            if session.canAddOutput(frontOutput) { session.addOutputWithNoConnections(frontOutput) }
            if session.canAddOutput(backOutput) { session.addOutputWithNoConnections(backOutput) }

            // --- Microphone (for video recording) ---
            var audioOut: AVCaptureAudioDataOutput?
            if let mic = AVCaptureDevice.default(for: .audio),
               let micInput = try? AVCaptureDeviceInput(device: mic) {
                var micAdded = false
                if session.canAddInput(micInput) {
                    session.addInputWithNoConnections(micInput)
                    micAdded = true
                }
                let audio = AVCaptureAudioDataOutput()
                // Same queue as video samples so delegate + AVAssetWriter are serialized (no cross-thread races).
                audio.setSampleBufferDelegate(self, queue: self.videoQueue)
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

            // --- Photo outputs ---
            let frontPhoto = AVCapturePhotoOutput()
            let backPhoto = AVCapturePhotoOutput()
            if session.canAddOutput(frontPhoto) { session.addOutputWithNoConnections(frontPhoto) }
            if session.canAddOutput(backPhoto) { session.addOutputWithNoConnections(backPhoto) }

            guard let frontPort = frontInput.ports.first,
                  let backPort = backInput.ports.first else {
                DispatchQueue.main.async {
                    capturedFrontView.showError("Could not get camera ports")
                    capturedBackView.showError("Could not get camera ports")
                }
                return
            }

            // --- Video connections ---
            let frontVideoConn = AVCaptureConnection(inputPorts: [frontPort], output: frontOutput)
            let backVideoConn = AVCaptureConnection(inputPorts: [backPort], output: backOutput)
            if session.canAddConnection(frontVideoConn) { session.addConnection(frontVideoConn) }
            if session.canAddConnection(backVideoConn) { session.addConnection(backVideoConn) }

            // --- Photo connections ---
            let frontPhotoConn = AVCaptureConnection(inputPorts: [frontPort], output: frontPhoto)
            let backPhotoConn = AVCaptureConnection(inputPorts: [backPort], output: backPhoto)
            if session.canAddConnection(frontPhotoConn) { session.addConnection(frontPhotoConn) }
            if session.canAddConnection(backPhotoConn) { session.addConnection(backPhotoConn) }

            session.commitConfiguration()

            // --- Preview layers (must be on main thread for UIKit) ---
            DispatchQueue.main.async {
                let frontPreview = AVCaptureVideoPreviewLayer()
                frontPreview.setSessionWithNoConnection(session)
                let backPreview = AVCaptureVideoPreviewLayer()
                backPreview.setSessionWithNoConnection(session)

                let frontPreviewConn = AVCaptureConnection(inputPort: frontPort, videoPreviewLayer: frontPreview)
                if session.canAddConnection(frontPreviewConn) { session.addConnection(frontPreviewConn) }
                let backPreviewConn = AVCaptureConnection(inputPort: backPort, videoPreviewLayer: backPreview)
                if session.canAddConnection(backPreviewConn) { session.addConnection(backPreviewConn) }

                capturedFrontView.attachPreview(frontPreview)
                capturedBackView.attachPreview(backPreview)

                self.session = session
                self.frontDevice = frontDev
                self.backDevice = backDev
                self.frontPhotoOutput = frontPhoto
                self.backPhotoOutput = backPhoto
                self.frontVideoOutput = frontOutput
                self.backVideoOutput = backOutput
                self.audioOutput = audioOut

                // Start the session AFTER preview connections are wired up
                self.sessionQueue.async {
                    session.startRunning()

                    DispatchQueue.main.async {
                        if session.isRunning {
                            self.isRunning = true
                            self.isPaused = false
                            capturedFrontView.sessionDidStart()
                            capturedBackView.sessionDidStart()
                        } else {
                            capturedFrontView.showError("Failed to start camera session")
                            capturedBackView.showError("Failed to start camera session")
                        }
                    }
                }
            }
        }
    }

  private func stop() {
    // Serialize all teardown with recording/start logic (which also runs on sessionQueue).
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.isStopping = true
      self.isRunning = false
      self.isPaused = false
      self.activePhotoDelegates.removeAll()
      self.cancelMaxDurationTimer()
      if self.videoRecorder.isRecording {
        self.videoRecorder.cancel()
      }
      self.lastRecordingResult = nil

      let sess = self.session
      sess?.stopRunning()

      DispatchQueue.main.async {
        self.frontView?.detachPreview()
        self.backView?.detachPreview()
        self.session = nil
        self.frontDevice = nil
        self.backDevice = nil
        self.frontPhotoOutput = nil
        self.backPhotoOutput = nil
        self.frontVideoOutput = nil
        self.backVideoOutput = nil
        self.audioOutput = nil
        // Allow restart after we fully detached views.
        self.sessionQueue.async { [weak self] in
          self?.isStopping = false
        }
      }
    }
  }

    // MARK: - Pause / Resume

    func pausePreview() {
        guard isRunning, !isPaused else { return }
        isPaused = true
        sessionQueue.async { [weak self] in
            self?.session?.stopRunning()
        }
    }

    func resumePreview() {
        guard isPaused else { return }
        isPaused = false
        sessionQueue.async { [weak self] in
            guard let self else { return }
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

    // MARK: - Photo Capture

    func takePicture(side: String, options: CaptureOptions, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard isRunning, !isPaused else {
            completion(.failure(DualCameraError.sessionNotRunning))
            return
        }

        let output = (side == "front") ? frontPhotoOutput : backPhotoOutput
        guard let photoOutput = output else {
            completion(.failure(DualCameraError.noPhotoOutput))
            return
        }

        let delegateID = UUID()
        let delegate = PhotoCaptureDelegate(options: options) { [weak self] result in
            self?.activePhotoDelegates.removeValue(forKey: delegateID)
            completion(result)
        }
        activePhotoDelegates[delegateID] = delegate

        let settings = AVCapturePhotoSettings()
        if side == "back", photoOutput.supportedFlashModes.contains(flashMode) {
            settings.flashMode = flashMode
        }

        sessionQueue.async {
            photoOutput.capturePhoto(with: settings, delegate: delegate)
        }
    }

    // MARK: - Video Recording

    var isRecordingVideo: Bool {
        videoRecorder.isRecording
    }

    func startRecording(
        options: [String: Any]?,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
      guard self.isRunning, !self.isPaused, !self.isStopping, let session = self.session, session.isRunning else {
                completion(.failure(DualCameraRecorderError.sessionNotReady))
                return
            }
            guard !self.videoRecorder.isRecording else {
                completion(.failure(DualCameraError.recordingInProgress))
                return
            }

            let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
            if micStatus == .denied || micStatus == .restricted {
                completion(.failure(DualCameraError.microphoneDenied))
                return
            }
            // Never block sessionQueue on permission UI — request mic from JS before recording.
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
            do {
                try self.videoRecorder.start(options: recordingOptions)
                self.scheduleMaxDurationStop(seconds: recordingOptions.maxDurationSec)
                completion(.success(()))
            } catch {
                completion(.failure(error))
            }
        }
    }

    func stopRecording(completion: @escaping (Result<[String: Any], Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.cancelMaxDurationTimer()

            if !self.videoRecorder.isRecording, let cached = self.lastRecordingResult {
                completion(cached)
                return
            }

            guard self.videoRecorder.isRecording else {
                completion(.failure(DualCameraRecorderError.notRecording))
                return
            }

            self.videoRecorder.finish { [weak self] result in
                guard let self else { return }
                self.lastRecordingResult = result
                DispatchQueue.main.async {
                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                }
                completion(result)
            }
        }
    }

    private func scheduleMaxDurationStop(seconds: Double) {
        cancelMaxDurationTimer()
        let timer = DispatchSource.makeTimerSource(queue: sessionQueue)
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
        guard videoRecorder.isRecording else { return }
        videoRecorder.finish { [weak self] result in
            guard let self else { return }
            self.lastRecordingResult = result
            DispatchQueue.main.async {
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        }
    }
}

// MARK: - Sample buffer delegates

extension DualCameraSessionManager: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard videoRecorder.isRecording else { return }

        if output === backVideoOutput {
            let continueRecording = videoRecorder.appendBackSample(sampleBuffer)
            if !continueRecording {
                sessionQueue.async { [weak self] in
                    self?.autoStopAtMaxDuration()
                }
            }
            return
        }

        if output === frontVideoOutput {
            videoRecorder.storeFrontSample(sampleBuffer)
            return
        }

        if output === audioOutput {
            videoRecorder.appendAudioSample(sampleBuffer)
        }
    }
}