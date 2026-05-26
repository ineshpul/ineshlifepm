import AVFoundation
import CoreImage
import UIKit

struct DualCameraRecordingOptions {
  let pipX: CGFloat
  let pipY: CGFloat
  let pipWidth: CGFloat
  let pipHeight: CGFloat
  let maxDurationSec: Double
  let mirrorFront: Bool
  /** When false, writer is video-only (no mic in capture graph). */
  let recordsAudio: Bool

  init(from dict: [String: Any]?) {
    let pip = dict?["pip"] as? [String: Any]
    pipX = CGFloat((pip?["x"] as? Double) ?? 0.05)
    pipY = CGFloat((pip?["y"] as? Double) ?? 0.05)
    pipWidth = CGFloat((pip?["width"] as? Double) ?? 0.28)
    pipHeight = CGFloat((pip?["height"] as? Double) ?? 0.22)
    maxDurationSec = (dict?["maxDurationSec"] as? Double) ?? 60
    mirrorFront = (dict?["mirrorFront"] as? Bool) ?? true
    recordsAudio = (dict?["recordsAudio"] as? Bool) ?? true
  }

  var normalizedPipRect: CGRect {
    CGRect(x: pipX, y: pipY, width: pipWidth, height: pipHeight)
  }
}

final class DualCameraVideoRecorder {
  private(set) var isRecording = false

  private var assetWriter: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?
  private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?

  private let ciContext = CIContext(options: nil)
  private let frontBufferLock = NSLock()
  /// Serializes writer + timeline fields; samples may arrive on one queue from multiple outputs.
  private let writerLock = NSLock()
  private struct TimestampedSample {
    let pts: CMTime
    let sample: CMSampleBuffer
  }
  /// Small rolling buffer so we can pick the closest front frame per back frame.
  private var frontSamples: [TimestampedSample] = []
  /// If front/back drift more than this, we prefer no PiP over obviously wrong PiP.
  private let maxFrontSkewSec: Double = 0.12
  /// How long we keep front frames for matching (seconds).
  private let frontBufferWindowSec: Double = 0.75
  private let frontBufferMaxCount: Int = 30

  private var outputURL: URL?
  private var recordingStartPTS: CMTime?
  private var lastVideoPTS: CMTime?
  private var maxDuration: CMTime = .zero
  private var normalizedPip = CGRect(x: 0.05, y: 0.05, width: 0.28, height: 0.22)
  private var mirrorFront = true
  private var outputSize = CGSize(width: 720, height: 1280)
  private var frameCount: Int64 = 0
  private var recordsAudio = true

