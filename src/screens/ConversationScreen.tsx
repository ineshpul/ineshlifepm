import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { Swipeable } from 'react-native-gesture-handler';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { Screen } from '../components/Screen';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { useConversation } from '../chat/hooks/useConversation';
import { logEngagementMetric } from '../services/nativeAnalytics';
import { useMessages } from '../chat/hooks/useMessages';
import { useAttachments } from '../chat/hooks/useAttachments';
import { usePresence } from '../chat/hooks/usePresence';
import type { ChatMessage, ReplyRef } from '../chat/types';
import { CHAT_REACTION_EMOJIS } from '../chat/constants';
import {
  addReaction,
  editMessage,
  ensureMyInboxRow,
  removeReaction,
  reportMessage,
  setTyping,
  softDeleteForSelf,
  subscribeReactions,
  subscribeTyping,
} from '../services/chat/chatFirestore';
import { BlockReportModal } from '../chat/components/BlockReportModal';
import { ChatHeaderIconButton } from '../chat/components/ChatHeaderIconButton';
import { ChatScreenHeader } from '../chat/components/ChatScreenHeader';
import { ChatComposer } from '../chat/components/ChatComposer';
import { MessageBubble } from '../chat/components/MessageBubble';
import { setForegroundChatConversationId } from '../chat/activeConversationRef';
import { showError, showInfo } from '../utils/ui';
import { navigateToUserProfile } from '../navigation/navigationHelpers';

type Props = NativeStackScreenProps<ChatStackParamList, 'Conversation'>;

type MemberProfile = { username: string; photoUrl: string | null };

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function DateSep({ d }: { d: Date }) {
  const styles = useThemedStyles((colors) => ({
    dateSep: { alignItems: 'center', marginTop: 10, marginBottom: 6 },
    dateSepTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted2,
      overflow: 'hidden',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.cardTint,
    },
  }));
  return (
    <View style={styles.dateSep}>
      <Text style={styles.dateSepTxt}>
        {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      </Text>
    </View>
  );
}

