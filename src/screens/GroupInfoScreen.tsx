import * as React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversation } from '../chat/hooks/useConversation';
import { patchMemberRow } from '../services/chat/chatFirestore';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { UsernameLink } from '../components/UsernameLink';

type Props = NativeStackScreenProps<ChatStackParamList, 'GroupInfo'>;

type MemberView = {
  memberUid: string;
  role: string;
  username: string;
  photoUrl: string | null;
};

export function GroupInfoScreen({ route }: Props) {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    title: { fontSize: 22, fontWeight: '900', color: colors.text },
    sub: { marginTop: 4, fontSize: 14, color: colors.muted, fontWeight: '600' },
    card: {
      marginTop: 20,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 16, fontWeight: '700', color: colors.text },
    section: {
      marginTop: 24,
      marginBottom: 8,
      fontSize: 13,
      fontWeight: '900',
      color: colors.muted,
      letterSpacing: 0.5,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border2,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarImg: { width: 40, height: 40 },
    avatarTxt: { fontSize: 15, fontWeight: '900', color: colors.moss },
    memberBody: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 16, fontWeight: '700', color: colors.text },
    role: { fontSize: 13, fontWeight: '700', color: colors.muted2, textTransform: 'capitalize' },
  }));

  const { conversation, members } = useConversation(conversationId, user?.uid);
  const me = members.find((m) => m.memberUid === user?.uid);
  const [memberViews, setMemberViews] = React.useState<MemberView[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(true);

  const membersKey = React.useMemo(
    () => members.map((m) => `${m.memberUid}:${m.displayNameSnap ?? ''}:${m.role}`).join('|'),
    [members]
  );

  React.useEffect(() => {
    if (!isFirebaseConfigured() || members.length === 0) {
      setMemberViews([]);
      setLoadingMembers(false);
      return;
    }
    let cancelled = false;
    setLoadingMembers(true);
    void (async () => {
      const rows = await Promise.all(
        members.map(async (m) => {
          const fromSnap = (m.displayNameSnap ?? '').trim().replace(/^@+/u, '');
          try {
            const snap = await getDoc(doc(firestore(), 'users', m.memberUid));
            const d = snap.data() as Record<string, unknown> | undefined;
            const username =
              (d?.username != null ? String(d.username).trim() : '') || fromSnap || 'Member';
            const photoUrl =
              d?.photoUrl != null && String(d.photoUrl).trim() !== '' ? String(d.photoUrl) : null;
            return {
              memberUid: m.memberUid,
              role: m.role,
              username: username.replace(/^@+/u, ''),
              photoUrl,
            } satisfies MemberView;
          } catch {
            return {
              memberUid: m.memberUid,
              role: m.role,
              username: fromSnap || 'Member',
              photoUrl: null,
            } satisfies MemberView;
          }
        })
      );
      if (!cancelled) {
        setMemberViews(rows);
        setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membersKey]);

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>{conversation?.name ?? 'Group'}</Text>
      <Text style={styles.sub}>{conversation?.memberCount ?? members.length} members</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Mute notifications</Text>
          <Switch
            value={Boolean(me?.muted)}
            onValueChange={(v) => {
              if (!user?.uid) return;
              void patchMemberRow(conversationId, user.uid, { muted: v });
            }}
            trackColor={{ false: colors.switchTrackOff, true: colors.moss }}
          />
        </View>
      </View>
      <Text style={styles.section}>Members</Text>
      {loadingMembers && memberViews.length === 0 ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={memberViews}
          keyExtractor={(m) => m.memberUid}
          renderItem={({ item }) => {
            const photo = (item.photoUrl ?? '').trim();
            return (
              <View style={styles.memberRow}>
                <View style={styles.avatar}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarTxt}>
                      {item.username.slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.memberBody}>
                  <UsernameLink
                    uid={item.memberUid}
                    username={item.username}
                    style={styles.memberName}
                  />
                </View>
                <Text style={styles.role}>{item.role}</Text>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}
