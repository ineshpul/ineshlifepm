import AVFoundation

enum DualCameraVideoConcat {
  static func concat(urls: [URL], completion: @escaping (Result<[String: Any], Error>) -> Void) {
    guard !urls.isEmpty else {
      completion(.failure(DualCameraRecorderError.noFrames))
      return
    }
    if urls.count == 1 {
      let url = urls[0]
      resolveMetadata(for: url, completion: completion)
      return
    }

    let composition = AVMutableComposition()
    guard
      let compositionVideo = composition.addMutableTrack(
        withMediaType: .video,
        preferredTrackID: kCMPersistentTrackID_Invalid
      )
    else {
      completion(.failure(DualCameraRecorderError.cannotConfigureWriter))
      return
    }

    var compositionAudio: AVMutableCompositionTrack?
    var cursor = CMTime.zero
    var naturalSize = CGSize(width: 720, height: 1280)

    for url in urls {
      let asset = AVURLAsset(url: url)
      guard let sourceVideo = asset.tracks(withMediaType: .video).first else { continue }

      let assetDuration = asset.duration
      let timeRange = CMTimeRange(start: .zero, duration: assetDuration)
      do {
        try compositionVideo.insertTimeRange(timeRange, of: sourceVideo, at: cursor)
      } catch {
        completion(.failure(error))
        return
      }

      naturalSize = sourceVideo.naturalSize

      if compositionAudio == nil, let sourceAudio = asset.tracks(withMediaType: .audio).first {
        compositionAudio = composition.addMutableTrack(
          withMediaType: .audio,
          preferredTrackID: kCMPersistentTrackID_Invalid
        )
        if let compositionAudio {
          try? compositionAudio.insertTimeRange(timeRange, of: sourceAudio, at: cursor)
        }
      } else if let compositionAudio, let sourceAudio = asset.tracks(withMediaType: .audio).first {
        try? compositionAudio.insertTimeRange(timeRange, of: sourceAudio, at: cursor)
      }

      cursor = CMTimeAdd(cursor, assetDuration)
    }

    let outURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("dual-concat-\(UUID().uuidString).mp4")
    if FileManager.default.fileExists(atPath: outURL.path) {
      try? FileManager.default.removeItem(at: outURL)
    }

    guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      completion(.failure(DualCameraRecorderError.cannotConfigureWriter))
      return
    }
    export.outputURL = outURL
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true

    export.exportAsynchronously {
      switch export.status {
      case .completed:
        resolveMetadata(for: outURL, durationOverride: CMTimeGetSeconds(cursor), completion: completion)
      case .failed, .cancelled:
        completion(.failure(export.error ?? DualCameraRecorderError.cannotStartWriter))
      default:
        completion(.failure(DualCameraRecorderError.cannotStartWriter))
      }
    }
  }

  private static func resolveMetadata(
    for url: URL,
    durationOverride: Double? = nil,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let asset = AVURLAsset(url: url)
    let track = asset.tracks(withMediaType: .video).first
    let size = track?.naturalSize ?? CGSize(width: 720, height: 1280)
    let durationMs: Int
    if let durationOverride {
      durationMs = Int(durationOverride * 1000)
    } else {
      durationMs = Int(CMTimeGetSeconds(asset.duration) * 1000)
    }
    completion(.success([
      "uri": url.absoluteString,
      "durationMs": durationMs,
      "width": Int(size.width),
      "height": Int(size.height),
    ]))
  }
}
