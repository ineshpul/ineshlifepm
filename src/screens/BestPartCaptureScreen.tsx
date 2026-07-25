import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DualCameraRecorder,
  type DualCameraController,
} from '../components/DualCameraRecorder';
import { useAuth } from '../state/auth';
import { commitBestPartPost } from '../services/bestPartPosts';
import { uploadBestPartMedia } from '../services/bestPartUpload';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
  BEST_PART_MAX_CAPTION,
  BEST_PART_MAX_VIDEO_SECONDS,
  type BestPartMediaType,
} from '../types/bestPart';
import { nyDateKey } from '../utils/nyTime';
import { showError, showInfo } from '../utils/ui';

type Stage = 'capture' | 'compose';
type CaptureMode = BestPartMediaType;
type CameraLayout = 'single' | 'dual';

const DOUBLE_TAP_MS = 280;

export function BestPartCaptureScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const cameraRef = React.useRef<CameraView | null>(null);
  const dualControllerRef = React.useRef<DualCameraController | null>(null);
  const lastTapRef = React.useRef(0);
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = React.useState<Stage>('capture');
  const [mode, setMode] = React.useState<CaptureMode>('photo');
  const [cameraLayout, setCameraLayout] = React.useState<CameraLayout>('single');
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [ready, setReady] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
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
  const [posting, setPosting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const dualMode = cameraLayout === 'dual' && mode === 'video';

  const styles = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: '#0E0E0E' },
    topBar: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      zIndex: 4,
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
    modeRow: {
      position: 'absolute' as const,
      bottom: insets.bottom + 110,
      left: 0,
      right: 0,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 22,
      zIndex: 4,
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
      zIndex: 4,
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
    recordTimer: {
      position: 'absolute' as const,
      top: insets.top + 64,
      alignSelf: 'center' as const,
      zIndex: 4,
      color: c.coral,
      fontWeight: '800' as const,
      fontSize: 18,
    },
    compose: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: insets.top + 8,
      paddingHorizontal: 18,
      paddingBottom: insets.bottom + 16,
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

  React.useEffect(() => () => clearRecordTimer(), [clearRecordTimer]);

  const ensureMic = React.useCallback(async () => {
    const current = await Audio.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Audio.requestPermissionsAsync();
    return next.granted;
  }, []);

  const flipFacing = React.useCallback(() => {
    if (recording || dualMode) return;
    setReady(false);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, [recording, dualMode]);

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
    if (posting) return;
    navigation.goBack();
  };

  const onRetake = () => {
    if (posting) return;
    setLocalUri(null);
    setSecondaryUri(null);
    setDualFrontIsPrimary(false);
    setCaption('');
    setDurationSeconds(undefined);
    setStage('capture');
    setReady(false);
  };

  const takePhoto = async () => {
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
      setStage('compose');
    } catch (err) {
      showError('Could not take photo', err);
    }
  };

  const stopRecording = async () => {
    if (dualMode) {
      try {
        await dualControllerRef.current?.stop();
      } catch {
        // race with auto-stop
      }
      return;
    }
    try {
      await cameraRef.current?.stopRecording();
    } catch {
      // stop can race with auto-stop
    }
  };

  const startSingleRecording = async () => {
    if (!cameraRef.current || !ready || recording) return;
    const micOk = await ensureMic();
    if (!micOk) {
      showInfo('Microphone needed', 'Allow microphone access to record video.');
      return;
    }
    setRecording(true);
    setRecordSecs(0);
    recordSecsRef.current = 0;
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      recordSecsRef.current += 1;
      const next = recordSecsRef.current;
      setRecordSecs(next);
      if (next >= BEST_PART_MAX_VIDEO_SECONDS) {
        void stopRecording();
      }
    }, 1000);
    try {
      const clip = await cameraRef.current.recordAsync({
        maxDuration: BEST_PART_MAX_VIDEO_SECONDS,
      });
      clearRecordTimer();
      setRecording(false);
      if (!clip?.uri) throw new Error('No video returned.');
      setLocalUri(clip.uri);
      setSecondaryUri(null);
      setDualFrontIsPrimary(false);
      setMediaType('video');
      setDurationSeconds(
        Math.min(BEST_PART_MAX_VIDEO_SECONDS, Math.max(1, recordSecsRef.current || 1))
      );
      setStage('compose');
    } catch (err) {
      clearRecordTimer();
      setRecording(false);
      showError('Could not record', err);
    }
  };

  const startDualRecording = async () => {
    const controller = dualControllerRef.current;
    if (!controller?.supported || !controller.isReady || recording) return;
    const micOk = await ensureMic();
    if (!micOk) {
      showInfo('Microphone needed', 'Allow microphone access to record video.');
      return;
    }
    setRecording(true);
    setRecordSecs(0);
    recordSecsRef.current = 0;
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      recordSecsRef.current += 1;
      setRecordSecs(recordSecsRef.current);
    }, 1000);
    try {
      await controller.start();
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

  const onPost = async () => {
    if (!user?.uid || !localUri || posting) return;
    const trimmed = caption.trim();
    if (!trimmed) {
      showInfo('Caption needed', 'Add a short caption.');
      return;
    }
    setPosting(true);
    setProgress(0);
    try {
      const dateKey = nyDateKey();
      const primary = await uploadBestPartMedia({
        uid: user.uid,
        dateKey,
        localUri,
        mediaType,
        onProgress: (pct) => setProgress(secondaryUri ? Math.round(pct * 0.55) : pct),
      });
      let secondary:
        | { url: string; storagePath: string }
        | undefined;
      if (mediaType === 'video' && secondaryUri) {
        secondary = await uploadBestPartMedia({
          uid: user.uid,
          dateKey,
          localUri: secondaryUri,
          mediaType: 'video',
          onProgress: (pct) => setProgress(55 + Math.round(pct * 0.45)),
        });
      }
      await commitBestPartPost({
        uid: user.uid,
        username: user.username,
        caption: trimmed,
        mediaType,
        url: primary.url,
        storagePath: primary.storagePath,
        secondaryUrl: secondary?.url,
        secondaryStoragePath: secondary?.storagePath,
        dualFrontIsPrimary: secondary ? dualFrontIsPrimary : undefined,
        isPrivate,
        durationSeconds: mediaType === 'video' ? durationSeconds : undefined,
        dateKey,
      });
      showInfo('Posted', isPrivate ? 'Saved privately.' : 'Shared.');
      navigation.goBack();
    } catch (err) {
      showError('Could not post', err);
    } finally {
      setPosting(false);
    }
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
    return (
      <KeyboardAvoidingView
        style={styles.compose}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.composeTop}>
          <Pressable style={styles.composeSideLeft} onPress={onRetake} disabled={posting} hitSlop={8}>
            <Text style={{ color: colors.green, fontWeight: '800' }}>Retake</Text>
          </Pressable>
          <Text style={styles.composeTitle}>New Post</Text>
          <Pressable style={styles.composeSideRight} onPress={close} disabled={posting} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.preview}>
          {mediaType === 'photo' ? (
            <Image source={{ uri: localUri }} style={styles.previewMedia} resizeMode="cover" />
          ) : (
            <Video
              source={{ uri: localUri }}
              style={styles.previewMedia}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              useNativeControls={false}
            />
          )}
          {secondaryUri ? (
            <View style={styles.previewPip}>
              <Video
                source={{ uri: secondaryUri }}
                style={StyleSheet.absoluteFill}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping
                isMuted
                useNativeControls={false}
              />
            </View>
          ) : null}
        </View>

        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={(t) => setCaption(t.slice(0, BEST_PART_MAX_CAPTION))}
          placeholder="Caption"
          placeholderTextColor={colors.muted2}
          multiline
          maxLength={BEST_PART_MAX_CAPTION}
          editable={!posting}
        />

        <View style={styles.privateRow}>
          <Text style={styles.privateLabel}>Keep it private</Text>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            disabled={posting}
            trackColor={{ false: colors.border, true: colors.moss }}
            thumbColor="#fff"
          />
        </View>

        <Pressable
          style={[styles.postBtn, posting && styles.postBtnDisabled]}
          onPress={() => void onPost()}
          disabled={posting}
        >
          {posting ? (
            <Text style={styles.postText}>Posting… {progress}%</Text>
          ) : (
            <Text style={styles.postText}>{isPrivate ? 'Save' : 'Post'}</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      {dualMode ? (
        <DualCameraRecorder
          active
          maxDurationSec={BEST_PART_MAX_VIDEO_SECONDS}
          controllerRef={dualControllerRef}
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
          onError={(err) => {
            clearRecordTimer();
            setRecording(false);
            showError('Camera error', err);
          }}
        />
      ) : (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            key={`${mode}-${facing}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={mode === 'photo' ? 'picture' : 'video'}
            mirror={facing === 'front'}
            onCameraReady={() => setReady(true)}
            onMountError={({ message }) => showError('Camera error', message)}
          />
          <Pressable
            style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
            onPress={onPreviewTap}
            accessibilityLabel="Double tap to flip camera"
          />
        </View>
      )}

      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!dualMode && !recording ? (
            <Pressable style={styles.iconBtn} onPress={flipFacing} accessibilityLabel="Flip camera">
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </Pressable>
          ) : null}
          {mode === 'video' && !recording ? (
            <Pressable
              style={[styles.iconBtn, dualMode && styles.iconBtnActive]}
              onPress={() => {
                setCameraLayout((m) => (m === 'single' ? 'dual' : 'single'));
                setReady(false);
              }}
              accessibilityLabel={dualMode ? 'Single camera' : 'Dual camera'}
            >
              <Ionicons name={dualMode ? 'copy' : 'copy-outline'} size={20} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {recording ? (
        <Text style={styles.recordTimer}>0:{String(recordSecs).padStart(2, '0')}</Text>
      ) : null}

      {!recording ? (
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, mode === 'photo' && styles.modeChipOn]}
            onPress={() => {
              setReady(false);
              setCameraLayout('single');
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
          style={styles.shutterOuter}
          onPress={onShutter}
          disabled={dualMode ? false : !ready}
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
  );
}
