import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { ChatScreenHeader } from '../chat/components/ChatScreenHeader';
import { createGroupConversation } from '../services/chat/chatFirestore';
import { subscribeMutualFollows, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import { showError } from '../utils/ui';

type Props = NativeStackScreenProps<ChatStackParamList, 'NewGroup'>;

export function NewGroupScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
      paddingHorizontal: 20,
      paddingTop: 14,
      gap: 14,
    },
    label: {
      fontSize: 12,
      fontWeight: '800' as const,
      color: c.muted,
      letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
    },
    input: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
      paddingVertical: 10,
      fontSize: 20,
      fontWeight: '700' as const,
      color: c.text,
    },
    addRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 4,
    },
    addRowPressed: { opacity: 0.75 },
    addTitle: { flex: 1, fontSize: 16, fontWeight: '700' as const, color: c.moss },
    chipRow: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
    },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingLeft: 4,
      paddingRight: 8,
      paddingVertical: 4,
      borderRadius: 16,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    chipAvatarImg: { width: 24, height: 24 },
    chipAvatarTxt: { fontSize: 11, fontWeight: '800' as const, color: c.moss },
    chipName: { fontSize: 13, fontWeight: '700' as const, color: c.text },
    meta: { fontSize: 13, color: c.muted, fontWeight: '600' as const, lineHeight: 18 },
    footerSpacer: { flex: 1 },
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
        return {
          uid,
          label,
          photo: (row?.targetPhotoUrl ?? '').trim(),
        };
      });
  }, [picked, mutual, user?.uid]);

  const removePerson = (uid: string) => {
    navigation.setParams({
      pickedUids: picked.filter((id) => id !== uid),
    });
  };

  const goBack = React.useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatInbox');
  }, [navigation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <ChatScreenHeader
          title="New group"
          onBack={goBack}
          backAccessibilityLabel="Back"
        />
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
        <Ionicons name="person-add-outline" size={18} color={colors.moss} />
        <Text style={styles.addTitle}>
          {pickedPeople.length > 0 ? 'Edit people' : 'Add people'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
      </Pressable>

      {pickedPeople.length > 0 ? (
        <View style={styles.chipRow}>
          {pickedPeople.map((p) => (
            <Pressable
              key={p.uid}
              style={styles.chip}
              onPress={() => removePerson(p.uid)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.label}`}
            >
              <View style={styles.chipAvatar}>
                {p.photo ? (
                  <Image source={{ uri: p.photo }} style={styles.chipAvatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.chipAvatarTxt}>{p.label.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <Text style={styles.chipName}>@{p.label}</Text>
              <Ionicons name="close" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.meta}>{peopleLabel}</Text>
      <View style={styles.footerSpacer} />
      <PrimaryButton
        title={creating ? 'Creating…' : 'Create group'}
        variant="green"
        disabled={creating || pickedPeople.length === 0}
        onPress={() => void onCreate()}
      />
    </Screen>
  );
}
