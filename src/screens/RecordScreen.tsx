import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

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

async function setAudioSessionForRecording() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

async function setAudioSessionForPlayback() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: false,
  });
}

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
  const isFocused = useIsFocused();
  const { preferences } = useSettingsPreferences();
  const { markPostedToday } = useAppState();
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const playerFacing = getPlayerFacingChallenge(challenge, window);
  const maxSec = challenge.maxDurationSeconds;
  const postedToday = useHasPostedToday(user?.uid, window.dateKey);
  const attemptsRemaining = useAttemptsRemaining(user?.uid, window.dateKey, challenge.maxRecordingAttempts);

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const attemptsLeft = attemptsRemaining;
  const [isRecording, setIsRecording] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [clipUri, setClipUri] = React.useState<string | null>(null);
  const [clipSource, setClipSource] = React.useState<'recorded' | 'demo' | null>(null);
  const [cameraFacing, setCameraFacing] = React.useState<'front' | 'back'>('front');
  const [uploading, setUploading] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  const cameraReadyRef = React.useRef(false);
  const cameraRef = React.useRef<CameraView>(null);
  const countdownAbortRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const recordingWatchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const cameraPermissionPending = permission == null;
  const canUseCamera = permission?.granted === true;

  const clearPreview = React.useCallback(() => {
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
    setCameraFacing('front');
    cameraReadyRef.current = false;
  }, []);

  React.useEffect(() => {
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
    setIsRecording(false);
    setCameraFacing('front');
    cameraReadyRef.current = false;
  }, [challenge.dateKey, challenge.maxDurationSeconds]);

  React.useEffect(() => {
    if (!postedToday) return;
    setClipUri(null);
    setClipSource(null);
    setCountdown(null);
    setIsRecording(false);
    cameraReadyRef.current = false;
  }, [postedToday]);

  useFocusEffect(
    React.useCallback(() => {
      void setAudioSessionForRecording().catch(() => {});

      if (permission?.status === 'undetermined') {
        void requestPermission();
      }

      const markReadyAfterResume = () => {
        void cameraRef.current?.resumePreview?.().then(() => {
          cameraReadyRef.current = true;
        }).catch(() => {});
      };

      const task = InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          markReadyAfterResume();
        });
      });

      return () => {
        task.cancel?.();
        countdownAbortRef.current = true;
        setCountdown(null);
        if (recordingWatchdogRef.current) {
          clearTimeout(recordingWatchdogRef.current);
          recordingWatchdogRef.current = null;
        }
        if (isRecordingRef.current) {
          try {
            cameraRef.current?.stopRecording();
          } catch {
            /* noop */
          }
          // Do not pause preview while a recording is stopping — expo-camera ends `recordAsync` when
          // preview is paused, which truncates the file. Pause after native stop settles.
          setTimeout(() => {
            cameraReadyRef.current = false;
            void cameraRef.current?.pausePreview?.().catch(() => {});
          }, 500);
        } else {
          cameraReadyRef.current = false;
          void cameraRef.current?.pausePreview?.().catch(() => {});
        }
        void setAudioSessionForPlayback().catch(() => {});
      };
    }, [permission?.status, requestPermission])
  );

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (!isFocused || postedToday || clipUri || !canUseCamera) return;
      requestAnimationFrame(() => {
        void cameraRef.current
          ?.resumePreview?.()
          .then(() => {
            cameraReadyRef.current = true;
          })
          .catch(() => {});
      });
    });
    return () => sub.remove();
  }, [isFocused, postedToday, clipUri, canUseCamera]);

  const saveClipToCameraRoll = React.useCallback(async () => {
    if (!clipUri || clipUri.startsWith('demo://')) return;
    if (clipSource !== 'recorded') return;
    try {
      const p = await MediaLibrary.requestPermissionsAsync();
      if (!p.granted) {
        showInfo('Camera roll', 'Permission was not granted.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(clipUri);
      showInfo('Saved', 'Saved to camera roll.');
    } catch (e) {
      showError('Could not save', e);
    }
  }, [clipUri, clipSource]);

  const startCountdownThenRecord = async () => {
    countdownAbortRef.current = false;
    setClipUri(null);
    setClipSource(null);
    setCountdown(3);
    for (let t = 3; t >= 1; t--) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 800));
      if (countdownAbortRef.current) {
        setCountdown(null);
        return;
      }
      setCountdown(t - 1);
    }
    if (countdownAbortRef.current) {
      setCountdown(null);
      return;
    }
    setCountdown(null);

    try {
      await setAudioSessionForRecording().catch(() => {});

      if (!cameraRef.current) {
        showError('Camera not ready', new Error('Try again in a moment.'));
        return;
      }

      // Preview must be running before recordAsync; pausing/stopping preview ends recording (expo-camera).
      await cameraRef.current.resumePreview?.().catch(() => {});

      let waited = 0;
      while (!cameraReadyRef.current && waited < 8000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
        waited += 120;
        if (countdownAbortRef.current) return;
      }
      if (!cameraReadyRef.current) {
        showError('Camera not ready', new Error('Wait for the preview, then try again.'));
        return;
      }

      setIsRecording(true);

      const durationSec = Math.max(1, maxSec);
      const recordingOptions = { maxDuration: durationSec };

      // If native maxDuration never fires, still stop so the user can post (matches challenge length).
      recordingWatchdogRef.current = setTimeout(() => {
        recordingWatchdogRef.current = null;
        if (!isRecordingRef.current) return;
        try {
          (cameraRef.current as { stopRecording?: () => void })?.stopRecording?.();
        } catch {
          /* noop */
        }
      }, durationSec * 1000 + 750);

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
      if (recordingWatchdogRef.current) {
        clearTimeout(recordingWatchdogRef.current);
        recordingWatchdogRef.current = null;
      }
      setIsRecording(false);
      void setAudioSessionForPlayback().catch(() => {});
    }
  };

  const onFlipCamera = React.useCallback(() => {
    if (postedToday || !playerFacing.canRecord || isRecording || countdown != null || !canUseCamera) return;
    cameraReadyRef.current = false;
    InteractionManager.runAfterInteractions(() => {
      setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
      requestAnimationFrame(() => {
        void cameraRef.current?.resumePreview?.().catch(() => {});
      });
    });
  }, [postedToday, playerFacing.canRecord, isRecording, countdown, canUseCamera]);

  const onTapRecord = async () => {
    if (postedToday) return;
    if (!playerFacing.canRecord) {
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
      const mic = await requestMicPermission();
      if (!mic.granted) {
        showError(
          'Microphone needed',
          new Error('Allow the microphone to record video with sound, or change this in Settings.')
        );
        return;
      }
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
    if (!playerFacing.canRecord) {
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
        nav.navigate('Tabs' as never, { screen: 'Feed' } as never);
        return;
      }

      const blob = await clipUriToBlob(clipUri);
      const ext = 'mp4';
      const contentType = 'video/mp4';
      const path = `videos/${user.uid}/${window.dateKey}/${Date.now()}.${ext}`;
      const rref = ref(storage(), path);
      setUploadPct(0);
      const task = uploadBytesResumable(rref, blob, { contentType });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => {
            const total = snapshot.totalBytes;
            if (total > 0) {
              setUploadPct(Math.min(99, Math.round((100 * snapshot.bytesTransferred) / total)));
            }
          },
          (err) => reject(err),
          () => resolve()
        );
      });
      setUploadPct(100);
      const downloadUrl = await getDownloadURL(task.snapshot.ref);

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

      // Successful post: optionally save a recorded clip.
      if (clipSource === 'recorded') {
        if (preferences.autoSavePosts) {
          await saveClipToCameraRoll();
        } else {
          Alert.alert('Save to camera roll?', 'Save this post to your camera roll?', [
            { text: 'Save', onPress: () => void saveClipToCameraRoll() },
            { text: 'Not now', style: 'cancel' },
          ]);
        }
      }

      markPostedToday();
      setClipUri(null);
      setClipSource(null);
      nav.navigate('Tabs' as never, { screen: 'Feed' } as never);
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
      setUploadPct(0);
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
        <TouchableOpacity
          onPress={() => {
            if (nav.canGoBack()) nav.goBack();
            else nav.navigate('Tabs' as never, { screen: 'Today' } as never);
          }}
          style={styles.topBtn}
        >
          <Text style={styles.topBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.promptPill}>
          <Text style={styles.promptText} numberOfLines={2}>
            {playerFacing.title}
          </Text>
        </View>
        <TouchableOpacity onPress={clearPreview} style={styles.topBtn}>
          <Text style={styles.topBtnText}>↺</Text>
        </TouchableOpacity>
      </View>
      {!playerFacing.canRecord ? (
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
        ) : cameraPermissionPending ? (
          <View style={styles.cameraLoading}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.cameraLoadingText}>Opening camera…</Text>
          </View>
        ) : canUseCamera ? (
          <>
            <CameraView
              key={`camera-${challenge.dateKey}-${challenge.maxDurationSeconds}-${cameraFacing}`}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={cameraFacing}
              mirror={cameraFacing === 'front'}
              mode="video"
              onCameraReady={() => {
                cameraReadyRef.current = true;
                requestAnimationFrame(() => {
                  void cameraRef.current?.resumePreview?.().catch(() => {});
                });
              }}
              onMountError={({ message }) => {
                cameraReadyRef.current = false;
                showError('Camera error', new Error(message));
              }}
            />
            <View style={styles.overlayFade} pointerEvents="none" />
            {!isRecording && countdown == null && playerFacing.canRecord && !postedToday ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={cameraFacing === 'front' ? 'Use back camera' : 'Use front camera'}
                onPress={onFlipCamera}
                style={styles.flipFab}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-reverse-outline" size={26} color={colors.white} />
              </TouchableOpacity>
            ) : null}
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
          {playerFacing.canRecord
            ? attemptsLeft <= 1
              ? `${maxSec}S MAX • 1 TAKE`
              : `${maxSec}S MAX • ${attemptsLeft} ATTEMPTS LEFT`
            : playerFacing.instructionsLine}
        </Text>

        {clipUri ? (
          <>
            <View style={styles.doneCard}>
              <Text style={styles.doneTitle}>Recording complete</Text>
              <Text style={styles.doneBody}>
                {clipUri.startsWith('demo://')
                  ? 'Demo mode — post to continue, or record again.'
                  : 'Replay your take with the video controls, then post or record again.'}
              </Text>
            </View>
            <PrimaryButton
              title={uploading ? (uploadPct > 0 ? `POST ${uploadPct}%` : 'POSTING…') : 'POST'}
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
                (attemptsLeft <= 0 || uploading || countdown != null || !playerFacing.canRecord) &&
                  styles.recordBtnDisabled,
              ]}
            >
              <View
                style={[
                  styles.recordOuter,
                  (attemptsLeft <= 0 || uploading || countdown != null || !playerFacing.canRecord) &&
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
                {!playerFacing.canRecord
                  ? 'DROPS NOON ET'
                  : !permission?.granted
                    ? 'TAP TO ENABLE CAMERA'
                    : isRecording
                      ? 'TAP TO STOP'
                      : 'TAP TO RECORD'}
              </Text>
            </TouchableOpacity>
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
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cameraLoadingText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '700',
  },
  overlayFade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  flipFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    zIndex: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
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