export function ConversationScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  listEmptyWrap: {
    flexGrow: 1,
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  listEmptyTxt: { fontSize: 15, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  listContent: { paddingHorizontal: 14 },
  /** Empty / loading: center in the thread area. */
  listContentWhenEmpty: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  /** Short threads: pin bubbles to the bottom (Instagram-style); small top padding under header when scrolled up. */
  listContentWhenThread: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 6,
    paddingBottom: 10,
  },
  rowMsg: { marginBottom: 6, maxWidth: '88%' },
  rowMsgGroup: { maxWidth: '92%' },
  rowMsgCluster: { marginTop: -2 },
  rowMsgClusterStart: { marginTop: 8 },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  swipeReply: { justifyContent: 'center', paddingHorizontal: 12 },
  composerAvoid: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border2,
  },
  reactionBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  reactionTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  reactionEmoji: { fontSize: 28 },
  videoModal: { flex: 1, backgroundColor: colors.black, paddingTop: 48 },
  imageModal: { flex: 1, backgroundColor: colors.black, paddingTop: 48 },
  imageFull: { flex: 1, width: '100%' },
  videoClose: { padding: 16 },
  videoCloseTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  typingBanner: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.cardTint },
  typingTxt: { fontSize: 12, fontWeight: '800', color: colors.moss },
}));
  const { conversationId, threadTitle, pendingShare } = route.params;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const { conversation, members, myMember } = useConversation(conversationId, user?.uid);
  const { messages, loading, loadOlder, hasMore, loadingOlder, send, markRead } = useMessages(
    conversationId,
    user?.uid,
    user?.username
  );
  /** Newest first — pairs with `inverted` FlatList so latest sits by the composer (standard chat layout). */
  const displayMessages = React.useMemo(() => [...messages].reverse(), [messages]);
  const { pickAndUploadImage, pickAndUploadVideo, uploadProgress, busy } = useAttachments(
    conversationId,
    user?.uid
  );
  const { watchPresence } = usePresence(user?.uid);

  const [draft, setDraft] = React.useState('');
  const [replyTo, setReplyTo] = React.useState<ReplyRef | null>(null);
  const [reactionMsg, setReactionMsg] = React.useState<ChatMessage | null>(null);
  const [reportTarget, setReportTarget] = React.useState<ChatMessage | null>(null);
  const [typingUids, setTypingUids] = React.useState<string[]>([]);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Avoid a Firestore write on every key — that stalls the JS thread and makes typing feel laggy. */
  const typingSentAtRef = React.useRef(0);
  const [videoOpen, setVideoOpen] = React.useState<string | null>(null);
  const [imageOpen, setImageOpen] = React.useState<string | null>(null);
  const reactionsUnsubs = React.useRef<Record<string, () => void>>({});
  const [reactionMap, setReactionMap] = React.useState<
    Record<string, { emoji: string; count: number; mine?: boolean }[]>
  >({});
  const pendingShareHandled = React.useRef(false);
  const listRef = React.useRef<FlatList<ChatMessage>>(null);
  const nearBottomRef = React.useRef(true);
  const composerFocusedRef = React.useRef(false);
  const lastNewestMessageIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    pendingShareHandled.current = false;
    setReactionMap({});
    lastNewestMessageIdRef.current = null;
    nearBottomRef.current = true;
    typingSentAtRef.current = 0;
  }, [conversationId]);

  /** Keep newest messages visible when the keyboard opens (Instagram-style). */
  React.useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      }
    );
    return () => show.remove();
  }, []);

  /** Only attach reaction listeners for recent messages (each sub is a live query). */
  const messagesForReactions = React.useMemo(() => messages.slice(-18), [messages]);

  const dmPeer = React.useMemo(() => {
    if (conversation?.type !== 'dm' || !user?.uid) return null;
    return members.find((m) => m.memberUid !== user.uid) ?? null;
  }, [conversation?.type, members, user?.uid]);

  /** Canonical peer identity from `users/{peer}` — avoids wrong convTitle / convAvatar on member rows. */
  const [dmPeerUser, setDmPeerUser] = React.useState<{ username: string; photoUrl: string | null } | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !dmPeer?.memberUid) {
      setDmPeerUser(null);
      return;
    }
    const uref = doc(firestore(), 'users', dmPeer.memberUid);
    return onSnapshot(
      uref,
      (snap) => {
        const d = snap.data();
        const username = d?.username != null ? String(d.username).trim() : '';
        const photoUrl = d?.photoUrl != null && String(d.photoUrl).trim() !== '' ? String(d.photoUrl) : null;
        setDmPeerUser({ username, photoUrl });
      },
      () => setDmPeerUser(null)
    );
  }, [dmPeer?.memberUid]);

  /** Group member usernames + avatars so every bubble can show who is speaking. */
  const [memberProfiles, setMemberProfiles] = React.useState<Record<string, MemberProfile>>({});
  const membersKey = React.useMemo(
    () => members.map((m) => `${m.memberUid}:${m.displayNameSnap ?? ''}`).join('|'),
    [members]
  );

  React.useEffect(() => {
    if (!isFirebaseConfigured() || conversation?.type !== 'group' || members.length === 0) {
      setMemberProfiles({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        members.map(async (m) => {
          const fromSnap = (m.displayNameSnap ?? '').trim().replace(/^@+/u, '');
          try {
            const snap = await getDoc(doc(firestore(), 'users', m.memberUid));
            const d = snap.data() as Record<string, unknown> | undefined;
            const username =
              (d?.username != null ? String(d.username).trim() : '') || fromSnap || 'Member';
            const photoUrl =
              d?.photoUrl != null && String(d.photoUrl).trim() !== '' ? String(d.photoUrl) : null;
            return [m.memberUid, { username: username.replace(/^@+/u, ''), photoUrl }] as const;
          } catch {
            return [m.memberUid, { username: fromSnap || 'Member', photoUrl: null }] as const;
          }
        })
      );
      if (!cancelled) setMemberProfiles(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation?.type, membersKey]);

  const resolveMemberLabel = React.useCallback(
    (uid: string | undefined) => {
      if (!uid) return '';
      if (uid === user?.uid) return user?.username?.replace(/^@+/u, '') || 'you';
      const fromProfile = memberProfiles[uid]?.username;
      if (fromProfile) return fromProfile;
      const fromMember = members.find((m) => m.memberUid === uid)?.displayNameSnap;
      return (fromMember ?? '').replace(/^@+/u, '') || '';
    },
    [memberProfiles, members, user?.uid, user?.username]
  );

  const typingLabel = React.useMemo(() => {
    if (!typingUids.length) return '';
    const names = typingUids
      .map((uid) => resolveMemberLabel(uid))
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return 'Someone is typing…';
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return 'Several people are typing…';
  }, [typingUids, resolveMemberLabel]);

  const goBack = React.useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ChatInbox');
  }, [navigation]);

  React.useLayoutEffect(() => {
    // `conversation.name` is often stale or defaulted to "Chat" on older DM docs; `myMember.convTitle`
    // is the per-user denormalized thread label (peer name for DMs). Prefer those over the conv doc.
    const title =
      (myMember?.convTitle?.trim() ||
        threadTitle?.trim() ||
        conversation?.name?.trim() ||
        'Chat') ||
      'Chat';

    const openDmProfile = () => {
      if (!dmPeer) return;
      const raw = (
        dmPeerUser?.username ||
        myMember?.convTitle ||
        threadTitle ||
        dmPeer.displayNameSnap ||
        ''
      ).trim();
      const uname = raw.replace(/^@+/u, '');
      navigateToUserProfile(navigation, {
        uid: dmPeer.memberUid,
        username: uname || undefined,
      });
    };

    /**
     * DM member rows are per-viewer: `members/{myUid}.convAvatarUrl` is the *peer* photo for my inbox.
     * `dmPeer` is the *other* member’s row, whose `convAvatarUrl` is **my** photo (their view) — never use it here.
     */
    const dmAvatarUri =
      (dmPeerUser?.photoUrl && dmPeerUser.photoUrl.trim()) ||
      (myMember?.convAvatarUrl && String(myMember.convAvatarUrl).trim()) ||
      (conversation?.avatarUrl && String(conversation.avatarUrl).trim()) ||
      '';

    if (conversation?.type === 'dm' && dmPeer) {
      const handle =
        (dmPeerUser?.username && dmPeerUser.username.trim()) ||
        title.replace(/^@+/u, '').trim() ||
        'Chat';
      const showAt = handle.startsWith('@') ? handle : `@${handle.replace(/^@+/u, '')}`;
      navigation.setOptions({
        header: () => (
          <ChatScreenHeader
            title={showAt}
            onBack={goBack}
            backAccessibilityLabel="Back to Chats"
            centerTitle={false}
            titleNode={
              <Pressable
                onPress={openDmProfile}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${showAt} profile`}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.cardTint,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {dmAvatarUri ? (
                    <Image
                      key={`dm-av-${dmPeer.memberUid}-${dmAvatarUri}`}
                      recyclingKey={`${dmPeer.memberUid}|${dmAvatarUri}`}
                      source={{ uri: dmAvatarUri }}
                      style={{ width: 32, height: 32 }}
                      contentFit="cover"
                      transition={120}
                    />
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: '900', color: colors.text }}>
                      {showAt.replace(/^@/u, '').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                  {showAt}
                </Text>
              </Pressable>
            }
          />
        ),
      });
    } else {
      navigation.setOptions({
        header: () => (
          <ChatScreenHeader
            title={title}
            onBack={goBack}
            backAccessibilityLabel="Back to Chats"
            right={
              conversation?.type === 'group' ? (
                <ChatHeaderIconButton
                  name="information-circle-outline"
                  size={24}
                  onPress={() => navigation.navigate('GroupInfo', { conversationId })}
                  accessibilityLabel="Group info"
                />
              ) : undefined
            }
          />
        ),
      });
    }
  }, [
    navigation,
    goBack,
    colors.text,
    colors.cardTint,
    conversation?.name,
    conversation?.type,
    conversation?.avatarUrl,
    threadTitle,
    conversationId,
    myMember?.convTitle,
    myMember?.convAvatarUrl,
    dmPeer,
    dmPeerUser?.username,
    dmPeerUser?.photoUrl,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      setForegroundChatConversationId(conversationId);
      void markRead();
      let cancelled = false;
      InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      });
      return () => {
        cancelled = true;
        setForegroundChatConversationId(null);
      };
    }, [conversationId, markRead])
  );

  // If the screen focused before messages loaded, mark read once we have a last message id.
  React.useEffect(() => {
    if (loading) return;
    if (messages.length === 0) return;
    void markRead();
  }, [loading, messages.length, markRead]);

  React.useEffect(() => {
    if (!user?.uid || !myMember) return;
    void ensureMyInboxRow({ myUid: user.uid, conversationId });
    // Intentionally not depending on `myMember` object identity (updates often); re-run when conv or user changes.
  }, [conversationId, user?.uid, myMember != null]);

  React.useEffect(() => {
    if (!pendingShare || pendingShareHandled.current || !user?.uid) return;
    pendingShareHandled.current = true;
    void (async () => {
      try {
        await send({ sharePost: pendingShare });
        navigation.setParams({ pendingShare: undefined });
      } catch (e) {
        pendingShareHandled.current = false;
        showError('Could not share clip', e);
      }
    })();
  }, [pendingShare, user?.uid, send, navigation]);

  React.useEffect(() => {
    if (!user?.uid) return;
    return subscribeTyping(conversationId, user.uid, setTypingUids);
  }, [conversationId, user?.uid]);

  React.useEffect(() => {
    if (!user?.uid) return;
    const unsubs: (() => void)[] = [];
    for (const m of members) {
      if (m.memberUid !== user.uid) {
        unsubs.push(watchPresence(m.memberUid));
      }
    }
    return () => {
      for (const u of unsubs) u();
    };
  }, [members, user?.uid, watchPresence]);

  /** Keep pinned to newest when new messages arrive while you are following the thread. */
  React.useEffect(() => {
    const newestId = displayMessages[0]?.id ?? null;
    const prevNewest = lastNewestMessageIdRef.current;
    if (newestId === prevNewest) return;
    lastNewestMessageIdRef.current = newestId;
    if (!newestId || prevNewest === null) return;
    if (nearBottomRef.current || composerFocusedRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    }
  }, [displayMessages]);

  React.useEffect(() => {
    return () => {
      Object.values(reactionsUnsubs.current).forEach((u) => u());
      reactionsUnsubs.current = {};
    };
  }, [conversationId]);

  React.useEffect(() => {
    if (!conversationId || !user?.uid) return;
    const uid = user.uid;
    const activeIds = new Set(messagesForReactions.map((m) => m.id));
    for (const id of Object.keys(reactionsUnsubs.current)) {
      if (!activeIds.has(id)) {
        reactionsUnsubs.current[id]?.();
        delete reactionsUnsubs.current[id];
      }
    }
    for (const m of messagesForReactions) {
      if (reactionsUnsubs.current[m.id]) continue;
      reactionsUnsubs.current[m.id] = subscribeReactions(conversationId, m.id, (rows) => {
        const map = new Map<string, number>();
        const mine = new Set<string>();
        rows.forEach((r) => {
          map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
          if (r.userId === uid) mine.add(r.emoji);
        });
        const arr = [...map.entries()].map(([emoji, count]) => ({ emoji, count, mine: mine.has(emoji) }));
        setReactionMap((prev) => ({ ...prev, [m.id]: arr }));
      });
    }
  }, [conversationId, user?.uid, messagesForReactions]);

  const onListScroll = React.useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // Inverted list: offset near 0 means user is at the newest end (by the composer).
    nearBottomRef.current = y < 120;
  }, []);

  const onTyping = React.useCallback(() => {
    if (!user?.uid) return;
    const now = Date.now();
    if (now - typingSentAtRef.current > 1400) {
      typingSentAtRef.current = now;
      void setTyping(conversationId, user.uid, true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      void setTyping(conversationId, user.uid, false);
      typingTimer.current = null;
    }, 2200);
  }, [conversationId, user?.uid]);

  const onSend = () => {
    const text = draft.trim();
    if (!text && !replyTo) return;
    const reply = replyTo;
    setDraft('');
    setReplyTo(null);
    void send({ text, replyTo: reply ?? undefined })
      .then(() => {
        void logEngagementMetric('chatting', { conversation_id: conversationId });
        void markRead();
      })
      .catch((e) => {
        setDraft(text);
        setReplyTo(reply);
        showError('Could not send', e);
      });
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.senderId === user?.uid;
    const older = displayMessages[index + 1];
    const newer = displayMessages[index - 1];
    const showDate =
      !older ||
      !older.createdAt ||
      !item.createdAt ||
      !sameDay(older.createdAt.toDate(), item.createdAt.toDate());
    const sameSenderCluster =
      Boolean(newer && newer.senderId === item.senderId && !showDate) &&
      !(
        newer?.deletedForEveryone ||
        (newer?.deletedForSelfUids && user?.uid && newer.deletedForSelfUids.includes(user.uid))
      );
    const isClusterStart =
      !older ||
      older.senderId !== item.senderId ||
      showDate ||
      Boolean(
        older.deletedForEveryone ||
          (older.deletedForSelfUids && user?.uid && older.deletedForSelfUids.includes(user.uid))
      );
    const isGroup = conversation?.type === 'group';
    const senderLabel = isGroup ? resolveMemberLabel(item.senderId) : '';
    const senderAvatarUrl = isGroup ? memberProfiles[item.senderId]?.photoUrl ?? null : null;
    const replySenderLabel = item.replyTo
      ? resolveMemberLabel(item.replyTo.senderId) || item.replyTo.senderUsername
      : undefined;
    const hidden =
      item.deletedForEveryone ||
      (item.deletedForSelfUids && user?.uid && item.deletedForSelfUids.includes(user.uid));
    if (hidden) return <View />;

    return (
      <View>
        {showDate && item.createdAt ? <DateSep d={item.createdAt.toDate()} /> : null}
        <Swipeable
          friction={2}
          overshootRight={false}
          activeOffsetX={[-20, 20]}
          failOffsetY={[-12, 12]}
          renderRightActions={() => (
            <View style={styles.swipeReply}>
              <TouchableOpacity
                onPress={() =>
                  setReplyTo({
                    messageId: item.id,
                    textSnippet: item.text ?? '',
                    senderId: item.senderId,
                    senderUsername: senderLabel || undefined,
                  })
                }
              >
                <Ionicons name="return-down-back" size={22} color={colors.moss} />
              </TouchableOpacity>
            </View>
          )}
        >
          <View
            style={[
              styles.rowMsg,
              isGroup && styles.rowMsgGroup,
              mine ? styles.rowMine : styles.rowTheirs,
              sameSenderCluster && styles.rowMsgCluster,
              isGroup && !mine && isClusterStart && styles.rowMsgClusterStart,
            ]}
          >
            <MessageBubble
              message={item}
              mine={mine}
              myUid={user?.uid}
              groupLayout={isGroup}
              showSenderMeta={Boolean(isGroup && !mine && isClusterStart)}
              senderLabel={senderLabel}
              senderAvatarUrl={senderAvatarUrl}
              replySenderLabel={replySenderLabel}
              reactions={reactionMap[item.id]}
              onLongPress={() => {
                Alert.alert('Message', undefined, [
                  {
                    text: 'Reply',
                    onPress: () =>
                      setReplyTo({
                        messageId: item.id,
                        textSnippet: item.text ?? '',
                        senderId: item.senderId,
                        senderUsername: senderLabel || undefined,
                      }),
                  },
                  { text: 'React', onPress: () => setReactionMsg(item) },
                  ...(mine
                    ? [
                        {
                          text: 'Edit',
                          onPress: () => {
                            if (Platform.OS === 'ios') {
                              Alert.prompt('Edit message', '', async (t) => {
                                if (!t || !user?.uid) return;
                                try {
                                  await editMessage(conversationId, item.id, user.uid, t);
                                } catch (e) {
                                  showError('Edit failed', e);
                                }
                              });
                            } else {
                              showInfo(
                                'Edit',
                                'Inline edit is available on iOS for now; long-press again on iPhone or re-send.'
                              );
                            }
                          },
                        } as const,
                        {
                          text: 'Delete for me',
                          style: 'destructive' as const,
                          onPress: () => {
                            if (!user?.uid) return;
                            void softDeleteForSelf(conversationId, item.id, user.uid);
                          },
                        },
                      ]
                    : []),
                  {
                    text: 'Report',
                    style: 'destructive' as const,
                    onPress: () => setReportTarget(item),
                  },
                  { text: 'Cancel', style: 'cancel' as const },
                ]);
              }}
              onOpenVideo={setVideoOpen}
              onOpenImage={setImageOpen}
              onToggleReaction={(emoji, isMine) => {
                if (!user?.uid) return;
                void (async () => {
                  try {
                    if (isMine) {
                      await removeReaction(conversationId, item.id, user.uid, emoji);
                    } else {
                      await addReaction(conversationId, item.id, user.uid, emoji);
                    }
                  } catch (e) {
                    showError('Reaction failed', e);
                  }
                })();
              }}
            />
          </View>
        </Swipeable>
      </View>
    );
  };

  const listEmpty = React.useMemo(() => {
    if (loading && !messages.length) {
      return (
        <View style={styles.listEmptyWrap}>
          <ActivityIndicator color={colors.moss} size="large" />
        </View>
      );
    }
    if (!messages.length) {
      return (
        <View style={styles.listEmptyWrap}>
          <Text style={styles.listEmptyTxt}>No messages yet — say hi.</Text>
        </View>
      );
    }
    return null;
  }, [loading, messages.length]);

  const composerDock = (
    <ChatComposer
      draft={draft}
      onChangeDraft={(t) => {
        setDraft(t);
        onTyping();
      }}
      replyTo={replyTo}
      onClearReply={() => setReplyTo(null)}
      onSend={onSend}
      onPickImage={() => {
        void (async () => {
          try {
            const att = await pickAndUploadImage();
            if (att) await send({ attachments: [att], replyTo: replyTo ?? undefined });
          } catch (e) {
            showError('Upload failed', e);
          }
        })();
      }}
      onPickVideo={() => {
        void (async () => {
          try {
            const att = await pickAndUploadVideo();
            if (att) await send({ attachments: [att], replyTo: replyTo ?? undefined });
          } catch (e) {
            showError('Video failed', e);
          }
        })();
      }}
      onFocus={() => {
        composerFocusedRef.current = true;
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      }}
      onBlur={() => {
        composerFocusedRef.current = false;
        if (user?.uid) void setTyping(conversationId, user.uid, false);
      }}
      uploadBusy={busy}
      uploadProgress={uploadProgress}
      bottomPad={Math.max(insets.bottom, 10)}
    />
  );

  const listContentStyle = React.useMemo(
    () => [
      styles.listContent,
      messages.length === 0 ? styles.listContentWhenEmpty : styles.listContentWhenThread,
    ],
    [messages.length]
  );

  return (
    <Screen style={styles.screen} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        enabled
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        {typingUids.length > 0 ? (
          <View style={styles.typingBanner}>
            <Text style={styles.typingTxt}>{typingLabel || 'Someone is typing…'}</Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          style={styles.flex}
          inverted
          data={displayMessages}
          extraData={reactionMap}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          ListEmptyComponent={listEmpty}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={80}
          removeClippedSubviews={Platform.OS === 'android'}
          onScroll={onListScroll}
          scrollEventThrottle={32}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onEndReached={() => {
            if (hasMore && !loadingOlder) void loadOlder();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={colors.moss} style={{ padding: 12 }} /> : null
          }
          contentContainerStyle={listContentStyle}
        />
        <View style={styles.composerAvoid}>{composerDock}</View>
      </KeyboardAvoidingView>

      <Modal visible={!!reactionMsg} transparent animationType="fade">
        <Pressable style={styles.reactionBackdrop} onPress={() => setReactionMsg(null)}>
          <View style={styles.reactionTray}>
            {CHAT_REACTION_EMOJIS.map((em) => (
              <TouchableOpacity
                key={em}
                onPress={async () => {
                  if (!reactionMsg || !user?.uid) return;
                  try {
                    const rows = reactionMsg ? reactionMap[reactionMsg.id] : undefined;
                    const already = Boolean(rows?.some((r) => r.emoji === em && r.mine));
                    if (already) {
                      await removeReaction(conversationId, reactionMsg.id, user.uid, em);
                    } else {
                      await addReaction(conversationId, reactionMsg.id, user.uid, em);
                    }
                  } catch (e) {
                    showError('Reaction failed', e);
                  }
                  setReactionMsg(null);
                }}
              >
                <Text style={styles.reactionEmoji}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!videoOpen} animationType="slide">
        <View style={styles.videoModal}>
          <TouchableOpacity style={styles.videoClose} onPress={() => setVideoOpen(null)}>
            <Text style={styles.videoCloseTxt}>Close</Text>
          </TouchableOpacity>
          {videoOpen ? (
            <Video source={{ uri: videoOpen }} style={{ flex: 1 }} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />
          ) : null}
        </View>
      </Modal>

      <Modal visible={!!imageOpen} animationType="fade" transparent onRequestClose={() => setImageOpen(null)}>
        <View style={styles.imageModal}>
          <TouchableOpacity style={styles.videoClose} onPress={() => setImageOpen(null)}>
            <Text style={styles.videoCloseTxt}>Close</Text>
          </TouchableOpacity>
          {imageOpen ? (
            <Image source={{ uri: imageOpen }} style={styles.imageFull} contentFit="contain" transition={200} />
          ) : null}
        </View>
      </Modal>

      <BlockReportModal
        visible={!!reportTarget}
        mode="report"
        onClose={() => setReportTarget(null)}
        onConfirm={(reason) => {
          if (!user?.uid || !reportTarget) return;
          void reportMessage({
            reporterId: user.uid,
            conversationId,
            messageId: reportTarget.id,
            reason: reason || 'unspecified',
          });
          setReportTarget(null);
        }}
      />
    </Screen>
  );
}
