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
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export function BestPartCaptureScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const cameraRef = React.useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [stage, setStage] = React.useState<Stage>('capture');
  const [mode, setMode] = React.useState<CaptureMode>('photo');
  const [facing, setFacing] = React.useState<CameraType>('back');
  const [ready, setReady] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecsRef = React.useRef(0);

  const [localUri, setLocalUri] = React.useState<string | null>(null);
  const [mediaType, setMediaType] = React.useState<CaptureMode>('photo');
  const [durationSeconds, setDurationSeconds] = React.useState<number | undefined>();
  const [caption, setCaption] = React.useState('');
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

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
    modeRow: {
      position: 'absolute' as const,
      bottom: insets.bottom + 110,
      left: 0,
      right: 0,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 18,
      zIndex: 4,
    },
    modeChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    modeChipOn: { backgroundColor: c.green },
    modeText: { color: '#fff', fontWeight: '800' as const, fontSize: 13, letterSpacing: 0.8 },
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
    shutterRecording: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: c.coral,
    },
    prompt: {
      position: 'absolute' as const,
      top: insets.top + 64,
      left: 24,
      right: 24,
      zIndex: 4,
      alignItems: 'center' as const,
    },
    promptText: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '800' as const,
      textAlign: 'center' as const,
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowRadius: 8,
    },
    subPrompt: {
      marginTop: 6,
      color: 'rgba(255,255,255,0.8)',
      fontSize: 13,
      fontWeight: '600' as const,
      textAlign: 'center' as const,
    },
    recordTimer: {
      marginTop: 10,
      color: c.coral,
      fontWeight: '800' as const,
      fontSize: 16,
    },
    compose: {
      flex: 1,
      backgroundColor: c.bg,
      paddingTop: insets.top + 8,
      paddingHorizontal: 18,
      paddingBottom: insets.bottom + 16,
    },
    composeTop: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 12,
    },
    composeTitle: { fontSize: 18, fontWeight: '800' as const, color: c.text },
    preview: {
      width: '100%' as const,
      aspectRatio: 4 / 5,
      borderRadius: 22,
      overflow: 'hidden' as const,
      backgroundColor: '#111',
      marginBottom: 14,
    },
    previewMedia: { width: '100%' as const, height: '100%' as const },
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
    privateHint: { fontSize: 12, color: c.muted2, marginTop: 2, maxWidth: 240 },
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
    permText: { fontSize: 16, color: c.text, textAlign: 'center' as const, fontWeight: '600' as const },
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

  const close = () => {
    if (posting) return;
    navigation.goBack();
  };

  const onRetake = () => {
    if (posting) return;
    setLocalUri(null);
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
      setMediaType('photo');
      setDurationSeconds(undefined);
      setStage('compose');
    } catch (err) {
      showError('Could not take photo', err);
    }
  };

  const stopRecording = async () => {
    try {
      await cameraRef.current?.stopRecording();
    } catch {
      // stop can race with auto-stop
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || !ready || recording) return;
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

  const onShutter = () => {
    if (mode === 'photo') {
      void takePhoto();
      return;
    }
    if (recording) {
      void stopRecording();
      return;
    }
    void startRecording();
  };

  const onPost = async () => {
    if (!user?.uid || !localUri || posting) return;
    const trimmed = caption.trim();
    if (!trimmed) {
      showInfo('Caption needed', 'Add a short caption for your moment.');
      return;
    }
    setPosting(true);
    setProgress(0);
    try {
      const uploaded = await uploadBestPartMedia({
        uid: user.uid,
        dateKey: nyDateKey(),
        localUri,
        mediaType,
        onProgress: setProgress,
      });
      await commitBestPartPost({
        uid: user.uid,
        username: user.username,
        caption: trimmed,
        mediaType,
        url: uploaded.url,
        storagePath: uploaded.storagePath,
        isPrivate,
        durationSeconds: mediaType === 'video' ? durationSeconds : undefined,
      });
      showInfo('Posted', isPrivate ? 'Saved privately to Mine.' : 'Shared with the community.');
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
        <Text style={styles.permText}>Leap needs camera access to capture today’s best moment live.</Text>
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
          <Pressable onPress={onRetake} disabled={posting} hitSlop={8}>
            <Text style={{ color: colors.green, fontWeight: '800' }}>Retake</Text>
          </Pressable>
          <Text style={styles.composeTitle}>Caption & share</Text>
          <Pressable onPress={close} disabled={posting} hitSlop={8}>
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
        </View>

        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={(t) => setCaption(t.slice(0, BEST_PART_MAX_CAPTION))}
          placeholder="What made this the best part?"
          placeholderTextColor={colors.muted2}
          multiline
          maxLength={BEST_PART_MAX_CAPTION}
          editable={!posting}
        />

        <View style={styles.privateRow}>
          <View>
            <Text style={styles.privateLabel}>Keep it private</Text>
            <Text style={styles.privateHint}>Only you see it in Mine. Off = Community.</Text>
          </View>
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
            <Text style={styles.postText}>{isPrivate ? 'Save privately' : 'Post'}</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
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

      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={close} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            setReady(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          accessibilityLabel="Flip camera"
        >
          <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.prompt} pointerEvents="none">
        <Text style={styles.promptText}>Post the best part of your day</Text>
        <Text style={styles.subPrompt}>Captured live in Leap. No uploads.</Text>
        {recording ? <Text style={styles.recordTimer}>0:{String(recordSecs).padStart(2, '0')}</Text> : null}
      </View>

      {!recording ? (
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, mode === 'photo' && styles.modeChipOn]}
            onPress={() => {
              setReady(false);
              setMode('photo');
            }}
          >
            <Text style={styles.modeText}>PHOTO</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, mode === 'video' && styles.modeChipOn]}
            onPress={() => {
              setReady(false);
              setMode('video');
            }}
          >
            <Text style={styles.modeText}>VIDEO</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.shutterWrap}>
        <Pressable
          style={styles.shutterOuter}
          onPress={onShutter}
          disabled={!ready}
          accessibilityLabel={mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
        >
          <View style={recording ? styles.shutterRecording : styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}
