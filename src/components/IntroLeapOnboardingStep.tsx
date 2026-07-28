import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';

import { enterRecording, ensureRecordingAudio } from '../camera/audioSessionGate';
import { RecordClipPreview } from '../components/RecordClipPreview';
import {
  SingleCameraRecorder,
  type SingleCameraController,
} from '../components/SingleCameraRecorder';
import { ob, onboardingColors as c } from '../components/onboarding/onboardingFonts';
import { useAuth } from '../state/auth';
import {
  INTRO_LEAP_INCHES,
  INTRO_LEAP_MAX_SECONDS,
  INTRO_LEAP_PROMPT,
  skipIntroLeap,
  uploadAndCommitIntroLeap,
} from '../services/introLeap';
import { showCameraRecordingError, showError } from '../utils/ui';

type Props = {
  onDone: () => void;
};

type Phase = 'prompt' | 'record' | 'preview' | 'uploading';

function OnboardingPrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 54,
        width: '100%',
        borderRadius: 14,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: '#fff', fontSize: 15, fontFamily: ob.jakarta.bold, letterSpacing: 0.2 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IntroLeapOnboardingStep({ onDone }: Props) {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = React.useState<Phase>('prompt');
  const [clipUri, setClipUri] = React.useState<string | null>(null);
  const [uploadPct, setUploadPct] = React.useState(0);
  const singleRef = React.useRef<SingleCameraController | null>(null);
  const releaseAudioRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      releaseAudioRef.current?.();
      releaseAudioRef.current = null;
    };
  }, []);

  const openSettings = React.useCallback(() => {
    Alert.alert(
      'Camera access needed',
      'Turn on Camera access in Settings to record your intro.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]
    );
  }, []);

  const handleSkip = React.useCallback(() => {
    void skipIntroLeap().finally(onDone);
  }, [onDone]);

  const startRecord = React.useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        openSettings();
        return;
      }
    }
    const mic = await Audio.requestPermissionsAsync();
    if (!mic.granted) {
      showError('Microphone needed', 'Microphone access is needed to record.');
      return;
    }
    await ensureRecordingAudio();
    releaseAudioRef.current = await enterRecording();
    setPhase('record');
  }, [openSettings, permission?.granted, requestPermission]);

  const onCapture = React.useCallback((uri: string) => {
    releaseAudioRef.current?.();
    releaseAudioRef.current = null;
    setClipUri(uri);
    setPhase('preview');
  }, []);

  const postIntro = React.useCallback(async () => {
    const uid = user?.uid;
    if (!uid || !clipUri) return;
    setPhase('uploading');
    setUploadPct(0);
    try {
      await uploadAndCommitIntroLeap({
        uid,
        clipUri,
        maxDurationSeconds: INTRO_LEAP_MAX_SECONDS,
        onProgress: setUploadPct,
      });
      onDone();
    } catch (e) {
      setPhase('preview');
      showError('Could not post your intro', e);
    }
  }, [clipUri, onDone, user?.uid]);

  if (phase === 'uploading') {
    return (
      <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 32, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} size="large" />
        <Text style={{ marginTop: 16, fontFamily: ob.jakarta.semibold, fontSize: 14, color: c.muted }}>
          Posting to your profile… {uploadPct}%
        </Text>
      </View>
    );
  }

  if (phase === 'preview' && clipUri) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
        <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' }}>
          <RecordClipPreview uri={clipUri} />
        </View>
        <View style={{ marginTop: 16, gap: 10 }}>
          <OnboardingPrimaryButton title={`Post · +${INTRO_LEAP_INCHES} in`} onPress={() => void postIntro()} />
          <Pressable accessibilityRole="button" onPress={() => setPhase('record')} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: ob.jakarta.semibold, fontSize: 13, color: c.muted }}>Re-record</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'record') {
    return (
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}>
        <Text style={{ fontFamily: ob.jakarta.bold, fontSize: 22, color: c.text, textAlign: 'center' }}>
          {INTRO_LEAP_PROMPT}
        </Text>
        <View style={{ flex: 1, marginTop: 14, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' }}>
          <SingleCameraRecorder
            active
            initialFacing="front"
            maxDurationSec={INTRO_LEAP_MAX_SECONDS}
            controllerRef={singleRef}
            onCapture={onCapture}
            onError={(e) => showCameraRecordingError(e, 'Recording failed')}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            releaseAudioRef.current?.();
            releaseAudioRef.current = null;
            setPhase('prompt');
          }}
          style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: ob.jakarta.semibold, fontSize: 13, color: c.muted }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 26 }}>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 10,
          letterSpacing: 1.4,
          color: c.accent,
        }}
      >
        YOUR INTRO LEAP
      </Text>
      <Text
        style={{
          marginTop: 14,
          fontFamily: ob.jakarta.bold,
          fontSize: 32,
          letterSpacing: -0.8,
          lineHeight: 36,
          color: c.text,
        }}
      >
        {INTRO_LEAP_PROMPT}
      </Text>
      <Text
        style={{
          marginTop: 16,
          fontFamily: ob.jakarta.medium,
          fontSize: 15,
          lineHeight: 23,
          color: c.soft,
        }}
      >
        A quick hello for your profile — not today&apos;s challenge. Record when you&apos;re ready, or skip for now.
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontFamily: ob.jakarta.semibold,
          fontSize: 13,
          color: c.muted,
        }}
      >
        Post it to earn {INTRO_LEAP_INCHES} in (profile only — not the main feed).
      </Text>
      <View style={{ flex: 1, justifyContent: 'flex-end', gap: 10 }}>
        <OnboardingPrimaryButton title="Record intro" onPress={() => void startRecord()} />
        <Pressable accessibilityRole="button" onPress={handleSkip} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontFamily: ob.jakarta.semibold, fontSize: 14, color: c.muted }}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
