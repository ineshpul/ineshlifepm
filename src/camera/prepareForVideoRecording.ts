import { ensureRecordingAudio } from './audioSessionGate';

/** Re-apply record-capable AVAudioSession before expo-camera / vision-camera writers. */
export async function prepareForVideoRecording(): Promise<void> {
  await ensureRecordingAudio();
  await new Promise<void>((r) => setTimeout(r, 180));
}
