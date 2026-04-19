import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { isFirebaseConfigured } from '../firebase/firebase';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversations } from '../chat/hooks/useConversations';
import { useChatNotifications } from '../chat/hooks/useChatNotifications';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatInbox'>;

function formatTime(ts: { toMillis?: () => number } | null | undefined) {
  if (!ts?.toMillis) return '';
  const ms = ts.toMillis();
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ChatInboxScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { rows, loading, totalUnread } = useConversations(user?.uid);
  useChatNotifications();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 4 }}>
          <TouchableOpacity onPress={() => navigation.navigate('ChatSearch')} accessibilityLabel="Search chats">
            <Ionicons name="search-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('NewChat')} accessibilityLabel="New chat">
            <Ionicons name="create-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  if (!isFirebaseConfigured()) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.offline}>Connect Firebase to use chat.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      {totalUnread > 0 ? (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>
            {totalUnread} unread {totalUnread === 1 ? 'conversation' : 'conversations'}
          </Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Start something real</Text>
          <Text style={styles.emptySub}>
            Message friends, share today’s leap, and keep groups buzzing — chats stay pinned by recent activity.
          </Text>
          <PrimaryButton title="New message" variant="green" onPress={() => navigation.navigate('NewChat')} />
          <TouchableOpacity style={styles.newGroup} onPress={() => navigation.navigate('NewGroup')}>
            <Text style={styles.newGroupText}>Create a group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.conversationId}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => {}} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const title = item.member.convTitle || 'Chat';
            const muted = item.member.muted;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  navigation.navigate('Conversation', {
                    conversationId: item.conversationId,
                    threadTitle: title,
                  })
                }
              >
                <View style={styles.avatar}>
                  <Ionicons name="chatbubbles-outline" size={22} color={colors.moss} />
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.title, muted && styles.mutedText]} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.time}>{formatTime(item.member.lastActivityAt)}</Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {item.member.lastMessagePreview || ' '}
                  </Text>
                </View>
                {item.member.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>{item.member.unreadCount > 99 ? '99+' : item.member.unreadCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offline: { padding: 24, textAlign: 'center', color: colors.muted, fontWeight: '600' },
  empty: { flex: 1, paddingHorizontal: 28, paddingTop: 48, gap: 14 },
  emptyTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  emptySub: { fontSize: 15, lineHeight: 22, color: colors.muted, fontWeight: '600' },
  newGroup: { alignSelf: 'flex-start', paddingVertical: 8 },
  newGroupText: { fontSize: 15, fontWeight: '800', color: colors.moss },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  mutedText: { opacity: 0.55 },
  time: { fontSize: 12, fontWeight: '700', color: colors.muted2 },
  preview: { marginTop: 4, fontSize: 14, color: colors.muted, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { color: colors.white, fontSize: 11, fontWeight: '900' },
  unreadBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.cardTint,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadBannerText: { fontSize: 13, fontWeight: '800', color: colors.text },
});
