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

type Props = NativeStackScreenProps<MainStackParamList, 'ConfirmCoLeap'>;

export function ConfirmCoLeapScreen({ navigation, route }: Props) {
  const { videoId } = route.params;
  const { user } = useAuth();
  const { markPostedToday } = useAppState();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { padding: 20, gap: 16 },
    title: { fontSize: 22, fontWeight: '900' as const, color: c.text },
    sub: { fontSize: 15, fontWeight: '600' as const, color: c.muted, lineHeight: 22 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      padding: 14,
      gap: 10,
    },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 48, height: 48 },
    avatarTxt: { fontSize: 18, fontWeight: '900' as const, color: c.moss },
    name: { fontSize: 16, fontWeight: '800' as const, color: c.text },
    prompt: { fontSize: 14, fontWeight: '600' as const, color: c.muted, marginTop: 2 },
    status: { fontSize: 13, fontWeight: '700' as const, color: c.moss },
    error: { fontSize: 14, fontWeight: '600' as const, color: '#B42318', lineHeight: 20 },
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
        <Text style={styles.title}>Confirm Co-Leap</Text>
        <Text style={styles.sub}>
          One tap counts for your streak and unlocks today’s feed. You earn 3in + engagement from the
          shared Leap (the poster gets full inches). You can still post your own Leap today for a full
          award — once you do, you’re done for the day.
        </Text>

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
