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
  VisionCamera,
} from 'react-native-vision-camera';
import type {
  CameraDevice,
  CameraSession,
  Recorder,
} from 'react-native-vision-camera';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { MIN_TASK_DURATION_SECONDS } from '../state/challenge';

export type DualCameraCapture = {
  /** Primary clip (the camera shown full-screen at capture time, usually back). */
  primaryUri: string;
  /** Secondary clip (PIP camera at capture time, usually front). */
  secondaryUri: string;
  /** Whether the front camera was the big one when recording finished. */
  frontIsPrimary: boolean;
};

type Props = {
  /** When false, the session is configured but stops (saves battery while previewing other tabs). */
  active: boolean;
  /** Hard cap for recording length, in seconds. The native recorders enforce this. */
  maxDurationSec: number;
  /** Fires every second while recording, with seconds remaining. */
  onRecordingTick?: (secondsLeft: number) => void;
  /** Both clips finished writing successfully. */
  onCapture: (clip: DualCameraCapture) => void;
  /** Surfaces fatal errors so the parent can route them through showError. */
  onError?: (e: unknown) => void;
  /**
   * Exposes start/stop control so the parent's record button can drive recording.
   * Returned `supported === false` means the device hardware cannot do simultaneous front+back.
   */
  controllerRef?: React.MutableRefObject<DualCameraController | null>;
};

