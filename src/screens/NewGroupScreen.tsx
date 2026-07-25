import * as React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { createGroupConversation } from '../services/chat/chatFirestore';
import { subscribeMutualFollows, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import { showError } from '../utils/ui';

type Props = NativeStackScreenProps<ChatStackParamList, 'NewGroup'>;

export function NewGroupScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12 },
    label: { fontSize: 13, fontWeight: '900', color: colors.muted, letterSpacing: 0.4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      fontSize: 16,
      fontWeight: '700',
      backgroundColor: colors.card,
      color: colors.text,
    },
    meta: { fontSize: 14, color: colors.muted, fontWeight: '600', lineHeight: 20 },
    people: { fontSize: 14, color: colors.text, fontWeight: '700', lineHeight: 20 },
    hint: { fontSize: 13, color: colors.muted, fontWeight: '600', lineHeight: 18 },
  }));

  const picked = route.params?.pickedUids ?? [];
  const [name, setName] = React.useState('');
  const [mutual, setMutual] = React.useState<FollowingRow[]>([]);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    return subscribeMutualFollows(user.uid, setMutual);
  }, [user?.uid]);

  const pickedPeople = React.useMemo(() => {
    const byUid = new Map(mutual.map((r) => [r.targetUid, r]));
    return picked
      .filter((uid) => uid !== user?.uid)
      .map((uid) => {
        const row = byUid.get(uid);
        const label = (row?.targetUsername ?? '').replace(/^@+/u, '') || 'member';
        return { uid, label };
      });
  }, [picked, mutual, user?.uid]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 12, paddingVertical: 6 }}
          onPress={() => navigation.navigate('MemberPicker', { mode: 'group', existingUids: picked })}
        >
          <Text style={{ fontWeight: '800', color: colors.moss }}>Add</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, picked, colors.moss]);

  const onCreate = async () => {
    if (!user?.uid || creating) return;
    const members = Array.from(new Set([user.uid, ...picked]));
    if (members.length < 2) {
      showError('Need more people', new Error('Pick at least one other person.'));
      return;
    }
    setCreating(true);
    try {
      const id = await createGroupConversation({
        name: name.trim() || 'New group',
        createdBy: user.uid,
        memberUids: members.filter((x) => x !== user.uid),
      });
      navigation.replace('Conversation', {
        conversationId: id,
        threadTitle: name.trim() || 'Group',
      });
    } catch (e) {
      showError('Could not create group', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        placeholder="Weekend crew, team leap…"
        placeholderTextColor={colors.muted2}
        value={name}
        onChangeText={setName}
      />
      <Text style={styles.meta}>
        {pickedPeople.length + 1} people including you
      </Text>
      {pickedPeople.length > 0 ? (
        <Text style={styles.people} numberOfLines={4}>
          You, {pickedPeople.map((p) => `@${p.label}`).join(', ')}
        </Text>
      ) : (
        <Text style={styles.hint}>
          Tap Add to pick people you follow who follow you back.
        </Text>
      )}
      <PrimaryButton
        title={creating ? 'Creating…' : 'Create group'}
        variant="green"
        disabled={creating}
        onPress={() => void onCreate()}
      />
    </Screen>
  );
}
