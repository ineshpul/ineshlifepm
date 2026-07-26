import { VisionCamera } from 'react-native-vision-camera';
import type {
  CameraDevice,
  CameraPhotoOutput,
  CameraPreviewOutput,
  CameraSession,
  CameraVideoOutput,
  Recorder,
} from 'react-native-vision-camera';

import { ensureRecordingAudio } from './audioSessionGate';
import type { DualCamPhase } from './dualCamTypes';

export type DualCamVideoOutputs = {
  kind: 'video';
  backPreview: CameraPreviewOutput;
  frontPreview: CameraPreviewOutput;
  backVideo: CameraVideoOutput;
  frontVideo: CameraVideoOutput;
};

export type DualCamPhotoOutputs = {
  kind: 'photo';
  backPreview: CameraPreviewOutput;
  frontPreview: CameraPreviewOutput;
  backPhoto: CameraPhotoOutput;
  frontPhoto: CameraPhotoOutput;
};

export type DualCamOutputs = DualCamVideoOutputs | DualCamPhotoOutputs;

export type DualCamPair = {
  front: CameraDevice;
  back: CameraDevice;
};

const WARMUP_MS = 220;

/** Serialize configure/teardown so remounts don't fight over the hardware. */
let dualCamLifecycle: Promise<void> = Promise.resolve();

export function enqueueDualCamLifecycle<T>(op: () => Promise<T>): Promise<T> {
  const run = dualCamLifecycle.then(op, op);
  dualCamLifecycle = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Long-lived multi-cam session owner. Pause/resume are forbidden while a
 * recorder is writing; teardown always cancels writers first.
 */
export class DualCamSession {
  private session: CameraSession | null = null;
  private phase: DualCamPhase = 'idle';
  private generation = 0;
  private backRecorder: Recorder | null = null;
  private frontRecorder: Recorder | null = null;

  getPhase(): DualCamPhase {
    return this.phase;
  }

  get isReady(): boolean {
    return this.phase === 'ready' || this.phase === 'recording' || this.phase === 'stopping';
  }

  get isRecording(): boolean {
    return this.phase === 'recording' || this.phase === 'stopping';
  }

  bindRecorders(back: Recorder | null, front: Recorder | null): void {
    this.backRecorder = back;
    this.frontRecorder = front;
  }

  setPhase(next: DualCamPhase): void {
    this.phase = next;
  }

  static supportsMultiCam(): boolean {
    try {
      return Boolean(VisionCamera.supportsMultiCamSessions);
    } catch {
      return false;
    }
  }

  static async findFrontBackPair(): Promise<DualCamPair | null> {
    const factory = await VisionCamera.createDeviceFactory();
    const combo = factory.supportedMultiCamDeviceCombinations.find((devices) => {
      return (
        devices.some((d) => d.position === 'front') &&
        devices.some((d) => d.position === 'back')
      );
    });
    if (!combo) return null;
    const front = combo.find((d) => d.position === 'front');
    const back = combo.find((d) => d.position === 'back');
    if (!front || !back) return null;
    return { front, back };
  }

  async configureAndStart(
    pair: DualCamPair,
    outputs: DualCamOutputs
  ): Promise<void> {
    const gen = ++this.generation;
    this.phase = 'warming';

    if (outputs.kind === 'video' && VisionCamera.microphonePermissionStatus !== 'authorized') {
      await VisionCamera.requestMicrophonePermission().catch(() => false);
    }
    if (VisionCamera.cameraPermissionStatus !== 'authorized') {
      await VisionCamera.requestCameraPermission().catch(() => false);
    }

    // Audio category must be playAndRecord before multi-cam configure adds the mic.
    if (outputs.kind === 'video') {
      await ensureRecordingAudio();
    }

    const session = await VisionCamera.createCameraSession(true);
    if (gen !== this.generation) {
      await session.stop().catch(() => undefined);
      return;
    }

    const { front: frontDevice, back: backDevice } = pair;
    const { backPreview, frontPreview } = outputs;
    // Mix with others so expo-av / vision-camera don't fight over AVAudioSession.
    const sessionConfig = { allowBackgroundAudioPlayback: true };

    if (outputs.kind === 'video') {
      const { backVideo, frontVideo } = outputs;
      // Matched FPS + resolution class — asymmetric 30/24 was a primary lag source.
      await session.configure(
        [
          {
            input: backDevice,
            outputs: [
              { output: backPreview, mirrorMode: 'off' },
              { output: backVideo, mirrorMode: 'off' },
            ],
            constraints: [
              { fps: 30 },
              { resolutionBias: backVideo },
              { resolutionBias: backPreview },
              { binned: true },
            ],
          },
          {
            input: frontDevice,
            outputs: [
              { output: frontPreview, mirrorMode: 'on' },
              { output: frontVideo, mirrorMode: 'on' },
            ],
            constraints: [
              { fps: 30 },
              { resolutionBias: frontVideo },
              { resolutionBias: frontPreview },
              { binned: true },
            ],
          },
        ],
        sessionConfig
      );
    } else {
      const { backPhoto, frontPhoto } = outputs;
      await session.configure(
        [
          {
            input: backDevice,
            outputs: [
              { output: backPreview, mirrorMode: 'off' },
              { output: backPhoto, mirrorMode: 'off' },
            ],
            constraints: [
              { fps: 30 },
              { resolutionBias: backPhoto },
              { resolutionBias: backPreview },
              { binned: true },
            ],
          },
          {
            input: frontDevice,
            outputs: [
              { output: frontPreview, mirrorMode: 'on' },
              { output: frontPhoto, mirrorMode: 'on' },
            ],
            constraints: [
              { fps: 30 },
              { resolutionBias: frontPhoto },
              { resolutionBias: frontPreview },
              { binned: true },
            ],
          },
        ],
        sessionConfig
      );
    }

    if (gen !== this.generation) {
      await session.stop().catch(() => undefined);
      return;
    }

    await session.start();
    if (gen !== this.generation) {
      await session.stop().catch(() => undefined);
      return;
    }

    this.session = session;
    await new Promise((r) => setTimeout(r, WARMUP_MS));
    if (gen !== this.generation) return;
    this.phase = 'ready';
  }

  /**
   * Pause the session to save battery. No-op while recording/stopping so we
   * never call session.stop() under active movie writers.
   */
  async pause(): Promise<void> {
    if (this.isRecording) return;
    if (this.phase !== 'ready' && this.phase !== 'warming') return;
    const s = this.session;
    if (!s) return;
    await s.stop().catch(() => undefined);
    // Bail if a recording started while we were awaiting session.stop().
    if (this.isRecording) return;
    this.phase = 'paused';
  }

  async resume(): Promise<void> {
    if (this.phase !== 'paused') return;
    const s = this.session;
    if (!s) return;
    await s.start().catch(() => undefined);
    this.phase = 'ready';
  }

  async teardown(): Promise<void> {
    this.generation += 1;
    const backRec = this.backRecorder;
    const frontRec = this.frontRecorder;
    this.backRecorder = null;
    this.frontRecorder = null;
    const s = this.session;
    this.session = null;

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
    try {
      await s?.stop();
    } catch {
      /* ignore */
    }
    this.phase = 'idle';
  }
}
