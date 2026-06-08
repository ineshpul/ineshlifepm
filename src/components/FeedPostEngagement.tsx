import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
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
import { BlockReportModal } from '../chat/components/BlockReportModal';
import { reportVideo } from '../services/contentReports';
import { blockUser } from '../services/chat/chatFirestore';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { navigateToChatSharePost } from '../navigation/navigationHelpers';
import type { VideoComment } from '../types/videoComment';
import {
  buildThreadDisplayList,
  flattenCommentsForThread,
  type ThreadDisplayRow,
} from '../utils/commentThread';
import { EngagementCommentComposer } from './EngagementCommentComposer';
import { EngagementCommentRow, type ReplyTargetPayload } from './EngagementCommentRow';
import { EngagementThreadCollapseRow } from './EngagementThreadCollapseRow';

export type { VideoComment };

const COMMENTS_SHEET_HEIGHT_RATIO = 0.65;
const COMMENTS_SHEET_MIN_PEEK = 72;

type Props = {
  videoId: string;
  videoOwnerUid: string;
  videoOwnerUsername: string;
  shareTitle: string;
  shareUrl: string;
  viewerUid: string | undefined;
  viewerUsername: string;
  onCommentComposerFocus?: () => void;
  reelLayout?: boolean;
};

export function FeedPostEngagement({
  videoId,
  videoOwnerUid,
  videoOwnerUsername,
  shareTitle,
  shareUrl,
  viewerUid,
  viewerUsername,
  onCommentComposerFocus,
  reelLayout = false,
}: Props) {
  const navigation = useNavigation<any>();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [lockedSheetHeight, setLockedSheetHeight] = React.useState<number | null>(null);
  const [lockedWindowHeight, setLockedWindowHeight] = React.useState<number | null>(null);
  const { preferences, patch } = useSettingsPreferences();
  const [likeCount, setLikeCount] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [docLikeCount, setDocLikeCount] = React.useState<number | null>(null);
  const [docCommentCount, setDocCommentCount] = React.useState<number | null>(null);
  const [comments, setComments] = React.useState<VideoComment[]>([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [likeBusy, setLikeBusy] = React.useState(false);
  const [deletingCommentId, setDeletingCommentId] = React.useState<string | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [commentsModalOpen, setCommentsModalOpen] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<ReplyTargetPayload | null>(null);
  const [modalKeyboardInset, setModalKeyboardInset] = React.useState(0);
  const [expandedThreads, setExpandedThreads] = React.useState<Record<string, boolean>>({});
  const [commentsQueryReady, setCommentsQueryReady] = React.useState(false);
  const postInFlightRef = React.useRef(false);

  const commentsThreaded = React.useMemo(() => flattenCommentsForThread(comments), [comments]);
  const commentDisplayList = React.useMemo(
    () => buildThreadDisplayList(commentsThreaded, expandedThreads),
    [commentsThreaded, expandedThreads]
  );

  React.useEffect(() => {
    setExpandedThreads({});
    setComments([]);
    setCommentsQueryReady(false);
  }, [videoId]);

  React.useEffect(() => {
    if (!commentsModalOpen) {
      setModalKeyboardInset(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => {
      setModalKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    };
    const onHide = () => setModalKeyboardInset(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [commentsModalOpen]);

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
    if (!isFirebaseConfigured() || !viewerUid || !commentsModalOpen) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        const q = query(
          collection(firestore(), 'videos', videoId, 'comments'),
          orderBy('createdAt', 'desc'),
          limit(80)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            const next = snap.docs.map((d) => {
              const data: any = d.data();
              const at =
                typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
              const replyToCommentId =
                data?.replyToCommentId != null ? String(data.replyToCommentId) : undefined;
              const replyToUsername =
                data?.replyToUsername != null ? String(data.replyToUsername) : undefined;
              const replyToUid = data?.replyToUid != null ? String(data.replyToUid) : undefined;
              const replyPreview = data?.replyPreview != null ? String(data.replyPreview) : undefined;
              return {
                id: d.id,
                uid: String(data?.uid ?? ''),
                username: String(data?.username ?? 'user'),
                text: String(data?.text ?? ''),
                at,
                replyToCommentId,
                replyToUid,
                replyToUsername,
                replyPreview,
              };
            });
            setComments(next);
            setCommentsQueryReady(true);
          },
          () => {
            setComments([]);
            setCommentsQueryReady(true);
          }
        );
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [videoId, viewerUid, commentsModalOpen]);

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
      const message = `${shareTitle}\n${shareUrl}`;
      const isHttp = /^https?:\/\//i.test(shareUrl.trim());
      await Share.share(
        isHttp
          ? { title: shareTitle, message }
          : { title: shareTitle, message, url: shareUrl }
      );
    } catch {
      // user dismissed sheet
    }
  };

  const notifyCommentRecipients = async (text: string, reply: ReplyTargetPayload | null) => {
    if (!viewerUid) return;
    const snippet = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    const recipients = new Set<string>();

    if (reply) {
      if (reply.uid !== viewerUid) recipients.add(reply.uid);
      if (videoOwnerUid !== viewerUid && videoOwnerUid !== reply.uid) recipients.add(videoOwnerUid);
    } else if (videoOwnerUid !== viewerUid) {
      recipients.add(videoOwnerUid);
    }

    for (const uid of recipients) {
      await createInAppNotification({
        recipientUid: uid,
        type: 'comment',
        fromUid: viewerUid,
        fromUsername: viewerUsername,
        videoId,
        snippet,
      });
    }
  };

  const onSendComment = async () => {
    const text = draft.trim();
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to comment.'));
      return;
    }
    if (!text) return;
    if (postInFlightRef.current) return;
    postInFlightRef.current = true;
    const reply = replyTarget;
    setSending(true);
    try {
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
      await addDoc(collection(firestore(), 'videos', videoId, 'comments'), payload);
      await notifyCommentRecipients(text, reply);
      setDraft('');
      setReplyTarget(null);
      Keyboard.dismiss();
    } catch (e) {
      showError('Comment failed', e);
    } finally {
      setSending(false);
      postInFlightRef.current = false;
    }
  };

  const confirmDeleteComment = React.useCallback(
    (commentId: string) => {
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
    },
    [viewerUid, videoId]
  );

  const onReply = React.useCallback((target: ReplyTargetPayload) => {
    setReplyTarget(target);
  }, []);

  const onExpandThread = React.useCallback((rootId: string) => {
    setExpandedThreads((prev) => ({ ...prev, [rootId]: true }));
  }, []);

  const renderModalRow = React.useCallback(
    ({ item }: { item: ThreadDisplayRow }) => {
      if (item.kind === 'collapsed') {
        return (
          <EngagementThreadCollapseRow
            indentDepth={item.indentDepth}
            hiddenCount={item.hiddenEntries.length}
            layout="modal"
            onPress={() => onExpandThread(item.threadRootId)}
          />
        );
      }
      const { comment: c, depth } = item.entry;
      return (
        <EngagementCommentRow
          videoId={videoId}
          comment={c}
          layout="modal"
          threadDepth={depth}
          viewerUid={viewerUid}
          videoOwnerUid={videoOwnerUid}
          deletingCommentId={deletingCommentId}
          onReply={onReply}
          onRequestDelete={confirmDeleteComment}
        />
      );
    },
    [videoId, viewerUid, videoOwnerUid, deletingCommentId, onReply, confirmDeleteComment, onExpandThread]
  );

  const displayLikes = Math.max(likeCount, docLikeCount ?? 0);
  const displayComments = Math.max(comments.length, docCommentCount ?? 0);

  const openSafety = () => {
    if (!viewerUid) return;
    Alert.alert('Safety', 'Keep Leap safe.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report post', style: 'destructive', onPress: () => setReportOpen(true) },
      { text: 'Block user', style: 'destructive', onPress: () => setBlockOpen(true) },
    ]);
  };

  const closeCommentsModal = React.useCallback(() => {
    Keyboard.dismiss();
    setCommentsModalOpen(false);
    setReplyTarget(null);
    setExpandedThreads({});
    setLockedSheetHeight(null);
    setLockedWindowHeight(null);
  }, []);

  const commentsSheetHeight = React.useMemo(() => {
    const screenH = lockedWindowHeight ?? windowHeight;
    const base = lockedSheetHeight ?? Math.round(screenH * COMMENTS_SHEET_HEIGHT_RATIO);
    if (modalKeyboardInset <= 0) return base;
    const maxHeight = screenH - modalKeyboardInset - COMMENTS_SHEET_MIN_PEEK;
    return Math.max(240, Math.min(base, maxHeight));
  }, [lockedSheetHeight, lockedWindowHeight, windowHeight, modalKeyboardInset]);

  const sheetPullDismissedRef = React.useRef(false);

  React.useEffect(() => {
    if (commentsModalOpen) {
      sheetPullDismissedRef.current = false;
    }
  }, [commentsModalOpen]);

  const onModalPanGesture = React.useCallback(
    (e: { nativeEvent: { state: State; translationY: number; velocityY: number } }) => {
      const { state, translationY, velocityY } = e.nativeEvent;
      if (state !== State.END) return;
      if (translationY > 40 || velocityY > 520) {
        closeCommentsModal();
      }
    },
    [closeCommentsModal]
  );

  const onModalListScroll = React.useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS !== 'ios' || sheetPullDismissedRef.current) return;
      const y = ev.nativeEvent.contentOffset.y;
      if (y < -40) {
        sheetPullDismissedRef.current = true;
        closeCommentsModal();
      }
    },
    [closeCommentsModal]
  );

  const onOpenCommentsModal = () => {
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to view comments.'));
      return;
    }
    setLockedWindowHeight(windowHeight);
    setLockedSheetHeight(Math.round(windowHeight * COMMENTS_SHEET_HEIGHT_RATIO));
    setCommentsModalOpen(true);
  };

  return (
    <View style={[styles.wrap, reelLayout && styles.wrapReelCompact]}>
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
          <Text style={styles.actionCount}>{displayLikes}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onOpenCommentsModal}
          accessibilityRole="button"
          accessibilityLabel="View comments"
        >
          <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
          <Text style={styles.actionCount}>{displayComments}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            if (!viewerUid) {
              showError('Sign in required', new Error('Log in to send clips to chat.'));
              return;
            }
            navigateToChatSharePost(navigation, {
              videoId,
              videoUrl: shareUrl,
              title: shareTitle,
              ownerUid: videoOwnerUid,
              ownerUsername: videoOwnerUsername,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Send this clip to someone in Leap"
        >
          <Ionicons name="paper-plane-outline" size={21} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share link outside Leap"
        >
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>

        {viewerUid && viewerUid !== videoOwnerUid ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={openSafety}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
          >
            <Ionicons name="flag-outline" size={21} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal
        visible={commentsModalOpen}
        animationType="slide"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => closeCommentsModal()}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => closeCommentsModal()} />
          <View
            style={[
              styles.modalSheet,
              {
                height: commentsSheetHeight,
                bottom: modalKeyboardInset,
                paddingBottom: Math.max(insets.bottom, 8),
              },
            ]}
          >
            <PanGestureHandler
              onHandlerStateChange={onModalPanGesture}
              activeOffsetY={8}
              failOffsetX={[-40, 40]}
            >
              <View style={styles.modalTopPan} collapsable={false}>
                <View style={styles.modalGrabber} />
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Comments</Text>
                  <TouchableOpacity
                    onPress={() => closeCommentsModal()}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close comments"
                  >
                    <Ionicons name="close" size={26} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </PanGestureHandler>
            <View style={styles.modalKeyboardArea}>
              <FlatList
                data={commentDisplayList}
                extraData={expandedThreads}
                keyExtractor={(row) =>
                  row.kind === 'comment' ? row.entry.comment.id : `collapsed-${row.threadRootId}`
                }
                renderItem={renderModalRow}
                ListEmptyComponent={
                  comments.length === 0 ? (
                    commentsQueryReady ? (
                      <View style={styles.modalEmptyWrap}>
                        <Text style={styles.modalEmpty}>No comments yet.</Text>
                        <Text style={styles.modalHint}>Be the first to say something.</Text>
                      </View>
                    ) : (
                      <View style={styles.modalLoadingWrap}>
                        <ActivityIndicator size="large" color={colors.moss} />
                      </View>
                    )
                  ) : null
                }
                style={styles.modalList}
                contentContainerStyle={[
                  styles.modalListContent,
                  comments.length === 0 ? styles.modalListContentEmpty : null,
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                scrollEventThrottle={16}
                onScroll={onModalListScroll}
                windowSize={10}
              />
              {viewerUid ? (
                <EngagementCommentComposer
                  draft={draft}
                  onChangeText={setDraft}
                  replyTarget={replyTarget}
                  onClearReply={() => setReplyTarget(null)}
                  sending={sending}
                  onSend={() => void onSendComment()}
                  forModal
                  reelLayout={reelLayout}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <BlockReportModal
        visible={reportOpen}
        mode="report"
        titleOverride="Report post"
        subtitleOverride="Tell us what’s wrong. Reports are reviewed within 24 hours."
        reasonPlaceholder="Reason (required)"
        onClose={() => setReportOpen(false)}
        onConfirm={(reason) => {
          if (!viewerUid) return;
          const r = reason.trim() || 'unspecified';
          const nextHidden = Array.from(new Set([...(preferences.hiddenVideoIds ?? []), videoId]));
          patch({ hiddenVideoIds: nextHidden });
          void reportVideo({
            reporterUid: viewerUid,
            videoId,
            videoOwnerUid,
            videoOwnerUsername,
            reason: r,
          });
          setReportOpen(false);
        }}
      />

      <BlockReportModal
        visible={blockOpen}
        mode="block"
        titleOverride="Block user?"
        subtitleOverride="You won’t see their posts, and they won’t be able to chat with you."
        onClose={() => setBlockOpen(false)}
        onConfirm={() => {
          if (!viewerUid) return;
          const uname = String(videoOwnerUsername ?? '').trim();
          if (uname) {
            const nextBlocked = Array.from(new Set([...(preferences.blockedUsernames ?? []), uname]));
            patch({ blockedUsernames: nextBlocked });
          }
          const nextHidden = Array.from(new Set([...(preferences.hiddenVideoIds ?? []), videoId]));
          patch({ hiddenVideoIds: nextHidden });
          void blockUser(viewerUid, videoOwnerUid);
          setBlockOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    gap: 6,
  },
  wrapReelCompact: {
    alignSelf: 'stretch',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 44,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  modalTopPan: {
    paddingBottom: 2,
  },
  modalGrabber: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border2,
    marginTop: 10,
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  modalKeyboardArea: {
    flex: 1,
    minHeight: 0,
  },
  modalList: {
    flex: 1,
    minHeight: 0,
  },
  modalListContent: { paddingBottom: 8 },
  modalListContentEmpty: {
    flexGrow: 1,
  },
  modalLoadingWrap: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  modalEmptyWrap: {
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  modalEmpty: { fontSize: 16, fontWeight: '800', color: colors.text },
  modalHint: { marginTop: 6, fontSize: 14, fontWeight: '600', color: colors.muted },
});
