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
import { doc, increment, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { RecordClipPreview } from '../components/RecordClipPreview';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAppState } from '../state/appState';
import { useAuth } from '../state/auth';
import { getPlayerFacingChallenge, useChallengeWindow, useTodayChallenge } from '../state/challenge';
import { firestore, isFirebaseConfigured, storage } from '../firebase/firebase';
import {
  ATTEMPT_PURCHASE_VERTICAL_COST,
  commitPostedVideo,
  consumeRecordingAttempt,
  refundRecordingAttemptIfNoPostedVideo,
  syncAttemptLedgerAfterSuccessfulPost,
  useAttemptsRemaining,
} from '../state/postAttempts';
import { useHasPostedToday } from '../state/posting';
import { showError, showInfo } from '../utils/ui';
import { CHALLENGE_INSTRUCTIONS } from '../content/challengeCopy';
import { useSettingsPreferences } from '../state/settingsPreferences';
import * as MediaLibrary from 'expo-media-library';
import * as Device from 'expo-device';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';
import { getExpoExtra } from '../config/expoExtra';
import { purchaseRecordingAttemptWithScore } from '../services/recordingAttemptsPurchase';
import { computeFeedViewingFromNow } from '../utils/nyTime';

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

/**
 * Quick mic pipeline check before camera video recording. Skipped on simulators (no reliable capture).
 * Returns true if a short capture succeeds; false if prepare/start/status indicates audio capture is not working.
 */
