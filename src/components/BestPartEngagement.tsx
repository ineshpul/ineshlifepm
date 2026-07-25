import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { EngagementCommentComposer } from './EngagementCommentComposer';
import {
  EngagementCommentRow,
  type ReplyTargetPayload,
} from './EngagementCommentRow';
import { EngagementThreadCollapseRow } from './EngagementThreadCollapseRow';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { toggleBestPartLike } from '../services/bestPartLikes';
import { resolveMentionUsernames } from '../services/mentionLookup';
import { createInAppNotification } from '../services/social';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { VideoComment } from '../types/videoComment';
import { parseMentionUsernames } from '../utils/commentMentions';
import {
  buildThreadDisplayList,
  flattenCommentsForThread,
  type ThreadDisplayRow,
} from '../utils/commentThread';
import { showError } from '../utils/ui';

type Props = {
  bestPartId: string;
  ownerUid: string;
  viewerUid?: string;
  viewerUsername: string;
  initialLikesCount?: number;
  initialCommentsCount?: number;
};

function mapCommentDoc(id: string, data: Record<string, unknown>): VideoComment {
  const at =
    data?.createdAt &&
    typeof data.createdAt === 'object' &&
    'toMillis' in data.createdAt &&
    typeof (data.createdAt as { toMillis: () => number }).toMillis === 'function'
      ? (data.createdAt as { toMillis: () => number }).toMillis()
      : 0;
  const mentionedUsersRaw = Array.isArray(data?.mentionedUsers) ? data.mentionedUsers : [];
  const mentionedUsers = mentionedUsersRaw
    .map((row: unknown) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const uid = String(r.uid ?? '').trim();
      const username = String(r.username ?? '').trim();
      if (!uid || !username) return null;
      return { uid, username };
    })
    .filter(Boolean) as { uid: string; username: string }[];

  return {
    id,
    uid: String(data?.uid ?? ''),
    username: String(data?.username ?? 'user'),
    text: String(data?.text ?? ''),
    at,
    replyToCommentId:
      data?.replyToCommentId != null ? String(data.replyToCommentId) : undefined,
    replyToUid: data?.replyToUid != null ? String(data.replyToUid) : undefined,
    replyToUsername:
      data?.replyToUsername != null ? String(data.replyToUsername) : undefined,
    replyPreview: data?.replyPreview != null ? String(data.replyPreview) : undefined,
    mentionedUsers: mentionedUsers.length ? mentionedUsers : undefined,
  };
}

