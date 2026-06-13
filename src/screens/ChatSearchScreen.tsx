import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversations } from '../chat/hooks/useConversations';
import { searchMessagesInConversation } from '../services/chat/chatFirestore';
import type { ChatMessage } from '../chat/types';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatSearch'>;

export function ChatSearchScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      fontSize: 16,
      fontWeight: '600',
      backgroundColor: colors.card,
      color: colors.text,
    },
    btn: { marginTop: 10, alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.moss },
    btnTxt: { color: colors.white, fontWeight: '900' },
    block: { marginTop: 20 },
    blockTitle: { fontSize: 15, fontWeight: '900', marginBottom: 8, color: colors.text },
    hit: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border2 },
    hitTxt: { fontSize: 14, color: colors.text, fontWeight: '600' },
  }));

  const { rows } = useConversations(user?.uid);
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<{ convId: string; title: string; messages: ChatMessage[] }[]>([]);
  const [loading, setLoading] = React.useState(false);

  const run = React.useCallback(async () => {
    const prefix = q.trim().toLowerCase();
    if (!prefix || !rows.length) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const out: { convId: string; title: string; messages: ChatMessage[] }[] = [];
      for (const r of rows.slice(0, 24)) {
        const msgs = await searchMessagesInConversation(r.conversationId, prefix, 8);
        if (msgs.length) {
          out.push({
            convId: r.conversationId,
            title: r.member.convTitle || 'Chat',
            messages: msgs,
          });
        }
      }
      setHits(out);
    } finally {
      setLoading(false);
    }
  }, [q, rows]);

  return (
    <Screen style={styles.screen}>
      <TextInput
        style={styles.input}
        placeholder="Search message text"
        placeholderTextColor={colors.muted2}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void run()}
        returnKeyType="search"
      />
      <TouchableOpacity style={styles.btn} onPress={() => void run()}>
        <Text style={styles.btnTxt}>Search</Text>
      </TouchableOpacity>
      {loading ? <ActivityIndicator color={colors.moss} style={{ marginTop: 16 }} /> : null}
      {hits.map((h) => (
        <View key={h.convId} style={styles.block}>
          <Text style={styles.blockTitle}>{h.title}</Text>
          {h.messages.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.hit}
              onPress={() => navigation.navigate('Conversation', { conversationId: h.convId, threadTitle: h.title })}
            >
              <Text numberOfLines={2} style={styles.hitTxt}>
                {m.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </Screen>
  );
}
