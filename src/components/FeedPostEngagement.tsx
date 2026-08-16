import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  PanGestureHandler,
  State,
  TouchableOpacity as GestureTouchableOpacity,
} from 'react-native-gesture-handler';
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

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { firestore, firebaseAuth, isFirebaseConfigured } from '../firebase/firebase';
import { toggleVideoLike } from '../services/videoLikes';
import { createInAppNotification } from '../services/social';
import { resolveMentionUsernames } from '../services/mentionLookup';
import { parseMentionUsernames } from '../utils/commentMentions';
import { saveRemoteVideoToCameraRoll } from '../services/saveVideoToCameraRoll';
import { showError, showInfo } from '../utils/ui';
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

const COMMENTS_SHEET_HEIGHT_RATIO = 0.55;

type Props = {
  videoId: string;
  videoOwnerUid: string;
  videoOwnerUsername: string;
  shareTitle: string;
  shareUrl: string;
  /** Leap prompt burned into camera-roll exports (e.g. "Jump on one foot"). */
  challengePrompt?: string;
  viewerUid: string | undefined;
  viewerUsername: string;
  onCommentComposerFocus?: () => void;
  reelLayout?: boolean;
  /** Seed from feed row so counts render before the per-video listener attaches. */
  initialLikesCount?: number;
  initialCommentsCount?: number;
};

