import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { isFirebaseConfigured } from '../firebase/firebase';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useChatInboxData } from '../chat/ChatUnreadContext';
import { useChatNotifications } from '../chat/hooks/useChatNotifications';
import { ChatHeaderIconButton } from '../chat/components/ChatHeaderIconButton';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';

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
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
    offline: { padding: 24, textAlign: 'center' as const, color: c.muted, fontWeight: '600' as const },
    empty: { flex: 1, paddingHorizontal: 28, paddingTop: 18, gap: 14 },
    emptyTitle: { fontSize: 24, fontWeight: '900' as const, color: c.text },
    emptySub: { fontSize: 15, lineHeight: 22, color: c.muted, fontWeight: '600' as const },
    newGroup: { alignSelf: 'flex-start' as const, paddingVertical: 8 },
    newGroupText: { fontSize: 15, fontWeight: '800' as const, color: c.moss },
    headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const, marginRight: 2 },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 11,
      gap: 12,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 52, height: 52 },
    avatarInitial: { fontSize: 18, fontWeight: '800' as const, color: c.moss },
    rowBody: {
      flex: 1,
      minWidth: 0,
      paddingBottom: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
    },
    rowTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8, alignItems: 'center' as const },
    title: { flex: 1, fontSize: 16, fontWeight: '700' as const, color: c.text },
    titleUnread: { fontWeight: '900' as const },
    mutedText: { opacity: 0.55 },
    time: { fontSize: 12, fontWeight: '600' as const, color: c.muted2 },
    timeUnread: { color: c.moss, fontWeight: '800' as const },
    previewRow: { marginTop: 3, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    preview: { flex: 1, fontSize: 14, color: c.muted, fontWeight: '500' as const },
    previewUnread: { color: c.text2, fontWeight: '700' as const },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      backgroundColor: c.moss,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    badgeTxt: { color: c.white, fontSize: 11, fontWeight: '900' as const },
  }));
  const insets = useSafeAreaInsets();
  const tabBarClearance = floatingTabContentClearance(insets.bottom);
  const { rows, loading } = useChatInboxData();
  useChatNotifications();

  const listVersion = React.useMemo(
    () => rows.reduce((n, r) => n + r.member.unreadCount, 0) + rows.length,
    [rows]
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <ChatHeaderIconButton
            name="search-outline"
            onPress={() => navigation.navigate('ChatSearch')}
            accessibilityLabel="Search chats"
          />
          <ChatHeaderIconButton
            name="people-outline"
            onPress={() => navigation.navigate('NewGroup')}
            accessibilityLabel="New group"
          />
          <ChatHeaderIconButton
            name="create-outline"
            onPress={() => navigation.navigate('NewChat')}
            accessibilityLabel="New chat"
          />
        </View>
      ),
    });
  }, [navigation, styles.headerActions]);

  if (!isFirebaseConfigured()) {
    return (
      <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
        <Text style={styles.offline}>Connect Firebase to use chat.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.moss} />
        </View>
      ) : rows.length === 0 ? (
        <View style={[styles.empty, { paddingBottom: tabBarClearance }]}>
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
          extraData={listVersion}
          contentContainerStyle={{ paddingBottom: tabBarClearance, paddingTop: 4 }}
          renderItem={({ item }) => {
            const title =
              (item.member.convTitle || item.member.displayNameSnap || 'Chat').trim() || 'Chat';
            const muted = item.member.muted;
            const unread = item.member.unreadCount > 0;
            const avatarUri = (item.member.convAvatarUrl ?? '').trim();
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('Conversation', {
                    conversationId: item.conversationId,
                    threadTitle: title,
                  })
                }
              >
                <View style={styles.avatar}>
                  {avatarUri ? (
                    <Image
                      key={item.conversationId}
                      recyclingKey={item.conversationId}
                      source={{ uri: avatarUri }}
                      style={styles.avatarImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Text style={styles.avatarInitial}>{title.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[styles.title, unread && styles.titleUnread, muted && styles.mutedText]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    <Text style={[styles.time, unread && styles.timeUnread]}>
                      {formatTime(item.member.lastActivityAt)}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                      {item.member.lastMessagePreview || ' '}
                    </Text>
                    {unread ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeTxt}>
                          {item.member.unreadCount > 99 ? '99+' : item.member.unreadCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}
