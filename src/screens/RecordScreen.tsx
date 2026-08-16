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
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import {
  enterPlayback,
  enterRecording,
  ensureRecordingAudio,
} from '../camera/audioSessionGate';
import { prepareForVideoRecording } from '../camera/prepareForVideoRecording';
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
import { canFlipMidRecording } from '../services/concatVideos';
import { removeGhostLeapVideoIfOpenLedger } from '../services/deleteVideo';
import { useHasSoloPostedToday } from '../state/posting';
import { useBackgroundPostUpload } from '../state/backgroundPostUpload';
import { showCameraRecordingError, showError, showInfo } from '../utils/ui';
import { useSettingsPreferences } from '../state/settingsPreferences';
import {
  BONUS_ATTEMPT_BASE_REDUCTION_INCHES,
  LEAP_BASE_INCHES,
  LEAP_FIRST_BONUS_BASE_INCHES,
} from '../lib/verticalScore';
import { purchaseRecordingAttemptWithScore } from '../services/recordingAttemptsPurchase';
import { computeFeedViewingFromNow } from '../utils/nyTime';
import { navigateToFeedTab } from '../navigation/navigationHelpers';
import { CoLeapInvitePickerModal } from '../components/CoLeapInvitePickerModal';
import type { CoLeapInviteePick } from '../types/coLeap';
import { typography } from '../theme/typography';

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