export function FeedPostEngagement({
  videoId,
  videoOwnerUid,
  videoOwnerUsername,
  shareTitle,
  shareUrl,
  challengePrompt,
  viewerUid,
  viewerUsername,
  onCommentComposerFocus,
  reelLayout = false,
  initialLikesCount,
  initialCommentsCount,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  wrap: {
    marginTop: 4,
    gap: 6,
  },
  wrapReelCompact: {
    alignSelf: 'stretch' as const,
  },
  wrapVerticalRail: {
    marginTop: 0,
    alignItems: 'center' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  actionsVertical: {
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 14,
  },
  actionBtn: {
    width: 44,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.card,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionBtnVertical: {
    width: 52,
    minHeight: 52,
    height: 'auto' as unknown as number,
    borderRadius: 26,
    borderWidth: 0,
    backgroundColor: 'transparent',
    flexDirection: 'column' as const,
    gap: 0,
    paddingVertical: 2,
  },
  actionCount: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '900' as const,
    color: colors.text,
  },
  actionCountVertical: {
    marginLeft: 0,
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionLabelVertical: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalComposerHost: {
    backgroundColor: colors.card,
    zIndex: 2,
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  modalTopPan: {
    paddingBottom: 4,
    paddingTop: 6,
  },
  modalGrabber: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border2,
    marginTop: 8,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  modalBody: {
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
}));
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { preferences, patch } = useSettingsPreferences();
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
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<ReplyTargetPayload | null>(null);
  const [expandedThreads, setExpandedThreads] = React.useState<Record<string, boolean>>({});
  const [commentsQueryReady, setCommentsQueryReady] = React.useState(false);
  const [savingToRoll, setSavingToRoll] = React.useState(false);
  const draftRef = React.useRef('');
  const postInFlightRef = React.useRef(false);
  const ActionTouchable = reelLayout ? GestureTouchableOpacity : TouchableOpacity;
  const keyboardInset = React.useRef(new Animated.Value(0)).current;
  const baseSheetHeightAnim = React.useRef(new Animated.Value(0)).current;
  const safeComposerBottom = Math.max(insets.bottom, 8);
  /** Only the composer rides the keyboard — the 55% comments sheet stays put (TikTok-style). */
  const composerTranslateY = React.useMemo(
    () =>
      keyboardInset.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -1],
        extrapolate: 'extend',
      }),
    [keyboardInset]
  );

  const commentsThreaded = React.useMemo(() => flattenCommentsForThread(comments), [comments]);
  const commentDisplayList = React.useMemo(
    () => buildThreadDisplayList(commentsThreaded, expandedThreads),
    [commentsThreaded, expandedThreads]
  );

  React.useEffect(() => {
    setExpandedThreads({});
    setComments([]);
    setCommentsQueryReady(false);
    setDocLikeCount(
      initialLikesCount != null && Number.isFinite(initialLikesCount) ? initialLikesCount : null
    );
    setDocCommentCount(
      initialCommentsCount != null && Number.isFinite(initialCommentsCount)
        ? initialCommentsCount
        : null
    );
  }, [videoId, initialLikesCount, initialCommentsCount]);

  React.useEffect(() => {
    if (!commentsModalOpen) {
      keyboardInset.setValue(0);
      setKeyboardVisible(false);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateInset = (toValue: number, duration?: number) => {
      Animated.timing(keyboardInset, {
        toValue,
        duration: duration ?? 250,
        useNativeDriver: true,
      }).start();
    };
    const onShow = (e: KeyboardEvent) => {
      setKeyboardVisible(true);
      animateInset(e.endCoordinates.height, e.duration ?? 250);
    };
    const onHide = (e: KeyboardEvent) => {
      setKeyboardVisible(false);
      animateInset(0, e.duration ?? 250);
    };
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
      keyboardInset.setValue(0);
      setKeyboardVisible(false);
    };
  }, [commentsModalOpen, keyboardInset]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !viewerUid) return;
    let unsubVideo: (() => void) | undefined;
    let unsubViewerLike: (() => void) | undefined;
    let cancelled = false;

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || !firebaseAuth().currentUser) return;
        unsubVideo = onSnapshot(
          doc(firestore(), 'videos', videoId),
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
        unsubViewerLike = onSnapshot(
          doc(firestore(), 'videos', videoId, 'likes', viewerUid),
          (snap) => setLiked(snap.exists()),
          () => setLiked(false)
        );
      });

    return () => {
      cancelled = true;
      unsubVideo?.();
      unsubViewerLike?.();
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
                id: d.id,
                uid: String(data?.uid ?? ''),
                username: String(data?.username ?? 'user'),
                text: String(data?.text ?? ''),
                at,
                replyToCommentId,
                replyToUid,
                replyToUsername,
                replyPreview,
                mentionedUsers: mentionedUsers.length ? mentionedUsers : undefined,
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
    if (likeBusy) return;
    const nextLiked = !liked;
    const prevLiked = liked;
    const prevCount = docLikeCount ?? 0;
    setLiked(nextLiked);
    setDocLikeCount(Math.max(0, prevCount + (nextLiked ? 1 : -1)));
    setLikeBusy(true);
    try {
      const res = await toggleVideoLike({
        videoId,
        viewerUid,
        viewerUsername,
        liked: nextLiked,
      });
      if (!res.ok) throw new Error('Like could not be saved.');
      setLiked(res.liked);
      setDocLikeCount(Math.max(0, res.likesCount));
    } catch (e) {
      setLiked(prevLiked);
      setDocLikeCount(prevCount);
      showError('Like failed', e);
    } finally {
      setLikeBusy(false);
    }
  };

  const shareLink = async () => {
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

  const saveToCameraRoll = async () => {
    if (savingToRoll) return;
    setSavingToRoll(true);
    try {
      const prompt = challengePrompt?.trim();
      await saveRemoteVideoToCameraRoll(
        shareUrl,
        prompt
          ? { title: prompt, username: videoOwnerUsername.trim() || 'user' }
          : undefined
      );
      showInfo('Saved', 'Video saved to camera roll.');
    } catch (e) {
      showError('Could not save', e);
    } finally {
      setSavingToRoll(false);
    }
  };

  const onShare = () => {
    Alert.alert('Share', shareTitle, [
      { text: 'Share link', onPress: () => void shareLink() },
      { text: 'Save to camera roll', onPress: () => void saveToCameraRoll() },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
      if (videoOwnerUid !== viewerUid && videoOwnerUid !== reply.uid) {
        recipients.set(videoOwnerUid, 'comment');
      }
    } else if (videoOwnerUid !== viewerUid) {
      recipients.set(videoOwnerUid, 'comment');
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
        videoId,
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
    if (!text) return;
    if (postInFlightRef.current) return;
    postInFlightRef.current = true;
    const reply = replyTarget;
    setSending(true);
    try {
      const mentionHandles = parseMentionUsernames(text);
      const mentionedUsers = await resolveMentionUsernames(mentionHandles);
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
      if (mentionedUsers.length) {
        payload.mentionedUsers = mentionedUsers;
      }
      await addDoc(collection(firestore(), 'videos', videoId, 'comments'), payload);
      await notifyCommentRecipients(text, reply, mentionedUsers);
      draftRef.current = '';
      setDraft('');
      setReplyTarget(null);
      setKeyboardVisible(false);
      keyboardInset.setValue(0);
      Keyboard.dismiss();
    } catch (e) {
      showError('Comment failed', e);
    } finally {
      setSending(false);
      postInFlightRef.current = false;
    }
  }, [viewerUid, viewerUsername, videoId, replyTarget]);

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

  const displayLikes = docLikeCount ?? 0;
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
    keyboardInset.setValue(0);
    baseSheetHeightAnim.setValue(0);
    setKeyboardVisible(false);
    setCommentsModalOpen(false);
    setReplyTarget(null);
    setExpandedThreads({});
  }, [keyboardInset, baseSheetHeightAnim]);

  const sheetPullDismissedRef = React.useRef(false);

  React.useEffect(() => {
    if (commentsModalOpen) {
      sheetPullDismissedRef.current = false;
    }
  }, [commentsModalOpen]);

  const dismissSheetOrKeyboard = React.useCallback(() => {
    if (keyboardVisible && draft.trim()) {
      Keyboard.dismiss();
      return;
    }
    closeCommentsModal();
  }, [keyboardVisible, draft, closeCommentsModal]);

  const dismissKeyboardIfOpen = React.useCallback(() => {
    if (keyboardVisible) Keyboard.dismiss();
  }, [keyboardVisible]);

  const onModalPanGesture = React.useCallback(
    (e: { nativeEvent: { state: State; translationY: number; velocityY: number } }) => {
      const { state, translationY, velocityY } = e.nativeEvent;
      if (state !== State.END) return;
      if (translationY > 28 || velocityY > 420) {
        dismissSheetOrKeyboard();
      }
    },
    [dismissSheetOrKeyboard]
  );

  const onModalListScroll = React.useCallback(
    (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (sheetPullDismissedRef.current) return;
      const y = ev.nativeEvent.contentOffset.y;
      if (y >= -28) return;
      if (keyboardVisible) {
        Keyboard.dismiss();
        return;
      }
      sheetPullDismissedRef.current = true;
      closeCommentsModal();
    },
    [keyboardVisible, closeCommentsModal]
  );

  const onOpenCommentsModal = React.useCallback(() => {
    if (!viewerUid) {
      showError('Sign in required', new Error('Log in to view comments.'));
      return;
    }
    baseSheetHeightAnim.setValue(
      Math.round(Dimensions.get('window').height * COMMENTS_SHEET_HEIGHT_RATIO)
    );
    setCommentsModalOpen(true);
  }, [viewerUid, baseSheetHeightAnim]);

  return (
    <View
      style={[
        styles.wrap,
        reelLayout && styles.wrapReelCompact,
        reelLayout && styles.wrapVerticalRail,
      ]}
    >
      <View style={[styles.actions, reelLayout && styles.actionsVertical]}>
        <ActionTouchable
          style={[styles.actionBtn, reelLayout && styles.actionBtnVertical]}
          onPress={onToggleLike}
          disabled={likeBusy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike' : 'Like'}
        >
          {likeBusy ? (
            <ActivityIndicator size="small" color={reelLayout ? '#FFFFFF' : colors.coral} />
          ) : (
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={reelLayout ? 26 : 22}
              color={reelLayout ? (liked ? '#FF5B39' : '#FFFFFF') : colors.coral}
            />
          )}
          {reelLayout ? (
            <Text style={styles.actionCountVertical}>{displayLikes}</Text>
          ) : (
            <Text style={styles.actionCount}>{displayLikes}</Text>
          )}
        </ActionTouchable>

        <ActionTouchable
          style={[styles.actionBtn, reelLayout && styles.actionBtnVertical]}
          onPress={onOpenCommentsModal}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View comments"
        >
          <Ionicons
            name="chatbubble-outline"
            size={reelLayout ? 24 : 20}
            color={reelLayout ? '#FFFFFF' : colors.text}
          />
          {reelLayout ? (
            <Text style={styles.actionCountVertical}>{displayComments}</Text>
          ) : (
            <Text style={styles.actionCount}>{displayComments}</Text>
          )}
        </ActionTouchable>

        <ActionTouchable
          style={[styles.actionBtn, reelLayout && styles.actionBtnVertical]}
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
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Send this clip to someone in Leap"
        >
          <Ionicons
            name="paper-plane-outline"
            size={reelLayout ? 24 : 21}
            color={reelLayout ? '#FFFFFF' : colors.text}
          />
          {reelLayout ? <Text style={styles.actionLabelVertical}>Send</Text> : null}
        </ActionTouchable>

        <ActionTouchable
          style={[styles.actionBtn, reelLayout && styles.actionBtnVertical]}
          onPress={onShare}
          disabled={savingToRoll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share video"
        >
          {savingToRoll ? (
            <ActivityIndicator size="small" color={reelLayout ? '#FFFFFF' : colors.text} />
          ) : (
            <Ionicons
              name="share-outline"
              size={reelLayout ? 24 : 22}
              color={reelLayout ? '#FFFFFF' : colors.text}
            />
          )}
          {reelLayout ? <Text style={styles.actionLabelVertical}>Share</Text> : null}
        </ActionTouchable>

        {viewerUid && viewerUid !== videoOwnerUid ? (
          <ActionTouchable
            style={[styles.actionBtn, reelLayout && styles.actionBtnVertical]}
            onPress={openSafety}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Report or block"
          >
            <Ionicons
              name="flag-outline"
              size={reelLayout ? 22 : 21}
              color={reelLayout ? '#FFFFFF' : colors.text}
            />
          </ActionTouchable>
        ) : null}
      </View>

      <Modal
        visible={commentsModalOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={dismissSheetOrKeyboard}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={dismissSheetOrKeyboard}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          />
          <Animated.View style={[styles.modalSheet, { height: baseSheetHeightAnim }]}>
            <PanGestureHandler
              onHandlerStateChange={onModalPanGesture}
              activeOffsetY={10}
              failOffsetX={[-28, 28]}
            >
              <View style={styles.modalTopPan} collapsable={false}>
                <View style={styles.modalGrabber} />
                <Pressable onPress={dismissKeyboardIfOpen} style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Comments</Text>
                  <TouchableOpacity
                    onPress={() => closeCommentsModal()}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close comments"
                  >
                    <Ionicons name="close" size={26} color={colors.text} />
                  </TouchableOpacity>
                </Pressable>
              </View>
            </PanGestureHandler>
            <View style={styles.modalBody}>
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
                      <Pressable onPress={dismissKeyboardIfOpen} style={styles.modalEmptyWrap}>
                        <Text style={styles.modalEmpty}>No comments yet.</Text>
                        <Text style={styles.modalHint}>Be the first to say something.</Text>
                      </Pressable>
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
                keyboardShouldPersistTaps="always"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                scrollEventThrottle={16}
                onScroll={onModalListScroll}
                onScrollBeginDrag={keyboardVisible ? Keyboard.dismiss : undefined}
                bounces
                alwaysBounceVertical
                windowSize={10}
              />
              {viewerUid ? (
                <Animated.View
                  style={[
                    styles.modalComposerHost,
                    {
                      transform: [{ translateY: composerTranslateY }],
                      paddingBottom: keyboardVisible ? 8 : safeComposerBottom,
                    },
                  ]}
                >
                  <ScrollView
                    keyboardShouldPersistTaps="always"
                    scrollEnabled={false}
                    keyboardDismissMode="none"
                  >
                    <EngagementCommentComposer
                      draft={draft}
                      draftTextRef={draftRef}
                      viewerUid={viewerUid}
                      onChangeText={(text) => {
                        draftRef.current = text;
                        setDraft(text);
                      }}
                      replyTarget={replyTarget}
                      onClearReply={() => setReplyTarget(null)}
                      sending={sending}
                      onSend={onSendComment}
                      forModal
                      reelLayout={reelLayout}
                      bottomInset={0}
                    />
                  </ScrollView>
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
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
