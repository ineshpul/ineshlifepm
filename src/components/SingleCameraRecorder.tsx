import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';

import { canConcatVideosNatively, concatVideos } from '../services/concatVideos';
import { MIN_TASK_DURATION_SECONDS } from '../state/challenge';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

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
  controllerRef?: React.MutableRefObject<SingleCameraController | null>;
};

type SegmentEndReason = 'flip' | 'stop' | 'max';

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
  controllerRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 10,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    loadingText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '700' as const,
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

  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onCaptureRef = React.useRef(onCapture);
  onCaptureRef.current = onCapture;
  const onRecordingTickRef = React.useRef(onRecordingTick);
  onRecordingTickRef.current = onRecordingTick;
  const onReadyChangeRef = React.useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;

  React.useEffect(() => {
    facingRef.current = facing;
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

  const runSegmentLoop = React.useCallback(
    async (takeId: number) => {
      if (segmentLoopBusyRef.current) return;
      segmentLoopBusyRef.current = true;

      try {
        while (takeId === takeIdRef.current && isRecordingRef.current) {
          if (!cameraReadyRef.current || !cameraRef.current) {
            throw new Error('Camera not ready');
          }

          const remaining = Math.max(1, boundedMaxSec - elapsedRef.current);
          segmentEndReasonRef.current = null;

          let uri: string | null = null;
          try {
            const result = await cameraRef.current.recordAsync({
              maxDuration: remaining,
            });
            const rawUri = result?.uri ?? null;
            uri = rawUri
              ? rawUri.startsWith('file://')
                ? rawUri
                : `file://${rawUri}`
              : null;
          } catch (e) {
            if (takeId !== takeIdRef.current) return;
            // User stop / flip can reject recordAsync on some devices — keep segments.
            if (segmentsRef.current.length === 0) throw e;
          }

          if (takeId !== takeIdRef.current) return;
          if (uri) segmentsRef.current.push(uri);

          const reason = segmentEndReasonRef.current;
          if (reason === 'flip' && canConcatVideosNatively()) {
            // Flip only after the segment file is closed (facing mid-take corrupts expo-camera).
            setFacing((f) => (f === 'front' ? 'back' : 'front'));
            // Brief yield so CameraView applies the new facing before the next recordAsync.
            await new Promise<void>((r) => setTimeout(r, 120));
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
    [boundedMaxSec, finalizeTake, resetTakeState]
  );

  const start = React.useCallback(async () => {
    if (isRecordingRef.current || stitching) return;
    if (!cameraReadyRef.current || !cameraRef.current) {
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
  }, [runSegmentLoop, startTickInterval, stitching]);

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

    // Mid-record flip needs native stitch; otherwise keep production no-op.
    if (!canConcatVideosNatively()) return;
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
    if (!active) return;
    if (!cameraReadyRef.current || !cameraRef.current) return;
    requestAnimationFrame(() => {
      void cameraRef.current?.resumePreview?.().catch(() => undefined);
    });
  }, [active]);

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
        onCameraReady={() => {
          cameraReadyRef.current = true;
          setIsReady(true);
          requestAnimationFrame(() => {
            void cameraRef.current?.resumePreview?.().catch(() => undefined);
          });
        }}
        onMountError={({ message }) => {
          cameraReadyRef.current = false;
          setIsReady(false);
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
