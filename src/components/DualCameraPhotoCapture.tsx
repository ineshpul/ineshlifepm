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
  usePhotoOutput,
  usePreviewOutput,
} from 'react-native-vision-camera';

import {
  DualCamSession,
  enqueueDualCamLifecycle,
  type DualCamPair,
} from '../camera/dualCamSession';
import { captureDualPhotos } from '../camera/dualPhotoCoordinator';
import {
  dualTakeToCapture,
  type DualCameraCapture,
} from '../camera/dualCamTypes';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

export type DualCameraPhotoController = {
  readonly isReady: boolean;
  readonly isCapturing: boolean;
  readonly supported: boolean;
  takePhoto: () => Promise<void>;
  swap: () => void;
};

type Props = {
  active: boolean;
  onCapture: (clip: DualCameraCapture) => void;
  onError?: (e: unknown) => void;
  onReadyChange?: (ready: boolean) => void;
  controllerRef?: React.MutableRefObject<DualCameraPhotoController | null>;
};

const PIP_WIDTH = 110;
const PIP_HEIGHT = 150;
const PIP_INSET = 12;

/** Dual still capture — separate from video so unused movie outputs never load. */
export function DualCameraPhotoCapture({
  active,
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
    },
    pipBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.7)',
    },
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

  const backPreview = usePreviewOutput();
  const frontPreview = usePreviewOutput();
  const backPhoto = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    quality: 0.9,
    qualityPrioritization: 'balanced',
  });
  const frontPhoto = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    quality: 0.9,
    qualityPrioritization: 'balanced',
  });

  const outputsRef = React.useRef({ backPreview, frontPreview, backPhoto, frontPhoto });
  outputsRef.current = { backPreview, frontPreview, backPhoto, frontPhoto };

  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onCaptureRef = React.useRef(onCapture);
  onCaptureRef.current = onCapture;
  const onReadyChangeRef = React.useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;

  const [supported] = React.useState(() => DualCamSession.supportsMultiCam());
  const [multiCamPair, setMultiCamPair] = React.useState<DualCamPair | null>(null);
  const [devicesLoading, setDevicesLoading] = React.useState(supported);
  const [isReady, setIsReady] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [frontIsPrimary, setFrontIsPrimary] = React.useState(false);
  const frontIsPrimaryRef = React.useRef(false);
  const sessionRef = React.useRef<DualCamSession | null>(null);
  const busyRef = React.useRef(false);
  const isReadyRef = React.useRef(false);
  const activeRef = React.useRef(active);
  activeRef.current = active;

  const markReady = React.useCallback((next: boolean) => {
    isReadyRef.current = next;
    setIsReady(next);
    onReadyChangeRef.current?.(next);
  }, []);

  React.useEffect(() => {
    frontIsPrimaryRef.current = frontIsPrimary;
  }, [frontIsPrimary]);

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
        if (!cancelled) setMultiCamPair(pair);
      } catch (e) {
        if (!cancelled) onErrorRef.current?.(e);
        if (!cancelled) setMultiCamPair(null);
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
        const outs = outputsRef.current;
        await session.configureAndStart(multiCamPair, {
          kind: 'photo',
          backPreview: outs.backPreview,
          frontPreview: outs.frontPreview,
          backPhoto: outs.backPhoto,
          frontPhoto: outs.frontPhoto,
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
      busyRef.current = false;
      sessionRef.current = null;
      void enqueueDualCamLifecycle(async () => {
        await session.teardown();
      });
    };
  }, [supported, multiCamPair, markReady]);

  React.useEffect(() => {
    const session = sessionRef.current;
    if (!session || isCapturing) return;
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
        if (activeRef.current) markReady(session.getPhase() === 'ready');
      });
    }
  }, [active, isCapturing, markReady]);

  const swap = React.useCallback(() => {
    setFrontIsPrimary((p) => !p);
  }, []);

  const takePhoto = React.useCallback(async () => {
    const session = sessionRef.current;
    if (!session || busyRef.current) return;
    if (session.getPhase() === 'paused') {
      await session.resume();
      markReady(session.getPhase() === 'ready');
    }
    if (session.getPhase() !== 'ready') {
      throw new Error('Dual camera is still starting. Try again in a moment.');
    }
    busyRef.current = true;
    setIsCapturing(true);
    try {
      const outs = outputsRef.current;
      const take = await captureDualPhotos({
        session,
        backPhoto: outs.backPhoto,
        frontPhoto: outs.frontPhoto,
        getFrontIsPrimary: () => frontIsPrimaryRef.current,
      });
      onCaptureRef.current(dualTakeToCapture(take));
    } finally {
      busyRef.current = false;
      setIsCapturing(false);
    }
  }, [markReady]);

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
  const controllerApiRef = React.useRef<DualCameraPhotoController | null>(null);
  if (!controllerApiRef.current) {
    controllerApiRef.current = {
      get isReady() {
        return Boolean(isReadyRef.current && sessionRef.current?.getPhase() === 'ready');
      },
      get isCapturing() {
        return busyRef.current;
      },
      get supported() {
        return supportedRef.current;
      },
      takePhoto: async () => undefined,
      swap: () => undefined,
    };
  }
  controllerApiRef.current.takePhoto = takePhoto;
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
          Switch back to single-camera mode to shoot.
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

  const primaryPreview = frontIsPrimary ? frontPreview : backPreview;
  const pipPreview = frontIsPrimary ? backPreview : frontPreview;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Swap which camera is the main one"
        activeOpacity={0.85}
        onPress={swap}
        style={styles.pipWrap}
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
      {!isReady ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={styles.loadingText}>Starting dual camera…</Text>
        </View>
      ) : null}
    </View>
  );
}
