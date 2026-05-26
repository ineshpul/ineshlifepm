# Leap fork notes (`55.2.4-leap.0`)

This is a vendored copy of `expo-dual-camera` with Leap-specific native video recording.

## iOS additions

- `DualCameraVideoRecorder.swift` — composites back + front PiP into one MP4 via `AVAssetWriter`
- `DualCameraSessionManager` — mic input, sample-buffer delegates, `startRecording` / `stopRecording`
- JS: `startRecording`, `stopRecording`, `recordAsync`

## Rebuild required

After changing Swift, run a new **EAS iOS build** (not Expo Go). The app depends on `"expo-dual-camera": "file:./packages/expo-dual-camera"`.