export type DualCameraController = {
  /** True once the session is running and previews are live. */
  readonly isReady: boolean;
  readonly isRecording: boolean;
  /** True if the device supports simultaneous front+back capture. */
  readonly supported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

const PIP_WIDTH = 110;
const PIP_HEIGHT = 150;
const PIP_INSET = 12;

type MultiCamPair = {
  front: CameraDevice;
  back: CameraDevice;
};

/**
 * BeReal-style dual camera capture using vision-camera v5 multi-cam sessions.
 *
 * Renders one preview full-screen and the other as a PIP tile. Tap the PIP
 * tile to swap which camera is the big one. The same record control writes
 * one MP4 per camera to disk; the parent decides what to do with them.
 *
 * Hardware support varies — only iPhone XS+ and certain recent Snapdragon
 * Androids can stream both cameras at the same time. Render a graceful
 * fallback when `supported` is false.
 */
export function DualCameraRecorder({
  active,
  maxDurationSec,
  onRecordingTick,
  onCapture,
  onError,
  controllerRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  fallbackTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  fallbackBody: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
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
  pipWrap: {
    position: 'absolute',
    top: PIP_INSET,
    right: PIP_INSET,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    zIndex: 30,
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
}));
  const boundedMaxSec = Math.max(MIN_TASK_DURATION_SECONDS, Math.round(maxDurationSec));

  const backPreview = usePreviewOutput();
  const frontPreview = usePreviewOutput();

  const backVideo = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    targetBitRate: 8_000_000,
    // iOS multi-cam exposes one mic input — attaching it to two recorders races
    // and yields intermittent silent clips. Back camera always owns audio; when
    // the user swaps front to big, playback reads audio from the PIP clip instead.
    enableAudio: true,
    fileType: 'mp4',
  });
  const frontVideo = useVideoOutput({
    // PIP only needs a light stream — lower resolution keeps the selfie preview smooth.
    targetResolution: CommonResolutions.VGA_16_9,
    targetBitRate: 2_500_000,
    enableAudio: false,
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

  const [supported] = React.useState<boolean>(() => {
    try {
      return Boolean(VisionCamera.supportsMultiCamSessions);
    } catch {
      return false;
    }
  });
  const [multiCamPair, setMultiCamPair] = React.useState<MultiCamPair | null>(null);
  const [devicesLoading, setDevicesLoading] = React.useState(supported);
  const [isReady, setIsReady] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  /** Which camera is the big one. PIP shows the other. */
  const [frontIsPrimary, setFrontIsPrimary] = React.useState(false);
  /** Latest value so the capture callback resolves primary/secondary off the swap-on-stop choice. */
  const frontIsPrimaryRef = React.useRef(false);
  React.useEffect(() => {
    frontIsPrimaryRef.current = frontIsPrimary;
  }, [frontIsPrimary]);

  const sessionRef = React.useRef<CameraSession | null>(null);
  const backRecorderRef = React.useRef<Recorder | null>(null);
  const frontRecorderRef = React.useRef<Recorder | null>(null);
  const isRecordingRef = React.useRef(false);
  const recordingStopGuardRef = React.useRef(false);
  const tickIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Pick a front+back pair the hardware actually supports running together.
  React.useEffect(() => {
    if (!supported) {
      setDevicesLoading(false);
      return;
    }

    let cancelled = false;
    setDevicesLoading(true);

    void (async () => {
      try {
        const factory = await VisionCamera.createDeviceFactory();
        const combo = factory.supportedMultiCamDeviceCombinations.find((devices) => {
          return (
            devices.some((d) => d.position === 'front') &&
            devices.some((d) => d.position === 'back')
          );
        });
        if (cancelled) return;
        if (!combo) {
          setMultiCamPair(null);
          return;
        }
        const front = combo.find((d) => d.position === 'front');
        const back = combo.find((d) => d.position === 'back');
        if (front && back) {
          setMultiCamPair({ front, back });
        } else {
          setMultiCamPair(null);
        }
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
  }, [supported]);

  React.useEffect(() => {
    if (!supported || !multiCamPair) return;

    const { front: frontDevice, back: backDevice } = multiCamPair;
    const { backPreview: bp, frontPreview: fp, backVideo: bv, frontVideo: fv } =
      outputsRef.current;

    let cancelled = false;
    let session: CameraSession | null = null;
    let teardownInProgress = false;

    void (async () => {
      try {
        // Vision Camera tracks its own permission state. Request mic explicitly
        // before configuring with `enableAudio: true`, or `session.configure`
        // throws "Audio Permission not yet granted" even when the OS already
        // granted it via expo-av.
        if (VisionCamera.microphonePermissionStatus !== 'authorized') {
          await VisionCamera.requestMicrophonePermission().catch(() => false);
        }
        if (VisionCamera.cameraPermissionStatus !== 'authorized') {
          await VisionCamera.requestCameraPermission().catch(() => false);
        }
        session = await VisionCamera.createCameraSession(true);
        if (cancelled) {
          await session.stop().catch(() => undefined);
          return;
        }
        await session.configure([
          {
            input: backDevice,
            outputs: [
              { output: bp, mirrorMode: 'off' },
              { output: bv, mirrorMode: 'off' },
            ],
            constraints: [
              { fps: 30 },
              { resolutionBias: bv },
              { resolutionBias: bp },
              { binned: true },
            ],
          },
          {
            input: frontDevice,
            outputs: [
              { output: fp, mirrorMode: 'on' },
              { output: fv, mirrorMode: 'on' },
            ],
            constraints: [
              { fps: 24 },
              { resolutionBias: fv },
              { resolutionBias: fp },
              { binned: true },
            ],
          },
        ]);
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
        if (!cancelled) onErrorRef.current?.(e);
      }
    })();

    return () => {
      cancelled = true;
      if (teardownInProgress) return;
      teardownInProgress = true;
      const s = session ?? sessionRef.current;
      sessionRef.current = null;
      setIsReady(false);
      void (async () => {
        // Cancel any in-flight recording first so file writers don't dangle.
        const recBack = backRecorderRef.current;
        const recFront = frontRecorderRef.current;
        backRecorderRef.current = null;
        frontRecorderRef.current = null;
        if (tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
        try {
          if (recBack?.isRecording) await recBack.cancelRecording();
        } catch {
          /* ignore */
        }
        try {
          if (recFront?.isRecording) await recFront.cancelRecording();
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
  }, [supported, multiCamPair]);

  // Pause the session when the parent says we're no longer active (e.g. another
  // tab focused) to release the camera and save battery.
  React.useEffect(() => {
    const s = sessionRef.current;
    if (!s || !isReady) return;
    if (active) {
      void s.start().catch(() => undefined);
    } else {
      void s.stop().catch(() => undefined);
    }
  }, [active, isReady]);

  const start = React.useCallback(async () => {
    if (!isReady || isRecordingRef.current) return;
    const { backVideo: bv, frontVideo: fv } = outputsRef.current;
    if (!bv || !fv) return;

    recordingStopGuardRef.current = false;
    // Each `Recorder` records exactly once — always make a new pair per take.
    let backRec: Recorder | null = null;
    let frontRec: Recorder | null = null;
    let backUri: string | null = null;
    let frontUri: string | null = null;
    let backDone = false;
    let frontDone = false;
    let captureFired = false;

    const maybeFireCapture = () => {
      if (captureFired) return;
      if (!backDone || !frontDone) return;
      if (!backUri || !frontUri) return;
      captureFired = true;
      // Read the latest swap choice so the user's last tap before stopping wins.
      const fIsPrimary = frontIsPrimaryRef.current;
      onCaptureRef.current({
        primaryUri: fIsPrimary ? frontUri : backUri,
        secondaryUri: fIsPrimary ? backUri : frontUri,
        frontIsPrimary: fIsPrimary,
      });
    };

    try {
      // Re-assert mic permission right before capture — expo-av's recording session
      // can reset vision-camera's permission view and leave clips silent.
      if (VisionCamera.microphonePermissionStatus !== 'authorized') {
        const granted = await VisionCamera.requestMicrophonePermission().catch(() => false);
        if (!granted) {
          onErrorRef.current?.(new Error('Microphone permission is required to record with sound.'));
          return;
        }
      }

      backRec = await bv.createRecorder({ maxDuration: boundedMaxSec });
      frontRec = await fv.createRecorder({ maxDuration: boundedMaxSec });
      backRecorderRef.current = backRec;
      frontRecorderRef.current = frontRec;

      // Start the audio-bearing recorder first so iOS attaches the shared mic input
      // before the second movie writer spins up, then start the selfie stream immediately.
      await backRec.startRecording(
        (filePath) => {
          backUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          backDone = true;
          maybeFireCapture();
        },
        (err) => {
          onErrorRef.current?.(err);
        }
      );

      await frontRec.startRecording(
        (filePath) => {
          frontUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          frontDone = true;
          maybeFireCapture();
        },
        (err) => {
          onErrorRef.current?.(err);
        }
      );

      setIsRecording(true);
      isRecordingRef.current = true;

      let elapsed = 0;
      onRecordingTickRef.current?.(boundedMaxSec);
      tickIntervalRef.current = setInterval(() => {
        elapsed += 1;
        const left = Math.max(0, boundedMaxSec - elapsed);
        onRecordingTickRef.current?.(left);
        if (left <= 0 && tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
      }, 1000);
    } catch (e) {
      onErrorRef.current?.(e);
      setIsRecording(false);
      isRecordingRef.current = false;
      backRecorderRef.current = null;
      frontRecorderRef.current = null;
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }
  }, [isReady, boundedMaxSec]);

  const stop = React.useCallback(async () => {
    if (recordingStopGuardRef.current) return;
    recordingStopGuardRef.current = true;
    const backRec = backRecorderRef.current;
    const frontRec = frontRecorderRef.current;
    backRecorderRef.current = null;
    frontRecorderRef.current = null;
    setIsRecording(false);
    isRecordingRef.current = false;
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    await Promise.all([
      backRec?.isRecording ? backRec.stopRecording().catch(() => undefined) : undefined,
      frontRec?.isRecording ? frontRec.stopRecording().catch(() => undefined) : undefined,
    ]);
  }, []);

  // Expose start/stop to the parent so the same red record button works for
  // both single- and dual-camera modes.
  React.useEffect(() => {
    if (!controllerRef) return;
    controllerRef.current = {
      get isReady() {
        return isReady;
      },
      get isRecording() {
        return isRecording;
      },
      get supported() {
        return supported && multiCamPair != null;
      },
      start,
      stop,
    };
    return () => {
      if (controllerRef.current && controllerRef.current.start === start) {
        controllerRef.current = null;
      }
    };
  }, [controllerRef, isReady, isRecording, supported, multiCamPair, start, stop]);

  if (!supported) {
    return (
      <View style={styles.fallback}>
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
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.loadingText}>
          {devicesLoading ? 'Finding cameras…' : 'Dual camera not available on this device'}
        </Text>
      </View>
    );
  }

  const bigPreview = frontIsPrimary ? frontPreview : backPreview;
  const pipPreview = frontIsPrimary ? backPreview : frontPreview;

  return (
    <View style={StyleSheet.absoluteFill}>
      <NativePreviewView
        style={StyleSheet.absoluteFill}
        previewOutput={bigPreview}
        resizeMode="cover"
      />

      {!isReady ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.loadingText}>Starting dual camera…</Text>
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Swap which camera is the main one"
        activeOpacity={0.85}
        // Swap is safe during recording — both video files keep writing
        // independently; only the visual "big vs PIP" assignment changes.
        onPress={() => setFrontIsPrimary((p) => !p)}
        style={[styles.pipWrap, isRecording && styles.pipWrapRecording]}
      >
        <NativePreviewView
          style={StyleSheet.absoluteFill}
          previewOutput={pipPreview}
          resizeMode="cover"
        />
        <View style={styles.pipBorder} pointerEvents="none" />
      </TouchableOpacity>
    </View>
  );
}
