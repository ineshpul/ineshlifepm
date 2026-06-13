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
  TextInput,
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
import { doc, onSnapshot } from 'firebase/firestore';
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
import { setForegroundChatConversationId } from '../chat/activeConversationRef';
import { showError, showInfo } from '../utils/ui';
import { navigateToUserProfile } from '../navigation/navigationHelpers';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';

type Props = NativeStackScreenProps<ChatStackParamList, 'Conversation'>;

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
  rowMsgCluster: { marginTop: -2 },
  rowMine: { alignSelf: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.cardTint,
  },
  bubbleMine: { backgroundColor: 'rgba(76, 175, 80, 0.22)', borderColor: 'rgba(76, 175, 80, 0.35)' },
  bubbleTheirs: { backgroundColor: colors.card, borderColor: colors.border2 },
  bubbleTxt: { fontSize: 16, fontWeight: '600', color: colors.text },
  bubbleTxtMine: { color: colors.text },
  edited: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.muted2 },
  replyPreview: { marginBottom: 4, padding: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)' },
  replyPrevTxt: { fontSize: 12, fontWeight: '600', color: colors.muted },
  shareTag: { fontSize: 11, fontWeight: '900', color: colors.moss, letterSpacing: 0.6 },
  shareTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  shareVideo: { width: 220, height: 280, borderRadius: 12, backgroundColor: colors.black },
  thumb: { width: 220, height: 140, borderRadius: 12, backgroundColor: colors.black },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  dur: { marginTop: 4, fontSize: 12, fontWeight: '800', color: colors.muted },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionChipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  reactionChip: { fontSize: 13, fontWeight: '700' },
  dateSep: { alignItems: 'center', marginTop: 10, marginBottom: 6 },
  dateSepTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted2,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  swipeReply: { justifyContent: 'center', paddingHorizontal: 12 },
  composerAvoid: {
    backgroundColor: colors.card,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 10 },
    }),
  },
  composerDock: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
    gap: 8,
  },
  replyBarTxt: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.muted },
  uploadBar: { padding: 8, backgroundColor: colors.cardTint },
  uploadTxt: { fontWeight: '700', color: colors.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
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
  const tabBarClearance = floatingTabContentClearance(insets.bottom);
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const { conversation, members, myMember } = useConversation(conversationId, user?.uid);
  const { messages, loading, loadOlder, hasMore, loadingOlder, send, markRead } = useMessages(
    conversationId,
    user?.uid
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
        title: undefined,
        headerTitleAlign: 'center',
        headerTitle: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>
            <Pressable
              onPress={openDmProfile}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 280 }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${showAt} profile`}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
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
                    style={{ width: 28, height: 28 }}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '900', color: colors.text }}>
                    {showAt.replace(/^@/u, '').slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                {showAt}
              </Text>
            </Pressable>
          </View>
        ),
        headerRight: () => <View style={{ width: 8 }} />,
      });
    } else {
      navigation.setOptions({
        title,
        headerTitleAlign: undefined,
        headerTitle: undefined,
        headerRight: () =>
          conversation?.type === 'group' ? (
            <TouchableOpacity
              style={{ paddingHorizontal: 8, marginRight: 4 }}
              onPress={() => navigation.navigate('GroupInfo', { conversationId })}
            >
              <Ionicons name="information-circle-outline" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 8 }} />
          ),
      });
    }
  }, [
    navigation,
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
    const hidden =
      item.deletedForEveryone ||
      (item.deletedForSelfUids && user?.uid && item.deletedForSelfUids.includes(user.uid));
    if (hidden) return <View />;

    const bubble = (
      <Pressable
        onLongPress={() => {
          Alert.alert('Message', undefined, [
            { text: 'Reply', onPress: () => setReplyTo({ messageId: item.id, textSnippet: item.text ?? '', senderId: item.senderId }) },
            {
              text: 'React',
              onPress: () => setReactionMsg(item),
            },
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
                        showInfo('Edit', 'Inline edit is available on iOS for now; long-press again on iPhone or re-send.');
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
      >
        {item.replyTo ? (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPrevTxt} numberOfLines={2}>
              Replying to {item.replyTo.senderId === user?.uid ? 'you' : 'message'}: {item.replyTo.textSnippet}
            </Text>
          </View>
        ) : null}
        {item.sharePost ? (
          <TouchableOpacity
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
            onPress={() => item.sharePost?.videoUrl && setVideoOpen(item.sharePost.videoUrl)}
          >
            <Text style={styles.shareTag}>Shared leap</Text>
            <Text style={styles.shareTitle}>{item.sharePost.title || 'Video'}</Text>
            {item.sharePost.videoUrl ? (
              <Video
                source={{ uri: item.sharePost.videoUrl }}
                style={styles.shareVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                useNativeControls
              />
            ) : null}
          </TouchableOpacity>
        ) : null}
        {item.attachments?.map((a) =>
          a.kind === 'video' ? (
            <TouchableOpacity
              key={a.id}
              style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              onPress={() => setVideoOpen(a.downloadUrl)}
            >
              {a.thumbnailUrl ? (
                <Image source={{ uri: a.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPh]}>
                  <Ionicons name="play-circle" size={40} color={colors.white} />
                </View>
              )}
              <Text style={styles.dur}>{a.durationSec ? `${a.durationSec}s` : 'Video'}</Text>
            </TouchableOpacity>
          ) : a.kind === 'image' ? (
            <TouchableOpacity
              key={a.id}
              style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              activeOpacity={0.85}
              onPress={() => setImageOpen(a.downloadUrl)}
              accessibilityRole="image"
              accessibilityLabel="View photo full screen"
            >
              <Image source={{ uri: a.downloadUrl }} style={styles.thumb} contentFit="cover" />
            </TouchableOpacity>
          ) : null
        )}
        {item.text ? (
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{item.text}</Text>
            {item.editedAt ? <Text style={styles.edited}>Edited</Text> : null}
          </View>
        ) : null}
        {reactionMap[item.id]?.length ? (
          <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
            {reactionMap[item.id]!.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={styles.reactionChipBtn}
                activeOpacity={0.75}
                onPress={() => {
                  if (!user?.uid) return;
                  void (async () => {
                    try {
                      if (r.mine) {
                        await removeReaction(conversationId, item.id, user.uid, r.emoji);
                      } else {
                        await addReaction(conversationId, item.id, user.uid, r.emoji);
                      }
                    } catch (e) {
                      showError('Reaction failed', e);
                    }
                  })();
                }}
              >
                <Text style={styles.reactionChip}>
                  {r.emoji} {r.count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </Pressable>
    );

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
                  setReplyTo({ messageId: item.id, textSnippet: item.text ?? '', senderId: item.senderId })
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
              mine ? styles.rowMine : styles.rowTheirs,
              sameSenderCluster && styles.rowMsgCluster,
            ]}
          >
            {bubble}
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
    <View style={styles.composerDock}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarTxt} numberOfLines={2}>
            Replying to: {replyTo.textSnippet}
          </Text>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ) : null}
      {busy ? (
        <View style={styles.uploadBar}>
          <Text style={styles.uploadTxt}>Uploading… {uploadProgress}%</Text>
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: tabBarClearance }]}>
        <TouchableOpacity
          onPress={async () => {
            try {
              const att = await pickAndUploadImage();
              if (att) await send({ attachments: [att], replyTo: replyTo ?? undefined });
            } catch (e) {
              showError('Upload failed', e);
            }
          }}
        >
          <Ionicons name="image-outline" size={24} color={colors.moss} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            try {
              const att = await pickAndUploadVideo();
              if (att) await send({ attachments: [att], replyTo: replyTo ?? undefined });
            } catch (e) {
              showError('Video failed', e);
            }
          }}
        >
          <Ionicons name="videocam-outline" size={24} color={colors.moss} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor={colors.muted2}
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            onTyping();
          }}
          onFocus={() => {
            composerFocusedRef.current = true;
            requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
          }}
          onBlur={() => {
            composerFocusedRef.current = false;
            if (user?.uid) void setTyping(conversationId, user.uid, false);
          }}
          multiline
          scrollEnabled
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={onSend}>
          <Ionicons name="send" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const listContentStyle = React.useMemo(
    () => [
      styles.listContent,
      messages.length === 0 ? styles.listContentWhenEmpty : styles.listContentWhenThread,
    ],
    [messages.length]
  );

  return (
    <Screen style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        enabled
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        {typingUids.length > 0 ? (
          <View style={styles.typingBanner}>
            <Text style={styles.typingTxt}>Someone is typing…</Text>
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
