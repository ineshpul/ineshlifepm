import * as React from 'react';
import {
  ActivityIndicator,
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
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
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
  const [comments, setComments] = React.useState<
    { id: string; username: string; text: string; at: number }[]
  >([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [likeBusy, setLikeBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const likesCol = collection(firestore(), 'videos', videoId, 'likes');
    const unsub = onSnapshot(likesCol, (snap) => {
      setLikeCount(snap.size);
      setLiked(viewerUid ? snap.docs.some((d) => d.id === viewerUid) : false);
    });
    return () => unsub();
  }, [videoId, viewerUid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const q = query(
      collection(firestore(), 'videos', videoId, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(12)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(
          snap.docs.map((d) => {
            const data: any = d.data();
            const at =
              typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            return {
              id: d.id,
              username: String(data?.username ?? 'user'),
              text: String(data?.text ?? ''),
              at,
            };
          })
        );
      },
      () => setComments([])
    );
    return () => unsub();
  }, [videoId]);

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
        await createInAppNotification({
          recipientUid: videoOwnerUid,
          type: 'like',
          fromUid: viewerUid,
          fromUsername: viewerUsername,
          videoId,
        });
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
      await createInAppNotification({
        recipientUid: videoOwnerUid,
        type: 'comment',
        fromUid: viewerUid,
        fromUsername: viewerUsername,
        videoId,
        snippet,
      });
      setDraft('');
    } catch (e) {
      showError('Comment failed', e);
    } finally {
      setSending(false);
    }
  };

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
          <Text style={styles.actionLabel}>{likeCount}</Text>
        </TouchableOpacity>

        <View style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
          <Text style={styles.actionLabel}>{comments.length}</Text>
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
              <Text key={c.id} style={styles.commentLine}>
                <Text style={styles.commentUser}>{c.username}</Text> {c.text}
              </Text>
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
  commentLine: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  commentUser: {
    fontWeight: '900',
    color: colors.text,
  },
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
