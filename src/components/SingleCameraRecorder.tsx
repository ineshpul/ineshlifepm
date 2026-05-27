import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  CommonResolutions,
  NativePreviewView,
  useCameraDevice,
  usePreviewOutput,
  useVideoOutput,
  VisionCamera,
} from 'react-native-vision-camera';
import type {
  CameraSession,
  Recorder,
} from 'react-native-vision-camera';

import { colors } from '../theme/colors';

export type SingleCameraFacing = 'front' | 'back';

export type SingleCameraController = {
  readonly isReady: boolean;
  readonly isRecording: boolean;
  readonly facing: SingleCameraFacing;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Flip front<->back. Safe to call while recording (the recorder is persistent). */
  flip: () => void;
};

type Props = {
  /** Stops/starts the underlying session for battery/lifecycle management. */
  active: boolean;
  initialFacing?: SingleCameraFacing;
  maxDurationSec: number;
  onRecordingTick?: (secondsLeft: number) => void;
  onCapture: (uri: string) => void;
  onError?: (e: unknown) => void;
  controllerRef?: React.MutableRefObject<SingleCameraController | null>;
};

/**
 * Single-camera recorder built on vision-camera v5 with a persistent recorder.
 *
 * The persistent recorder uses AVAssetWriter on iOS and `asPersistentRecording()`
 * on Android, both of which can continue writing across an input-device swap
 * without losing the file. That's what makes flip-mid-record possible — calling
 * `flip()` reconfigures the session's input but leaves the recorder running.
 */
