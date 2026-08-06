import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  enterPlayback,
  enterRecording,
  ensureRecordingAudio,
} from '../camera/audioSessionGate';
import {
  DualCameraRecorder,
  type DualCameraController,
} from '../components/DualCameraRecorder';
import {
  DualCameraPhotoCapture,
  type DualCameraPhotoController,
} from '../components/DualCameraPhotoCapture';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { RecordClipPreview } from '../components/RecordClipPreview';
import {
  SingleCameraRecorder,
  type SingleCameraController,
  type SingleCameraFacing,
} from '../components/SingleCameraRecorder';
import { canFlipMidRecording } from '../services/concatVideos';
import { useAuth } from '../state/auth';
import { useBackgroundBestPartUpload } from '../state/backgroundBestPartUpload';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
  BEST_PART_MAX_CAPTION,
  BEST_PART_MAX_VIDEO_SECONDS,
  type BestPartMediaType,
} from '../types/bestPart';
import { nyDateKey } from '../utils/nyTime';
import { showCameraRecordingError, showError, showInfo } from '../utils/ui';

type Stage = 'capture' | 'compose';
type CaptureMode = BestPartMediaType;
type CameraLayout = 'single' | 'dual' | 'switching';

const DOUBLE_TAP_MS = 280;
const CAMERA_SWITCH_MS = 280;

