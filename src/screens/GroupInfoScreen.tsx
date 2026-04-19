import * as React from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversation } from '../chat/hooks/useConversation';
import { patchMemberRow } from '../services/chat/chatFirestore';

type Props = NativeStackScreenProps<ChatStackParamList, 'GroupInfo'>;

export function GroupInfoScreen({ route }: Props) {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const { conversation, members } = useConversation(conversationId, user?.uid);
  const me = members.find((m) => m.memberUid === user?.uid);

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
            trackColor={{ false: '#D1D5DB', true: '#A5D6A7' }}
          />
        </View>
      </View>
      <Text style={styles.section}>Members</Text>
      <FlatList
        style={{ flex: 1 }}
        data={members}
        keyExtractor={(m) => m.memberUid}
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Text style={styles.memberName}>@{item.displayNameSnap || item.memberUid}</Text>
            <Text style={styles.role}>{item.role}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { marginTop: 4, fontSize: 14, color: colors.muted, fontWeight: '600' },
  card: {
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: '700', color: colors.text },
  section: { marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: '900', color: colors.muted, letterSpacing: 0.5 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
  },
  memberName: { fontSize: 16, fontWeight: '700', color: colors.text },
  role: { fontSize: 13, fontWeight: '700', color: colors.muted2, textTransform: 'capitalize' },
});