function formatRecorderTime(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/**
 * Mic permission only before record. A separate Audio.Recording probe steals the iOS session
 * from CameraView and freezes the preview on TestFlight/production builds.
 */
async function ensureMicrophonePermissionForRecording(): Promise<boolean> {
  const current = await Audio.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Audio.requestPermissionsAsync();
  return next.granted;
}

export function RecordScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: {
    backgroundColor: '#0C0F0D',
  },
  reviewScreen: {
    backgroundColor: '#F4F6F2',
  },
  topBar: {
    paddingTop: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    zIndex: 30,
  },
  frogStrip: {
    marginTop: 8,
    marginHorizontal: 16,
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTopBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6EBE4',
  },
  topBtnText: {
    color: colors.white,
    fontSize: 17,
    fontFamily: typography.bodyBold,
  },
  promptPill: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  reviewPromptPill: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  promptText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: typography.bodyBold,
  },
  reviewPromptText: {
    color: '#101A14',
    fontSize: 15.5,
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
    marginTop: 14,
    marginHorizontal: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#171B14',
  },
  reviewPreview: {
    flex: 0,
    width: 116,
    height: 174,
    marginTop: 16,
    marginLeft: 20,
    marginRight: 0,
    borderRadius: 22,
    backgroundColor: '#3E4735',
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
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
    alignItems: 'center',
    gap: 10,
  },
  reviewBottomBar: {
    alignItems: 'stretch',
    paddingTop: 14,
  },
  meta: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontFamily: typography.bodyBold,
    letterSpacing: 0.4,
    backgroundColor: 'rgba(20,26,20,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  recordBtn: {
    alignItems: 'center',
    gap: 10,
  },
  recordBtnDisabled: {
    opacity: 0.55,
  },
  recordOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordOuterDisabled: {
    borderColor: 'rgba(255,255,255,0.25)',
  },
  recordInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  recordInnerIdle: {
    backgroundColor: '#FF5B39',
  },
  recordInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F97316',
  },
  doneCard: {
    alignSelf: 'stretch',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBE4',
    marginBottom: 4,
  },
  doneTitle: {
    color: '#101A14',
    fontSize: 23,
    fontFamily: typography.displayExtraBold,
    letterSpacing: -0.8,
  },
  doneBody: {
    marginTop: 6,
    color: '#7C8A80',
    fontSize: 11.5,
    fontFamily: typography.bodyBold,
    letterSpacing: 1.2,
    lineHeight: 18,
  },
  recordHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  postBtn: {
    width: '100%',
    minHeight: 56,
    borderRadius: 20,
  },
  attachBtn: {
    width: '100%',
    height: 48,
    borderRadius: 18,
  },
  libraryAttachBtn: {
    width: 220,
    height: 44,
    borderRadius: 14,
    marginTop: 10,
  },
  coLeapBtn: {
    width: '100%',
    height: 52,
    borderRadius: 20,
  },
  coLeapHint: {
    color: '#7C8A80',
    fontSize: 12,
    fontFamily: typography.bodySemiBold,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
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
  // Co-Leap confirm unlocks the feed/streak but does not lock the camera — only a solo post does.
  const postedForRecordingDay = useHasSoloPostedToday(user?.uid, recordingChallengeDateKey);
  const maxSec = normalizeTaskDurationSeconds(challenge.maxDurationSeconds);
  const playerFacing = getPlayerFacingChallenge(challenge, window);
  const attemptsRemaining = useAttemptsRemaining(
    user?.uid,
    recordingChallengeDateKey,
    challenge.maxRecordingAttempts,
    isStaffUser
  );
  /**
   * Block whenever an active solo post exists for the day — staff included, so one
   * leap per day holds for every account. `useHasSoloPostedToday` already treats
   * deleted/orphan leap docs as non-posts, so repost-after-delete stays unblocked
   * without needing the day ledger as a second gate; that clause let anyone who
   * posted with attempts to spare record over their own leap.
   * `isStaffUser` still grants unlimited *attempts* before a post lands (QA).
   */
  const recordingBlocked = postedForRecordingDay;

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
  const [clipSource, setClipSource] = React.useState<'recorded' | 'demo' | 'library' | null>(null);
  const [clipMediaType, setClipMediaType] = React.useState<'video' | 'photo'>('video');
  /** PIP companion video captured at the same time as `clipUri` when dual mode is on. */
  const [secondaryClipUri, setSecondaryClipUri] = React.useState<string | null>(null);
  /** Whether the front camera was the big view when a dual take finished. */
  const [dualFrontIsPrimary, setDualFrontIsPrimary] = React.useState(false);
  const [coLeapInvitees, setCoLeapInvitees] = React.useState<CoLeapInviteePick[]>([]);
  const [coLeapPickerOpen, setCoLeapPickerOpen] = React.useState(false);
  /** Current direction of the single-camera recorder; the dual recorder owns its own facing state. */
  const [cameraFacing, setCameraFacing] = React.useState<'front' | 'back'>('front');
  /** Single = expo-camera (production quality). Dual = vision-camera multi-cam. */
  const [cameraMode, setCameraMode] = React.useState<'single' | 'dual'>('single');
  const dualControllerRef = React.useRef<DualCameraController | null>(null);
  const singleControllerRef = React.useRef<SingleCameraController | null>(null);
  const recordingAbortRef = React.useRef(false);
  const isRecordingRef = React.useRef(false);
  const recordTapBusyRef = React.useRef(false);
  /** Release fn from AudioSessionGate while this screen holds the record category. */
  const releaseRecordAudioRef = React.useRef<(() => void) | null>(null);
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
      if (!user?.uid || !isFirebaseConfigured() || isStaffUser) {
        return;
      }
      if (!postedForRecordingDay && attemptsRemaining > 0) return;

      if (!postedForRecordingDay && attemptsRemaining <= 0) {
        void resetRecordingAttemptsAfterVideoDelete({
          uid: user.uid,
          challengeDate: recordingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] heal attempts after delete failed:', e);
        });
        return;
      }

      if (recordingBlocked) {
        void removeGhostLeapVideoIfOpenLedger({
          uid: user.uid,
          challengeDate: recordingChallengeDateKey,
        }).catch((e) => {
          if (__DEV__) console.log('[Record] ghost leap heal failed:', e);
        });
      }
    }, [
      user?.uid,
      isStaffUser,
      postedForRecordingDay,
      attemptsRemaining,
      recordingBlocked,
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
    setClipMediaType('video');
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);
    setCoLeapInvitees([]);
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
    setClipMediaType('video');
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
    setClipMediaType('video');
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);
    setPreRecordCountdown(null);
    setRecordingSecondsLeft(null);
    setIsRecording(false);
  }, [recordingBlocked]);

  const onAttachFromLibrary = React.useCallback(async () => {
    if (!challenge.allowLibraryAttach) return;
    if (recordingBlocked || backgroundUploadActive || !playerFacing.canRecord) return;
    if (attemptsLeft <= 0 && !isStaffUser) {
      showInfo('Out of attempts', 'Unlock another attempt to attach media.');
      return;
    }
    if (isRecordingRef.current || preRecordCountdown != null) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError(
        'Photos access needed',
        new Error('Allow Photos access in Settings so you can attach proof from your camera roll.')
      );
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];
    const uri = String(asset.uri ?? '').trim();
    if (!uri) {
      showError('Attach failed', new Error('Could not read that file. Try another photo or video.'));
      return;
    }

    const isPhoto =
      asset.type === 'image' ||
      /\.(jpe?g|png|heic|webp)$/i.test(uri) ||
      String(asset.mimeType ?? '').startsWith('image/');

    if (!isPhoto) {
      // ImagePicker duration is milliseconds on iOS/Android.
      const durationSec =
        typeof asset.duration === 'number' && asset.duration > 0
          ? asset.duration > 1000
            ? asset.duration / 1000
            : asset.duration
          : 0;
      if (durationSec > maxSec + 0.75) {
        showError(
          'Too long',
          new Error(`Pick a clip of ${maxSec}s or less for today’s leap.`)
        );
        return;
      }
    }

    setClipUri(uri);
    setClipSource('library');
    setClipMediaType(isPhoto ? 'photo' : 'video');
    setSecondaryClipUri(null);
    setDualFrontIsPrimary(false);

    if (user?.uid && isFirebaseConfigured() && !isStaffUser) {
      void consumeRecordingAttempt({
        uid: user.uid,
        challengeDate: recordingChallengeDateKey,
      }).catch((e) => {
        if (__DEV__) console.log('[Record] library attempt consume failed:', e);
      });
    }
  }, [
    challenge.allowLibraryAttach,
    recordingBlocked,
    backgroundUploadActive,
    playerFacing.canRecord,
    attemptsLeft,
    isStaffUser,
    preRecordCountdown,
    maxSec,
    user?.uid,
    recordingChallengeDateKey,
  ]);

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
        // Stop writers before releasing the audio category / pausing the session.
        void (async () => {
          if (isRecordingRef.current) {
            await stopActiveRecording();
          }
          const release = releaseRecordAudioRef.current;
          releaseRecordAudioRef.current = null;
          release?.();
          await enterPlayback().catch(() => undefined);
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
    if (clipUri) {
      const release = releaseRecordAudioRef.current;
      releaseRecordAudioRef.current = null;
      release?.();
      void enterPlayback().catch(() => undefined);
      return;
    }
    if (!isFocused) {
      if (isRecordingRef.current || preRecordCountdown != null) {
        return;
      }
      const release = releaseRecordAudioRef.current;
      releaseRecordAudioRef.current = null;
      release?.();
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
  }, [isFocused, cameraMode, clipUri, preRecordCountdown, isRecording]);

  React.useEffect(() => {
    if (!isFocused) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void getCameraPermission();
        void getMicPermission();
        return;
      }
      if (next !== 'background' && next !== 'inactive') return;
      if (!isRecordingRef.current && preRecordCountdown == null) return;
      recordingAbortRef.current = true;
      setPreRecordCountdown(null);
      setRecordingSecondsLeft(null);
      void stopActiveRecording();
      setIsRecording(false);
      isRecordingRef.current = false;
      setCameraSessionKey((k) => k + 1);
    });
    return () => sub.remove();
  }, [isFocused, getCameraPermission, getMicPermission, stopActiveRecording]);

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
      await new Promise((r) => setTimeout(r, 400));
    }

    try {
      await prepareForVideoRecording();
      await controller.start();
      if (!controller.isRecording) {
        throw new Error('Camera not ready');
      }
      setRecordingSecondsLeft(maxSec);
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (e) {
      showCameraRecordingError(e, 'Recording failed');
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
      setCameraSessionKey((k) => k + 1);
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
      await new Promise((r) => setTimeout(r, 400));
    }

    try {
      await prepareForVideoRecording();
      await controller.start();
      if (!controller.isRecording) {
        throw new Error('Camera not ready');
      }
      setRecordingSecondsLeft(maxSec);
      setIsRecording(true);
      isRecordingRef.current = true;
    } catch (e) {
      showCameraRecordingError(e, 'Recording failed');
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordingSecondsLeft(null);
      setCameraSessionKey((k) => k + 1);
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
      const release = releaseRecordAudioRef.current;
      releaseRecordAudioRef.current = null;
      release?.();
      void enterPlayback().catch(() => undefined);
    },
    [user?.uid, recordingChallengeDateKey, isStaffUser]
  );

  const handleSingleError = React.useCallback((e: unknown) => {
    if (__DEV__) console.log('[Record] single camera error:', e);
    showCameraRecordingError(e);
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordingSecondsLeft(null);
    setCameraSessionKey((k) => k + 1);
  }, []);

  // Flip works mid-record via expo-camera segment stitch (production quality path).
  const onFlipCamera = React.useCallback(() => {
    if (recordingBlocked || !playerFacing.canRecord || preRecordCountdown != null || !canUseCamera) {
      return;
    }
    // Avoid label/camera desync when mid-take flips cannot be stitched safely.
    if (isRecordingRef.current && !canFlipMidRecording()) return;
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
        if (!micPermission?.granted) {
          const micOk = await ensureMicrophonePermissionForRecording();
          if (!micOk) {
            showError(
              'Microphone needed',
              new Error('Allow the microphone to record video with sound, or change this in Settings.')
            );
            restorePreviewAfterRecording();
            return;
          }
        }
        if (!releaseRecordAudioRef.current) {
          releaseRecordAudioRef.current = await enterRecording();
        }
        await startRecordingSession();
      } else {
        if (!releaseRecordAudioRef.current) {
          releaseRecordAudioRef.current = await enterRecording();
        } else {
          await ensureRecordingAudio();
        }
        await startDualRecordingSession();
      }
    } finally {
      recordTapBusyRef.current = false;
    }
  };

  const onPost = async () => {
    // Defensive: the blocked effect clears clipUri so this button normally unmounts,
    // but a snapshot landing mid-tap could still get here. Say why instead of no-oping.
    if (recordingBlocked) {
      showInfo('You already posted today!', 'Wait for tomorrow’s leap.');
      return;
    }
    if (backgroundUploadActive) return;
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
        setClipMediaType('video');
        setSecondaryClipUri(null);
        setDualFrontIsPrimary(false);
        navigateToFeedTab(nav);
        return;
      }

      const uploadClipUri = clipUri;
      const uploadSecondaryClipUri = clipMediaType === 'photo' ? null : secondaryClipUri;
      const uploadClipSource = clipSource ?? 'unknown';
      const uploadDualFrontIsPrimary = dualFrontIsPrimary;
      const uploadMediaType = clipMediaType;

      const uploadCoLeapInvitees = coLeapInvitees;
      setClipUri(null);
      setClipSource(null);
      setClipMediaType('video');
      setSecondaryClipUri(null);
      setDualFrontIsPrimary(false);
      setCoLeapInvitees([]);

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
        mediaType: uploadMediaType,
        autoSavePosts: preferences.autoSavePosts,
        watermarkInfo,
        ...(uploadCoLeapInvitees.length > 0 ? { coLeapInvitees: uploadCoLeapInvitees } : {}),
      });

      navigateToFeedTab(nav);
    };

    if (!preferences.uploadOnCellular) {
      Alert.alert(
        'Upload',
        'Cellular uploads are turned off in Settings. Upload this anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upload', onPress: submitPost },
        ]
      );
      return;
    }

    submitPost();
  };

  const captureSessionLive =
    isRecording || preRecordCountdown != null || isRecordingRef.current;
  const cameraActive =
    canUseCamera &&
    !clipUri &&
    !recordingBlocked &&
    (isFocused || captureSessionLive);
  const dualActive =
    cameraMode === 'dual' &&
    canUseCamera &&
    !clipUri &&
    !recordingBlocked &&
    (isFocused || captureSessionLive);

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
      const release = releaseRecordAudioRef.current;
      releaseRecordAudioRef.current = null;
      release?.();
      void enterPlayback().catch(() => undefined);
    },
    [user?.uid, recordingChallengeDateKey, isStaffUser]
  );

  const handleDualError = React.useCallback((e: unknown) => {
    if (__DEV__) console.log('[Record] dual camera error:', e);
    showCameraRecordingError(e, 'Dual camera error');
    setIsRecording(false);
    isRecordingRef.current = false;
    setRecordingSecondsLeft(null);
    setCameraSessionKey((k) => k + 1);
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
      if (isFocused && !clipUri && !releaseRecordAudioRef.current) {
        void enterRecording().then((release) => {
          releaseRecordAudioRef.current = release;
        });
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

  const isReviewing = Boolean(clipUri);

  return (
    <Screen
      withSafeArea={false}
      style={[styles.screen, isReviewing && styles.reviewScreen]}
    >
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => {
            if (nav.canGoBack()) nav.goBack();
            else nav.navigate('Tabs' as never, { screen: 'Today' } as never);
          }}
          style={[styles.topBtn, isReviewing && styles.reviewTopBtn]}
        >
          <Ionicons name={isReviewing ? 'chevron-back' : 'close'} size={20} color={isReviewing ? '#101A14' : colors.white} />
        </TouchableOpacity>
        <View style={[styles.promptPill, isReviewing && styles.reviewPromptPill]}>
          <Text style={[styles.promptText, isReviewing && styles.reviewPromptText]} numberOfLines={2}>
            {isReviewing ? 'Review' : playerFacing.title}
          </Text>
        </View>
        <TouchableOpacity
          onPress={clearPreview}
          style={[styles.topBtn, isReviewing && styles.reviewTopBtn]}
          accessibilityLabel={isReviewing ? 'Retake' : 'Reset camera'}
        >
          <Ionicons
            name="refresh"
            size={19}
            color={isReviewing ? '#101A14' : colors.white}
          />
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

      <View style={[styles.cameraWrap, isReviewing && styles.reviewPreview]}>
        {clipUri && !clipUri.startsWith('demo://') ? (
          <RecordClipPreview
            key={clipUri}
            uri={clipUri}
            mediaType={clipMediaType}
            secondaryUri={clipMediaType === 'photo' ? null : secondaryClipUri}
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
            <Text style={styles.demoTitle}>You already posted today!</Text>
            <Text style={styles.demoBody}>Wait for tomorrow&apos;s leap.</Text>
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
                onFacingChange={setCameraFacing}
                onRecordingTick={handleRecordingTick}
                onCapture={handleSingleCapture}
                onError={handleSingleError}
              />
            )}
            {!recordingBlocked &&
            !clipUri &&
            preRecordCountdown == null &&
            cameraMode === 'single' ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={
                  cameraFacing === 'front' ? 'Use back camera' : 'Use front camera'
                }
                onPress={onFlipCamera}
                // Mid-record flip: expo-camera segments stitched on stop.
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
            <Ionicons
              name={challenge.allowLibraryAttach ? 'images-outline' : 'camera-outline'}
              size={40}
              color="rgba(255,255,255,0.85)"
            />
            <Text style={styles.demoTitle}>
              {challenge.allowLibraryAttach ? 'Camera optional today' : 'Camera access needed'}
            </Text>
            <Text style={styles.demoBody}>
              {challenge.allowLibraryAttach
                ? 'Today’s leap allows camera-roll proof. Attach a photo or video below, or enable the camera to record.'
                : cameraDenied
                  ? 'Leap needs camera access to record your daily leap. Turn it on in Settings.'
                  : 'Allow camera access to record your daily leap.'}
            </Text>
            {!challenge.allowLibraryAttach || !cameraDenied ? (
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
            ) : (
              <PrimaryButton
                title="Open Settings for camera"
                variant="outline"
                onPress={() => void Linking.openSettings()}
                style={styles.permissionBtn}
              />
            )}
            {allowReviewDemo ? (
              <PrimaryButton
                title="Continue without camera"
                variant="outline"
                onPress={() => {
                  setClipUri('demo://clip');
                  setClipSource('demo');
                  setClipMediaType('video');
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

      <View style={[styles.bottomBar, isReviewing && styles.reviewBottomBar]}>
        {!isReviewing ? <Text style={styles.meta}>
          {playerFacing.canRecord
            ? isRecording && recordingSecondsLeft != null
              ? attemptsLeft <= 0
                ? `${formatRecorderTime(maxSec - recordingSecondsLeft)} / ${formatRecorderTime(maxSec)} • OUT OF ATTEMPTS`
                : attemptsLeft === 1
                  ? `${formatRecorderTime(maxSec - recordingSecondsLeft)} / ${formatRecorderTime(maxSec)} • 1 ATTEMPT LEFT`
                  : `${formatRecorderTime(maxSec - recordingSecondsLeft)} / ${formatRecorderTime(maxSec)} • ${attemptsLeft} ATTEMPTS LEFT`
              : attemptsLeft <= 0
                ? `${maxSec}S MAX • OUT OF ATTEMPTS`
                : attemptsLeft === 1
                  ? `${maxSec}S MAX • 1 ATTEMPT LEFT`
                  : `${maxSec}S MAX • ${attemptsLeft} ATTEMPTS LEFT`
            : playerFacing.instructionsLine}
        </Text> : null}

        {clipUri ? (
          <>
            <View style={styles.doneCard}>
              <Text style={styles.doneBody}>YOUR TAKE</Text>
              <Text style={styles.doneTitle}>
                {playerFacing.title}
              </Text>
            </View>
            <PrimaryButton
              title={
                coLeapInvitees.length === 0
                  ? 'Add Co-Leapers'
                  : coLeapInvitees.length === 1
                    ? 'Co-Leap: 1 invited'
                    : `Co-Leap: ${coLeapInvitees.length} invited`
              }
              variant="outline"
              onPress={() => setCoLeapPickerOpen(true)}
              disabled={recordingBlocked || backgroundUploadActive}
              style={styles.coLeapBtn}
            />
            {coLeapInvitees.length > 0 ? (
              <Text style={styles.coLeapHint}>
                {coLeapInvitees.map((p) => `@${p.username.replace(/^@+/u, '')}`).join(' · ')}
                {' — they’ll confirm to get posted-today credit'}
              </Text>
            ) : null}
            <PrimaryButton
              title="Post leap  ›"
              variant="green"
              onPress={onPost}
              disabled={recordingBlocked || backgroundUploadActive}
              style={styles.postBtn}
            />
            <PrimaryButton
              title={clipSource === 'library' ? 'Choose again' : 'Retake'}
              variant="outline"
              onPress={clearPreview}
              disabled={recordingBlocked || backgroundUploadActive}
              style={styles.attachBtn}
            />
            {user?.uid ? (
              <CoLeapInvitePickerModal
                visible={coLeapPickerOpen}
                viewerUid={user.uid}
                initial={coLeapInvitees}
                onClose={() => setCoLeapPickerOpen(false)}
                onDone={(picks) => {
                  setCoLeapInvitees(picks);
                  setCoLeapPickerOpen(false);
                }}
              />
            ) : null}
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
                    ? challenge.allowLibraryAttach
                      ? 'RECORD OR ATTACH BELOW'
                      : cameraDenied
                        ? 'OPEN SETTINGS FOR CAMERA'
                        : 'TAP TO ENABLE CAMERA'
                    : preRecordCountdown != null
                      ? 'GET READY…'
                      : isRecording
                        ? 'TAP TO STOP'
                        : 'TAP TO RECORD'}
              </Text>
            </TouchableOpacity>
            {challenge.allowLibraryAttach && playerFacing.canRecord ? (
              <PrimaryButton
                title="ATTACH FROM CAMERA ROLL"
                variant="outline"
                onPress={() => void onAttachFromLibrary()}
                disabled={
                  attemptsLeft <= 0 ||
                  backgroundUploadActive ||
                  preRecordCountdown != null ||
                  isRecording
                }
                style={styles.libraryAttachBtn}
              />
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
