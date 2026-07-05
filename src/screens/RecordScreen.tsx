import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { DualCameraRecorder, type DualCameraController } from '../components/DualCameraRecorder';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { RecordClipPreview } from '../components/RecordClipPreview';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  SingleCameraRecorder,
  type SingleCameraController,
} from '../components/SingleCameraRecorder';
import { useAppState } from '../state/appState';
import { useAuth } from '../state/auth';
import {
  getChallengeWatermarkInfo,
  getPlayerFacingChallenge,
  normalizeTaskDurationSeconds,
  useChallengeWindow,
  useTodayChallenge,
} from '../state/challenge';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES,
  consumeRecordingAttempt,
  resetRecordingAttemptsAfterVideoDelete,
  useAttemptsRemaining,
} from '../state/postAttempts';
import { resetStaffLeapDayForTesting } from '../services/deleteVideo';
import { useHasPostedToday } from '../state/posting';
import { useBackgroundPostUpload } from '../state/backgroundPostUpload';
import { showError, showInfo } from '../utils/ui';
import { useSettingsPreferences } from '../state/settingsPreferences';
import {
  BONUS_ATTEMPT_BASE_REDUCTION_INCHES,
  LEAP_BASE_INCHES,
  LEAP_FIRST_BONUS_BASE_INCHES,
} from '../lib/verticalScore';
import { purchaseRecordingAttemptWithScore } from '../services/recordingAttemptsPurchase';
import { computeFeedViewingFromNow } from '../utils/nyTime';
import { navigateToFeedTab } from '../navigation/navigationHelpers';

function openCameraSettingsAlert() {
  Alert.alert(
    'Camera access needed',
    'Leap needs your camera to record daily leaps. Turn on Camera access in Settings.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]
  );
}

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

