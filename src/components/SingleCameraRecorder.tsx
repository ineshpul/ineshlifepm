import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraRecordingOptions, type CameraType } from 'expo-camera';

import { prepareForVideoRecording } from '../camera/prepareForVideoRecording';
import { canFlipMidRecording, concatVideos } from '../services/concatVideos';
import { MIN_TASK_DURATION_SECONDS } from '../state/challenge';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

export type SingleCameraFacing = 'front' | 'back';

export type SingleCameraController = {
  readonly isReady: boolean;
  readonly isRecording: boolean;
  readonly facing: SingleCameraFacing;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /**
   * Toggle front↔back. Safe while recording when native stitch is available:
   * closes the current expo-camera segment, flips, starts the next segment.
   */
  flip: () => void;
};

type Props = {
  active: boolean;
  initialFacing?: SingleCameraFacing;
  maxDurationSec: number;
  onRecordingTick?: (secondsLeft: number) => void;
  onCapture: (uri: string) => void;
  onError?: (e: unknown) => void;
  onReadyChange?: (ready: boolean) => void;
  onFacingChange?: (facing: SingleCameraFacing) => void;
  controllerRef?: React.MutableRefObject<SingleCameraController | null>;
};

type SegmentEndReason = 'flip' | 'stop' | 'max';

function recordingOptionsForTake(maxDurationSec: number): CameraRecordingOptions[] {
  const maxDuration = Math.max(1, Math.round(maxDurationSec));
  return [{ maxDuration }];
}

/**
 * Production Leap single-camera path: expo-camera `CameraView`
 * (hardware `AVCaptureMovieFileOutput`).
 *
 * Mid-record flip uses short MovieFileOutput segments + native stitch —
 * not vision-camera's persistent recorder (soft/laggy).
 */
