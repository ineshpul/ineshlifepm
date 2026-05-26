# Leap fork notes (`55.2.4-leap.2`)

Vendored `expo-dual-camera` with native dual-cam PiP video recording.

## iOS layout (rewrite)

| File | Role |
|------|------|
| `DualCameraCaptureController.swift` | Single `captureSessionQueue` for **all** `AVCaptureSession` mutations; preview, photo, recording orchestration |
| `DualCameraPiPMovieWriter.swift` | PiP compositor + `AVAssetWriter` only (no session access) |
| `ObjcExceptionCatcher` | Pure Obj-C `@try`/`@catch` for `NSException` |
| `DualCameraTurboSafe.swift` | Every TurboModule async/sync entry: Swift `do/catch` **and** `ObjcExceptionCatcher` |
| `ExpoDualCameraModule.swift` | Thin JS bridge — no capture logic |

## Recording guards

- `startRecording` rejects immediately if `isConfiguringCaptureSession`, `isStopping`, `!session.isRunning`, or paused.
- Sample buffers run on `sampleBufferQueue`; session graph on `captureSessionQueue` only.

## Rebuild required

After changing Swift, run a new **EAS iOS build** (not Expo Go). Root `package.json`: `"expo-dual-camera": "file:./packages/expo-dual-camera"`.
