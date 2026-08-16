import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { isFirebaseConfigured } from '../firebase/firebase';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useChatInboxData } from '../chat/ChatUnreadContext';
import { useChatNotifications } from '../chat/hooks/useChatNotifications';
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
    screen: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
    offline: { padding: 24, textAlign: 'center' as const, color: c.muted, fontWeight: '600' as const },
    header: {
      paddingTop: 14,
      paddingBottom: 18,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    headerTitle: {
      fontFamily: typography.displayExtraBold,
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: -1.1,
      color: c.text,
    },
    headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: c.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    composeButton: { backgroundColor: c.green, borderColor: c.green },
    search: {
      height: 46,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: c.card,
      paddingHorizontal: 14,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginBottom: 20,
    },
    searchText: { fontFamily: typography.bodyMedium, fontSize: 14, color: c.muted2 },
    sectionLabel: {
      marginTop: 2,
      marginBottom: 12,
      fontFamily: typography.bodyBold,
      fontSize: 11.5,
      letterSpacing: 1.5,
      color: c.muted2,
    },
    empty: { flex: 1, paddingTop: 20, gap: 14 },
    emptyTitle: { fontFamily: typography.displayExtraBold, fontSize: 26, color: c.text },
    emptySub: { fontFamily: typography.bodySemiBold, fontSize: 15, lineHeight: 22, color: c.muted },
    newGroup: { alignSelf: 'flex-start' as const, paddingVertical: 8 },
    newGroupText: { fontFamily: typography.bodyBold, fontSize: 15, color: c.moss },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 14,
      paddingVertical: 16,
      gap: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: c.card,
      marginBottom: 12,
    },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 20,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 54, height: 54 },
    avatarInitial: { fontFamily: typography.bodyBold, fontSize: 18, color: c.moss },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8, alignItems: 'center' as const },
    title: { flex: 1, fontFamily: typography.bodySemiBold, fontSize: 15.5, color: c.text },
    titleUnread: { fontFamily: typography.bodyBold },
    mutedText: { opacity: 0.55 },
    time: { fontFamily: typography.bodySemiBold, fontSize: 11.5, color: c.muted2 },
    timeUnread: { color: c.moss, fontFamily: typography.bodyBold },
    previewRow: { marginTop: 3, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    preview: { flex: 1, fontFamily: typography.bodyMedium, fontSize: 13.5, color: c.muted },
    previewUnread: { color: c.green, fontFamily: typography.bodySemiBold },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 6,
      backgroundColor: c.green,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    badgeTxt: { color: c.white, fontFamily: typography.bodyExtraBold, fontSize: 11 },
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
      headerShown: false,
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('NewGroup')}
            accessibilityRole="button"
            accessibilityLabel="Create group"
          >
            <Ionicons name="people-outline" size={19} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.composeButton]}
            onPress={() => navigation.navigate('NewChat')}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <Ionicons name="add" size={23} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={styles.search}
        onPress={() => navigation.navigate('ChatSearch')}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Search chats"
      >
        <Ionicons name="search-outline" size={18} color={colors.muted2} />
        <Text style={styles.searchText}>Search</Text>
      </TouchableOpacity>
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
          showsVerticalScrollIndicator={false}
          keyExtractor={(r) => r.conversationId}
          extraData={listVersion}
          ListHeaderComponent={<Text style={styles.sectionLabel}>MESSAGES</Text>}
          contentContainerStyle={{ paddingBottom: tabBarClearance }}
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
