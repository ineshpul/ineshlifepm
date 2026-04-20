import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
  setDoc,
} from 'firebase/firestore';

import { colors } from '../theme/colors';
import { firestore, firebaseAuth, isFirebaseConfigured } from '../firebase/firebase';
import { createInAppNotification } from '../services/social';
import { showError } from '../utils/ui';

type Props = {
  videoId: string;
  videoOwnerUid: string;
  shareTitle: string;
  shareUrl: string;
  viewerUid: string | undefined;
  viewerUsername: string;
};

export function FeedPostEngagement({
  videoId,
  videoOwnerUid,
  shareTitle,
  shareUrl,
  viewerUid,
  viewerUsername,
}: Props) {
  const navigation = useNavigation<any>();
  const [likeCount, setLikeCount] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [docLikeCount, setDocLikeCount] = React.useState<number | null>(null);
  const [docCommentCount, setDocCommentCount] = React.useState<number | null>(null);
  const [comments, setComments] = React.useState<
    { id: string; uid: string; username: string; text: string; at: number }[]
  >([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [likeBusy, setLikeBusy] = React.useState(false);
  const [deletingCommentId, setDeletingCommentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        const likesCol = collection(firestore(), 'videos', videoId, 'likes');
        unsub = onSnapshot(
          likesCol,
          (snap) => {
            setLikeCount(snap.size);
            setLiked(snap.docs.some((d) => d.id === viewerUid));
          },
          () => {
            setLikeCount(0);
            setLiked(false);
          }
        );
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [videoId, viewerUid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        const vref = doc(firestore(), 'videos', videoId);
        unsub = onSnapshot(
          vref,
          (snap) => {
            if (!snap.exists()) {
              setDocLikeCount(null);
              setDocCommentCount(null);
              return;
            }
            const d: any = snap.data();
            const lc = Number(d?.likesCount ?? 0);
            const cc = Number(d?.commentsCount ?? 0);
            setDocLikeCount(Number.isFinite(lc) ? lc : 0);
            setDocCommentCount(Number.isFinite(cc) ? cc : 0);
          },
          () => {
            setDocLikeCount(null);
            setDocCommentCount(null);
          }
        );
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [videoId, viewerUid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        const q = query(
          collection(firestore(), 'videos', videoId, 'comments'),
          orderBy('createdAt', 'desc'),
          limit(12)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            setComments(
              snap.docs.map((d) => {
                const data: any = d.data();
                const at =
                  typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
                return {
                  id: d.id,
                  uid: String(data?.uid ?? ''),
                  username: String(data?.username ?? 'user'),
                  text: String(data?.text ?? ''),
                  at,
                };
              })
            );
          },
          () => setComments([])
        );
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [videoId, viewerUid]);

  const onToggleLike = async () => {
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to like posts.'));
      return;
    }
    setLikeBusy(true);
    try {
      const likeRef = doc(firestore(), 'videos', videoId, 'likes', viewerUid);
      if (liked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, { createdAt: serverTimestamp() });
        if (viewerUid !== videoOwnerUid) {
          await createInAppNotification({
            recipientUid: videoOwnerUid,
            type: 'like',
            fromUid: viewerUid,
            fromUsername: viewerUsername,
            videoId,
          });
        }
      }
    } catch (e) {
      showError('Like failed', e);
    } finally {
      setLikeBusy(false);
    }
  };

  const onShare = async () => {
    try {
      await Share.share({
        title: shareTitle,
        message: `${shareTitle}\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {
      // user dismissed sheet
    }
  };

  const onSendComment = async () => {
    const text = draft.trim();
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to comment.'));
      return;
    }
    if (!text) return;
    setSending(true);
    try {
      await addDoc(collection(firestore(), 'videos', videoId, 'comments'), {
        uid: viewerUid,
        username: viewerUsername,
        text,
        createdAt: serverTimestamp(),
      });
      const snippet = text.length > 140 ? `${text.slice(0, 137)}…` : text;
      if (viewerUid !== videoOwnerUid) {
        await createInAppNotification({
          recipientUid: videoOwnerUid,
          type: 'comment',
          fromUid: viewerUid,
          fromUsername: viewerUsername,
          videoId,
          snippet,
        });
      }
      setDraft('');
    } catch (e) {
      showError('Comment failed', e);
    } finally {
      setSending(false);
    }
  };

  const canDeleteComment = React.useCallback(
    (c: { uid: string }) => Boolean(viewerUid && (viewerUid === c.uid || viewerUid === videoOwnerUid)),
    [viewerUid, videoOwnerUid]
  );

  const confirmDeleteComment = (commentId: string) => {
    if (!viewerUid) return;
    Alert.alert('Delete comment?', 'This removes the comment from this video.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            if (!isFirebaseConfigured()) return;
            setDeletingCommentId(commentId);
            try {
              await deleteDoc(doc(firestore(), 'videos', videoId, 'comments', commentId));
            } catch (e) {
              showError('Delete failed', e);
            } finally {
              setDeletingCommentId(null);
            }
          })(),
      },
    ]);
  };

  const displayLikes = Math.max(likeCount, docLikeCount ?? 0);
  const displayComments = Math.max(comments.length, docCommentCount ?? 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onToggleLike}
          disabled={likeBusy}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        >
          {likeBusy ? (
            <ActivityIndicator size="small" color={colors.coral} />
          ) : (
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={colors.coral} />
          )}
          <Text style={styles.actionLabel}>{displayLikes}</Text>
        </TouchableOpacity>

        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
          <Text style={styles.actionLabel}>{displayComments}</Text>
        </View>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            if (!viewerUid) {
              showError('Sign in required', new Error('Log in to send clips to chat.'));
              return;
            }
            navigation.navigate('Chat', {
              screen: 'NewChat',
              params: {
                sharePost: {
                  videoId,
                  videoUrl: shareUrl,
                  title: shareTitle,
                  ownerUid: videoOwnerUid,
                },
              },
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Send to chat"
        >
          <Ionicons name="paper-plane-outline" size={21} color={colors.text} />
          <Text style={styles.actionLabel}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={22} color={colors.text} />
          <Text style={styles.actionLabel}>Share</Text>
        </TouchableOpacity>
      </View>

      {comments.length > 0 && (
        <View style={styles.comments}>
          {comments
            .slice()
            .reverse()
            .map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Text style={styles.commentLine}>
                  <Text
                    style={styles.commentUser}
                    onPress={() =>
                      c.uid ? navigation.navigate('UserProfile', { uid: c.uid, username: c.username }) : undefined
                    }
                    suppressHighlighting
                  >
                    {c.username}
                  </Text>{' '}
                  {c.text}
                </Text>
                {canDeleteComment(c) ? (
                  <TouchableOpacity
                    onPress={() => confirmDeleteComment(c.id)}
                    disabled={deletingCommentId === c.id}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete comment"
                  >
                    <Text style={styles.commentDelete}>
                      {deletingCommentId === c.id ? '…' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
        </View>
      )}

      {viewerUid ? (
        <View style={styles.compose}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!sending}
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={onSendComment}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.sendText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  comments: {
    gap: 6,
    paddingTop: 4,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  commentLine: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  commentUser: {
    fontWeight: '900',
    color: colors.text,
  },
  commentDelete: { fontSize: 12, fontWeight: '900', color: colors.coral },
  compose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.white,
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.moss,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 13,
  },
});
