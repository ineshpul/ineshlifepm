import * as React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { ChatHeaderBack } from '../chat/components/ChatHeaderBack';
import { createGroupConversation } from '../services/chat/chatFirestore';
import { subscribeMutualFollows, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import { showError } from '../utils/ui';

type Props = NativeStackScreenProps<ChatStackParamList, 'NewGroup'>;

export function NewGroupScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 12,
    },
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
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addRowPressed: { opacity: 0.88 },
    addIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    addBody: { flex: 1, minWidth: 0 },
    addTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    addSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted },
    meta: { fontSize: 14, color: colors.muted, fontWeight: '600', lineHeight: 20 },
    people: { fontSize: 14, color: colors.text, fontWeight: '700', lineHeight: 20 },
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

  const goBack = React.useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatInbox');
  }, [navigation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: false,
      headerRight: () => null,
      headerLeft: () => (
        <ChatHeaderBack onPress={goBack} accessibilityLabel="Back to Chats" />
      ),
    });
  }, [navigation, goBack]);

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

  const totalPeople = pickedPeople.length + 1;
  const peopleLabel =
    totalPeople === 1 ? '1 person including you' : `${totalPeople} people including you`;

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']} dismissKeyboardOnTap>
      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        placeholder="Weekend crew, team leap…"
        placeholderTextColor={colors.muted2}
        value={name}
        onChangeText={setName}
      />
      <Pressable
        style={({ pressed }) => [styles.addRow, pressed && styles.addRowPressed]}
        onPress={() => navigation.navigate('MemberPicker', { mode: 'group', existingUids: picked })}
        accessibilityRole="button"
        accessibilityLabel="Add people to group"
      >
        <View style={styles.addIcon}>
          <Ionicons name="person-add-outline" size={18} color={colors.moss} />
        </View>
        <View style={styles.addBody}>
          <Text style={styles.addTitle}>
            {pickedPeople.length > 0 ? 'Edit people' : 'Add people'}
          </Text>
          <Text style={styles.addSub}>
            {pickedPeople.length > 0
              ? `${pickedPeople.length} selected`
              : 'Pick people you follow who follow you back'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
      </Pressable>
      <Text style={styles.meta}>{peopleLabel}</Text>
      {pickedPeople.length > 0 ? (
        <Text style={styles.people} numberOfLines={4}>
          You, {pickedPeople.map((p) => `@${p.label}`).join(', ')}
        </Text>
      ) : null}
      <PrimaryButton
        title={creating ? 'Creating…' : 'Create group'}
        variant="green"
        disabled={creating}
        onPress={() => void onCreate()}
      />
    </Screen>
  );
}