export function RecordScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
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
  permissionBtn: {
    width: 220,
    marginTop: 4,
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
}));
  const nav = useNavigation<any>();
  const isFocused = useIsFocused();
  const { preferences } = useSettingsPreferences();
  const { markPostedToday, clearPostedOverride } = useAppState();
  const { startBackgroundPost, isActive: backgroundUploadActive } = useBackgroundPostUpload();
  const { user } = useAuth();
  useChallengeWindow();
  const { challenge, window } = useTodayChallenge();
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  const recordingChallengeDateKey = viewingChallengeDateKey;
  const isStaffUser = Boolean(user?.isAdmin || user?.isModerator);
  const postedForRecordingDay = useHasPostedToday(user?.uid, recordingChallengeDateKey);
  const recordingBlocked = postedForRecordingDay && !isStaffUser;
  const maxSec = normalizeTaskDurationSeconds(challenge.maxDurationSeconds);
  const playerFacing = getPlayerFacingChallenge(challenge, window);
  const attemptsRemaining = useAttemptsRemaining(
    user?.uid,
    recordingChallengeDateKey,
    challenge.maxRecordingAttempts,
    isStaffUser
  );

  const [permission, requestPermission, getCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission, getMicPermission] = useMicrophonePermissions();
  const attemptsLeft = attemptsRemaining;
  const unlockBaseAfterReduction = LEAP_BASE_INCHES - ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES;
  const unlockFirstPostBaseAfterReduction =
    LEAP_FIRST_BONUS_BASE_INCHES - ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES;
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
  /** Whether the front camera was the big view when a dual take finished. */
  const [dualFrontIsPrimary, setDualFrontIsPrimary] = React.useState(false);
  /** Current direction of the single-camera recorder; the dual recorder owns its own facing state. */
  const [cameraFacing, setCameraFacing] = React.useState<'front' | 'back'>('front');
  /** Both modes use vision-camera. Single is one device + persistent recorder; dual is multi-cam. */
  const [cameraMode, setCameraMode] = React.useState<'single' | 'dual'>('single');
  const dualControllerRef = React.useRef<DualCameraController | null>(null);
  const singleControllerRef = React.useRef<SingleCameraController | null>(null);
  const staffLeapResetRef = React.useRef(false);
  const recordingAbortRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const recordTapBusyRef = React.useRef(false);
  /** Bumped on blur/unmount so the active take is invalidated. */
  const recordingSessionRef = React.useRef(0);
  const [cameraSessionKey, setCameraSessionKey] = React.useState(0);
  const prevRecordingBlockedRef = React.useRef(recordingBlocked);

  React.useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  React.useEffect(() => {
    if (prevRecordingBlockedRef.current && !recordingBlocked) {
      setCameraSessionKey((k) => k + 1);
    }
    prevRecordingBlockedRef.current = recordingBlocked;
  }, [recordingBlocked]);

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
      const isStaff = Boolean(user?.isAdmin || user?.isModerator);
      if (!isStaff || !user?.uid || !isFirebaseConfigured() || staffLeapResetRef.current) {
        return;
      }
      staffLeapResetRef.current = true;
      void resetStaffLeapDayForTesting({
        uid: user.uid,
        challengeDate: viewingChallengeDateKey,
      })
        .then(() => clearPostedOverride())
        .catch((e) => {
          if (__DEV__) console.log('[Record] staff leap reset failed:', e);
          staffLeapResetRef.current = false;
        });
    }, [
      user?.isAdmin,
      user?.isModerator,
      user?.uid,
      viewingChallengeDateKey,
      clearPostedOverride,
    ])
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid || !isFirebaseConfigured() || isStaffUser || postedForRecordingDay) {
        return;
      }
      if (attemptsRemaining > 0) return;
      void resetRecordingAttemptsAfterVideoDelete({
        uid: user.uid,
        challengeDate: recordingChallengeDateKey,
      }).catch((e) => {
        if (__DEV__) console.log('[Record] heal attempts after delete failed:', e);
      });
    }, [
      user?.uid,
      isStaffUser,
      postedForRecordingDay,
      attemptsRemaining,
      recordingChallengeDateKey,
    ])
  );

  React.useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setBonusBasePending(false);
      return;
    }
    const ref = doc(firestore(), 'postAttempts', `${user.uid}_${recordingChallengeDateKey}`);
    return onSnapshot(ref, (snap) => {
      const reduction = Number(snap.data()?.leapBaseReductionInches ?? 0);
      setBonusBasePending(reduction >= BONUS_ATTEMPT_BASE_REDUCTION_INCHES);
    });
  }, [user?.uid, recordingChallengeDateKey]);

  const cameraPermissionPending = permission == null;
  const canUseCamera = permission?.granted === true;
  const cameraDenied = permission?.status === 'denied';
  /** App Store review accounts may post without a real camera clip. */
  const allowReviewDemo = Boolean(user?.bypassFeedGate);

  const ensureCameraPermission = React.useCallback(async (): Promise<boolean> => {
    const current = permission?.granted ? permission : await getCameraPermission();
    if (current.granted) return true;
    if (current.status === 'denied') {
      openCameraSettingsAlert();
      return false;
    }
    const next = await requestPermission();
    if (next.granted) return true;
    if (next.status === 'denied') openCameraSettingsAlert();
    return false;
  }, [permission, getCameraPermission, requestPermission]);

  const promptRecordingPermissionsOnFocus = React.useCallback(async () => {
    const cam = permission?.granted ? permission : await getCameraPermission();
    if (!cam.granted) {
      if (cam.status === 'undetermined') {
        await requestPermission();
      }
      return;
    }
    const mic = micPermission?.granted ? micPermission : await getMicPermission();
    if (!mic.granted && mic.status === 'undetermined') {
      await requestMicPermission();
    }
  }, [
    permission,
    micPermission,
    getCameraPermission,
    getMicPermission,
    requestPermission,
    requestMicPermission,
  ]);

  const clearPreview = React.useCallback(() => {
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);
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
    setDualFrontIsPrimary(false);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
    setCameraFacing('front');
  }, [challenge.dateKey, challenge.maxDurationSeconds]);

  React.useEffect(() => {
    if (!recordingBlocked) return;
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
  }, [recordingBlocked]);

  useFocusEffect(
    React.useCallback(() => {
      recordingAbortRef.current = false;
      if (!recordingBlocked && !clipUri && playerFacing.canRecord) {
        void promptRecordingPermissionsOnFocus();
      }
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
    }, [
      recordingBlocked,
      clipUri,
      playerFacing.canRecord,
      promptRecordingPermissionsOnFocus,
      stopActiveRecording,
    ])
  );

  React.useEffect(() => {
    if (!isFocused || clipUri) return;
    // Single (expo-camera) and dual (vision-camera) capture both write audio through
    // an iOS `AVCaptureMovieFileOutput`, which needs a record-capable AVAudioSession
    // (`.playAndRecord`). Forcing a playback category here disabled the microphone
    // input and left dual clips silent, so keep the mic live for both modes.
    void setAudioSessionForRecording().catch(() => {});
  }, [isFocused, cameraMode, clipUri]);

  React.useEffect(() => {
    if (!isFocused) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      void getCameraPermission();
      void getMicPermission();
    });
    return () => sub.remove();
  }, [isFocused, getCameraPermission, getMicPermission]);

  const startDualRecordingSession = async () => {
    recordingAbortRef.current = false;
    setClipUri(null);
    setClipSource(null);
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);
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
    setDualFrontIsPrimary(false);
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
      if (user?.uid && isFirebaseConfigured() && !isStaffUser) {
        void consumeRecordingAttempt({
          uid: user.uid,
          challengeDate: recordingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] single attempt consume failed:', e);
        });
      }
      void setAudioSessionForPlayback().catch(() => {});
    },
    [user?.uid, recordingChallengeDateKey, isStaffUser]
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
    if (recordingBlocked || !playerFacing.canRecord || preRecordCountdown != null || !canUseCamera) {
      return;
    }
    setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
    singleControllerRef.current?.flip();
  }, [recordingBlocked, playerFacing.canRecord, preRecordCountdown, canUseCamera]);

  const onTapRecord = async () => {
    // Stop must run even when `recordTapBusyRef` is true — it stays true for the
    // duration of the recording so taps would otherwise never reach `stop`.
    if (isRecordingRef.current) {
      void stopActiveRecording();
      return;
    }
    if (recordTapBusyRef.current) return;
    if (recordingBlocked) return;
    if (!playerFacing.canRecord) {
      showInfo(
        'Not yet',
        'Today’s leap drops at 12:00 PM Eastern. Come back after the prompt goes live.'
      );
      return;
    }
    if (attemptsLeft <= 0 || backgroundUploadActive) {
      if (attemptsLeft <= 0 && !backgroundUploadActive) {
        showInfo(
          'Out of attempts',
          'Spend Vertical Score for another try (below), or post your clip if you are done.'
        );
      }
      return;
    }
    if (!permission) return;
    if (!permission.granted) {
      if (allowReviewDemo) {
        const next = await requestPermission();
        if (!next.granted) {
          setClipUri('demo://clip');
          setClipSource('demo');
        }
        return;
      }
      const granted = await ensureCameraPermission();
      if (!granted) return;
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
      if (cameraMode === 'single') {
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
        await startRecordingSession();
      } else {
        // Dual mode records audio via vision-camera's `AVCaptureMovieFileOutput`, which
        // needs a record-capable AVAudioSession just like single capture. A playback
        // category disables the mic and produces silent dual clips.
        await setAudioSessionForRecording().catch(() => {});
        await startDualRecordingSession();
      }
    } finally {
      recordTapBusyRef.current = false;
    }
  };

  const onPost = async () => {
    if (recordingBlocked || backgroundUploadActive) return;
    if (!clipUri) return;
    if (!playerFacing.canRecord) {
      showInfo('Not yet', 'Today’s leap is not live yet.');
      return;
    }

    const submitPost = () => {
      const watermarkInfo = getChallengeWatermarkInfo(
        challenge,
        window,
        String(user?.username ?? 'user')
      );

      if (!isFirebaseConfigured() || !user || clipUri.startsWith('demo://')) {
        markPostedToday();
        setClipUri(null);
        setClipSource(null);
        setSecondaryClipUri(null);
        setDualFrontIsPrimary(false);
        navigateToFeedTab(nav);
        return;
      }

      const uploadClipUri = clipUri;
      const uploadSecondaryClipUri = secondaryClipUri;
      const uploadClipSource = clipSource ?? 'unknown';
      const uploadDualFrontIsPrimary = dualFrontIsPrimary;

      setClipUri(null);
      setClipSource(null);
      setSecondaryClipUri(null);
      setDualFrontIsPrimary(false);

      startBackgroundPost({
        uid: user.uid,
        username: String(user.username ?? 'user'),
        viewingChallengeDateKey: recordingChallengeDateKey,
        challengeTitle: challenge.title,
        maxDurationSeconds: maxSec,
        clipUri: uploadClipUri,
        secondaryClipUri: uploadSecondaryClipUri,
        dualFrontIsPrimary: uploadDualFrontIsPrimary,
        clipSource: uploadClipSource,
        autoSavePosts: preferences.autoSavePosts,
        watermarkInfo,
      });

      navigateToFeedTab(nav);
    };

    if (!preferences.uploadOnCellular) {
      Alert.alert(
        'Upload',
        'Cellular uploads are turned off in Settings. Upload this video anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload', onPress: submitPost },
        ]
      );
      return;
    }

    submitPost();
  };

  const cameraActive = isFocused && canUseCamera && !clipUri && !recordingBlocked;
  const dualActive =
    cameraMode === 'dual' && isFocused && canUseCamera && !clipUri && !recordingBlocked;

  const handleDualCapture = React.useCallback(
    (clip: { primaryUri: string; secondaryUri: string; frontIsPrimary: boolean }) => {
      const sessionId = recordingSessionRef.current + 1;
      recordingSessionRef.current = sessionId;
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
      setClipUri(clip.primaryUri);
      setSecondaryClipUri(clip.secondaryUri);
      setDualFrontIsPrimary(clip.frontIsPrimary);
      setClipSource('recorded');
      if (user?.uid && isFirebaseConfigured() && !isStaffUser) {
        void consumeRecordingAttempt({
          uid: user.uid,
          challengeDate: recordingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] dual attempt consume failed:', e);
        });
      }
      void setAudioSessionForPlayback().catch(() => {});
    },
    [user?.uid, recordingChallengeDateKey, isStaffUser]
  );

  const handleDualError = React.useCallback((e: unknown) => {
    if (__DEV__) console.log('[Record] dual camera error:', e);
    showError('Dual camera error', e);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordingSecondsLeft(null);
  }, []);

  const handleRecordingTick = React.useCallback((left: number) => {
    setRecordingSecondsLeft(left);
  }, []);

  const toggleCameraMode = React.useCallback(() => {
    if (isRecordingRef.current || preRecordCountdown != null || clipUri || recordingBlocked) {
      return;
    }
    setCameraMode((m) => {
      const next = m === 'single' ? 'dual' : 'single';
      // Both single and dual capture need a record-capable AVAudioSession while
      // previewing so the microphone stays live for the next take.
      if (isFocused && !clipUri) {
        void setAudioSessionForRecording().catch(() => {});
      }
      return next;
    });
  }, [preRecordCountdown, clipUri, recordingBlocked, isFocused]);

  const onPurchaseAttemptPress = React.useCallback(() => {
    if (!user?.uid || !isFirebaseConfigured()) return;
    Alert.alert(
      'Get another attempt?',
      `Costs ${ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES}in from your leap base when you post (${unlockBaseAfterReduction}in base, or ${unlockFirstPostBaseAfterReduction}in for a first post). Engagement still adds on top.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock attempt',
          onPress: () => {
            setPurchaseBusy(true);
            void (async () => {
              try {
                await purchaseRecordingAttemptWithScore(recordingChallengeDateKey);
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
  }, [user?.uid, recordingChallengeDateKey, unlockBaseAfterReduction, unlockFirstPostBaseAfterReduction]);

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
      {recordingBlocked ? (
        <View style={styles.postedPill}>
          <Text style={styles.postedText}>POSTED TODAY</Text>
        </View>
      ) : null}

      <View style={styles.cameraWrap}>
        {clipUri && !clipUri.startsWith('demo://') ? (
          <RecordClipPreview
            key={clipUri}
            uri={clipUri}
            secondaryUri={secondaryClipUri}
            dualFrontIsPrimary={dualFrontIsPrimary}
          />
        ) : clipUri?.startsWith('demo://') ? (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Review take ready</Text>
            <Text style={styles.demoBody}>
              No camera file — post to try the rest of the app, or tap ↺ to reset.
            </Text>
          </View>
        ) : recordingBlocked ? (
          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Already posted today</Text>
            <Text style={styles.demoBody}>
              Delete today&apos;s leap from your feed to record again.
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
                key={`dual-${cameraSessionKey}`}
                active={dualActive}
                maxDurationSec={maxSec}
                controllerRef={dualControllerRef}
                onRecordingTick={handleRecordingTick}
                onCapture={handleDualCapture}
                onError={handleDualError}
              />
            ) : (
              <SingleCameraRecorder
                key={`single-${cameraSessionKey}`}
                active={cameraActive}
                initialFacing={cameraFacing}
                maxDurationSec={maxSec}
                controllerRef={singleControllerRef}
                onRecordingTick={handleRecordingTick}
                onCapture={handleSingleCapture}
                onError={handleSingleError}
              />
            )}
            {!recordingBlocked &&
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
            {!recordingBlocked && !clipUri && preRecordCountdown == null ? (
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
            <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.85)" />
            <Text style={styles.demoTitle}>Camera access needed</Text>
            <Text style={styles.demoBody}>
              {cameraDenied
                ? 'Leap needs camera access to record your daily leap. Turn it on in Settings.'
                : 'Allow camera access to record your daily leap.'}
            </Text>
            <PrimaryButton
              title={cameraDenied ? 'Open Settings' : 'Allow camera'}
              variant="green"
              onPress={() => {
                if (cameraDenied) {
                  void Linking.openSettings();
                  return;
                }
                void ensureCameraPermission();
              }}
              style={styles.permissionBtn}
            />
            {allowReviewDemo ? (
              <PrimaryButton
                title="Continue without camera"
                variant="outline"
                onPress={() => {
                  setClipUri('demo://clip');
                  setClipSource('demo');
                }}
                style={styles.permissionBtn}
              />
            ) : null}
          </View>
        )}
        {preRecordCountdown != null && !clipUri ? (
          <View style={styles.recordTimerBar} pointerEvents="none">
            <Text style={styles.recordTimerText}>{preRecordCountdown}</Text>
          </View>
        ) : null}
      </View>

      {playerFacing.canRecord && !recordingBlocked && attemptsLeft <= 0 && !clipUri ? (
        <View style={styles.outOfAttemptsCard}>
          <Text style={styles.outOfAttemptsTitle}>Out of attempts</Text>
          <Text style={styles.outOfAttemptsBody}>
            Spend {ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES}in from your leap base to leap again
          </Text>
          <Text style={styles.outOfAttemptsHint}>
            {bonusBasePending
              ? `Base reduction active (−${ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES}in from base on post).`
              : `Normal base ${LEAP_BASE_INCHES}→${unlockBaseAfterReduction}in · first-post base ${LEAP_FIRST_BONUS_BASE_INCHES}→${unlockFirstPostBaseAfterReduction}in · engagement unchanged.`}
          </Text>
          <PrimaryButton
            title={
              purchaseBusy
                ? '…'
                : bonusBasePending
                  ? '+1 attempt unlocked'
                  : `+1 attempt (−${ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES}in base)`
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
                  ? 'Review mode — post to continue, or record again.'
                  : 'Replay your take with the video controls, then post or record again.'}
              </Text>
            </View>
            <PrimaryButton
              title="POST"
              variant="green"
              onPress={onPost}
              style={styles.postBtn}
            />
            <PrimaryButton
              title="RECORD AGAIN"
              variant="outline"
              onPress={clearPreview}
              disabled={recordingBlocked || backgroundUploadActive}
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
                  backgroundUploadActive ||
                  !playerFacing.canRecord ||
                  preRecordCountdown != null) &&
                  styles.recordBtnDisabled,
              ]}
            >
              <View
                style={[
                  styles.recordOuter,
                  (attemptsLeft <= 0 ||
                    backgroundUploadActive ||
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
                    ? cameraDenied
                      ? 'OPEN SETTINGS FOR CAMERA'
                      : 'TAP TO ENABLE CAMERA'
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