  func start(options: DualCameraRecordingOptions) throws {
    writerLock.lock()
    defer { writerLock.unlock() }

    guard !isRecording else {
      throw DualCameraRecorderError.alreadyRecording
    }

    normalizedPip = options.normalizedPipRect
    mirrorFront = options.mirrorFront
    recordsAudio = options.recordsAudio
    maxDuration = CMTime(seconds: options.maxDurationSec, preferredTimescale: 600)
    frameCount = 0
    frontSamples = []

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("dual-\(UUID().uuidString).mp4")
    outputURL = url

    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }

    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: Int(outputSize.width),
      AVVideoHeightKey: Int(outputSize.height),
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 4_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]

    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    vInput.expectsMediaDataInRealTime = true

    let attrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
      kCVPixelBufferWidthKey as String: Int(outputSize.width),
      kCVPixelBufferHeightKey as String: Int(outputSize.height),
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: vInput,
      sourcePixelBufferAttributes: attrs
    )

    var aInput: AVAssetWriterInput?
    if recordsAudio {
      let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 1,
        AVSampleRateKey: 44_100,
        AVEncoderBitRateKey: 128_000,
      ])
      audio.expectsMediaDataInRealTime = true
      aInput = audio
      guard writer.canAdd(vInput), writer.canAdd(audio) else {
        throw DualCameraRecorderError.cannotConfigureWriter
      }
      writer.add(vInput)
      writer.add(audio)
    } else {
      guard writer.canAdd(vInput) else {
        throw DualCameraRecorderError.cannotConfigureWriter
      }
      writer.add(vInput)
    }

    guard writer.startWriting() else {
      throw writer.error ?? DualCameraRecorderError.cannotStartWriter
    }

    assetWriter = writer
    videoInput = vInput
    audioInput = aInput
    pixelBufferAdaptor = adaptor
    recordingStartPTS = nil
    lastVideoPTS = nil
    isRecording = true
  }

  func storeFrontSample(_ sample: CMSampleBuffer) {
    guard isRecording else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(sample)
    frontBufferLock.lock()
    frontSamples.append(TimestampedSample(pts: pts, sample: sample))
    if frontSamples.count > frontBufferMaxCount {
      frontSamples.removeFirst(frontSamples.count - frontBufferMaxCount)
    }
    // Prune old samples to keep searches fast and reduce the chance of stale PiP.
    let cutoff = CMTime(seconds: frontBufferWindowSec, preferredTimescale: 600)
    while let first = frontSamples.first, CMTimeSubtract(pts, first.pts) > cutoff {
      frontSamples.removeFirst()
    }
    frontBufferLock.unlock()
  }

  func appendAudioSample(_ sample: CMSampleBuffer) {
    writerLock.lock()
    defer { writerLock.unlock() }

    guard isRecording,
          recordsAudio,
          let writer = assetWriter,
          let input = audioInput,
          writer.status == .writing,
          input.isReadyForMoreMediaData else { return }

    let pts = CMSampleBufferGetPresentationTimeStamp(sample)
    if recordingStartPTS == nil {
      recordingStartPTS = pts
      writer.startSession(atSourceTime: pts)
    }

    // Keep original PTS; writer session is started at the same source time.
    _ = input.append(sample)
  }

  func appendBackSample(_ sample: CMSampleBuffer) -> Bool {
    writerLock.lock()
    defer { writerLock.unlock() }

    guard isRecording,
          let writer = assetWriter,
          let vInput = videoInput,
          let adaptor = pixelBufferAdaptor,
          writer.status == .writing,
          vInput.isReadyForMoreMediaData else { return false }

    let pts = CMSampleBufferGetPresentationTimeStamp(sample)
    if recordingStartPTS == nil {
      recordingStartPTS = pts
      writer.startSession(atSourceTime: pts)
    }

    if maxDuration > .zero {
      let elapsed = CMTimeSubtract(pts, recordingStartPTS!)
      if elapsed >= maxDuration {
        return false
      }
    }

    guard let pixelBuffer = compositeFrame(backSample: sample) else { return true }

    let ok = adaptor.append(pixelBuffer, withPresentationTime: pts)
    if ok {
      frameCount += 1
      lastVideoPTS = pts
    }
    return ok
  }

  func finish(completion: @escaping (Result<[String: Any], Error>) -> Void) {
    writerLock.lock()
    guard isRecording else {
      writerLock.unlock()
      completion(.failure(DualCameraRecorderError.notRecording))
      return
    }
    isRecording = false
    writerLock.unlock()

    frontBufferLock.lock()
    frontSamples = []
    frontBufferLock.unlock()

    writerLock.lock()
    guard let writer = assetWriter,
          let url = outputURL,
          let vInput = videoInput else {
      writerLock.unlock()
      completion(.failure(DualCameraRecorderError.notRecording))
      return
    }
    let aInput = audioInput
    let startPTS = recordingStartPTS
    let endPTS = lastVideoPTS
    let outW = Int(outputSize.width)
    let outH = Int(outputSize.height)
    vInput.markAsFinished()
    aInput?.markAsFinished()
    writerLock.unlock()

    writer.finishWriting { [weak self, frameCount, startPTS, endPTS, url, outW, outH] in
      self?.writerLock.lock()
      self?.assetWriter = nil
      self?.videoInput = nil
      self?.audioInput = nil
      self?.pixelBufferAdaptor = nil
      self?.recordingStartPTS = nil
      self?.lastVideoPTS = nil
      self?.writerLock.unlock()

      if let error = writer.error {
        completion(.failure(error))
        return
      }
      if frameCount < 1 {
        completion(.failure(DualCameraRecorderError.noFrames))
        return
      }
      let durationSec: Double
      if let start = startPTS, let last = endPTS {
        durationSec = max(0, CMTimeGetSeconds(CMTimeSubtract(last, start)))
      } else {
        durationSec = 0
      }
      let durationMs = Int((durationSec * 1000).rounded())
      completion(.success([
        "uri": url.absoluteString,
        "durationMs": durationMs,
        "width": outW,
        "height": outH,
      ]))
    }
  }

  func cancel() {
    writerLock.lock()
    defer { writerLock.unlock() }

    isRecording = false
    frontSamples = []
    if let writer = assetWriter, writer.status == .writing {
      writer.cancelWriting()
    }
    if let url = outputURL {
      try? FileManager.default.removeItem(at: url)
    }
    assetWriter = nil
    videoInput = nil
    audioInput = nil
    pixelBufferAdaptor = nil
    recordingStartPTS = nil
    lastVideoPTS = nil
    outputURL = nil
  }

  // MARK: - Compositing

  private func compositeFrame(backSample: CMSampleBuffer) -> CVPixelBuffer? {
    guard let backImage = ciImage(from: backSample) else { return nil }

    let orientedBack = orientedImage(backImage, sample: backSample, mirror: false)
    let scaledBack = scaleToFill(orientedBack, targetSize: outputSize)

    var output = scaledBack

    let backPTS = CMSampleBufferGetPresentationTimeStamp(backSample)
    let frontSample = selectFrontSample(near: backPTS)

    if let frontSample, let frontImage = ciImage(from: frontSample) {
      let orientedFront = orientedImage(frontImage, sample: frontSample, mirror: mirrorFront)
      let pip = pipRectInOutputSpace(normalized: normalizedPip, outputSize: outputSize)
      let scaledFront = scaleAspectFill(orientedFront, targetSize: pip.size)
      let positioned = scaledFront.transformed(by: CGAffineTransform(translationX: pip.origin.x, y: pip.origin.y))
      output = positioned.composited(over: output)
    }

    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    CVPixelBufferCreate(
      kCFAllocatorDefault,
      Int(outputSize.width),
      Int(outputSize.height),
      kCVPixelFormatType_32BGRA,
      attrs as CFDictionary,
      &pixelBuffer
    )
    guard let buffer = pixelBuffer else { return nil }
    ciContext.render(output, to: buffer)
    return buffer
  }

  private func selectFrontSample(near backPTS: CMTime) -> CMSampleBuffer? {
    frontBufferLock.lock()
    let samples = frontSamples
    frontBufferLock.unlock()

    guard !samples.isEmpty else { return nil }

    // Prefer a sample at or before the back frame (reduces "future" PiP),
    // but allow closest within a small skew window.
    var best: TimestampedSample?
    var bestAbs: Double = .greatestFiniteMagnitude

    for s in samples {
      let delta = CMTimeSubtract(s.pts, backPTS)
      let absSec = abs(CMTimeGetSeconds(delta))
      if absSec < bestAbs {
        bestAbs = absSec
        best = s
      }
    }

    guard let picked = best else { return nil }
    if bestAbs > maxFrontSkewSec {
      return nil
    }
    return picked.sample
  }

  private func ciImage(from sample: CMSampleBuffer) -> CIImage? {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return nil }
    return CIImage(cvPixelBuffer: buffer)
  }

  private func orientedImage(_ image: CIImage, sample: CMSampleBuffer, mirror: Bool) -> CIImage {
    var result = image
    if let orientation = orientation(from: sample) {
      result = result.oriented(orientation)
    }
    if mirror {
      let e = result.extent
      let t = CGAffineTransform(translationX: -e.midX, y: -e.midY)
        .scaledBy(x: -1, y: 1)
        .translatedBy(x: e.midX, y: e.midY)
      result = result.transformed(by: t)
    }
    return result
  }

  private func orientation(from sample: CMSampleBuffer) -> CGImagePropertyOrientation? {
    guard let attachment = CMGetAttachment(
      sample,
      key: kCGImagePropertyOrientation,
      attachmentModeOut: nil
    ) as? NSNumber else {
      return .right
    }
    return CGImagePropertyOrientation(rawValue: attachment.uint32Value) ?? .right
  }

  private func scaleToFill(_ image: CIImage, targetSize: CGSize) -> CIImage {
    let extent = image.extent
    guard extent.width > 1, extent.height > 1 else { return image }
    let scale = max(targetSize.width / extent.width, targetSize.height / extent.height)
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let x = (targetSize.width - scaled.extent.width) / 2
    let y = (targetSize.height - scaled.extent.height) / 2
    return scaled.transformed(by: CGAffineTransform(translationX: x - scaled.extent.origin.x, y: y - scaled.extent.origin.y))
  }

  private func scaleAspectFill(_ image: CIImage, targetSize: CGSize) -> CIImage {
    let extent = image.extent
    guard extent.width > 1, extent.height > 1 else { return image }
    let scale = max(targetSize.width / extent.width, targetSize.height / extent.height)
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let x = (targetSize.width - scaled.extent.width) / 2
    let y = (targetSize.height - scaled.extent.height) / 2
    return scaled.transformed(by: CGAffineTransform(translationX: x - scaled.extent.origin.x, y: y - scaled.extent.origin.y))
      .cropped(to: CGRect(origin: .zero, size: targetSize))
  }

  /// UI-style normalized rect (origin top-left) → Core Image space (origin bottom-left).
  private func pipRectInOutputSpace(normalized: CGRect, outputSize: CGSize) -> CGRect {
    let w = normalized.width * outputSize.width
    let h = normalized.height * outputSize.height
    let x = normalized.origin.x * outputSize.width
    let y = (1.0 - normalized.origin.y - normalized.height) * outputSize.height
    return CGRect(x: x, y: y, width: w, height: h)
  }

  // Intentionally no sample re-timing: we start the writer session at the first sample PTS,
  // then append samples using their original timestamps.
}

enum DualCameraRecorderError: LocalizedError {
  case alreadyRecording
  case notRecording
  case cannotConfigureWriter
  case cannotStartWriter
  case noFrames
  case sessionNotReady

  var errorDescription: String? {
    switch self {
    case .alreadyRecording: return "Recording already in progress"
    case .notRecording: return "No active recording"
    case .cannotConfigureWriter: return "Could not configure video writer"
    case .cannotStartWriter: return "Could not start video writer"
    case .noFrames: return "No video frames were captured"
    case .sessionNotReady: return "Dual camera session is not ready"
    }
  }
}
