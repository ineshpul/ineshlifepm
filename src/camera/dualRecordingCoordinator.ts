import { VisionCamera } from 'react-native-vision-camera';
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';

import { ensureRecordingAudio } from './audioSessionGate';
import type { DualCamSession } from './dualCamSession';
import type { DualTake } from './dualCamTypes';
import { toFileUri } from './dualCamTypes';

export type DualRecordingHandle = {
  stop: () => Promise<void>;
};

type StartOpts = {
  session: DualCamSession;
  backVideo: CameraVideoOutput;
  frontVideo: CameraVideoOutput;
  maxDurationSec: number;
  getFrontIsPrimary: () => boolean;
  onTake: (take: DualTake) => void;
  onError: (err: unknown) => void;
  onTick?: (secondsLeft: number) => void;
};

/**
 * Atomic dual start/stop. Back recorder owns the mic; front is silent.
 * Capture fires only when both files finish successfully.
 */
export async function startDualRecording(opts: StartOpts): Promise<DualRecordingHandle | null> {
  const {
    session,
    backVideo,
    frontVideo,
    maxDurationSec,
    getFrontIsPrimary,
    onTake,
    onError,
    onTick,
  } = opts;

  if (session.getPhase() !== 'ready') return null;

  if (VisionCamera.microphonePermissionStatus !== 'authorized') {
    const granted = await VisionCamera.requestMicrophonePermission().catch(() => false);
    if (!granted) {
      onError(new Error('Microphone permission is required to record with sound.'));
      return null;
    }
  }

  // Re-assert playAndRecord immediately before writers start. Feed / App /
  // expo-av permission prompts can flip the category back to playback while
  // the dual session is already live — that yields silent MP4s with no error.
  await ensureRecordingAudio();
  await new Promise((r) => setTimeout(r, 180));

  let backRec: Recorder | null = null;
  let frontRec: Recorder | null = null;
  let backUri: string | null = null;
  let frontUri: string | null = null;
  let backDone = false;
  let frontDone = false;
  let backFailed = false;
  let frontFailed = false;
  let captureFired = false;
  let stopGuard = false;
  let tickInterval: ReturnType<typeof setInterval> | null = null;

  const clearTick = () => {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  };

  const maybeFire = () => {
    if (captureFired) return;
    if (backFailed || frontFailed) return;
    if (!backDone || !frontDone) return;
    if (!backUri || !frontUri) return;
    captureFired = true;
    session.setPhase('ready');
    session.bindRecorders(null, null);
    onTake({
      backUri,
      frontUri,
      frontIsPrimary: getFrontIsPrimary(),
    });
  };

  const fail = (err: unknown) => {
    if (captureFired) return;
    captureFired = true;
    clearTick();
    session.setPhase('ready');
    session.bindRecorders(null, null);
    onError(err);
  };

  try {
    session.setPhase('recording');
    await ensureRecordingAudio();
    backRec = await backVideo.createRecorder({ maxDuration: maxDurationSec });
    frontRec = await frontVideo.createRecorder({ maxDuration: maxDurationSec });
    session.bindRecorders(backRec, frontRec);

    // Start the audio-bearing (back) persistent recorder first so its dedicated
    // AudioSession + AssetWriter track is live before the silent front writer.
    await backRec.startRecording(
      (filePath) => {
        backUri = toFileUri(filePath);
        backDone = true;
        maybeFire();
      },
      (err) => {
        backFailed = true;
        fail(err);
      }
    );

    await frontRec.startRecording(
      (filePath) => {
        frontUri = toFileUri(filePath);
        frontDone = true;
        maybeFire();
      },
      (err) => {
        frontFailed = true;
        fail(err);
      }
    );

    let elapsed = 0;
    onTick?.(maxDurationSec);
    tickInterval = setInterval(() => {
      elapsed += 1;
      const left = Math.max(0, maxDurationSec - elapsed);
      onTick?.(left);
      if (left <= 0) clearTick();
    }, 1000);
  } catch (e) {
    clearTick();
    session.bindRecorders(null, null);
    session.setPhase('ready');
    try {
      if (backRec?.isRecording) await backRec.cancelRecording();
    } catch {
      /* ignore */
    }
    try {
      if (frontRec?.isRecording) await frontRec.cancelRecording();
    } catch {
      /* ignore */
    }
    onError(e);
    return null;
  }

  return {
    stop: async () => {
      if (stopGuard) return;
      stopGuard = true;
      session.setPhase('stopping');
      clearTick();
      const b = backRec;
      const f = frontRec;
      backRec = null;
      frontRec = null;
      await Promise.all([
        b?.isRecording ? b.stopRecording().catch(() => undefined) : undefined,
        f?.isRecording ? f.stopRecording().catch(() => undefined) : undefined,
      ]);
      // Phase returns to ready in maybeFire / fail when files close.
      // If neither callback fires (cancelled), reset so the UI can retry.
      if (!captureFired && !backDone && !frontDone) {
        session.bindRecorders(null, null);
        session.setPhase('ready');
      }
    },
  };
}
