import * as React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CommonResolutions,
  NativePreviewView,
  usePreviewOutput,
  useVideoOutput,
} from 'react-native-vision-camera';

import { enterRecording, ensureRecordingAudio } from '../camera/audioSessionGate';
import {
  DualCamSession,
  enqueueDualCamLifecycle,
  type DualCamPair,
} from '../camera/dualCamSession';
import { startDualRecording } from '../camera/dualRecordingCoordinator';
import {
  dualTakeToCapture,
  type DualCameraCapture,
} from '../camera/dualCamTypes';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { MIN_TASK_DURATION_SECONDS } from '../state/challenge';

export type { DualCameraCapture };

type Props = {
  /** When false, the session pauses (saves battery). Ignored while recording. */
  active: boolean;
  /** Hard cap for recording length, in seconds. */
  maxDurationSec: number;
  /** Hide the PIP tile (still records both cameras; flip/swap still works). */
  hidePip?: boolean;
  onRecordingTick?: (secondsLeft: number) => void;
  onCapture: (clip: DualCameraCapture) => void;
  onError?: (e: unknown) => void;
  /** Fires whenever the dual session can accept start/stop. */
  onReadyChange?: (ready: boolean) => void;
  controllerRef?: React.MutableRefObject<DualCameraController | null>;
};

export type DualCameraController = {
  readonly isReady: boolean;
  readonly isRecording: boolean;
  readonly supported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Swap which camera is full-screen vs PIP. Safe while recording. */
  swap: () => void;
};

const PIP_WIDTH = 110;
const PIP_HEIGHT = 150;
const PIP_INSET = 12;

/**
 * Dual video capture with fixed full + PIP slots. Swap only rebinds which
 * preview feeds which slot — never resizes native surfaces (that was laggy).
 */
