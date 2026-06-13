import * as React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { createGroupConversation } from '../services/chat/chatFirestore';
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
    meta: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  }));

  const picked = route.params?.pickedUids ?? [];
  const [name, setName] = React.useState('');

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
    if (!user?.uid) return;
    const members = Array.from(new Set([user.uid, ...picked]));
    if (members.length < 2) {
      showError('Need more people', new Error('Pick at least one other person.'));
      return;
    }
    try {
      const id = await createGroupConversation({
        name: name.trim() || 'New group',
        createdBy: user.uid,
        memberUids: members.filter((x) => x !== user.uid),
      });
      navigation.replace('Conversation', { conversationId: id, threadTitle: name.trim() || 'Group' });
    } catch (e) {
      showError('Could not create group', e);
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
      <Text style={styles.meta}>{picked.length + 1} people including you</Text>
      <PrimaryButton title="Create group" variant="green" onPress={() => void onCreate()} />
    </Screen>
  );
}
