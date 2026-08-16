import * as React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { UsernameLink } from '../components/UsernameLink';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import { useAppState } from '../state/appState';
import type { MainStackParamList } from '../navigation/types';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { confirmCoLeap } from '../services/coLeap';
import { parseCoLeapInvitees } from '../lib/coLeapInvitees';
import { showError, showInfo } from '../utils/ui';
import { typography } from '../theme/typography';

type Props = NativeStackScreenProps<MainStackParamList, 'ConfirmCoLeap'>;

export function ConfirmCoLeapScreen({ navigation, route }: Props) {
  const { videoId } = route.params;
  const { user } = useAuth();
  const { markPostedToday } = useAppState();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: '#F4F6F2' },
    body: { padding: 20, gap: 16, paddingTop: 28, paddingBottom: 36 },
    eyebrow: {
      fontSize: 11.5,
      fontFamily: typography.bodyBold,
      letterSpacing: 1.5,
      color: '#7C8A80',
    },
    title: {
      fontSize: 30,
      fontFamily: typography.displayExtraBold,
      color: '#101A14',
      letterSpacing: -1.1,
    },
    sub: {
      fontSize: 14,
      fontFamily: typography.bodySemiBold,
      color: '#5F6E64',
      lineHeight: 21,
    },
    reward: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: '#E9F4EA',
      borderWidth: 1,
      borderColor: '#C8E2CD',
    },
    rewardText: {
      color: '#1C7C43',
      fontSize: 12.5,
      fontFamily: typography.bodyBold,
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: '#E6EBE4',
      backgroundColor: '#FFFFFF',
      padding: 16,
      gap: 14,
    },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: '#E9F4EA',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 48, height: 48 },
    avatarTxt: { fontSize: 18, fontFamily: typography.bodyExtraBold, color: '#1C7C43' },
    name: { fontSize: 16, fontFamily: typography.bodyBold, color: '#101A14' },
    prompt: {
      fontSize: 14,
      fontFamily: typography.bodySemiBold,
      color: '#7C8A80',
      marginTop: 3,
    },
    status: { fontSize: 13, fontFamily: typography.bodyBold, color: '#1C7C43' },
    error: {
      fontSize: 14,
      fontFamily: typography.bodySemiBold,
      color: '#B42318',
      lineHeight: 20,
    },
  }));

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [posterUid, setPosterUid] = React.useState('');
  const [posterUsername, setPosterUsername] = React.useState('');
  const [posterPhoto, setPosterPhoto] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [myStatus, setMyStatus] = React.useState<'pending' | 'confirmed' | 'missing'>('missing');
  const [unavailable, setUnavailable] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !videoId) {
      setLoading(false);
      setUnavailable('Co-Leap not found.');
      return;
    }
    return onSnapshot(
      doc(firestore(), 'videos', videoId),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setUnavailable('This Co-Leap is no longer available.');
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        if (data.isCoLeapCredit === true || data.deleted === true) {
          setUnavailable('This Co-Leap is no longer available.');
          return;
        }
        const mod = String(data.moderationStatus ?? '').toLowerCase();
        if (mod === 'rejected' || mod === 'nulled') {
          setUnavailable('This Co-Leap is no longer available.');
          return;
        }
        setPosterUid(String(data.uid ?? ''));
        setPosterUsername(String(data.username ?? 'user'));
        setPosterPhoto(String(data.photoUrl ?? '').trim());
        setPrompt(String(data.prompt ?? data.challengeTitle ?? 'Today’s Leap'));
        const invitees = parseCoLeapInvitees(data.coLeapInvitees);
        const me = invitees.find((i) => i.uid === user?.uid);
        if (!me) {
          setMyStatus('missing');
          setUnavailable('You were not invited to this Co-Leap.');
          return;
        }
        setUnavailable(null);
        setMyStatus(me.status === 'confirmed' ? 'confirmed' : 'pending');
      },
      () => {
        setLoading(false);
        setUnavailable('Could not load this Co-Leap.');
      }
    );
  }, [videoId, user?.uid]);

  const onConfirm = async () => {
    if (!user?.uid || busy || myStatus !== 'pending') return;
    setBusy(true);
    try {
      await confirmCoLeap(videoId);
      markPostedToday();
      showInfo(
        'Co-Leap confirmed',
        'Streak counts and feed unlocked. You can still post your own Leap today for full inches.'
      );
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Tabs', { screen: 'Feed' });
    } catch (e) {
      showError('Could not confirm', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>CO-LEAP INVITE</Text>
        <Text style={styles.title}>Confirm Co-Leap</Text>
        <Text style={styles.sub}>
          Join the shared Leap to keep your streak moving and unlock today’s feed. You can still post
          your own Leap later for the full award.
        </Text>
        <View style={styles.reward}>
          <Ionicons name="trending-up" size={16} color="#1C7C43" />
          <Text style={styles.rewardText}>3″ + engagement for confirming</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.moss} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                {posterPhoto ? (
                  <Image source={{ uri: posterPhoto }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarTxt}>
                    {(posterUsername[0] ?? '?').toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {posterUid ? (
                  <UsernameLink uid={posterUid} username={posterUsername} style={styles.name} />
                ) : (
                  <Text style={styles.name}>@{posterUsername}</Text>
                )}
                <Text style={styles.prompt} numberOfLines={3}>
                  {prompt}
                </Text>
              </View>
            </View>
            {myStatus === 'confirmed' ? (
              <Text style={styles.status}>
                You’re confirmed — streak counts. Post your own Leap anytime today for full inches.
              </Text>
            ) : null}
            {unavailable ? <Text style={styles.error}>{unavailable}</Text> : null}
          </View>
        )}

        {!loading && !unavailable && myStatus === 'pending' ? (
          <PrimaryButton
            title={busy ? 'Confirming…' : 'Confirm Co-Leap'}
            variant="green"
            disabled={busy}
            onPress={() => void onConfirm()}
          />
        ) : null}
        {!loading && myStatus === 'confirmed' ? (
          <PrimaryButton
            title="Back to feed"
            variant="outline"
            onPress={() => navigation.navigate('Tabs', { screen: 'Feed' })}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