export function DualCameraRecorder({
  active,
  maxDurationSec,
  hidePip = false,
  onRecordingTick,
  onCapture,
  onError,
  onReadyChange,
  controllerRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({
    fallback: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 24,
      gap: 10,
    },
    fallbackTitle: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '900' as const,
      letterSpacing: 0.4,
    },
    fallbackBody: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600' as const,
      textAlign: 'center' as const,
    },
    loading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 12,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 10,
      backgroundColor: 'rgba(0,0,0,0.35)',
      zIndex: 40,
    },
    loadingText: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '700' as const,
    },
    pipWrap: {
      position: 'absolute' as const,
      top: PIP_INSET,
      right: PIP_INSET,
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      borderRadius: 14,
      overflow: 'hidden' as const,
      backgroundColor: '#0F172A',
      zIndex: 30,
      opacity: 1,
    },
    pipWrapRecording: {
      opacity: 0.92,
    },
    pipBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.7)',
    },
    // Keep clear of top chrome / shutter so native preview can't eat UI taps.
    tapCatcher: {
      position: 'absolute' as const,
      top: 96,
      left: 0,
      right: 0,
      bottom: 168,
      zIndex: 20,
    },
    previewLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
  }));

  const boundedMaxSec = Math.max(MIN_TASK_DURATION_SECONDS, Math.round(maxDurationSec));

  const backPreview = usePreviewOutput();
  const frontPreview = usePreviewOutput();
  // Persistent recorder = VideoDataOutput + AVAssetWriter + a SEPARATE mic
  // AVCaptureSession. MovieFileOutput on AVCaptureMultiCamSession is structurally
  // broken for audio (wrong mic port / mp4 fragments) — that is why dual takes
  // have been silent for so long despite AVAudioSession fixes.
  const backVideo = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    targetBitRate: 3_500_000,
    enableAudio: true,
    enablePersistentRecorder: true,
    fileType: 'mp4',
  });
  const frontVideo = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    targetBitRate: 2_500_000,
    enableAudio: false,
    enablePersistentRecorder: true,
    fileType: 'mp4',
  });

  const outputsRef = React.useRef({
    backPreview,
    frontPreview,
    backVideo,
    frontVideo,
  });
  outputsRef.current = {
    backPreview,
    frontPreview,
    backVideo,
    frontVideo,
  };

  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onCaptureRef = React.useRef(onCapture);
  onCaptureRef.current = onCapture;
  const onRecordingTickRef = React.useRef(onRecordingTick);
  onRecordingTickRef.current = onRecordingTick;
  const onReadyChangeRef = React.useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;

  const [supported] = React.useState(() => DualCamSession.supportsMultiCam());
  const [multiCamPair, setMultiCamPair] = React.useState<DualCamPair | null>(null);
  const [devicesLoading, setDevicesLoading] = React.useState(supported);
  const [isReady, setIsReady] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [frontIsPrimary, setFrontIsPrimary] = React.useState(false);

  const frontIsPrimaryRef = React.useRef(false);
  React.useEffect(() => {
    frontIsPrimaryRef.current = frontIsPrimary;
  }, [frontIsPrimary]);

  const sessionRef = React.useRef<DualCamSession | null>(null);
  const stopHandleRef = React.useRef<(() => Promise<void>) | null>(null);
  const releaseAudioRef = React.useRef<(() => void) | null>(null);
  const isRecordingRef = React.useRef(false);
  const isReadyRef = React.useRef(false);
  const readyWaitersRef = React.useRef<Array<(ok: boolean) => void>>([]);
  const activeRef = React.useRef(active);
  activeRef.current = active;

  const markReady = React.useCallback((next: boolean) => {
    isReadyRef.current = next;
    setIsReady(next);
    onReadyChangeRef.current?.(next);
    if (next) {
      const waiters = readyWaitersRef.current.splice(0);
      for (const w of waiters) w(true);
    }
  }, []);

  const waitUntilReady = React.useCallback((timeoutMs: number) => {
    if (isReadyRef.current && sessionRef.current?.getPhase() === 'ready') {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        readyWaitersRef.current = readyWaitersRef.current.filter((w) => w !== onReady);
        resolve(false);
      }, timeoutMs);
      const onReady = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      readyWaitersRef.current.push(onReady);
    });
  }, []);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  React.useEffect(() => {
    if (!supported) {
      setDevicesLoading(false);
      markReady(false);
      return;
    }
    let cancelled = false;
    setDevicesLoading(true);
    void (async () => {
      try {
        const pair = await DualCamSession.findFrontBackPair();
        if (cancelled) return;
        setMultiCamPair(pair);
      } catch (e) {
        if (!cancelled) onErrorRef.current?.(e);
        setMultiCamPair(null);
      } finally {
        if (!cancelled) setDevicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported, markReady]);

  React.useEffect(() => {
    if (!supported || !multiCamPair) return;

    const session = new DualCamSession();
    sessionRef.current = session;
    let cancelled = false;

    void enqueueDualCamLifecycle(async () => {
      if (cancelled) return;
      try {
        const release = await enterRecording();
        if (cancelled) {
          release();
          return;
        }
        releaseAudioRef.current = release;
        await session.configureAndStart(multiCamPair, {
          kind: 'video',
          backPreview: outputsRef.current.backPreview,
          frontPreview: outputsRef.current.frontPreview,
          backVideo: outputsRef.current.backVideo,
          frontVideo: outputsRef.current.frontVideo,
        });
        if (cancelled) return;
        if (!activeRef.current) {
          await session.pause();
          markReady(false);
          return;
        }
        markReady(session.getPhase() === 'ready');
      } catch (e) {
        session.setPhase('failed');
        markReady(false);
        if (!cancelled) onErrorRef.current?.(e);
      }
    });

    return () => {
      cancelled = true;
      markReady(false);
      setIsRecording(false);
      isRecordingRef.current = false;
      stopHandleRef.current = null;
      const release = releaseAudioRef.current;
      releaseAudioRef.current = null;
      release?.();
      sessionRef.current = null;
      void enqueueDualCamLifecycle(async () => {
        await session.teardown();
      });
    };
  }, [supported, multiCamPair, markReady]);

  React.useEffect(() => {
    const session = sessionRef.current;
    if (!session || isRecording) return;
    if (!active) {
      if (session.getPhase() === 'ready' || session.getPhase() === 'warming') {
        void enqueueDualCamLifecycle(async () => {
          await session.pause();
        });
        markReady(false);
      }
      return;
    }
    if (session.getPhase() === 'paused') {
      void enqueueDualCamLifecycle(async () => {
        await session.resume();
        if (activeRef.current) {
          markReady(session.getPhase() === 'ready');
        }
      });
    }
  }, [active, isRecording, markReady]);

  const start = React.useCallback(async () => {
    if (isRecordingRef.current) return;

    const ready = await waitUntilReady(15_000);
    const session = sessionRef.current;
    if (!ready || !session) {
      throw new Error('Dual camera is still starting. Try again in a moment.');
    }

    if (session.getPhase() === 'paused') {
      await session.resume();
      markReady(session.getPhase() === 'ready');
    }
    if (session.getPhase() !== 'ready') {
      throw new Error('Dual camera is still starting. Try again in a moment.');
    }

    await ensureRecordingAudio();

    const { backVideo: bv, frontVideo: fv } = outputsRef.current;
    const handle = await startDualRecording({
      session,
      backVideo: bv,
      frontVideo: fv,
      maxDurationSec: boundedMaxSec,
      getFrontIsPrimary: () => frontIsPrimaryRef.current,
      onTick: (left) => onRecordingTickRef.current?.(left),
      onTake: (take) => {
        setIsRecording(false);
        isRecordingRef.current = false;
        stopHandleRef.current = null;
        onCaptureRef.current(dualTakeToCapture(take));
      },
      onError: (err) => {
        setIsRecording(false);
        isRecordingRef.current = false;
        stopHandleRef.current = null;
        onErrorRef.current?.(err);
      },
    });

    if (!handle) {
      // Coordinator already invoked onError for mic / writer failures.
      return;
    }
    stopHandleRef.current = handle.stop;
    setIsRecording(true);
    isRecordingRef.current = true;
  }, [boundedMaxSec, markReady, waitUntilReady]);

  const stop = React.useCallback(async () => {
    const stopFn = stopHandleRef.current;
    stopHandleRef.current = null;
    if (stopFn) {
      await stopFn();
    }
  }, []);

  const swap = React.useCallback(() => {
    setFrontIsPrimary((p) => !p);
  }, []);

  const lastTapRef = React.useRef(0);
  const onMainPreviewTap = React.useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      swap();
      return;
    }
    lastTapRef.current = now;
  }, [swap]);

  const supportedRef = React.useRef(false);
  supportedRef.current = supported && multiCamPair != null;

  // Stable controller object — never null out between dependency updates.
  const controllerApiRef = React.useRef<DualCameraController | null>(null);
  if (!controllerApiRef.current) {
    controllerApiRef.current = {
      get isReady() {
        return Boolean(isReadyRef.current && sessionRef.current?.getPhase() === 'ready');
      },
      get isRecording() {
        return isRecordingRef.current;
      },
      get supported() {
        return supportedRef.current;
      },
      start: async () => undefined,
      stop: async () => undefined,
      swap: () => undefined,
    };
  }
  controllerApiRef.current.start = start;
  controllerApiRef.current.stop = stop;
  controllerApiRef.current.swap = swap;

  React.useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = controllerApiRef.current;
    return () => {
      if (controllerRef.current === controllerApiRef.current) {
        controllerRef.current = null;
      }
    };
  }, [controllerRef]);

  if (!supported) {
    return (
      <View style={styles.fallback} pointerEvents="none">
        <Ionicons name="alert-circle-outline" size={32} color={colors.white} />
        <Text style={styles.fallbackTitle}>Dual camera not supported</Text>
        <Text style={styles.fallbackBody}>
          This device can&apos;t stream the front and back cameras at the same time.
          Switch back to single-camera mode to record.
        </Text>
      </View>
    );
  }

  if (devicesLoading || !multiCamPair) {
    return (
      <View style={styles.loading} pointerEvents="none">
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.loadingText}>
          {devicesLoading ? 'Finding cameras…' : 'Dual camera not available on this device'}
        </Text>
      </View>
    );
  }

  // Fixed slots — swap only which output feeds which view (no native resize).
  const primaryPreview = frontIsPrimary ? frontPreview : backPreview;
  const pipPreview = frontIsPrimary ? backPreview : frontPreview;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Previews are visual-only so they can't steal taps from shutter / chrome. */}
      <View style={styles.previewLayer} pointerEvents="none">
        <NativePreviewView
          style={StyleSheet.absoluteFill}
          previewOutput={primaryPreview}
          resizeMode="cover"
        />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Double tap to swap cameras"
        activeOpacity={1}
        onPress={onMainPreviewTap}
        style={styles.tapCatcher}
      />

      {!hidePip ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Swap which camera is the main one"
          activeOpacity={0.85}
          onPress={swap}
          style={[styles.pipWrap, isRecording && styles.pipWrapRecording]}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <NativePreviewView
              style={StyleSheet.absoluteFill}
              previewOutput={pipPreview}
              resizeMode="cover"
            />
          </View>
          <View style={styles.pipBorder} pointerEvents="none" />
        </TouchableOpacity>
      ) : null}

      {!isReady ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.loadingText}>Starting dual camera…</Text>
        </View>
      ) : null}
    </View>
  );
}
