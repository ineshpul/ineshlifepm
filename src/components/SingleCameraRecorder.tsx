import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

import { colors } from '../theme/colors';
import { useCameraPreviewFreezeRecovery } from '../hooks/useCameraPreviewFreezeRecovery';

export type SingleCameraFacing = 'front' | 'back';

export type SingleCameraController = {
  readonly isReady: boolean;
  readonly isRecording: boolean;
  readonly facing: SingleCameraFacing;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Toggle front<->back. No-op while recording — expo-camera cannot flip mid-take on iOS. */
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
 * Single-camera recorder backed by expo-camera's `CameraView`.
 *
 * Why not vision-camera v5? Empirically its iOS preview/recording quality was
 * noticeably worse than expo-camera's at the same target resolution, with
 * visible lag during recording and inconsistent front-camera mirroring on
 * playback. Dual mode still uses vision-camera (`DualCameraRecorder`) because
 * expo-camera doesn't expose multi-cam sessions; for single-camera capture
 * we prefer the proven, hardware-accelerated `AVCaptureMovieFileOutput` path
 * that `CameraView` uses.
 *
 * The component exposes the same `SingleCameraController` shape the vision-
 * camera implementation did, so `RecordScreen` doesn't care which backend is
 * in use.
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
  const [isReady, setIsReady] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  /** Bumped to force a CameraView remount when the freeze watchdog trips. */
  const [sessionKey, setSessionKey] = React.useState(0);

  const cameraRef = React.useRef<CameraView | null>(null);
  const cameraReadyRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const stopInFlightRef = React.useRef(false);
  const tickIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingSecondsLeftRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Reset readiness on any external transition that drops the view (mode swap,
  // remount via sessionKey, becoming inactive). `onCameraReady` will flip it
  // back to true once expo-camera has the session warmed up again.
  React.useEffect(() => {
    cameraReadyRef.current = false;
    setIsReady(false);
  }, [sessionKey, facing, active]);

  const { markPreviewPulse } = useCameraPreviewFreezeRecovery({
    enabled: active && !isRecording,
    isRecording,
    recordingSecondsLeft: recordingSecondsLeftRef.current,
    onRecover: React.useCallback(() => {
      // Remount the CameraView. The session is fully re-created by expo-camera
      // on remount, which is the only reliable way out of its sporadic preview
      // freeze on iOS after audio-session collisions.
      setSessionKey((k) => k + 1);
    }, []),
  });

  const stopTickInterval = React.useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    recordingSecondsLeftRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    if (isRecordingRef.current) return;
    if (!cameraReadyRef.current || !cameraRef.current) {
      throw new Error('Camera not ready');
    }

    stopInFlightRef.current = false;
    isRecordingRef.current = true;
    setIsRecording(true);

    // Drive the seconds-left tick the same way DualCameraRecorder does, so
    // RecordScreen's UI updates work uniformly across modes.
    let elapsed = 0;
    recordingSecondsLeftRef.current = maxDurationSec;
    onRecordingTick?.(maxDurationSec);
    tickIntervalRef.current = setInterval(() => {
      elapsed += 1;
      const left = Math.max(0, maxDurationSec - elapsed);
      recordingSecondsLeftRef.current = left;
      onRecordingTick?.(left);
      if (left <= 0 && tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }, 1000);

    // `recordAsync` blocks until the recording ends, either by `maxDuration`
    // elapsing or `stopRecording()` being invoked. Fire-and-forget here so the
    // controller's `start()` resolves immediately and the parent can manage
    // its own state machine.
    void (async () => {
      try {
        const result = await cameraRef.current?.recordAsync({
          maxDuration: maxDurationSec,
        });
        const rawUri = result?.uri ?? null;
        const uri = rawUri
          ? rawUri.startsWith('file://')
            ? rawUri
            : `file://${rawUri}`
          : null;
        if (uri) onCapture(uri);
      } catch (e) {
        onError?.(e);
      } finally {
        stopInFlightRef.current = false;
        isRecordingRef.current = false;
        setIsRecording(false);
        stopTickInterval();
      }
    })();
  }, [maxDurationSec, onCapture, onError, onRecordingTick, stopTickInterval]);

  const stop = React.useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (stopInFlightRef.current) return;
    stopInFlightRef.current = true;
    try {
      cameraRef.current?.stopRecording?.();
    } catch {
      /* `recordAsync` will still resolve with whatever file was written */
    }
  }, []);

  const flip = React.useCallback(() => {
    // expo-camera cannot switch `facing` mid-record on iOS without breaking the
    // file. RecordScreen also hides the flip FAB during recording, but we
    // guard defensively here too.
    if (isRecordingRef.current) return;
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

  // Map our 'front'/'back' to expo-camera's CameraType.
  const cameraType: CameraType = facing === 'front' ? 'front' : 'back';

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        /** Do NOT include `facing` in `key` — remounting mid-recordAsync breaks recording and freezes preview. */
        key={`single-cam-${sessionKey}`}
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cameraType}
        mode="video"
        active={active}
        mirror={facing === 'front'}
        responsiveOrientationWhenOrientationLocked
        onCameraReady={() => {
          cameraReadyRef.current = true;
          setIsReady(true);
          markPreviewPulse();
          requestAnimationFrame(() => {
            void cameraRef.current?.resumePreview?.().catch(() => undefined);
          });
        }}
        onMountError={({ message }) => {
          cameraReadyRef.current = false;
          setIsReady(false);
          onError?.(new Error(message));
        }}
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
