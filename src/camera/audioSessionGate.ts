import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

/**
 * Ref-counted owner of the iOS/Android AVAudioSession category for capture vs
 * playback. Prevents RecordScreen, BestPartCapture, and Feed from stomping
 * each other's `allowsRecordingIOS` setting — the main cause of silent dual
 * clips when App defaults to playback while a multi-cam session needs mic.
 *
 * Vision-camera multi-cam expects playAndRecord + mixWithOthers. Using
 * DoNotMix here previously raced the native capture session and left
 * intermittent silent takes.
 */

let recordingHolders = 0;
let applyChain: Promise<void> = Promise.resolve();

async function applyRecordingMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    // Match vision-camera's multi-cam audio session (mixWithOthers).
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

async function applyPlaybackMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

function enqueue(op: () => Promise<void>): Promise<void> {
  applyChain = applyChain.then(op, op);
  return applyChain;
}

/**
 * Always re-apply the record-capable AVAudioSession category.
 * Call immediately before configure and before every take — other screens
 * (Feed, App, expo-av permission prompts) can silently flip the category
 * back to playback even while a holder is open.
 */
export async function ensureRecordingAudio(): Promise<void> {
  await enqueue(applyRecordingMode);
}

/**
 * Acquire a recording-session hold. Always re-applies the record category
 * (not only on 0→1) so late mounts still recover from stomps.
 * Returns a release function that must be called once (idempotent).
 */
export async function enterRecording(): Promise<() => void> {
  recordingHolders += 1;
  await ensureRecordingAudio();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    recordingHolders = Math.max(0, recordingHolders - 1);
    // Stay in record mode until an explicit enterPlayback() when no holders remain.
    // Flipping to playback eagerly would mute an in-flight vision-camera writer.
  };
}

/**
 * Switch to playback category only when no recording holders remain.
 * Call after capture completes, on blur away from a capture screen, etc.
 */
export async function enterPlayback(): Promise<void> {
  if (recordingHolders > 0) return;
  await enqueue(applyPlaybackMode);
}

/**
 * Safe partial audio-mode update for non-capture screens (Feed, etc.).
 * Never forces `allowsRecordingIOS: false` while a capture surface holds
 * the record category.
 */
export async function patchAudioMode(partial: {
  playsInSilentModeIOS?: boolean;
  allowsRecordingIOS?: boolean;
  staysActiveInBackground?: boolean;
  shouldDuckAndroid?: boolean;
}): Promise<void> {
  const next = { ...partial };
  if (recordingHolders > 0 && next.allowsRecordingIOS === false) {
    delete next.allowsRecordingIOS;
  }
  if (Object.keys(next).length === 0) return;
  await enqueue(async () => {
    await Audio.setAudioModeAsync(next);
  });
}

/** True when at least one capture surface holds the record category. */
export function isRecordingAudioHeld(): boolean {
  return recordingHolders > 0;
}
