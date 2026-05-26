# Leap fork notes (`55.2.4-leap.0`)

This is a vendored copy of `expo-dual-camera` with Leap-specific native video recording.

## iOS additions

- `DualCameraVideoRecorder.swift` — composites back + front PiP into one MP4 via `AVAssetWriter`
- `DualCameraSessionManager` — mic input, sample-buffer delegates, `startRecording` / `stopRecording`
- JS: `startRecording`, `stopRecording`, `recordAsync`

## Rebuild required

After changing Swift, run a new **EAS iOS build** (not Expo Go). The app depends on `"expo-dual-camera": "file:./packages/expo-dual-camera"`.

## Crash hardening (TestFlight `.ips`)

- `startRecording` must not `promise.resolve(nil)` — use `true` (TurboModule can abort on `nil`).
- Serialize `AVAssetWriter` access with a lock; route **audio + video** sample delegates onto the **same** queue as video.
- Fix mic graph bug: after `addInput(mic)`, `canAddInput(mic)` was false so the audio **output** was never added.
- Do not `sem.wait()` on the capture session queue for mic permission.
- Only activate `AVAudioSession` when the session actually has a mic track.
- `finishWriting`: capture PTS + dimensions before async completion; clear writer state **inside** the completion handler (was clearing too early).
- Optional `recordsAudio` on the writer when there is no mic in the graph.
