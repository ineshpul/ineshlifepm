import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { launchImageLibraryAsync, MediaTypeOptions } from 'expo-image-picker';
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAppState } from '../state/appState';
import { useAuth } from '../state/auth';
import { useTodayChallenge } from '../state/challenge';
import { firestore, isFirebaseConfigured, storage } from '../firebase/firebase';
import { commitPostedVideo, consumeRecordingAttempt, useAttemptsRemaining } from '../state/postAttempts';
import { useHasPostedToday } from '../state/posting';
import { showError } from '../utils/ui';
import { useSettingsPreferences } from '../state/settingsPreferences';
import * as MediaLibrary from 'expo-media-library';

export function RecordScreen() {
  const nav = useNavigation<any>();
  const { preferences } = useSettingsPreferences();
  const { markPostedToday } = useAppState();
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const maxSec = challenge.maxDurationSeconds;
  const postedToday = useHasPostedToday(user?.uid, window.dateKey);
  const attemptsRemaining = useAttemptsRemaining(user?.uid, window.dateKey);

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const attemptsLeft = attemptsRemaining;
  const [isRecording, setIsRecording] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [clipUri, setClipUri] = React.useState<string | null>(null);
  const [clipSource, setClipSource] = React.useState<'recorded' | 'library' | 'demo' | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const cameraReadyRef = React.useRef(false);
  const cameraRef = React.useRef<CameraView>(null);

  const canUseCamera = permission?.granted;

  React.useEffect(() => {
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
    setIsRecording(false);
    cameraReadyRef.current = false;
  }, [challenge.dateKey, challenge.maxDurationSeconds]);

  React.useEffect(() => {
    if (!postedToday) return;
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
    setIsRecording(false);
  }, [postedToday]);

  React.useEffect(() => {
    if (!clipUri || clipSource !== 'recorded' || !preferences.saveToCameraRoll) return;
    void (async () => {
      try {
        const p = await MediaLibrary.requestPermissionsAsync();
        if (!p.granted) return;
        await MediaLibrary.saveToLibraryAsync(clipUri);
      } catch {
        // ignore — device permission or format
      }
    })();
  }, [clipUri, clipSource, preferences.saveToCameraRoll]);

  const startCountdownThenRecord = async () => {
    setClipUri(null);
    setClipSource(null);
    setCountdown(3);
    for (let t = 3; t >= 1; t--) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 800));
      setCountdown(t - 1);
    }
    setCountdown(null);

    setIsRecording(true);
    try {
      if (!cameraRef.current) {
        showError('Camera not ready', new Error('Try again in a moment.'));
        return;
      }
      let waited = 0;
      while (!cameraReadyRef.current && waited < 6000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
        waited += 120;
      }
      if (!cameraReadyRef.current) {
        showError('Camera not ready', new Error('Wait for the preview, then try again.'));
        return;
      }

      const recordingOptions =
        Platform.OS === 'ios'
          ? { maxDuration: maxSec, codec: 'avc1' as const }
          : { maxDuration: maxSec };

      const result = await cameraRef.current.recordAsync(recordingOptions);
      const fileUri = result?.uri ?? null;
      setClipUri(fileUri);
      if (fileUri) {
        setClipSource('recorded');
        if (user?.uid && isFirebaseConfigured()) {
          try {
            await consumeRecordingAttempt({ uid: user.uid, challengeDate: window.dateKey });
          } catch (e) {
            showError('Could not sync your take', e);
          }
        }
      } else {
        showError(
          'Recording failed',
          new Error('No video file was returned. Is the camera in video mode?')
        );
      }
    } catch (e) {
      showError('Recording failed', e);
    } finally {
      setIsRecording(false);
    }
  };

  const onAttachVideo = async () => {
    if (postedToday) return;
    if (attemptsLeft <= 0 || uploading || isRecording || countdown != null) return;
    const picked = await launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Videos,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (picked.canceled) return;
    const asset = picked.assets?.[0];
    if (!asset?.uri) return;
    const pickedDur = asset.duration;
    if (typeof pickedDur === 'number' && pickedDur > maxSec + 0.25) {
      showError(
        'Video too long',
        new Error(`Choose a clip up to ${maxSec} seconds for today’s task.`)
      );
      return;
    }
    setClipUri(asset.uri);
    setClipSource('library');
    if (user?.uid && isFirebaseConfigured()) {
      try {
        await consumeRecordingAttempt({ uid: user.uid, challengeDate: window.dateKey });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('No attempts')) {
          showError('No attempts left', e);
          setClipUri(null);
          setClipSource(null);
        } else {
          showError('Could not sync your take', e);
        }
      }
    }
  };

  const onTapRecord = async () => {
    if (postedToday) return;
    if (attemptsLeft <= 0 || uploading) return;
    if (!permission) return;
    if (!permission.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setClipUri('demo://clip');
        setClipSource('demo');
        return;
      }
    }
    if (!micPermission?.granted) {
      await requestMicPermission();
    }
    if (isRecording) {
      (cameraRef.current as any)?.stopRecording?.();
      return;
    }
    if (!canUseCamera) return;
    await startCountdownThenRecord();
  };

  const onPost = async () => {
    if (postedToday) return;
    if (uploading) return;

    const runUpload = async () => {
      setUploading(true);
      try {
      // If Firebase isn't configured yet (or user isn't authenticated), still unlock the app
      // so you can test flows end-to-end.
      if (!isFirebaseConfigured() || !user || !clipUri || clipUri.startsWith('demo://')) {
        markPostedToday();
        setClipUri(null);
        setClipSource(null);
        nav.navigate('Feed');
        return;
      }

      const blob = await fetch(clipUri).then((r) => r.blob());
      const ext =
        clipSource === 'library'
          ? clipUri.toLowerCase().endsWith('.mov')
            ? 'mov'
            : 'mp4'
          : 'mp4';
      const contentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
      const path = `videos/${user.uid}/${window.dateKey}/${Date.now()}.${ext}`;
      const rref = ref(storage(), path);
      await uploadBytes(rref, blob, { contentType });
      const downloadUrl = await getDownloadURL(rref);

      try {
        await commitPostedVideo({
          payload: {
            uid: user.uid,
            username: user.username,
            challengeDate: window.dateKey,
            challengeTitle: challenge.title,
            challengeSubtitle: challenge.subtitle,
            prompt: challenge.title,
            maxDurationSeconds: maxSec,
            source: clipSource ?? 'unknown',
            url: downloadUrl,
            storagePath: path,
            moderationStatus: 'approved',
          },
        });
        try {
          await updateDoc(doc(firestore(), 'users', user.uid), {
            challengesCompleted: increment(1),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Best-effort; video post already succeeded.
        }
      } catch (e) {
        try {
          await deleteObject(rref);
        } catch {
          // ignore cleanup failures
        }
        throw e;
      }

      markPostedToday();
      setClipUri(null);
      setClipSource(null);
      nav.navigate('Feed');
    } catch (e) {
      showError('Post failed', e);
    } finally {
      setUploading(false);
    }
    };

    if (!preferences.uploadOnCellular) {
      Alert.alert(
        'Upload',
        'Cellular uploads are turned off in Settings. Upload this video anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload', onPress: () => void runUpload() },
        ]
      );
      return;
    }

    await runUpload();
  };

  return (
    <Screen withSafeArea={false} style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.navigate('Today')} style={styles.topBtn}>
          <Text style={styles.topBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.promptPill}>
          <Text style={styles.promptText} numberOfLines={1}>
            {challenge.title}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setClipUri(null);
            setClipSource(null);
            setCountdown(null);
          }}
          style={styles.topBtn}
        >
          <Text style={styles.topBtnText}>↺</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraWrap}>
        {canUseCamera ? (
          <CameraView
            key={`camera-${challenge.dateKey}-${challenge.maxDurationSeconds}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            mode="video"
            onCameraReady={() => {
              cameraReadyRef.current = true;
            }}
            onMountError={({ message }) => {
              cameraReadyRef.current = false;
              showError('Camera error', new Error(message));
            }}
          />
        ) : (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo Mode</Text>
            <Text style={styles.demoBody}>
              Camera access denied. Using demo mode. You can still test the recording flow!
            </Text>
          </View>
        )}
        <View style={styles.overlayFade} />
        {countdown != null && countdown > 0 && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.meta}>
          {attemptsLeft <= 1
            ? `${maxSec}S MAX • 1 TAKE`
            : `${maxSec}S MAX • ${attemptsLeft} ATTEMPTS LEFT`}
        </Text>

        {clipUri ? (
          <PrimaryButton
            title={uploading ? 'POSTING…' : 'POST'}
            variant="green"
            onPress={onPost}
            style={styles.postBtn}
            disabled={uploading}
          />
        ) : (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onTapRecord}
              style={[
                styles.recordBtn,
                (attemptsLeft <= 0 || uploading || countdown != null) && styles.recordBtnDisabled,
              ]}
            >
              <View style={styles.recordOuter}>
                <View style={[styles.recordInner, isRecording && styles.recordInnerRecording]} />
              </View>
              <Text style={styles.recordHint}>
                {!permission?.granted
                  ? 'TAP TO ENABLE CAMERA'
                  : isRecording
                    ? 'TAP TO STOP'
                    : 'TAP TO RECORD'}
              </Text>
            </TouchableOpacity>

            <PrimaryButton
              title="ATTACH VIDEO"
              variant="outline"
              onPress={onAttachVideo}
              disabled={attemptsLeft <= 0 || uploading || countdown != null}
              style={styles.attachBtn}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#0B1220',
  },
  topBar: {
    paddingTop: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBtnText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  promptPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  promptText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  cameraWrap: {
    flex: 1,
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  overlayFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  countdownText: {
    fontSize: 72,
    fontWeight: '900',
    color: colors.white,
  },
  demo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  demoTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  demoBody: {
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 10,
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  recordBtn: {
    alignItems: 'center',
    gap: 10,
  },
  recordBtnDisabled: {
    opacity: 0.55,
  },
  recordOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FB4B4B',
  },
  recordInnerRecording: {
    backgroundColor: '#F97316',
  },
  recordHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  postBtn: {
    width: 220,
    borderRadius: 30,
  },
  attachBtn: {
    width: 220,
    height: 44,
    borderRadius: 14,
  },
});

