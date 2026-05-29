import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { doc, getDoc, increment, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { DualCameraRecorder, type DualCameraController } from '../components/DualCameraRecorder';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { RecordClipPreview } from '../components/RecordClipPreview';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  SingleCameraRecorder,
  type SingleCameraController,
} from '../components/SingleCameraRecorder';
import { colors } from '../theme/colors';
import { useAppState } from '../state/appState';
import { useAuth } from '../state/auth';
import {
  getPlayerFacingChallenge,
  normalizeTaskDurationSeconds,
  useChallengeWindow,
  useTodayChallenge,
} from '../state/challenge';
import { firestore, isFirebaseConfigured, storage } from '../firebase/firebase';
import {
  ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES,
  commitPostedVideo,
  consumeRecordingAttempt,
  refundRecordingAttemptIfNoPostedVideo,
  resetAdminRecordingAttemptsForToday,
  syncAttemptLedgerAfterSuccessfulPost,
  useAttemptsRemaining,
} from '../state/postAttempts';
import { useHasPostedToday } from '../state/posting';
import { showError, showInfo } from '../utils/ui';
import { CHALLENGE_INSTRUCTIONS } from '../content/challengeCopy';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { BONUS_ATTEMPT_BASE_REDUCTION_INCHES } from '../lib/verticalScore';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';
import { getExpoExtra } from '../config/expoExtra';
import { purchaseRecordingAttemptWithScore } from '../services/recordingAttemptsPurchase';
import { computeFeedViewingFromNow } from '../utils/nyTime';
import { navigateToFeedTab } from '../navigation/navigationHelpers';
import { offerCameraRollSaveAfterPost } from '../state/pendingCameraRollSave';
import { saveVideoToCameraRoll } from '../services/saveVideoToCameraRoll';

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
 * Mic permission only before record. A separate Audio.Recording probe steals the iOS session
 * from CameraView and freezes the preview on TestFlight/production builds.
 */