export function SingleCameraRecorder({
  active,
  initialFacing = 'front',
  maxDurationSec,
  onRecordingTick,
  onCapture,
  onError,
  onReadyChange,
  onFacingChange,
  controllerRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 10,
      backgroundColor: 'rgba(12,15,13,0.42)',
    },
    loadingText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontFamily: typography.bodyBold,
      letterSpacing: 0.2,
    },
  }));

  const boundedMaxSec = Math.max(MIN_TASK_DURATION_SECONDS, Math.round(maxDurationSec));
  const [facing, setFacing] = React.useState<SingleCameraFacing>(initialFacing);
  const [isReady, setIsReady] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [stitching, setStitching] = React.useState(false);

  const cameraRef = React.useRef<CameraView | null>(null);
  const cameraReadyRef = React.useRef(false);
  const isReadyRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const facingRef = React.useRef(facing);
  const tickIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = React.useRef(0);
  const segmentsRef = React.useRef<string[]>([]);
  const takeIdRef = React.useRef(0);
  const segmentEndReasonRef = React.useRef<SegmentEndReason | null>(null);
  const segmentLoopBusyRef = React.useRef(false);
  const readyWaitersRef = React.useRef<Array<() => void>>([]);
  const hasBeenReadyRef = React.useRef(false);

  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onCaptureRef = React.useRef(onCapture);
  onCaptureRef.current = onCapture;
  const onRecordingTickRef = React.useRef(onRecordingTick);
  onRecordingTickRef.current = onRecordingTick;
  const onReadyChangeRef = React.useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;
  const onFacingChangeRef = React.useRef(onFacingChange);
  onFacingChangeRef.current = onFacingChange;

  const markCameraReady = React.useCallback(() => {
    cameraReadyRef.current = true;
    hasBeenReadyRef.current = true;
    setIsReady(true);
    const waiters = readyWaitersRef.current.splice(0);
    for (const resolve of waiters) resolve();
    requestAnimationFrame(() => {
      void cameraRef.current?.resumePreview?.().catch(() => undefined);
    });
  }, []);

  const markCameraNotReady = React.useCallback(() => {
    cameraReadyRef.current = false;
    setIsReady(false);
  }, []);

  const waitForCameraReady = React.useCallback((timeoutMs: number): Promise<void> => {
    if (cameraReadyRef.current && cameraRef.current) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = readyWaitersRef.current.indexOf(onReady);
        if (idx >= 0) readyWaitersRef.current.splice(idx, 1);
        reject(new Error('Camera not ready'));
      }, timeoutMs);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      readyWaitersRef.current.push(onReady);
    });
  }, []);

  React.useEffect(() => {
    facingRef.current = facing;
    onFacingChangeRef.current?.(facing);
  }, [facing]);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  React.useEffect(() => {
    isReadyRef.current = isReady;
    onReadyChangeRef.current?.(isReady);
  }, [isReady]);

  const stopTickInterval = React.useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const emitTick = React.useCallback(() => {
    onRecordingTickRef.current?.(Math.max(0, boundedMaxSec - elapsedRef.current));
  }, [boundedMaxSec]);

  const startTickInterval = React.useCallback(() => {
    stopTickInterval();
    emitTick();
    tickIntervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      emitTick();
      if (elapsedRef.current >= boundedMaxSec) {
        stopTickInterval();
        if (segmentEndReasonRef.current == null) {
          segmentEndReasonRef.current = 'max';
        }
        try {
          cameraRef.current?.stopRecording?.();
        } catch {
          /* recordAsync settles */
        }
      }
    }, 1000);
  }, [boundedMaxSec, emitTick, stopTickInterval]);

  const resetTakeState = React.useCallback(() => {
    stopTickInterval();
    isRecordingRef.current = false;
    setIsRecording(false);
    segmentEndReasonRef.current = null;
    segmentLoopBusyRef.current = false;
    elapsedRef.current = 0;
    segmentsRef.current = [];
  }, [stopTickInterval]);

  const finalizeTake = React.useCallback(
    async (takeId: number, segments: string[]) => {
      if (takeId !== takeIdRef.current) return;
      resetTakeState();
      const usable = segments.filter(Boolean);
      if (usable.length === 0) return;

      try {
        if (usable.length === 1) {
          onCaptureRef.current(usable[0]);
          return;
        }
        setStitching(true);
        const stitched = await concatVideos(usable);
        if (takeId !== takeIdRef.current) return;
        onCaptureRef.current(stitched);
      } catch (e) {
        if (takeId === takeIdRef.current) onErrorRef.current?.(e);
      } finally {
        if (takeId === takeIdRef.current) setStitching(false);
      }
    },
    [resetTakeState]
  );

  const recordOneSegment = React.useCallback(
    async (remaining: number): Promise<string | null> => {
      if (!cameraRef.current) {
        throw new Error('Camera not ready');
      }
      await prepareForVideoRecording();
      await waitForCameraReady(5000);

      const optionSets = recordingOptionsForTake(remaining);
      let lastError: unknown = null;

      for (let i = 0; i < 2; i += 1) {
        try {
          const result = await cameraRef.current.recordAsync(optionSets[0]);
          const rawUri = result?.uri ?? null;
          if (!rawUri) {
            throw new Error('Camera not ready');
          }
          return rawUri.startsWith('file://') ? rawUri : `file://${rawUri}`;
        } catch (e) {
          lastError = e;
          if (i < 1) {
            await prepareForVideoRecording();
            await new Promise<void>((r) => setTimeout(r, 220));
            await waitForCameraReady(3000).catch(() => undefined);
          }
        }
      }
      throw lastError ?? new Error('Camera not ready');
    },
    [waitForCameraReady]
  );

  const runSegmentLoop = React.useCallback(
    async (takeId: number) => {
      if (segmentLoopBusyRef.current) return;
      segmentLoopBusyRef.current = true;

      try {
        while (takeId === takeIdRef.current && isRecordingRef.current) {
          const remaining = Math.max(1, boundedMaxSec - elapsedRef.current);
          segmentEndReasonRef.current = null;

          let uri: string | null = null;
          try {
            uri = await recordOneSegment(remaining);
          } catch (e) {
            if (takeId !== takeIdRef.current) return;
            const reason = segmentEndReasonRef.current;
            if (reason === 'stop' || reason === 'max') {
              await finalizeTake(takeId, segmentsRef.current);
              return;
            }
            if (segmentsRef.current.length === 0) throw e;
          }

          if (takeId !== takeIdRef.current) return;
          if (uri) segmentsRef.current.push(uri);

          const reason = segmentEndReasonRef.current;
          if (reason === 'flip' && canFlipMidRecording()) {
            setFacing((f) => (f === 'front' ? 'back' : 'front'));
            await new Promise<void>((r) => setTimeout(r, 280));
            await waitForCameraReady(4000).catch(() => undefined);
            if (takeId !== takeIdRef.current || !isRecordingRef.current) {
              await finalizeTake(takeId, segmentsRef.current);
              return;
            }
            continue;
          }

          await finalizeTake(takeId, segmentsRef.current);
          return;
        }
      } catch (e) {
        if (takeId === takeIdRef.current) {
          resetTakeState();
          onErrorRef.current?.(e);
        }
      } finally {
        if (takeId === takeIdRef.current) {
          segmentLoopBusyRef.current = false;
        }
      }
    },
    [boundedMaxSec, finalizeTake, recordOneSegment, resetTakeState, waitForCameraReady]
  );

  const start = React.useCallback(async () => {
    if (isRecordingRef.current || stitching) return;
    await prepareForVideoRecording();
    await waitForCameraReady(5000);
    if (!cameraRef.current) {
      throw new Error('Camera not ready');
    }

    takeIdRef.current += 1;
    const takeId = takeIdRef.current;
    segmentsRef.current = [];
    elapsedRef.current = 0;
    segmentEndReasonRef.current = null;
    isRecordingRef.current = true;
    setIsRecording(true);
    startTickInterval();
    void runSegmentLoop(takeId);
  }, [runSegmentLoop, startTickInterval, stitching, waitForCameraReady]);

  const stop = React.useCallback(async () => {
    if (!isRecordingRef.current) return;
    if (segmentEndReasonRef.current === 'stop' || segmentEndReasonRef.current === 'max') {
      return;
    }
    segmentEndReasonRef.current = 'stop';
    try {
      cameraRef.current?.stopRecording?.();
    } catch {
      /* recordAsync settles */
    }
  }, []);

  const flip = React.useCallback(() => {
    if (stitching) return;

    if (!isRecordingRef.current) {
      setFacing((f) => (f === 'front' ? 'back' : 'front'));
      return;
    }

    if (!canFlipMidRecording()) return;
    if (segmentEndReasonRef.current != null) return;
    if (elapsedRef.current >= boundedMaxSec - 1) return;

    segmentEndReasonRef.current = 'flip';
    try {
      cameraRef.current?.stopRecording?.();
    } catch {
      segmentEndReasonRef.current = null;
    }
  }, [boundedMaxSec, stitching]);

  const controllerApiRef = React.useRef<SingleCameraController | null>(null);
  if (!controllerApiRef.current) {
    controllerApiRef.current = {
      get isReady() {
        return isReadyRef.current;
      },
      get isRecording() {
        return isRecordingRef.current;
      },
      get facing() {
        return facingRef.current;
      },
      start: async () => undefined,
      stop: async () => undefined,
      flip: () => undefined,
    };
  }
  controllerApiRef.current.start = start;
  controllerApiRef.current.stop = stop;
  controllerApiRef.current.flip = flip;

  React.useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = controllerApiRef.current;
    return () => {
      if (controllerRef.current === controllerApiRef.current) {
        controllerRef.current = null;
      }
    };
  }, [controllerRef]);

  const cameraType: CameraType = facing === 'front' ? 'front' : 'back';

  React.useEffect(() => {
    if (!active) {
      markCameraNotReady();
      return;
    }
    // CameraView stays mounted across `active` toggles, so `onCameraReady` fires
    // only on the first mount. Without re-arming here, readiness cleared on
    // deactivate never comes back and `waitForCameraReady` times out on the next
    // take (retry after a clip, or returning to a focused Record screen).
    if (!hasBeenReadyRef.current || !cameraRef.current) return;
    requestAnimationFrame(() => {
      const cam = cameraRef.current;
      if (!cam) return;
      void Promise.resolve(cam.resumePreview?.())
        .catch(() => undefined)
        .finally(() => markCameraReady());
    });
  }, [active, markCameraNotReady, markCameraReady]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={cameraType}
        mode="video"
        active={active}
        mirror={facing === 'front'}
        responsiveOrientationWhenOrientationLocked
        onCameraReady={markCameraReady}
        onMountError={({ message }) => {
          markCameraNotReady();
          onErrorRef.current?.(new Error(message));
        }}
      />
      {!isReady || stitching ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.loadingText}>
            {stitching ? 'Finishing flip…' : 'Starting camera…'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
