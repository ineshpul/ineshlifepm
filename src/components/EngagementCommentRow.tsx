import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UsernameLink } from './UsernameLink';
import { colors } from '../theme/colors';
import type { VideoComment } from '../types/videoComment';
import { formatCommentTime } from '../utils/formatCommentTime';
import { THREAD_INDENT } from '../utils/commentThread';

export type ReplyTargetPayload = { id: string; uid: string; username: string; textSnippet: string };

type Props = {
  comment: VideoComment;
  layout: 'inline' | 'modal';
  /** Nesting level when shown under a parent thread (0 = top-level). */
  threadDepth?: number;
  viewerUid?: string;
  videoOwnerUid: string;
  deletingCommentId: string | null;
  onReply: (target: ReplyTargetPayload) => void;
  onRequestDelete: (commentId: string) => void;
};

function canDelete(c: VideoComment, viewerUid: string | undefined, videoOwnerUid: string) {
  return Boolean(viewerUid && (viewerUid === c.uid || viewerUid === videoOwnerUid));
}

export const EngagementCommentRow = React.memo(function EngagementCommentRow({
  comment: c,
  layout,
  threadDepth = 0,
  viewerUid,
  videoOwnerUid,
  deletingCommentId,
  onReply,
  onRequestDelete,
}: Props) {
  const initial = (c.username || '?').trim().slice(0, 1).toUpperCase();
  const isModal = layout === 'modal';
  const showDelete = canDelete(c, viewerUid, videoOwnerUid);
  const nested = threadDepth > 0;
  const showTopReplyMeta = Boolean(c.replyToUsername && !nested);
  const showNestedReplyTarget = Boolean(nested && c.replyToUsername);
  const timeLabel = formatCommentTime(c.at);

  const deleteColumnPadTop = showTopReplyMeta
    ? isModal
      ? 17
      : 14
    : showNestedReplyTarget
      ? isModal
        ? 14
        : 12
      : nested && isModal
        ? 5
        : 0;

  return (
    <View
      style={[
        styles.commentRowOuter,
        isModal && styles.commentRowOuterModal,
        nested && styles.commentRowNested,
        { marginLeft: threadDepth * THREAD_INDENT },
      ]}
    >
      <View style={[styles.avatar, isModal && styles.avatarModal, nested && styles.avatarNested]}>
        <Text style={styles.avatarTxt}>{initial}</Text>
      </View>
      <View style={styles.commentBody}>
        {showNestedReplyTarget ? (
          <View style={[styles.replyMetaRow, styles.nestedReplySpacing]} accessibilityRole="text">
            <Text style={styles.nestedReplyToIcon}>↳ </Text>
            {c.replyToUid && c.replyToUsername ? (
              <UsernameLink uid={c.replyToUid} username={c.replyToUsername} style={styles.nestedReplyToStrong} />
            ) : (
              <Text style={styles.nestedReplyToStrong}>@{c.replyToUsername}</Text>
            )}
          </View>
        ) : null}
        {showTopReplyMeta ? (
          <View style={styles.replyMetaRow} accessibilityRole="text">
            <Text style={styles.replyMeta}>Replying to </Text>
            {c.replyToUid && c.replyToUsername ? (
              <UsernameLink uid={c.replyToUid} username={c.replyToUsername} style={styles.replyMetaStrong} />
            ) : (
              <Text style={styles.replyMetaStrong}>@{c.replyToUsername}</Text>
            )}
          </View>
        ) : null}
        <View style={styles.commentTopLine}>
          {c.uid ? (
            <UsernameLink uid={c.uid} username={c.username} style={styles.commentUser} />
          ) : (
            <Text style={styles.commentUser}>{c.username}</Text>
          )}
          <View style={styles.commentTopRight}>
            {timeLabel ? <Text style={styles.commentTime}>{timeLabel}</Text> : null}
            {viewerUid ? (
              <TouchableOpacity
                onPress={() =>
                  onReply({
                    id: c.id,
                    uid: c.uid,
                    username: c.username,
                    textSnippet: c.text,
                  })
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  c.uid === viewerUid ? 'Reply to your comment' : `Reply to ${c.username}`
                }
              >
                <Text style={styles.replyLink}>Reply</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <Text style={[styles.commentText, isModal && styles.commentTextModal]}>{c.text}</Text>
      </View>
      <View style={[styles.deleteColumn, { paddingTop: deleteColumnPadTop }]}>
        {showDelete ? (
          <TouchableOpacity
            onPress={() => onRequestDelete(c.id)}
            disabled={deletingCommentId === c.id}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Delete comment"
          >
            <Text style={styles.commentDelete}>{deletingCommentId === c.id ? '…' : 'Delete'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.deleteSpacer} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  commentRowOuter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  commentRowOuterModal: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
  },
  commentRowNested: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModal: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarNested: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
  },
  replyMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 2,
    gap: 2,
  },
  replyMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  replyMetaStrong: {
    fontWeight: '800',
    color: colors.text,
  },
  nestedReplySpacing: {
    marginBottom: 4,
  },
  nestedReplyToIcon: {
    fontWeight: '700',
    color: colors.moss,
  },
  nestedReplyToStrong: {
    fontWeight: '800',
    color: colors.text,
  },
  commentTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  commentTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  commentTime: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  commentUser: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  replyLink: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  commentText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
  },
  commentTextModal: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '500',
  },
  commentDelete: { fontSize: 12, fontWeight: '800', color: colors.coral },
  deleteColumn: {
    minWidth: 48,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  deleteSpacer: { width: 44, minHeight: 1 },
});