export function BestPartEngagement({
  bestPartId,
  ownerUid,
  viewerUid,
  viewerUsername,
  initialLikesCount = 0,
  initialCommentsCount = 0,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [liked, setLiked] = React.useState(false);
  const [likeBusy, setLikeBusy] = React.useState(false);
  const [likesCount, setLikesCount] = React.useState(initialLikesCount);
  const [commentsCount, setCommentsCount] = React.useState(initialCommentsCount);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [comments, setComments] = React.useState<VideoComment[]>([]);
  const [commentsReady, setCommentsReady] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const draftRef = React.useRef('');
  const [replyTarget, setReplyTarget] = React.useState<ReplyTargetPayload | null>(null);
  const [sending, setSending] = React.useState(false);
  const [deletingCommentId, setDeletingCommentId] = React.useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = React.useState<Record<string, boolean>>({});
  const postInFlightRef = React.useRef(false);

  const styles = useThemedStyles((c) => ({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 18,
      marginTop: 10,
    },
    action: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    count: { fontSize: 14, fontWeight: '800' as const, color: c.text },
    sheet: {
      flex: 1,
      justifyContent: 'flex-end' as const,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheetCard: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: '78%' as const,
      paddingBottom: Math.max(insets.bottom, 10),
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
    },
    sheetHead: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    sheetTitle: { fontSize: 17, fontWeight: '800' as const, color: c.text },
    listPad: { paddingHorizontal: 14, paddingBottom: 8 },
    empty: {
      paddingVertical: 36,
      alignItems: 'center' as const,
      gap: 8,
    },
    emptyText: { color: c.muted2, fontWeight: '600' as const, fontSize: 14 },
  }));

  React.useEffect(() => {
    setLikesCount(initialLikesCount);
    setCommentsCount(initialCommentsCount);
  }, [bestPartId, initialLikesCount, initialCommentsCount]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid || !bestPartId) return;
    let unsubPost: (() => void) | undefined;
    let unsubLike: (() => void) | undefined;
    let cancelled = false;
    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        unsubPost = onSnapshot(
          doc(firestore(), 'bestParts', bestPartId),
          (snap) => {
            if (!snap.exists()) return;
            const d = snap.data() as Record<string, unknown>;
            const lc = Number(d.likesCount ?? 0);
            const cc = Number(d.commentsCount ?? 0);
            setLikesCount(Number.isFinite(lc) ? lc : 0);
            setCommentsCount(Number.isFinite(cc) ? cc : 0);
          },
          () => undefined
        );
        unsubLike = onSnapshot(
          doc(firestore(), 'bestParts', bestPartId, 'likes', viewerUid),
          (snap) => setLiked(snap.exists()),
          () => setLiked(false)
        );
      });
    return () => {
      cancelled = true;
      unsubPost?.();
      unsubLike?.();
    };
  }, [bestPartId, viewerUid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid || !commentsOpen) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    setCommentsReady(false);
    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        const q = query(
          collection(firestore(), 'bestParts', bestPartId, 'comments'),
          orderBy('createdAt', 'desc'),
          limit(80)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            setComments(
              snap.docs.map((d) => mapCommentDoc(d.id, d.data() as Record<string, unknown>))
            );
            setCommentsReady(true);
          },
          () => {
            setComments([]);
            setCommentsReady(true);
          }
        );
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [bestPartId, viewerUid, commentsOpen]);

  const threaded = React.useMemo(
    () => buildThreadDisplayList(flattenCommentsForThread(comments), expandedThreads),
    [comments, expandedThreads]
  );

  const onToggleLike = async () => {
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to like moments.'));
      return;
    }
    if (likeBusy) return;
    const nextLiked = !liked;
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(nextLiked);
    setLikesCount(Math.max(0, prevCount + (nextLiked ? 1 : -1)));
    setLikeBusy(true);
    try {
      const res = await toggleBestPartLike({
        bestPartId,
        viewerUid,
        viewerUsername,
        liked: nextLiked,
      });
      if (!res.ok) throw new Error('Like could not be saved.');
      setLiked(res.liked);
      setLikesCount(Math.max(0, res.likesCount));
    } catch (e) {
      setLiked(prevLiked);
      setLikesCount(prevCount);
      showError('Like failed', e);
    } finally {
      setLikeBusy(false);
    }
  };

  const notifyCommentRecipients = async (
    text: string,
    reply: ReplyTargetPayload | null,
    mentionedUsers: { uid: string; username: string }[]
  ) => {
    if (!viewerUid) return;
    const snippet = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    const recipients = new Map<string, 'comment' | 'mention'>();
    if (reply) {
      if (reply.uid !== viewerUid) recipients.set(reply.uid, 'comment');
      if (ownerUid !== viewerUid && ownerUid !== reply.uid) {
        recipients.set(ownerUid, 'comment');
      }
    } else if (ownerUid !== viewerUid) {
      recipients.set(ownerUid, 'comment');
    }
    for (const user of mentionedUsers) {
      if (user.uid === viewerUid) continue;
      if (!recipients.has(user.uid)) recipients.set(user.uid, 'mention');
    }
    for (const [uid, type] of recipients) {
      await createInAppNotification({
        recipientUid: uid,
        type,
        fromUid: viewerUid,
        fromUsername: viewerUsername,
        bestPartId,
        snippet,
      });
    }
  };

  const onSendComment = React.useCallback(async () => {
    const text = draftRef.current.trim();
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to comment.'));
      return;
    }
    if (!text || postInFlightRef.current) return;
    postInFlightRef.current = true;
    const reply = replyTarget;
    setSending(true);
    try {
      const mentionedUsers = await resolveMentionUsernames(parseMentionUsernames(text));
      const payload: Record<string, unknown> = {
        uid: viewerUid,
        username: viewerUsername,
        text,
        createdAt: serverTimestamp(),
      };
      if (reply) {
        payload.replyToCommentId = reply.id;
        payload.replyToUid = reply.uid;
        payload.replyToUsername = reply.username;
      }
      if (mentionedUsers.length) payload.mentionedUsers = mentionedUsers;
      await addDoc(collection(firestore(), 'bestParts', bestPartId, 'comments'), payload);
      await notifyCommentRecipients(text, reply, mentionedUsers);
      draftRef.current = '';
      setDraft('');
      setReplyTarget(null);
      Keyboard.dismiss();
    } catch (e) {
      showError('Comment failed', e);
    } finally {
      setSending(false);
      postInFlightRef.current = false;
    }
  }, [viewerUid, viewerUsername, bestPartId, replyTarget, ownerUid]);

  const confirmDeleteComment = React.useCallback(
    (commentId: string) => {
      if (!viewerUid) return;
      Alert.alert('Delete comment?', 'This removes the comment from this moment.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setDeletingCommentId(commentId);
              try {
                await deleteDoc(doc(firestore(), 'bestParts', bestPartId, 'comments', commentId));
              } catch (e) {
                showError('Delete failed', e);
              } finally {
                setDeletingCommentId(null);
              }
            })(),
        },
      ]);
    },
    [viewerUid, bestPartId]
  );

  const renderRow = React.useCallback(
    ({ item }: { item: ThreadDisplayRow }) => {
      if (item.kind === 'collapsed') {
        return (
          <EngagementThreadCollapseRow
            indentDepth={item.indentDepth}
            hiddenCount={item.hiddenEntries.length}
            layout="modal"
            onPress={() =>
              setExpandedThreads((prev) => ({ ...prev, [item.threadRootId]: true }))
            }
          />
        );
      }
      return (
        <EngagementCommentRow
          postId={bestPartId}
          engagementCollection="bestParts"
          comment={item.entry.comment}
          layout="modal"
          threadDepth={item.entry.depth}
          viewerUid={viewerUid}
          videoOwnerUid={ownerUid}
          deletingCommentId={deletingCommentId}
          onReply={setReplyTarget}
          onRequestDelete={confirmDeleteComment}
        />
      );
    },
    [bestPartId, viewerUid, ownerUid, deletingCommentId, confirmDeleteComment]
  );

  const displayComments = Math.max(comments.length, commentsCount);

  return (
    <>
      <View style={styles.row}>
        <Pressable
          style={styles.action}
          onPress={() => void onToggleLike()}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.coral : colors.text}
          />
          <Text style={styles.count}>{likesCount}</Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => setCommentsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Comments"
        >
          <Ionicons name="chatbubble-outline" size={21} color={colors.text} />
          <Text style={styles.count}>{displayComments}</Text>
        </Pressable>
      </View>

      <Modal
        visible={commentsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsOpen(false)}
      >
        <View style={styles.sheet}>
          <Pressable style={{ flex: 1 }} onPress={() => setCommentsOpen(false)} />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Comments</Text>
              <Pressable onPress={() => setCommentsOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {!commentsReady ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.green} />
              </View>
            ) : (
              <FlatList
                data={threaded}
                keyExtractor={(item, i) =>
                  item.kind === 'collapsed' ? `c-${item.threadRootId}` : item.entry.comment.id + i
                }
                renderItem={renderRow}
                contentContainerStyle={styles.listPad}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>Be the first to comment.</Text>
                  </View>
                }
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 420 }}
              />
            )}

            <EngagementCommentComposer
              draft={draft}
              onChangeText={(t) => {
                draftRef.current = t;
                setDraft(t);
              }}
              replyTarget={replyTarget}
              onClearReply={() => setReplyTarget(null)}
              sending={sending}
              onSend={() => void onSendComment()}
              forModal
              reelLayout={false}
              draftTextRef={draftRef}
              viewerUid={viewerUid}
              bottomInset={0}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