export function SingleCameraRecorder({
  active,
  initialFacing = 'front',
  maxDurationSec,
  onRecordingTick,
  onCapture,
  onError,
  controllerRef,
}: Props) {
  const [facing, setFacing] = React.useState<SingleCameraFacing>(initialFacing);
  const facingRef = React.useRef(facing);
  React.useEffect(() => {
    facingRef.current = facing;
  }, [facing]);

  const backDevice = useCameraDevice('back');
  const frontDevice = useCameraDevice('front');
  const currentDevice = facing === 'front' ? frontDevice : backDevice;

  const previewOutput = usePreviewOutput();
  // Audio is captured on the main video output. Persistent recorder is required
  // for the recording to survive a flip mid-take.
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.FHD_16_9,
    // Push the recorder above its default bitrate so 1080p selfies don't look
    // muddy. ~10 Mbps is a comfortable target for 1080p H.264.
    targetBitRate: 10_000_000,
    enableAudio: true,
    enablePersistentRecorder: true,
    fileType: 'mp4',
  });

  const [isReady, setIsReady] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);

  const sessionRef = React.useRef<CameraSession | null>(null);
  const recorderRef = React.useRef<Recorder | null>(null);
  const isRecordingRef = React.useRef(false);
  const stopGuardRef = React.useRef(false);
  const tickIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const reconfigureBusyRef = React.useRef(false);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Build the initial connection list whenever the active device changes.
  // The `mirrorMode` on the preview gives users the natural selfie-view feel;
  // the recording itself is captured non-mirrored (sensor-native), which
  // matches the prior expo-camera behavior.
  const buildConnections = React.useCallback(
    (faceFor: SingleCameraFacing) => {
      const device = faceFor === 'front' ? frontDevice : backDevice;
      if (!device) return null;
      return [
        {
          input: device,
          outputs: [
            { output: previewOutput, mirrorMode: faceFor === 'front' ? 'on' : 'off' } as const,
            { output: videoOutput, mirrorMode: 'off' } as const,
          ],
          constraints: [],
        },
      ];
    },
    [backDevice, frontDevice, previewOutput, videoOutput]
  );

  // Create + start the session once both devices have resolved. Teardown
  // cancels any in-flight recording so we don't leave dangling file writers.
  React.useEffect(() => {
    if (!backDevice || !frontDevice) return;

    let cancelled = false;
    let session: CameraSession | null = null;

    void (async () => {
      try {
        // Vision Camera tracks its own permission state. Request both
        // explicitly so the very first `configure({ enableAudio: true })`
        // doesn't throw "Audio Permission not yet granted".
        if (VisionCamera.microphonePermissionStatus !== 'authorized') {
          await VisionCamera.requestMicrophonePermission().catch(() => false);
        }
        if (VisionCamera.cameraPermissionStatus !== 'authorized') {
          await VisionCamera.requestCameraPermission().catch(() => false);
        }
        session = await VisionCamera.createCameraSession(false);
        if (cancelled) {
          await session.stop().catch(() => undefined);
          return;
        }
        const connections = buildConnections(facingRef.current);
        if (!connections) return;
        await session.configure(connections);
        if (cancelled) {
          await session.stop().catch(() => undefined);
          return;
        }
        await session.start();
        if (cancelled) {
          await session.stop().catch(() => undefined);
          return;
        }
        sessionRef.current = session;
        setIsReady(true);
      } catch (e) {
        if (!cancelled) onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      const s = session ?? sessionRef.current;
      sessionRef.current = null;
      setIsReady(false);
      void (async () => {
        const rec = recorderRef.current;
        recorderRef.current = null;
        if (tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
        try {
          if (rec?.isRecording) await rec.cancelRecording();
        } catch {
          /* ignore */
        }
        try {
          await s?.stop();
        } catch {
          /* ignore */
        }
      })();
    };
  }, [backDevice, frontDevice, buildConnections, onError]);

  // Pause/resume the session when the parent toggles `active` (e.g. screen blur).
  React.useEffect(() => {
    const s = sessionRef.current;
    if (!s || !isReady) return;
    if (active) {
      void s.start().catch(() => undefined);
    } else {
      void s.stop().catch(() => undefined);
    }
  }, [active, isReady]);

  // Reconfigure the input device whenever facing flips. With persistent recorder
  // enabled, any in-flight `Recorder` keeps writing across this reconfigure.
  React.useEffect(() => {
    const s = sessionRef.current;
    if (!s || !isReady) return;
    if (reconfigureBusyRef.current) return;
    const connections = buildConnections(facing);
    if (!connections) return;
    reconfigureBusyRef.current = true;
    void (async () => {
      try {
        await s.configure(connections);
      } catch (e) {
        onError?.(e);
      } finally {
        reconfigureBusyRef.current = false;
      }
    })();
  }, [facing, isReady, buildConnections, onError]);

  const start = React.useCallback(async () => {
    if (!isReady || isRecordingRef.current) return;
    if (!videoOutput) return;

    stopGuardRef.current = false;
    try {
      const recorder = await videoOutput.createRecorder({ maxDuration: maxDurationSec });
      recorderRef.current = recorder;

      await recorder.startRecording(
        (filePath) => {
          const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          onCapture(uri);
        },
        (err) => {
          onError?.(err);
        }
      );

      setIsRecording(true);
      isRecordingRef.current = true;

      let elapsed = 0;
      onRecordingTick?.(maxDurationSec);
      tickIntervalRef.current = setInterval(() => {
        elapsed += 1;
        const left = Math.max(0, maxDurationSec - elapsed);
        onRecordingTick?.(left);
        if (left <= 0 && tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
      }, 1000);
    } catch (e) {
      onError?.(e);
      setIsRecording(false);
      isRecordingRef.current = false;
      recorderRef.current = null;
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }
  }, [isReady, videoOutput, maxDurationSec, onCapture, onError, onRecordingTick]);

  const stop = React.useCallback(async () => {
    if (stopGuardRef.current) return;
    stopGuardRef.current = true;
    const rec = recorderRef.current;
    recorderRef.current = null;
    setIsRecording(false);
    isRecordingRef.current = false;
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    try {
      if (rec?.isRecording) await rec.stopRecording();
    } catch {
      /* onRecordingFinished still fires with the file path */
    }
  }, []);

  const flip = React.useCallback(() => {
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
  }, []);

  React.useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      get isReady() {
        return isReady;
      },
      get isRecording() {
        return isRecording;
      },
      get facing() {
        return facing;
      },
      start,
      stop,
      flip,
    };
    return () => {
      if (controllerRef.current && controllerRef.current.start === start) {
        controllerRef.current = null;
      }
    };
  }, [controllerRef, isReady, isRecording, facing, start, stop, flip]);

  if (!currentDevice) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.loadingText}>Finding camera…</Text>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={previewOutput}
        resizeMode="cover"
      />
      {!isReady ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.loadingText}>Starting camera…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
});
