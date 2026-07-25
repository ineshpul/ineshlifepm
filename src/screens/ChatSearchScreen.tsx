import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useChatInboxData } from '../chat/ChatUnreadContext';
import { ChatHeaderBack } from '../chat/components/ChatHeaderBack';
import {
  searchMessagesParallel,
  type MessageSearchHitGroup,
} from '../chat/searchMessagesParallel';
import type { ChatMessage } from '../chat/types';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatSearch'>;

type ListRow =
  | { type: 'section'; id: string; title: string }
  | {
      type: 'chat';
      id: string;
      conversationId: string;
      title: string;
      avatarUrl?: string | null;
      preview?: string;
    }
  | {
      type: 'message';
      id: string;
      conversationId: string;
      title: string;
      avatarUrl?: string | null;
      message: ChatMessage;
    }
  | { type: 'empty'; id: string; text: string };

function formatTime(ts: { toMillis?: () => number } | null | undefined) {
  if (!ts?.toMillis) return '';
  const d = new Date(ts.toMillis());
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatSearchScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    searchWrap: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border2,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '600' as const,
      backgroundColor: c.inputBg,
      color: c.text,
    },
    section: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
      fontSize: 13,
      fontWeight: '800' as const,
      color: c.muted,
      letterSpacing: 0.3,
      textTransform: 'uppercase' as const,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 44, height: 44 },
    avatarInitial: { fontSize: 16, fontWeight: '800' as const, color: c.moss },
    body: { flex: 1, minWidth: 0 },
    title: { fontSize: 16, fontWeight: '800' as const, color: c.text },
    preview: { marginTop: 2, fontSize: 14, fontWeight: '500' as const, color: c.muted },
    time: { fontSize: 12, fontWeight: '600' as const, color: c.muted2, marginLeft: 8 },
    idle: {
      paddingHorizontal: 28,
      paddingTop: 36,
      gap: 8,
    },
    idleTitle: { fontSize: 18, fontWeight: '800' as const, color: c.text },
    idleSub: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const, color: c.muted },
    emptyRow: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 14,
      fontWeight: '600' as const,
      color: c.muted,
    },
    loading: { marginTop: 20 },
  }));

  const { rows } = useChatInboxData();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [messageHits, setMessageHits] = React.useState<MessageSearchHitGroup[]>([]);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const searchGen = React.useRef(0);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: false,
      headerLeft: () => (
        <ChatHeaderBack
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('ChatInbox');
          }}
          accessibilityLabel="Back to Chats"
        />
      ),
    });
  }, [navigation]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const chatMatches = React.useMemo(() => {
    const s = debounced.toLowerCase();
    if (!s) return [];
    return rows
      .filter((r) => {
        const title = (r.member.convTitle || r.member.displayNameSnap || '').toLowerCase();
        const preview = (r.member.lastMessagePreview || '').toLowerCase();
        return title.includes(s) || preview.includes(s);
      })
      .slice(0, 20);
  }, [rows, debounced]);

  React.useEffect(() => {
    const gen = ++searchGen.current;
    if (!debounced) {
      setMessageHits([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    const seeds = rows.slice(0, 24).map((r) => ({
      conversationId: r.conversationId,
      title: (r.member.convTitle || r.member.displayNameSnap || 'Chat').trim() || 'Chat',
      avatarUrl: r.member.convAvatarUrl,
    }));
    void searchMessagesParallel({
      query: debounced,
      conversations: seeds,
      concurrency: 4,
      perConvLimit: 5,
      isCancelled: () => searchGen.current !== gen,
    }).then((hits) => {
      if (searchGen.current !== gen) return;
      setMessageHits(hits);
      setLoadingMessages(false);
    });
  }, [debounced, rows]);

  const listData = React.useMemo((): ListRow[] => {
    if (!debounced) return [];
    const out: ListRow[] = [];
    out.push({ type: 'section', id: 'sec-chats', title: 'Chats' });
    if (chatMatches.length === 0) {
      out.push({ type: 'empty', id: 'empty-chats', text: 'No matching chats' });
    } else {
      for (const r of chatMatches) {
        const title = (r.member.convTitle || r.member.displayNameSnap || 'Chat').trim() || 'Chat';
        out.push({
          type: 'chat',
          id: `chat-${r.conversationId}`,
          conversationId: r.conversationId,
          title,
          avatarUrl: r.member.convAvatarUrl,
          preview: r.member.lastMessagePreview,
        });
      }
    }
    out.push({ type: 'section', id: 'sec-msgs', title: 'Messages' });
    if (loadingMessages) {
      // Spinner rendered via ListHeaderComponent
    } else if (messageHits.length === 0) {
      out.push({ type: 'empty', id: 'empty-msgs', text: 'No matching messages' });
    } else {
      for (const g of messageHits) {
        for (const m of g.messages) {
          out.push({
            type: 'message',
            id: `msg-${g.convId}-${m.id}`,
            conversationId: g.convId,
            title: g.title,
            avatarUrl: g.avatarUrl,
            message: m,
          });
        }
      }
    }
    return out;
  }, [debounced, chatMatches, messageHits, loadingMessages]);

  const openConversation = (conversationId: string, threadTitle: string) => {
    navigation.navigate('Conversation', { conversationId, threadTitle });
  };

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search chats and messages"
          placeholderTextColor={colors.muted2}
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {!debounced ? (
        <View style={styles.idle}>
          <Text style={styles.idleTitle}>Search chats and messages</Text>
          <Text style={styles.idleSub}>
            Find people you message or jump into a past conversation by text.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            loadingMessages ? (
              <ActivityIndicator color={colors.moss} style={styles.loading} />
            ) : null
          }
          renderItem={({ item }) => {
            if (item.type === 'section') {
              return <Text style={styles.section}>{item.title}</Text>;
            }
            if (item.type === 'empty') {
              return <Text style={styles.emptyRow}>{item.text}</Text>;
            }
            const avatarUri = (item.avatarUrl ?? '').trim();
            const preview =
              item.type === 'chat' ? item.preview || ' ' : item.message.text || ' ';
            const time =
              item.type === 'message' ? formatTime(item.message.createdAt) : '';
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => openConversation(item.conversationId, item.title)}
              >
                <View style={styles.avatar}>
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Text style={styles.avatarInitial}>{item.title.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.body}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {time ? <Text style={styles.time}>{time}</Text> : null}
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {preview}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}
