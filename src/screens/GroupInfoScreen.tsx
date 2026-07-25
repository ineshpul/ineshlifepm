import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { doc, getDoc } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversation } from '../chat/hooks/useConversation';
import { ChatScreenHeader } from '../chat/components/ChatScreenHeader';
import { patchMemberRow, renameGroupConversation } from '../services/chat/chatFirestore';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { showError } from '../utils/ui';

type Props = NativeStackScreenProps<ChatStackParamList, 'GroupInfo'>;

type MemberView = {
  memberUid: string;
  role: string;
  username: string;
  photoUrl: string | null;
};

export function GroupInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    nameInput: {
      flex: 1,
      fontSize: 22,
      fontWeight: '800' as const,
      color: c.text,
      paddingVertical: 4,
      paddingHorizontal: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
    },
    nameSave: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.moss,
    },
    nameSaveDisabled: { opacity: 0.45 },
    nameSaveTxt: { fontSize: 13, fontWeight: '800' as const, color: c.white },
    sub: { marginTop: 8, fontSize: 14, color: c.muted, fontWeight: '600' as const },
    muteRow: {
      marginTop: 22,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 4,
    },
    label: { fontSize: 16, fontWeight: '700' as const, color: c.text },
    section: {
      marginTop: 28,
      marginBottom: 10,
      fontSize: 13,
      fontWeight: '800' as const,
      color: c.muted,
      letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
    },
    memberRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 11,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 40, height: 40 },
    avatarTxt: { fontSize: 15, fontWeight: '800' as const, color: c.moss },
    memberBody: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 16, fontWeight: '700' as const, color: c.text },
    role: { fontSize: 12, fontWeight: '700' as const, color: c.muted2, textTransform: 'capitalize' as const },
    emptyMembers: { paddingVertical: 20, color: c.muted, fontWeight: '600' as const },
  }));

  const { conversation, members } = useConversation(conversationId, user?.uid);
  const me = members.find((m) => m.memberUid === user?.uid);
  const [draftName, setDraftName] = React.useState('');
  const [savingName, setSavingName] = React.useState(false);
  const [memberViews, setMemberViews] = React.useState<MemberView[]>([]);

  React.useEffect(() => {
    setDraftName((conversation?.name ?? '').trim());
  }, [conversation?.name]);

  const membersKey = React.useMemo(
    () => members.map((m) => `${m.memberUid}:${m.displayNameSnap ?? ''}:${m.role}`).join('|'),
    [members]
  );

  // Instant list from member snaps; enrich photos/usernames in the background.
  React.useEffect(() => {
    if (members.length === 0) {
      setMemberViews([]);
      return;
    }
    setMemberViews(
      members.map((m) => ({
        memberUid: m.memberUid,
        role: m.role,
        username: (m.displayNameSnap ?? '').replace(/^@+/u, '').trim() || 'Member',
        photoUrl: null,
      }))
    );
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
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
      if (!cancelled) setMemberViews(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [membersKey]);

  const goBack = React.useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Conversation', { conversationId });
  }, [navigation, conversationId]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <ChatScreenHeader
          title="Group info"
          onBack={goBack}
          backAccessibilityLabel="Back to chat"
        />
      ),
    });
  }, [navigation, goBack]);

  const nameDirty =
    draftName.trim().length > 0 &&
    draftName.trim() !== (conversation?.name ?? '').trim();

  const saveName = async () => {
    if (!nameDirty || savingName) return;
    setSavingName(true);
    try {
      const next = await renameGroupConversation({
        conversationId,
        name: draftName,
        memberUids: members.map((m) => m.memberUid),
      });
      setDraftName(next);
    } catch (e) {
      showError('Could not rename group', e);
    } finally {
      setSavingName(false);
    }
  };

  const count = conversation?.memberCount ?? members.length;

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.nameInput}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Group name"
            placeholderTextColor={colors.muted2}
            autoCapitalize="sentences"
            autoCorrect
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void saveName()}
          />
          <Pressable
            style={[styles.nameSave, (!nameDirty || savingName) && styles.nameSaveDisabled]}
            disabled={!nameDirty || savingName}
            onPress={() => void saveName()}
            accessibilityRole="button"
            accessibilityLabel="Save group name"
          >
            {savingName ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.nameSaveTxt}>Save</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.sub}>
          {count} {count === 1 ? 'member' : 'members'}
        </Text>

        <View style={styles.muteRow}>
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

        <Text style={styles.section}>Members</Text>
        {memberViews.length === 0 ? (
          <Text style={styles.emptyMembers}>No members yet.</Text>
        ) : (
          <FlatList
            data={memberViews}
            keyExtractor={(m) => m.memberUid}
            renderItem={({ item }) => {
              const photo = (item.photoUrl ?? '').trim();
              const isMe = item.memberUid === user?.uid;
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
                    <Text style={styles.memberName} numberOfLines={1}>
                      @{item.username}
                      {isMe ? ' (you)' : ''}
                    </Text>
                  </View>
                  <Text style={styles.role}>{item.role}</Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
