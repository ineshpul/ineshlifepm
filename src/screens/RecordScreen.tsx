import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { launchImageLibraryAsync, MediaTypeOptions } from 'expo-image-picker';
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { RecordClipPreview } from '../components/RecordClipPreview';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAppState } from '../state/appState';
import { useAuth } from '../state/auth';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { firestore, isFirebaseConfigured, storage } from '../firebase/firebase';
import {
  commitPostedVideo,
  refundRecordingAttemptIfNoPostedVideo,
  syncAttemptLedgerAfterSuccessfulPost,
  useAttemptsRemaining,
} from '../state/postAttempts';
import { useHasPostedToday } from '../state/posting';
import { showError, showInfo } from '../utils/ui';
import { CHALLENGE_INSTRUCTIONS } from '../content/challengeCopy';
import { useSettingsPreferences } from '../state/settingsPreferences';
import * as MediaLibrary from 'expo-media-library';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';
import { getExpoExtra } from '../config/expoExtra';

async function clipUriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(
      `Could not read your clip (HTTP ${res.status}). Try recording again or pick another video.`
    );
  }
  const blob = await res.blob();
  if (!blob || blob.size < 64) {
    throw new Error('This video looks empty or unreadable. Try recording again or choose another clip.');
  }
  return blob;
}

export function RecordScreen() {
  const nav = useNavigation<any>();
  const { preferences } = useSettingsPreferences();
  const { markPostedToday } = useAppState();
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
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

  const clearPreview = React.useCallback(() => {
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
  }, []);

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
    if (!facing.canRecord) {
      showInfo(
        'Not yet',
        'Today’s leap drops at 12:00 PM Eastern. Come back after the prompt goes live.'
      );
      return;
    }
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
  };

  const onTapRecord = async () => {
    if (postedToday) return;
    if (!facing.canRecord) {
      showInfo(
        'Not yet',
        'Today’s leap drops at 12:00 PM Eastern. Come back after the prompt goes live.'
      );
      return;
    }
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
    if (!facing.canRecord) {
      showInfo('Not yet', 'Today’s leap is not live yet.');
      return;
    }

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

      const blob = await clipUriToBlob(clipUri);
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
        const requireMod = Boolean(getExpoExtra().requirePostModeration);
        await commitPostedVideo({
          payload: {
            uid: user.uid,
            username: String(user.username ?? 'user').trim() || 'user',
            challengeDate: window.dateKey,
            challengeTitle: challenge.title,
            challengeSubtitle: CHALLENGE_INSTRUCTIONS,
            prompt: challenge.title,
            maxDurationSeconds: maxSec,
            source: clipSource ?? 'unknown',
            url: downloadUrl,
            storagePath: path,
            moderationStatus: requireMod ? 'pending' : 'approved',
          },
        });
        try {
          await syncAttemptLedgerAfterSuccessfulPost({
            uid: user.uid,
            challengeDate: window.dateKey,
          });
        } catch {
          // Best-effort; video doc is the source of truth for “posted today”.
        }
        try {
          await updateDoc(doc(firestore(), 'users', user.uid), {
            challengesCompleted: increment(1),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Best-effort; video post already succeeded.
        }
        void recomputeVerticalScoreForUser(user.uid);
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
      if (user?.uid && isFirebaseConfigured()) {
        try {
          await refundRecordingAttemptIfNoPostedVideo({
            uid: user.uid,
            challengeDate: window.dateKey,
          });
        } catch {
          // ignore ledger cleanup failures
        }
      }
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
          <Text style={styles.promptText} numberOfLines={2}>
            {facing.title}
          </Text>
        </View>
        <TouchableOpacity onPress={clearPreview} style={styles.topBtn}>
          <Text style={styles.topBtnText}>↺</Text>
        </TouchableOpacity>
      </View>
      {!facing.canRecord ? (
        <View style={styles.frogStrip}>
          <LeapLoadingFrog active dark />
        </View>
      ) : null}
      {postedToday ? (
        <View style={styles.postedPill}>
          <Text style={styles.postedText}>POSTED TODAY</Text>
        </View>
      ) : null}

      <View style={styles.cameraWrap}>
        {clipUri && !clipUri.startsWith('demo://') ? (
          <RecordClipPreview key={clipUri} uri={clipUri} />
        ) : clipUri?.startsWith('demo://') ? (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo take ready</Text>
            <Text style={styles.demoBody}>
              No camera file — post to try the rest of the app, or tap ↺ to reset.
            </Text>
          </View>
        ) : canUseCamera ? (
          <>
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
            <View style={styles.overlayFade} />
          </>
        ) : (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Demo Mode</Text>
            <Text style={styles.demoBody}>
              Camera access denied. Using demo mode. You can still test the recording flow!
            </Text>
          </View>
        )}
        {countdown != null && countdown > 0 && !clipUri ? (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.meta}>
          {facing.canRecord
            ? attemptsLeft <= 1
              ? `${maxSec}S MAX • 1 TAKE`
              : `${maxSec}S MAX • ${attemptsLeft} ATTEMPTS LEFT`
            : facing.instructionsLine}
        </Text>

        {clipUri ? (
          <>
            <View style={styles.doneCard}>
              <Text style={styles.doneTitle}>
                {clipSource === 'library' ? 'Clip ready' : 'Recording complete'}
              </Text>
              <Text style={styles.doneBody}>
                {clipUri.startsWith('demo://')
                  ? 'Demo mode — post to continue, or record again.'
                  : 'Replay your take with the video controls, then post or record again.'}
              </Text>
            </View>
            <PrimaryButton
              title={uploading ? 'POSTING…' : 'POST'}
              variant="green"
              onPress={onPost}
              style={styles.postBtn}
              disabled={uploading}
            />
            <PrimaryButton
              title="RECORD AGAIN"
              variant="outline"
              onPress={clearPreview}
              disabled={uploading || postedToday}
              style={styles.attachBtn}
            />
          </>
        ) : (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onTapRecord}
              style={[
                styles.recordBtn,
                (attemptsLeft <= 0 || uploading || countdown != null || !facing.canRecord) &&
                  styles.recordBtnDisabled,
              ]}
            >
              <View
                style={[
                  styles.recordOuter,
                  (attemptsLeft <= 0 || uploading || countdown != null || !facing.canRecord) &&
                    styles.recordOuterDisabled,
                ]}
              >
                <View
                  style={[
                    styles.recordInner,
                    isRecording ? styles.recordInnerRecording : styles.recordInnerIdle,
                  ]}
                />
              </View>
              <Text style={styles.recordHint}>
                {!facing.canRecord
                  ? 'DROPS NOON ET'
                  : !permission?.granted
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
              disabled={attemptsLeft <= 0 || uploading || countdown != null || !facing.canRecord}
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
  frogStrip: {
    marginTop: 8,
    marginHorizontal: 16,
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
  postedPill: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postedText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
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
  recordOuterDisabled: {
    borderColor: 'rgba(255,255,255,0.25)',
  },
  recordInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  recordInnerIdle: {
    backgroundColor: '#FB4B4B',
  },
  recordInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F97316',
  },
  doneCard: {
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    marginBottom: 4,
  },
  doneTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  doneBody: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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