async function verifyMicrophoneCapturesAudioOk(): Promise<boolean> {
  if (!Device.isDevice) return true;

  let recording: InstanceType<typeof Audio.Recording> | undefined;
  try {
    await setAudioSessionForRecording();
    const audioPerm = await Audio.requestPermissionsAsync();
    if (!audioPerm.granted) return false;

    const created = await Audio.Recording.createAsync();
    recording = created.recording;

    await new Promise<void>((r) => setTimeout(r, 480));

    const mid = await recording.getStatusAsync();
    const capturing =
      mid.isRecording === true &&
      typeof mid.durationMillis === 'number' &&
      mid.durationMillis > 0;

    await recording.stopAndUnloadAsync();
    recording = undefined;

    await setAudioSessionForRecording().catch(() => {});
    /** Brief pause so iOS/Android release the audio session before `CameraView.recordAsync`. */
    await new Promise<void>((r) => setTimeout(r, 200));
    return capturing;
  } catch {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        /* noop */
      }
    }
    await setAudioSessionForRecording().catch(() => {});
    await new Promise<void>((r) => setTimeout(r, 200));
    return false;
  }
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
  useChallengeWindow();
  const { challenge, window } = useTodayChallenge();
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  const playerFacing = getPlayerFacingChallenge(challenge, window);
  const maxSec = challenge.maxDurationSeconds;
  const postedToday = useHasPostedToday(user?.uid, viewingChallengeDateKey);
  const attemptsRemaining = useAttemptsRemaining(
    user?.uid,
    viewingChallengeDateKey,
    challenge.maxRecordingAttempts
  );

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const attemptsLeft = attemptsRemaining;
  const [verticalScoreDisplay, setVerticalScoreDisplay] = React.useState(0);
  const [purchaseBusy, setPurchaseBusy] = React.useState(false);
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
  const recordTapBusyRef = React.useRef(false);
  /** Fewer React commits while Firebase reports many tiny upload progress ticks. */
  const uploadProgressGateRef = React.useRef({ lastShown: -1, lastAt: 0 });

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  React.useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setVerticalScoreDisplay(0);
      return;
    }
    const ref = doc(firestore(), 'users', user.uid);
    return onSnapshot(ref, (snap) => {
      setVerticalScoreDisplay(Math.round(Number(snap.data()?.verticalScore ?? 0)));
    });
  }, [user?.uid]);

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

  /**
   * Only depend on `permission?.status`, not `requestPermission` — the hook’s request function identity
   * can change across renders; re-running this cleanup while still on Record would call `stopRecording()`
   * mid-take and strand `recordAsync` (especially painful on the last attempt).
   */
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid deps on `requestPermission` identity churn (would stop mid-record)
    }, [permission?.status])
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
      isRecordingRef.current = true;

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
      }, durationSec * 1000 + 2800);

      const result = await cameraRef.current.recordAsync(recordingOptions);

      const fileUri = result?.uri ?? null;
      if (fileUri) {
        if (user?.uid && isFirebaseConfigured()) {
          try {
            await consumeRecordingAttempt({ uid: user.uid, challengeDate: viewingChallengeDateKey });
          } catch (e) {
            showError('No attempts remaining', e);
            return;
          }
        }
        setClipUri(fileUri);
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
      isRecordingRef.current = false;
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
    // Stop must run even while `recordTapBusyRef` is true — it stays true for the whole
    // `recordAsync()` await inside `startCountdownThenRecord`, otherwise taps never reach `stopRecording`.
    if (isRecordingRef.current) {
      (cameraRef.current as { stopRecording?: () => void })?.stopRecording?.();
      return;
    }
    if (recordTapBusyRef.current) return;
    if (postedToday) return;
    if (!playerFacing.canRecord) {
      showInfo(
        'Not yet',
        'Today’s leap drops at 12:00 PM Eastern. Come back after the prompt goes live.'
      );
      return;
    }
    if (attemptsLeft <= 0 || uploading) {
      if (attemptsLeft <= 0 && !uploading) {
        showInfo(
          'Out of attempts',
          'Spend Vertical Score for another try (below), or post your clip if you are done.'
        );
      }
      return;
    }
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
    if (!canUseCamera) return;

    recordTapBusyRef.current = true;
    try {
      const audioOk = await verifyMicrophoneCapturesAudioOk();
      if (!audioOk) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Microphone check',
            'We could not verify that your microphone is capturing audio. Your leap might be silent in the feed. Do you want to continue recording anyway?',
            [
              { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue anyway', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
        if (!proceed) return;
      }

      await setAudioSessionForRecording().catch(() => {});
      await new Promise<void>((r) => setTimeout(r, 200));
      await startCountdownThenRecord();
    } finally {
      recordTapBusyRef.current = false;
    }
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
      uploadProgressGateRef.current = { lastShown: -1, lastAt: 0 };
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

      // Let the "POSTING…" frame paint before we read the whole file into memory.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const blob = await clipUriToBlob(clipUri);
      const ext = 'mp4';
      const contentType = 'video/mp4';
      const path = `videos/${user.uid}/${viewingChallengeDateKey}/${Date.now()}.${ext}`;
      const rref = ref(storage(), path);
      setUploadPct(0);

      const reportUploadProgress = (rawPct: number) => {
        const pct = Math.min(99, Math.max(0, Math.round(rawPct)));
        if (pct >= 99) {
          setUploadPct(pct);
          uploadProgressGateRef.current = { lastShown: pct, lastAt: Date.now() };
          return;
        }
        const now = Date.now();
        const g = uploadProgressGateRef.current;
        if (pct - g.lastShown < 4 && now - g.lastAt < 280) return;
        g.lastShown = pct;
        g.lastAt = now;
        setUploadPct(pct);
      };

      const task = uploadBytesResumable(rref, blob, { contentType });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => {
            const total = snapshot.totalBytes;
            if (total > 0) {
              reportUploadProgress((100 * snapshot.bytesTransferred) / total);
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
            challengeDate: viewingChallengeDateKey,
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
      } catch (e) {
        try {
          await deleteObject(rref);
        } catch {
          // ignore cleanup failures
        }
        throw e;
      }

      const recordedForSave = clipSource === 'recorded';
      const autoSaveClip = preferences.autoSavePosts;

      markPostedToday();
      setClipUri(null);
      setClipSource(null);
      /** Next frame — faster than `runAfterInteractions`, which can wait behind unrelated animations. */
      requestAnimationFrame(() => {
        nav.navigate('Tabs' as never, { screen: 'Feed' } as never);
      });

      void syncAttemptLedgerAfterSuccessfulPost({
        uid: user.uid,
        challengeDate: viewingChallengeDateKey,
      }).catch(() => {});
      void updateDoc(doc(firestore(), 'users', user.uid), {
        challengesCompleted: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      void recomputeVerticalScoreForUser(user.uid);

      if (recordedForSave && autoSaveClip) {
        void saveClipToCameraRoll().catch(() => {});
      } else if (recordedForSave) {
        InteractionManager.runAfterInteractions(() =>
          requestAnimationFrame(() => {
            setTimeout(() => {
              Alert.alert('Save to camera roll?', 'Save this post to your camera roll?', [
                { text: 'Save', onPress: () => void saveClipToCameraRoll() },
                { text: 'Not now', style: 'cancel' },
              ]);
            }, 400);
          })
        );
      }
    } catch (e) {
      if (user?.uid && isFirebaseConfigured()) {
        try {
          await refundRecordingAttemptIfNoPostedVideo({
            uid: user.uid,
            challengeDate: viewingChallengeDateKey,
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

  const onPurchaseAttemptPress = React.useCallback(() => {
    if (!user?.uid || !isFirebaseConfigured()) return;
    if (verticalScoreDisplay < ATTEMPT_PURCHASE_VERTICAL_COST) {
      showInfo(
        'Not enough Vertical Score',
        `You need at least ${ATTEMPT_PURCHASE_VERTICAL_COST} Vertical Score to unlock another attempt.`
      );
      return;
    }
    Alert.alert(
      'Get another attempt?',
      `Spend ${ATTEMPT_PURCHASE_VERTICAL_COST} Vertical Score for one more recording try?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Spend ${ATTEMPT_PURCHASE_VERTICAL_COST}`,
          onPress: () => {
            setPurchaseBusy(true);
            void (async () => {
              try {
                await purchaseRecordingAttemptWithScore(viewingChallengeDateKey);
                showInfo('Attempt added', 'You can record again.');
              } catch (e) {
                showError('Could not unlock attempt', e);
              } finally {
                setPurchaseBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [user?.uid, verticalScoreDisplay, viewingChallengeDateKey]);

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

      {playerFacing.canRecord && !postedToday && attemptsLeft <= 0 && !clipUri ? (
        <View style={styles.outOfAttemptsCard}>
          <Text style={styles.outOfAttemptsTitle}>Out of attempts</Text>
          <Text style={styles.outOfAttemptsBody}>
            You have used every recording try for this leap. Spend Vertical Score to get one more take, or post if you
            are happy with your clip.
          </Text>
          <Text style={styles.outOfAttemptsScore}>Vertical Score: {verticalScoreDisplay}</Text>
          {verticalScoreDisplay < ATTEMPT_PURCHASE_VERTICAL_COST ? (
            <Text style={styles.outOfAttemptsHint}>
              Need at least {ATTEMPT_PURCHASE_VERTICAL_COST} Vertical Score to buy another attempt.
            </Text>
          ) : null}
          <PrimaryButton
            title={
              purchaseBusy
                ? '…'
                : `Spend ${ATTEMPT_PURCHASE_VERTICAL_COST} score · +1 attempt`
            }
            variant="outline"
            disabled={purchaseBusy || verticalScoreDisplay < ATTEMPT_PURCHASE_VERTICAL_COST}
            onPress={onPurchaseAttemptPress}
            style={styles.outOfAttemptsBtn}
          />
        </View>
      ) : null}

      <View style={styles.bottomBar}>
        <Text style={styles.meta}>
          {playerFacing.canRecord
            ? attemptsLeft <= 0
              ? `${maxSec}S MAX • OUT OF ATTEMPTS`
              : attemptsLeft === 1
                ? `${maxSec}S MAX • 1 ATTEMPT LEFT`
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
  outOfAttemptsCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  outOfAttemptsTitle: { color: colors.white, fontSize: 15, fontWeight: '900' },
  outOfAttemptsBody: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  outOfAttemptsScore: { marginTop: 10, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800' },
  outOfAttemptsHint: { marginTop: 8, color: 'rgba(251,191,36,0.95)', fontSize: 12, fontWeight: '700' },
  outOfAttemptsBtn: { marginTop: 12 },
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