async function ensureMicrophonePermissionForRecording(): Promise<boolean> {
  const audioPerm = await Audio.requestPermissionsAsync();
  return audioPerm.granted;
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
  const maxSec = normalizeTaskDurationSeconds(challenge.maxDurationSeconds);
  const postedToday = useHasPostedToday(user?.uid, viewingChallengeDateKey);
  const attemptsRemaining = useAttemptsRemaining(
    user?.uid,
    viewingChallengeDateKey,
    challenge.maxRecordingAttempts
  );

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const attemptsLeft = attemptsRemaining;
  const [bonusBasePending, setBonusBasePending] = React.useState(false);
  const [purchaseBusy, setPurchaseBusy] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  /** 3-2-1 shown on the camera preview before recordAsync starts. */
  const [preRecordCountdown, setPreRecordCountdown] = React.useState<number | null>(null);
  /** Seconds left while recording — shown in the bottom meta line (replaces "60S MAX"). */
  const [recordingSecondsLeft, setRecordingSecondsLeft] = React.useState<number | null>(null);
  const [clipUri, setClipUri] = React.useState<string | null>(null);
  const [clipSource, setClipSource] = React.useState<'recorded' | 'demo' | null>(null);
  /** PIP companion video captured at the same time as `clipUri` when dual mode is on. */
  const [secondaryClipUri, setSecondaryClipUri] = React.useState<string | null>(null);
  /** Current direction of the single-camera recorder; the dual recorder owns its own facing state. */
  const [cameraFacing, setCameraFacing] = React.useState<'front' | 'back'>('front');
  /** Both modes use vision-camera. Single is one device + persistent recorder; dual is multi-cam. */
  const [cameraMode, setCameraMode] = React.useState<'single' | 'dual'>('single');
  const dualControllerRef = React.useRef<DualCameraController | null>(null);
  const singleControllerRef = React.useRef<SingleCameraController | null>(null);
  const adminAttemptsResetRef = React.useRef(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  /** After bytes finish uploading, Firestore commit can take a while — show a distinct phase. */
  const [postSaving, setPostSaving] = React.useState(false);
  const recordingAbortRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const recordTapBusyRef = React.useRef(false);
  /** Bumped on blur/unmount so the active take is invalidated. */
  const recordingSessionRef = React.useRef(0);
  /** Fewer React commits while Firebase reports many tiny upload progress ticks. */
  const uploadProgressGateRef = React.useRef({ lastShown: -1, lastAt: 0 });

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const stopActiveRecording = React.useCallback(async () => {
    try {
      if (cameraMode === 'dual') {
        await dualControllerRef.current?.stop();
      } else {
        await singleControllerRef.current?.stop();
      }
    } catch {
      /* the recorder's onRecordingFinished will surface the file regardless */
    }
  }, [cameraMode]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.isAdmin || !user?.uid || !isFirebaseConfigured() || adminAttemptsResetRef.current) {
        return;
      }
      adminAttemptsResetRef.current = true;
      void resetAdminRecordingAttemptsForToday({
        uid: user.uid,
        challengeDate: viewingChallengeDateKey,
        dailyMaxAttempts: challenge.maxRecordingAttempts,
      }).catch((e) => {
        if (__DEV__) console.log('[Record] admin attempt reset failed:', e);
        adminAttemptsResetRef.current = false;
      });
    }, [user?.isAdmin, user?.uid, viewingChallengeDateKey, challenge.maxRecordingAttempts])
  );

  React.useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setBonusBasePending(false);
      return;
    }
    const ref = doc(firestore(), 'postAttempts', `${user.uid}_${viewingChallengeDateKey}`);
    return onSnapshot(ref, (snap) => {
      const reduction = Number(snap.data()?.leapBaseReductionInches ?? 0);
      setBonusBasePending(reduction >= BONUS_ATTEMPT_BASE_REDUCTION_INCHES);
    });
  }, [user?.uid, viewingChallengeDateKey]);

  const cameraPermissionPending = permission == null;
  const canUseCamera = permission?.granted === true;

  const clearPreview = React.useCallback(() => {
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
    setCameraFacing('front');
  }, []);

  const restorePreviewAfterRecording = React.useCallback(() => {
    // No-op for vision-camera — sessions stay live across takes. Kept as a hook
    // so the existing call sites read cleanly.
  }, []);

  React.useEffect(() => {
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
    setCameraFacing('front');
  }, [challenge.dateKey, challenge.maxDurationSeconds]);

  React.useEffect(() => {
    if (!postedToday) return;
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
  }, [postedToday]);

  React.useEffect(() => {
    if (permission?.status === 'undetermined') {
      void requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestPermission identity churn
  }, [permission?.status]);

  /** Screen focus only — do not tie to permission changes (that paused camera right after grant). */
  useFocusEffect(
    React.useCallback(() => {
      void setAudioSessionForRecording().catch(() => {});

      return () => {
        recordingAbortRef.current = true;
        recordingSessionRef.current += 1;
        setPreRecordCountdown(null);
        setRecordingSecondsLeft(null);
        void (async () => {
          if (isRecordingRef.current) {
            await stopActiveRecording();
          }
          void setAudioSessionForPlayback().catch(() => {});
        })();
      };
    }, [stopActiveRecording])
  );

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (_next: AppStateStatus) => {
      // vision-camera's session is driven by the `active` prop on the recorder
      // components, which we already wire through `cameraActive` / `dualActive`,
      // so foreground transitions don't need a manual resume here.
    });
    return () => sub.remove();
  }, [isFocused, postedToday, clipUri, canUseCamera]);

  const navigateAfterPost = React.useCallback(
    async (opts: { recordedForSave: boolean; clipUriForOffer: string | null }) => {
      const { recordedForSave, clipUriForOffer } = opts;
      if (
        recordedForSave &&
        !preferences.autoSavePosts &&
        clipUriForOffer &&
        !clipUriForOffer.startsWith('demo://')
      ) {
        await offerCameraRollSaveAfterPost(clipUriForOffer);
      }
      navigateToFeedTab(nav);
    },
    [nav, preferences.autoSavePosts]
  );

  const startDualRecordingSession = async () => {
    recordingAbortRef.current = false;
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);

    const controller = dualControllerRef.current;
    if (!controller) {
      showError('Camera not ready', new Error('Try again in a moment.'));
      return;
    }
    if (!controller.supported) {
      showError(
        'Dual camera unsupported',
        new Error("This device can't run the front and back cameras together.")
      );
      return;
    }

    let waited = 0;
    while (!controller.isReady && waited < 8000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
      waited += 120;
      if (recordingAbortRef.current) return;
    }
    if (!controller.isReady) {
      showError('Camera not ready', new Error('Wait for the preview, then try again.'));
      return;
    }

    for (let n = 3; n >= 1; n -= 1) {
      if (recordingAbortRef.current) {
        setPreRecordCountdown(null);
        return;
      }
      setPreRecordCountdown(n);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPreRecordCountdown(null);
    if (recordingAbortRef.current) return;

    if (controller.isRecording) {
      try {
        await controller.stop();
      } catch {
        /* stale native session */
      }
    }

    setRecordingSecondsLeft(maxSec);
    setIsRecording(true);
    isRecordingRef.current = true;
    try {
      await controller.start();
    } catch (e) {
      showError('Recording failed', e);
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
    }
  };

  const startRecordingSession = async () => {
    recordingAbortRef.current = false;
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);

    const controller = singleControllerRef.current;
    if (!controller) {
      showError('Camera not ready', new Error('Try again in a moment.'));
      return;
    }

    let waited = 0;
    while (!controller.isReady && waited < 8000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
      waited += 120;
      if (recordingAbortRef.current) return;
    }
    if (!controller.isReady) {
      showError('Camera not ready', new Error('Wait for the preview, then try again.'));
      return;
    }

    for (let n = 3; n >= 1; n -= 1) {
      if (recordingAbortRef.current) {
        setPreRecordCountdown(null);
        return;
      }
      setPreRecordCountdown(n);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPreRecordCountdown(null);
    if (recordingAbortRef.current) return;

    if (controller.isRecording) {
      try {
        await controller.stop();
      } catch {
        /* stale native session */
      }
    }

    setRecordingSecondsLeft(maxSec);
    setIsRecording(true);
    isRecordingRef.current = true;
    try {
      await controller.start();
    } catch (e) {
      showError('Recording failed', e);
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
    }
  };

  const handleSingleCapture = React.useCallback(
    (uri: string) => {
      const sessionId = recordingSessionRef.current + 1;
      recordingSessionRef.current = sessionId;
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
      setClipUri(uri);
      setClipSource('recorded');
      if (user?.uid && isFirebaseConfigured()) {
        void consumeRecordingAttempt({
          uid: user.uid,
          challengeDate: viewingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] single attempt consume failed:', e);
        });
      }
      void setAudioSessionForPlayback().catch(() => {});
    },
    [user?.uid, viewingChallengeDateKey]
  );

  const handleSingleError = React.useCallback((e: unknown) => {
    if (__DEV__) console.log('[Record] single camera error:', e);
    showError('Camera error', e);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordingSecondsLeft(null);
  }, []);

  // Flip works during recording — the SingleCameraRecorder's persistent recorder
  // continues writing across the input-device swap, so we just toggle facing.
  const onFlipCamera = React.useCallback(() => {
    if (postedToday || !playerFacing.canRecord || preRecordCountdown != null || !canUseCamera) {
      return;
    }
    setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
    singleControllerRef.current?.flip();
  }, [postedToday, playerFacing.canRecord, preRecordCountdown, canUseCamera]);

  const onTapRecord = async () => {
    // Stop must run even when `recordTapBusyRef` is true — it stays true for the
    // duration of the recording so taps would otherwise never reach `stop`.
    if (isRecordingRef.current) {
      void stopActiveRecording();
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
      const micOk = await ensureMicrophonePermissionForRecording();
      if (!micOk) {
        showError(
          'Microphone needed',
          new Error('Allow the microphone to record video with sound, or change this in Settings.')
        );
        restorePreviewAfterRecording();
        return;
      }

      await setAudioSessionForRecording().catch(() => {});
      if (cameraMode === 'dual') {
        await startDualRecordingSession();
      } else {
        await startRecordingSession();
      }
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
      setPostSaving(false);
      uploadProgressGateRef.current = { lastShown: -1, lastAt: 0 };
      try {
      // If Firebase isn't configured yet (or user isn't authenticated), still unlock the app
      // so you can test flows end-to-end.
      if (!isFirebaseConfigured() || !user || !clipUri || clipUri.startsWith('demo://')) {
        const clipUriForOffer =
          clipSource === 'recorded' && clipUri && !clipUri.startsWith('demo://') ? clipUri : null;
        markPostedToday();
        setClipUri(null);
        setClipSource(null);
        setSecondaryClipUri(null);
        await navigateAfterPost({
          recordedForSave: clipSource === 'recorded',
          clipUriForOffer,
        });
        return;
      }

      // Let the "POSTING…" frame paint before we read the whole file into memory.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const ext = 'mp4';
      const contentType = 'video/mp4';
      const UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
      const primaryPath = `videos/${user.uid}/${viewingChallengeDateKey}/${Date.now()}.${ext}`;
      const primaryRef = ref(storage(), primaryPath);
      const hasSecondary = Boolean(secondaryClipUri);
      // Reserve more of the bar for the (larger) primary file. The PIP file is
      // ~half the bitrate, so this roughly maps to clock time on Wi-Fi.
      const primaryShare = hasSecondary ? 70 : 100;
      const secondaryShare = 100 - primaryShare;
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

      const runResumableUpload = async (
        storageRef: typeof primaryRef,
        sourceUri: string,
        scaleStart: number,
        scaleSpan: number
      ): Promise<string> => {
        const blob = await clipUriToBlob(sourceUri);
        const task = uploadBytesResumable(storageRef, blob, { contentType });
        await new Promise<void>((resolve, reject) => {
          const uploadTimeout = setTimeout(() => {
            try {
              task.cancel();
            } catch {
              /* ignore */
            }
            reject(
              new Error(
                'Upload timed out. Stay on this screen on Wi‑Fi and try again, or use a shorter clip.'
              )
            );
          }, UPLOAD_TIMEOUT_MS);
          task.on(
            'state_changed',
            (snapshot) => {
              const total = snapshot.totalBytes;
              if (total > 0) {
                const localPct = (100 * snapshot.bytesTransferred) / total;
                reportUploadProgress(scaleStart + (localPct * scaleSpan) / 100);
              }
            },
            (err) => {
              clearTimeout(uploadTimeout);
              reject(err);
            },
            () => {
              clearTimeout(uploadTimeout);
              resolve();
            }
          );
        });
        return await getDownloadURL(task.snapshot.ref);
      };

      const downloadUrl = await runResumableUpload(primaryRef, clipUri, 0, primaryShare);

      let secondaryDownloadUrl: string | null = null;
      let secondaryRef: typeof primaryRef | null = null;
      let secondaryPath: string | null = null;
      if (hasSecondary && secondaryClipUri) {
        secondaryPath = `videos/${user.uid}/${viewingChallengeDateKey}/${Date.now()}_pip.${ext}`;
        secondaryRef = ref(storage(), secondaryPath);
        try {
          secondaryDownloadUrl = await runResumableUpload(
            secondaryRef,
            secondaryClipUri,
            primaryShare,
            secondaryShare
          );
        } catch (e) {
          // PIP upload failed. Roll back the primary so we don't strand a half-posted dual take.
          try {
            await deleteObject(primaryRef);
          } catch {
            /* ignore */
          }
          throw e;
        }
      }
      setUploadPct(100);
      setPostSaving(true);

      try {
        const requireMod = Boolean(getExpoExtra().requirePostModeration);
        let posterPhotoUrl = '';
        try {
          const userSnap = await getDoc(doc(firestore(), 'users', user.uid));
          posterPhotoUrl = String(userSnap.data()?.photoUrl ?? '').trim();
        } catch {
          // optional denormalized avatar on the leap doc
        }
        await commitPostedVideo({
          payload: {
            uid: user.uid,
            username: String(user.username ?? 'user').trim() || 'user',
            ...(posterPhotoUrl ? { photoUrl: posterPhotoUrl } : {}),
            challengeDate: viewingChallengeDateKey,
            challengeTitle: challenge.title,
            challengeSubtitle: CHALLENGE_INSTRUCTIONS,
            prompt: challenge.title,
            maxDurationSeconds: maxSec,
            source: clipSource ?? 'unknown',
            url: downloadUrl,
            storagePath: primaryPath,
            ...(secondaryDownloadUrl && secondaryPath
              ? { secondaryUrl: secondaryDownloadUrl, secondaryStoragePath: secondaryPath }
              : {}),
            moderationStatus: requireMod ? 'pending' : 'approved',
          },
        });
      } catch (e) {
        try {
          await deleteObject(primaryRef);
        } catch {
          // ignore cleanup failures
        }
        if (secondaryRef) {
          try {
            await deleteObject(secondaryRef);
          } catch {
            /* ignore */
          }
        }
        throw e;
      }

      const recordedForSave = clipSource === 'recorded';
      const autoSaveClip = preferences.autoSavePosts;
      const clipUriForOffer = recordedForSave ? clipUri : null;

      markPostedToday();
      setClipUri(null);
      setClipSource(null);
      setSecondaryClipUri(null);
      await navigateAfterPost({ recordedForSave, clipUriForOffer });

      void syncAttemptLedgerAfterSuccessfulPost({
        uid: user.uid,
        challengeDate: viewingChallengeDateKey,
      }).catch(() => {});
      void updateDoc(doc(firestore(), 'users', user.uid), {
        challengesCompleted: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      void recomputeVerticalScoreForUser(user.uid);

      if (recordedForSave && autoSaveClip && clipUriForOffer) {
        void saveVideoToCameraRoll(clipUriForOffer).catch(() => {});
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
      setPostSaving(false);
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

  const cameraActive = isFocused && canUseCamera && !clipUri && !postedToday;
  const dualActive =
    cameraMode === 'dual' && isFocused && canUseCamera && !clipUri && !postedToday;

  const handleDualCapture = React.useCallback(
    (clip: { primaryUri: string; secondaryUri: string }) => {
      const sessionId = recordingSessionRef.current + 1;
      recordingSessionRef.current = sessionId;
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
      setClipUri(clip.primaryUri);
      setSecondaryClipUri(clip.secondaryUri);
      setClipSource('recorded');
      if (user?.uid && isFirebaseConfigured()) {
        void consumeRecordingAttempt({
          uid: user.uid,
          challengeDate: viewingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] dual attempt consume failed:', e);
        });
      }
      void setAudioSessionForPlayback().catch(() => {});
    },
    [user?.uid, viewingChallengeDateKey]
  );

  const handleDualError = React.useCallback((e: unknown) => {
    if (__DEV__) console.log('[Record] dual camera error:', e);
    showError('Dual camera error', e);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordingSecondsLeft(null);
  }, []);

  const toggleCameraMode = React.useCallback(() => {
    if (isRecordingRef.current || preRecordCountdown != null || clipUri || postedToday) {
      return;
    }
    setCameraMode((m) => (m === 'single' ? 'dual' : 'single'));
  }, [preRecordCountdown, clipUri, postedToday]);

  const onPurchaseAttemptPress = React.useCallback(() => {
    if (!user?.uid || !isFirebaseConfigured()) return;
    Alert.alert(
      'Get another attempt?',
      `Costs ${ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES} in from your leap base when you post (5→0 in base, or 10→5 in for a first post). Engagement still adds on top.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock attempt',
          onPress: () => {
            setPurchaseBusy(true);
            void (async () => {
              try {
                await purchaseRecordingAttemptWithScore(viewingChallengeDateKey);
                setBonusBasePending(true);
                showInfo('Attempt added', 'Your next posted leap will use the reduced base.');
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
  }, [user?.uid, viewingChallengeDateKey]);

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
          <RecordClipPreview key={clipUri} uri={clipUri} secondaryUri={secondaryClipUri} />
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
            {cameraMode === 'dual' ? (
              <DualCameraRecorder
                active={dualActive}
                maxDurationSec={maxSec}
                controllerRef={dualControllerRef}
                onRecordingTick={(left) => setRecordingSecondsLeft(left)}
                onCapture={handleDualCapture}
                onError={handleDualError}
              />
            ) : (
              <SingleCameraRecorder
                active={cameraActive}
                initialFacing={cameraFacing}
                maxDurationSec={maxSec}
                controllerRef={singleControllerRef}
                onRecordingTick={(left) => setRecordingSecondsLeft(left)}
                onCapture={handleSingleCapture}
                onError={handleSingleError}
              />
            )}
            {!postedToday &&
            !clipUri &&
            preRecordCountdown == null &&
            cameraMode === 'single' &&
            !isRecording ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  cameraFacing === 'front' ? 'Use back camera' : 'Use front camera'
                }
                onPress={onFlipCamera}
                // We hide the flip FAB during recording: vision-camera's
                // non-persistent movie file output corrupts the in-flight clip
                // if the input device changes. The user can stop, flip, and
                // start a new take — matching the original expo-camera UX.
                style={[styles.cornerFab, styles.cornerFabLeft]}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-reverse-outline" size={26} color={colors.white} />
              </TouchableOpacity>
            ) : null}
            {!postedToday && !clipUri && preRecordCountdown == null ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  cameraMode === 'dual' ? 'Switch to single camera' : 'Switch to dual camera'
                }
                onPress={toggleCameraMode}
                // Mode swap recreates the underlying session, so we keep it
                // disabled while a recording or countdown is in progress to
                // avoid yanking the camera out from under it.
                disabled={isRecording || preRecordCountdown != null}
                style={[
                  styles.cornerFab,
                  styles.cornerFabRight,
                  cameraMode === 'dual' && styles.cornerFabActive,
                  (isRecording || preRecordCountdown != null) && styles.cornerFabDisabled,
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={cameraMode === 'dual' ? 'copy' : 'copy-outline'}
                  size={24}
                  color={colors.white}
                />
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
        {preRecordCountdown != null && !clipUri ? (
          <View style={styles.recordTimerBar} pointerEvents="none">
            <Text style={styles.recordTimerText}>{preRecordCountdown}</Text>
          </View>
        ) : null}
      </View>

      {playerFacing.canRecord && !postedToday && attemptsLeft <= 0 && !clipUri ? (
        <View style={styles.outOfAttemptsCard}>
          <Text style={styles.outOfAttemptsTitle}>Out of attempts</Text>
          <Text style={styles.outOfAttemptsBody}>
            You have used all attempts for this leap. Spend 5in to leap again
          </Text>
          <Text style={styles.outOfAttemptsHint}>
            {bonusBasePending
              ? `Base reduction active (−${ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES} in from base on post).`
              : `Normal base 5→0 in · first-post base 10→5 in · engagement unchanged.`}
          </Text>
          <PrimaryButton
            title={
              purchaseBusy
                ? '…'
                : bonusBasePending
                  ? '+1 attempt unlocked'
                  : '+1 attempt (−5 in base)'
            }
            variant="outline"
            disabled={purchaseBusy || bonusBasePending}
            onPress={onPurchaseAttemptPress}
            style={styles.outOfAttemptsBtn}
          />
        </View>
      ) : null}

      <View style={styles.bottomBar}>
        <Text style={styles.meta}>
          {playerFacing.canRecord
            ? isRecording && recordingSecondsLeft != null
              ? attemptsLeft <= 0
                ? `${recordingSecondsLeft}S LEFT • OUT OF ATTEMPTS`
                : attemptsLeft === 1
                  ? `${recordingSecondsLeft}S LEFT • 1 ATTEMPT LEFT`
                  : `${recordingSecondsLeft}S LEFT • ${attemptsLeft} ATTEMPTS LEFT`
              : attemptsLeft <= 0
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
              title={
                postSaving
                  ? 'SAVING…'
                  : uploading
                    ? uploadPct > 0
                      ? `UPLOAD ${uploadPct}%`
                      : 'UPLOADING…'
                    : 'POST'
              }
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
                (attemptsLeft <= 0 ||
                  uploading ||
                  !playerFacing.canRecord ||
                  preRecordCountdown != null) &&
                  styles.recordBtnDisabled,
              ]}
            >
              <View
                style={[
                  styles.recordOuter,
                  (attemptsLeft <= 0 ||
                    uploading ||
                    !playerFacing.canRecord ||
                    preRecordCountdown != null) &&
                    styles.recordOuterDisabled,
                ]}
              >
                <View
                  style={[
                    styles.recordInner,
                    isRecording || preRecordCountdown != null
                      ? styles.recordInnerRecording
                      : styles.recordInnerIdle,
                  ]}
                />
              </View>
              <Text style={styles.recordHint}>
                {!playerFacing.canRecord
                  ? 'DROPS NOON ET'
                  : !permission?.granted
                    ? 'TAP TO ENABLE CAMERA'
                    : preRecordCountdown != null
                      ? 'GET READY…'
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
  cornerFabDisabled: {
    opacity: 0.45,
  },
  cornerFabActive: {
    backgroundColor: 'rgba(76,175,80,0.55)',
    borderColor: 'rgba(255,255,255,0.45)',
  },
  cornerFabLeft: {
    left: 14,
  },
  cornerFabRight: {
    right: 14,
  },
  cornerFab: {
    position: 'absolute',
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
  recordTimerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    zIndex: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordTimerText: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.white,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
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