export function BestPartCaptureScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { preferences } = useSettingsPreferences();
  const { startBackgroundBestPart, isActive: backgroundUploadActive } =
    useBackgroundBestPartUpload();
  const cameraRef = React.useRef<CameraView | null>(null);
  const singleVideoRef = React.useRef<SingleCameraController | null>(null);
  const dualVideoRef = React.useRef<DualCameraController | null>(null);
  const dualPhotoRef = React.useRef<DualCameraPhotoController | null>(null);
  const lastTapRef = React.useRef(0);
  const releaseRecordAudioRef = React.useRef<(() => void) | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = React.useState<Stage>('capture');
  const [mode, setMode] = React.useState<CaptureMode>('photo');
  const [cameraLayout, setCameraLayout] = React.useState<CameraLayout>('single');
  const [facing, setFacing] = React.useState<SingleCameraFacing>('back');
  const [ready, setReady] = React.useState(false);
  const [dualReady, setDualReady] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [singleRecorderKey, setSingleRecorderKey] = React.useState(0);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = React.useRef(0);

  const [localUri, setLocalUri] = React.useState<string | null>(null);
  const [secondaryUri, setSecondaryUri] = React.useState<string | null>(null);
  const [dualFrontIsPrimary, setDualFrontIsPrimary] = React.useState(false);
  const [mediaType, setMediaType] = React.useState<CaptureMode>('photo');
  const [durationSeconds, setDurationSeconds] = React.useState<number | undefined>();
  const [caption, setCaption] = React.useState('');
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  const captionInputRef = React.useRef<TextInput>(null);

  const dualMode = cameraLayout === 'dual';
  const captureReady = dualMode ? dualReady : ready;
  const layoutSwitchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const styles = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: '#0E0E0E' },
    chrome: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
      elevation: 100,
    },
    topBar: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      paddingTop: insets.top + 8,
      paddingHorizontal: 16,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconBtnActive: { backgroundColor: c.green },
    /** Mirrors DualCameraRecorder tap zone — chrome sits above native previews. */
    dualTapCatcher: {
      position: 'absolute' as const,
      top: 96,
      left: 0,
      right: 0,
      bottom: 168,
    },
    /** Mirrors DualCameraRecorder PIP hit target for mid-record swap. */
    dualPipHit: {
      position: 'absolute' as const,
      top: 12,
      right: 12,
      width: 110,
      height: 150,
      borderRadius: 14,
    },
    modeRow: {
      position: 'absolute' as const,
      bottom: insets.bottom + 110,
      left: 0,
      right: 0,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 22,
    },
    modeChip: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    modeChipOn: { borderColor: '#fff' },
    shutterWrap: {
      position: 'absolute' as const,
      bottom: insets.bottom + 28,
      left: 0,
      right: 0,
      alignItems: 'center' as const,
    },
    shutterOuter: {
      width: 78,
      height: 78,
      borderRadius: 39,
      borderWidth: 4,
      borderColor: '#fff',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    shutterInner: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: '#fff',
    },
    shutterInnerVideo: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.coral,
    },
    shutterRecording: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: c.coral,
    },
    recordHint: {
      position: 'absolute' as const,
      top: insets.top + 64,
      alignSelf: 'center' as const,
      color: 'rgba(255,255,255,0.92)',
      fontWeight: '800' as const,
      fontSize: 13,
      letterSpacing: 0.8,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    recordTimerWrap: {
      position: 'absolute' as const,
      top: insets.top + 58,
      alignSelf: 'center' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    recordTimer: {
      color: c.coral,
      fontWeight: '900' as const,
      fontSize: 28,
      fontVariant: ['tabular-nums'] as ('tabular-nums')[],
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },
    recordTimerWarn: {
      color: '#FFB020',
    },
    recordTimerSub: {
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '700' as const,
      fontSize: 12,
      letterSpacing: 0.6,
    },
    compose: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: insets.top + 8,
      paddingHorizontal: 18,
    },
    composeContent: {
      flexGrow: 1,
      paddingBottom: insets.bottom + 24,
    },
    composeTop: {
      height: 44,
      marginBottom: 12,
      justifyContent: 'center' as const,
    },
    composeSideLeft: { position: 'absolute' as const, left: 0, zIndex: 2 },
    composeSideRight: { position: 'absolute' as const, right: 0, zIndex: 2 },
    composeTitle: {
      fontSize: 18,
      fontWeight: '800' as const,
      color: c.text,
      textAlign: 'center' as const,
    },
    preview: {
      width: '100%' as const,
      aspectRatio: 4 / 5,
      borderRadius: 22,
      overflow: 'hidden' as const,
      backgroundColor: '#111',
      marginBottom: 14,
    },
    previewCompact: {
      aspectRatio: undefined,
      height: 168,
      alignSelf: 'stretch' as const,
    },
    previewMedia: { width: '100%' as const, height: '100%' as const },
    previewPip: {
      position: 'absolute' as const,
      top: 12,
      right: 12,
      width: 88,
      height: 118,
      borderRadius: 12,
      overflow: 'hidden' as const,
      borderWidth: 2,
      borderColor: '#fff',
      backgroundColor: '#000',
    },
    previewPipCompact: {
      width: 64,
      height: 86,
      top: 8,
      right: 8,
    },
    input: {
      minHeight: 88,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      backgroundColor: c.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '600' as const,
      color: c.text,
      textAlignVertical: 'top' as const,
    },
    privateRow: {
      marginTop: 14,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 10,
    },
    privateLabel: { fontSize: 15, fontWeight: '700' as const, color: c.text },
    postBtn: {
      marginTop: 18,
      backgroundColor: c.green,
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: 'center' as const,
    },
    postBtnDisabled: { opacity: 0.55 },
    postText: { color: '#fff', fontSize: 16, fontWeight: '800' as const },
    perm: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 24,
      gap: 12,
      backgroundColor: c.bg,
    },
    permText: {
      fontSize: 16,
      color: c.text,
      textAlign: 'center' as const,
      fontWeight: '600' as const,
    },
    permBtn: {
      marginTop: 8,
      backgroundColor: c.green,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
    },
  }));

  const clearRecordTimer = React.useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const onCaptureCameraError = React.useCallback(
    (err: unknown) => {
      clearRecordTimer();
      setRecording(false);
      showCameraRecordingError(err);
      setSingleRecorderKey((k) => k + 1);
    },
    [clearRecordTimer]
  );

  React.useEffect(
    () => () => {
      clearRecordTimer();
      if (layoutSwitchTimerRef.current) {
        clearTimeout(layoutSwitchTimerRef.current);
        layoutSwitchTimerRef.current = null;
      }
    },
    [clearRecordTimer]
  );

  const switchCameraLayout = React.useCallback(() => {
    if (recording || cameraLayout === 'switching') return;
    const next: CameraLayout = cameraLayout === 'dual' ? 'single' : 'dual';
    setReady(false);
    setDualReady(false);
    setCameraLayout('switching');
    if (layoutSwitchTimerRef.current) clearTimeout(layoutSwitchTimerRef.current);
    // Brief idle so expo-camera / vision-camera release the hardware before the other mounts.
    layoutSwitchTimerRef.current = setTimeout(() => {
      layoutSwitchTimerRef.current = null;
      setCameraLayout(next);
    }, CAMERA_SWITCH_MS);
  }, [cameraLayout, recording]);

  const releaseCaptureAudio = React.useCallback(() => {
    const release = releaseRecordAudioRef.current;
    releaseRecordAudioRef.current = null;
    release?.();
  }, []);

  // Keep a record-capable AVAudioSession while capturing video (single or dual).
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        releaseCaptureAudio();
        void enterPlayback().catch(() => undefined);
      };
    }, [releaseCaptureAudio])
  );

  React.useEffect(() => {
    const needsRecordAudio = stage === 'capture' && mode === 'video';
    if (!needsRecordAudio) {
      releaseCaptureAudio();
      if (stage === 'compose') {
        void enterPlayback().catch(() => undefined);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const release = await enterRecording();
      if (cancelled) {
        release();
        return;
      }
      releaseRecordAudioRef.current?.();
      releaseRecordAudioRef.current = release;
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, mode, releaseCaptureAudio]);

  const ensureMic = React.useCallback(async () => {
    const current = await Audio.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Audio.requestPermissionsAsync();
    return next.granted;
  }, []);

  const flipFacing = React.useCallback(() => {
    if (dualMode) {
      if (mode === 'photo') dualPhotoRef.current?.swap();
      else dualVideoRef.current?.swap();
      return;
    }
    if (mode === 'video') {
      if (recording && !canFlipMidRecording()) return;
      singleVideoRef.current?.flip();
      return;
    }
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, [dualMode, mode, recording]);

  const onPreviewTap = React.useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      flipFacing();
      return;
    }
    lastTapRef.current = now;
  }, [flipFacing]);

  const close = () => {
    if (backgroundUploadActive) return;
    navigation.goBack();
  };

  const onRetake = () => {
    if (backgroundUploadActive) return;
    setLocalUri(null);
    setSecondaryUri(null);
    setDualFrontIsPrimary(false);
    setCaption('');
    setDurationSeconds(undefined);
    setStage('capture');
    setReady(false);
  };

  const takeDualPhoto = async () => {
    if (recording || !dualReady) return;
    const controller = dualPhotoRef.current;
    if (!controller?.supported) {
      showError('Dual camera unsupported', new Error("This device can't run both cameras together."));
      return;
    }
    setRecording(true);
    try {
      await controller.takePhoto();
    } catch (err) {
      setRecording(false);
      showError('Could not take photo', err);
    }
  };

  const takePhoto = async () => {
    if (dualMode) {
      void takeDualPhoto();
      return;
    }
    if (!cameraRef.current || !ready || recording) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error('No photo returned.');
      setLocalUri(photo.uri);
      setSecondaryUri(null);
      setDualFrontIsPrimary(false);
      setMediaType('photo');
      setDurationSeconds(undefined);
      releaseCaptureAudio();
      void enterPlayback().catch(() => undefined);
      setStage('compose');
    } catch (err) {
      showError('Could not take photo', err);
    }
  };

  const stopRecording = async () => {
    if (dualMode) {
      try {
        await dualVideoRef.current?.stop();
      } catch {
        // race with auto-stop
      }
      return;
    }
    try {
      await singleVideoRef.current?.stop();
    } catch {
      // stop can race with auto-stop
    }
  };

  const onSingleVideoCapture = React.useCallback(
    (uri: string) => {
      clearRecordTimer();
      setRecording(false);
      setLocalUri(uri);
      setSecondaryUri(null);
      setDualFrontIsPrimary(false);
      setMediaType('video');
      setDurationSeconds(
        Math.min(BEST_PART_MAX_VIDEO_SECONDS, Math.max(1, recordSecsRef.current || 1))
      );
      releaseCaptureAudio();
      void enterPlayback().catch(() => undefined);
      setStage('compose');
    },
    [clearRecordTimer, releaseCaptureAudio]
  );

  const startSingleRecording = async () => {
    if (recording) return;
    const controller = singleVideoRef.current;
    if (!controller?.isReady || !ready) return;
    const micOk = await ensureMic();
    if (!micOk) {
      showInfo('Microphone needed', 'Allow microphone access to record video.');
      return;
    }
    await ensureRecordingAudio();
    setRecordSecs(0);
    recordSecsRef.current = 0;
    clearRecordTimer();
    setRecording(true);
    try {
      await controller.start();
      if (!controller.isRecording) {
        setRecording(false);
      }
    } catch (err) {
      clearRecordTimer();
      setRecording(false);
      showError('Could not record', err);
    }
  };

  const startDualRecording = async () => {
    if (recording || !dualReady) return;
    const controller = dualVideoRef.current;
    if (!controller?.supported) {
      showError('Dual camera unsupported', new Error("This device can't run both cameras together."));
      return;
    }
    const micOk = await ensureMic();
    if (!micOk) {
      showInfo('Microphone needed', 'Allow microphone access to record video.');
      return;
    }
    await ensureRecordingAudio();
    setRecordSecs(0);
    recordSecsRef.current = 0;
    clearRecordTimer();
    setRecording(true);
    try {
      await controller.start();
      if (!controller.isRecording) {
        setRecording(false);
      }
    } catch (err) {
      clearRecordTimer();
      setRecording(false);
      showError('Could not record', err);
    }
  };

  const onShutter = () => {
    if (mode === 'photo') {
      void takePhoto();
      return;
    }
    if (recording) {
      void stopRecording();
      return;
    }
    if (dualMode) {
      void startDualRecording();
      return;
    }
    void startSingleRecording();
  };

  const onPost = () => {
    if (!user?.uid || !localUri || backgroundUploadActive) return;
    const trimmed = caption.trim();
    if (!trimmed) {
      showInfo('Caption needed', 'Add a short caption.');
      return;
    }

    const submitPost = () => {
      startBackgroundBestPart({
        uid: user.uid,
        username: String(user.username ?? 'user'),
        caption: trimmed,
        mediaType,
        localUri,
        secondaryUri,
        dualFrontIsPrimary: secondaryUri ? dualFrontIsPrimary : undefined,
        isPrivate,
        durationSeconds: mediaType === 'video' ? durationSeconds : undefined,
        dateKey: nyDateKey(),
        autoSavePosts: preferences.autoSavePosts,
      });
      navigation.goBack();
    };

    if (!preferences.uploadOnCellular) {
      Alert.alert(
        'Upload',
        'Cellular uploads are turned off in Settings. Upload this moment anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload', onPress: submitPost },
        ]
      );
      return;
    }
    submitPost();
  };

  if (!permission) {
    return (
      <View style={styles.perm}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.perm}>
        <Text style={styles.permText}>Camera access is required.</Text>
        <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
          <Text style={styles.postText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={close}>
          <Text style={{ color: colors.muted2, fontWeight: '700', marginTop: 12 }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === 'compose' && localUri) {
    const dismissKeyboard = () => {
      Keyboard.dismiss();
      captionInputRef.current?.blur();
    };

    return (
      <KeyboardScreen
        style={styles.compose}
        contentContainerStyle={styles.composeContent}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={styles.composeTop}>
          <Pressable
            style={styles.composeSideLeft}
            onPress={() => {
              dismissKeyboard();
              onRetake();
            }}
            disabled={backgroundUploadActive}
            hitSlop={8}
          >
            <Text style={{ color: colors.green, fontWeight: '800' }}>Retake</Text>
          </Pressable>
          <Text style={styles.composeTitle}>New Post</Text>
          <Pressable
            style={styles.composeSideRight}
            onPress={() => {
              dismissKeyboard();
              close();
            }}
            disabled={backgroundUploadActive}
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={keyboardOpen ? dismissKeyboard : undefined}
          disabled={!keyboardOpen}
          accessibilityRole={keyboardOpen ? 'button' : undefined}
          accessibilityLabel={keyboardOpen ? 'Dismiss keyboard' : undefined}
        >
          <View style={[styles.preview, keyboardOpen && styles.previewCompact]} pointerEvents="box-none">
            {mediaType === 'photo' ? (
              <>
                <Image source={{ uri: localUri }} style={styles.previewMedia} resizeMode="cover" />
                {secondaryUri ? (
                  <Image
                    source={{ uri: secondaryUri }}
                    style={[styles.previewPip, keyboardOpen && styles.previewPipCompact]}
                    resizeMode="cover"
                  />
                ) : null}
              </>
            ) : (
              <View style={StyleSheet.absoluteFill} pointerEvents={keyboardOpen ? 'none' : 'auto'}>
                <RecordClipPreview
                  key={`${localUri}|${secondaryUri ?? ''}`}
                  uri={localUri}
                  secondaryUri={secondaryUri}
                  dualFrontIsPrimary={dualFrontIsPrimary}
                  loop
                  contentFit="cover"
                />
              </View>
            )}
          </View>
        </Pressable>

        <TextInput
          ref={captionInputRef}
          style={styles.input}
          value={caption}
          onChangeText={(t) => setCaption(t.slice(0, BEST_PART_MAX_CAPTION))}
          placeholder="Caption… add #hashtags"
          placeholderTextColor={colors.muted2}
          multiline
          maxLength={BEST_PART_MAX_CAPTION}
          editable={!backgroundUploadActive}
          blurOnSubmit
          returnKeyType="done"
          onSubmitEditing={dismissKeyboard}
        />

        <Pressable onPress={dismissKeyboard}>
          <View style={styles.privateRow}>
            <Text style={styles.privateLabel}>Keep it private</Text>
            <Switch
              value={isPrivate}
              onValueChange={(v) => {
                dismissKeyboard();
                setIsPrivate(v);
              }}
              disabled={backgroundUploadActive}
              trackColor={{ false: colors.border, true: colors.moss }}
              thumbColor="#fff"
            />
          </View>
        </Pressable>

        <Pressable
          style={[styles.postBtn, backgroundUploadActive && styles.postBtnDisabled]}
          onPress={() => {
            dismissKeyboard();
            onPost();
          }}
          disabled={backgroundUploadActive}
        >
          <Text style={styles.postText}>
            {backgroundUploadActive
              ? 'Uploading…'
              : isPrivate
                ? 'Save'
                : 'Post'}
          </Text>
        </Pressable>
      </KeyboardScreen>
    );
  }

  return (
    <View style={styles.root}>
      {cameraLayout === 'switching' ? (
        <View style={StyleSheet.absoluteFill} />
      ) : dualMode && mode === 'photo' ? (
        <DualCameraPhotoCapture
          active
          controllerRef={dualPhotoRef}
          onReadyChange={setDualReady}
          onCapture={(clip) => {
            setRecording(false);
            setLocalUri(clip.primaryUri);
            setSecondaryUri(clip.secondaryUri);
            setDualFrontIsPrimary(clip.frontIsPrimary);
            setMediaType('photo');
            setDurationSeconds(undefined);
            releaseCaptureAudio();
            void enterPlayback().catch(() => undefined);
            setStage('compose');
          }}
          onError={onCaptureCameraError}
        />
      ) : dualMode ? (
        <DualCameraRecorder
          active
          maxDurationSec={BEST_PART_MAX_VIDEO_SECONDS}
          controllerRef={dualVideoRef}
          onReadyChange={setDualReady}
          onRecordingTick={(left) => {
            const used = Math.max(0, BEST_PART_MAX_VIDEO_SECONDS - left);
            recordSecsRef.current = used;
            setRecordSecs(used);
          }}
          onCapture={(clip) => {
            clearRecordTimer();
            setRecording(false);
            setLocalUri(clip.primaryUri);
            setSecondaryUri(clip.secondaryUri);
            setDualFrontIsPrimary(clip.frontIsPrimary);
            setMediaType('video');
            setDurationSeconds(
              Math.min(BEST_PART_MAX_VIDEO_SECONDS, Math.max(1, recordSecsRef.current || 1))
            );
            setStage('compose');
          }}
          onError={onCaptureCameraError}
        />
      ) : mode === 'video' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <SingleCameraRecorder
            key={`best-part-single-${singleRecorderKey}`}
            active
            initialFacing={facing}
            maxDurationSec={BEST_PART_MAX_VIDEO_SECONDS}
            controllerRef={singleVideoRef}
            onFacingChange={setFacing}
            onReadyChange={setReady}
            onRecordingTick={(left) => {
              const used = Math.max(0, BEST_PART_MAX_VIDEO_SECONDS - left);
              recordSecsRef.current = used;
              setRecordSecs(used);
            }}
            onCapture={onSingleVideoCapture}
            onError={onCaptureCameraError}
          />
          <Pressable
            style={{ position: 'absolute', top: 96, left: 0, right: 0, bottom: 168 }}
            onPress={onPreviewTap}
            accessibilityLabel="Double tap to flip camera"
          />
        </View>
      ) : (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <CameraView
              key={facing}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="picture"
              mirror={facing === 'front'}
              onCameraReady={() => setReady(true)}
              onMountError={({ message }) => showError('Camera error', message)}
            />
          </View>
          <Pressable
            style={{ position: 'absolute', top: 96, left: 0, right: 0, bottom: 168 }}
            onPress={onPreviewTap}
            accessibilityLabel="Double tap to flip camera"
          />
        </View>
      )}

      {/* Chrome sits above native camera layers so dual mode can't eat taps. */}
      <View style={styles.chrome} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable style={styles.iconBtn} onPress={close} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {cameraLayout !== 'switching' ? (
              <Pressable
                style={styles.iconBtn}
                onPress={flipFacing}
                accessibilityLabel={dualMode ? 'Swap cameras' : 'Flip camera'}
              >
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
              </Pressable>
            ) : null}
            {!recording ? (
              <Pressable
                style={[styles.iconBtn, dualMode && styles.iconBtnActive]}
                onPress={switchCameraLayout}
                disabled={cameraLayout === 'switching'}
                accessibilityLabel={dualMode ? 'Single camera' : 'Dual camera'}
              >
                <Ionicons name={dualMode ? 'copy' : 'copy-outline'} size={20} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Chrome sits above dual previews — own swap gestures so mid-record works. */}
        {dualMode ? (
          <>
            <Pressable
              style={styles.dualTapCatcher}
              onPress={onPreviewTap}
              accessibilityLabel="Double tap to swap cameras"
            />
            <Pressable
              style={styles.dualPipHit}
              onPress={flipFacing}
              accessibilityLabel="Swap which camera is the main one"
            />
          </>
        ) : null}

        {recording && mode === 'video' ? (
          <View style={styles.recordTimerWrap} pointerEvents="none">
            <Text
              style={[
                styles.recordTimer,
                BEST_PART_MAX_VIDEO_SECONDS - recordSecs <= 5 ? styles.recordTimerWarn : null,
              ]}
            >
              {Math.max(0, BEST_PART_MAX_VIDEO_SECONDS - recordSecs)}S LEFT
            </Text>
            <Text style={styles.recordTimerSub}>{BEST_PART_MAX_VIDEO_SECONDS}S MAX</Text>
          </View>
        ) : null}

        {!recording && mode === 'video' && cameraLayout !== 'switching' ? (
          <Text style={styles.recordHint} pointerEvents="none">
            {BEST_PART_MAX_VIDEO_SECONDS}S MAX
          </Text>
        ) : null}

        {!recording && cameraLayout !== 'switching' ? (
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, mode === 'photo' && styles.modeChipOn]}
              onPress={() => {
                setReady(false);
                setDualReady(false);
                setMode('photo');
              }}
              accessibilityLabel="Photo"
            >
              <Ionicons name="camera" size={26} color="#fff" />
            </Pressable>
            <Pressable
              style={[styles.modeChip, mode === 'video' && styles.modeChipOn]}
              onPress={() => {
                setReady(false);
                setDualReady(false);
                setMode('video');
              }}
              accessibilityLabel="Video"
            >
              <Ionicons name="videocam" size={26} color={colors.coral} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.shutterWrap}>
          <Pressable
            style={[
              styles.shutterOuter,
              (!captureReady || cameraLayout === 'switching') && !recording
                ? { opacity: 0.45 }
                : null,
            ]}
            onPress={onShutter}
            disabled={(!captureReady || cameraLayout === 'switching') && !recording}
            accessibilityLabel={
              mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'
            }
          >
            <View
              style={
                recording
                  ? styles.shutterRecording
                  : mode === 'video'
                    ? styles.shutterInnerVideo
                    : styles.shutterInner
              }
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
