import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { getOrCreateDm, sendChatMessage } from '../services/chat/chatFirestore';
import { subscribeMutualFollows, type FollowingRow } from '../services/social';
import { showError } from '../utils/ui';

export type FeedSharePost = {
  videoId: string;
  videoUrl: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
};

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

type SheetAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  tone?: 'neutral' | 'danger';
  busy?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  viewerUid: string | undefined;
  viewerUsername: string;
  post: FeedSharePost;
  savingToRoll: boolean;
  onCopyLink: () => void;
  onShareExternal: () => void;
  onSaveToCameraRoll: () => void;
  onNotInterested: () => void;
  onReport: () => void;
  onBlock: () => void;
};

/**
 * TikTok-shaped share sheet: mutual follows to send to on the first row, then everything else
 * (copy, external share, save, safety) as a rail of round actions.
 */
export function FeedShareSheet(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      {props.visible ? <FeedShareSheetBody {...props} /> : null}
    </Modal>
  );
}

function FeedShareSheetBody({
  onClose,
  viewerUid,
  viewerUsername,
  post,
  savingToRoll,
  onCopyLink,
  onShareExternal,
  onSaveToCameraRoll,
  onNotInterested,
  onReport,
  onBlock,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = React.useState<FollowingRow[]>([]);
  const [friendsLoading, setFriendsLoading] = React.useState(true);
  const [sendStates, setSendStates] = React.useState<Record<string, SendState>>({});

  const styles = useThemedStyles((c) => ({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end' as const,
      backgroundColor: c.overlay,
    },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingBottom: Math.max(insets.bottom, 12) + 8,
    },
    handle: {
      alignSelf: 'center' as const,
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border2,
      marginBottom: 12,
    },
    title: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      fontFamily: typography.displayBold,
      fontSize: 19,
      letterSpacing: -0.4,
      color: c.text,
    },
    friendRail: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 6,
    },
    friendRailEmpty: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    friendHint: {
      fontFamily: typography.bodyMedium,
      fontSize: 13,
      lineHeight: 19,
      color: c.muted,
    },
    friend: {
      width: 72,
      alignItems: 'center' as const,
      paddingHorizontal: 2,
      gap: 6,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: {
      width: 56,
      height: 56,
    },
    avatarInitial: {
      fontFamily: typography.bodyBold,
      fontSize: 20,
      color: c.moss,
    },
    avatarVeil: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'rgba(8, 14, 10, 0.55)',
    },
    friendName: {
      fontFamily: typography.bodyMedium,
      fontSize: 11.5,
      color: c.muted,
      textAlign: 'center' as const,
    },
    friendNameSent: {
      fontFamily: typography.bodyBold,
      color: c.moss,
    },
    divider: {
      height: 1,
      marginHorizontal: 20,
      marginBottom: 14,
      backgroundColor: c.border2,
    },
    actionRail: {
      paddingHorizontal: 14,
      gap: 4,
    },
    action: {
      width: 76,
      alignItems: 'center' as const,
      gap: 7,
    },
    actionCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border2,
    },
    actionCircleDanger: {
      backgroundColor: 'rgba(255, 91, 57, 0.10)',
      borderColor: 'rgba(255, 91, 57, 0.24)',
    },
    actionLabel: {
      fontFamily: typography.bodyMedium,
      fontSize: 11.5,
      lineHeight: 15,
      color: c.muted,
      textAlign: 'center' as const,
    },
    cancel: {
      marginTop: 16,
      marginHorizontal: 20,
      height: 50,
      borderRadius: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border2,
    },
    cancelText: {
      fontFamily: typography.bodyBold,
      fontSize: 15,
      color: c.muted,
    },
    friendsLoading: {
      paddingVertical: 22,
      paddingBottom: 30,
    },
  }));

  React.useEffect(() => {
    if (!viewerUid) {
      setFriends([]);
      setFriendsLoading(false);
      return;
    }
    setFriendsLoading(true);
    return subscribeMutualFollows(viewerUid, (rows) => {
      setFriends(rows);
      setFriendsLoading(false);
    });
  }, [viewerUid]);

  const sendToFriend = React.useCallback(
    (friend: FollowingRow) => {
      if (!viewerUid) return;
      if (sendStates[friend.targetUid] === 'sending' || sendStates[friend.targetUid] === 'sent') {
        return;
      }
      setSendStates((prev) => ({ ...prev, [friend.targetUid]: 'sending' }));
      void (async () => {
        try {
          const conversationId = await getOrCreateDm({
            currentUid: viewerUid,
            otherUid: friend.targetUid,
            otherDisplayName: friend.targetUsername,
          });
          await sendChatMessage({
            conversationId,
            senderId: viewerUid,
            senderUsername: viewerUsername,
            sharePost: {
              videoId: post.videoId,
              videoUrl: post.videoUrl,
              title: post.title,
              ownerUid: post.ownerUid,
              ownerUsername: post.ownerUsername,
            },
          });
          setSendStates((prev) => ({ ...prev, [friend.targetUid]: 'sent' }));
        } catch (e) {
          setSendStates((prev) => ({ ...prev, [friend.targetUid]: 'failed' }));
          showError('Could not send', e);
        }
      })();
    },
    [viewerUid, viewerUsername, post, sendStates]
  );

  const closeThen = React.useCallback(
    (run: () => void) => {
      onClose();
      requestAnimationFrame(run);
    },
    [onClose]
  );

  const canModerateOwner = Boolean(viewerUid && viewerUid !== post.ownerUid);

  const actions: SheetAction[] = [
    { key: 'copy', label: 'Copy link', icon: 'link-outline', onPress: () => closeThen(onCopyLink) },
    {
      key: 'external',
      label: 'Share to…',
      icon: 'share-outline',
      onPress: () => closeThen(onShareExternal),
    },
    {
      key: 'save',
      label: 'Save video',
      icon: 'download-outline',
      busy: savingToRoll,
      onPress: () => closeThen(onSaveToCameraRoll),
    },
    ...(canModerateOwner
      ? ([
          {
            key: 'hide',
            label: 'Not interested',
            icon: 'eye-off-outline',
            onPress: () => closeThen(onNotInterested),
          },
          {
            key: 'report',
            label: 'Report',
            icon: 'flag-outline',
            tone: 'danger',
            onPress: () => closeThen(onReport),
          },
          {
            key: 'block',
            label: 'Block',
            icon: 'ban-outline',
            tone: 'danger',
            onPress: () => closeThen(onBlock),
          },
        ] satisfies SheetAction[])
      : []),
  ];

  return (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close share sheet">
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.handle} />
        <Text style={styles.title}>Send to</Text>

        {friendsLoading && friends.length === 0 ? (
          <View style={styles.friendsLoading}>
            <ActivityIndicator color={colors.moss} />
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.friendRailEmpty}>
            <Text style={styles.friendHint}>
              Nobody to send to yet. Follow someone and once they follow you back, their leaps and
              yours can go straight into chat.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendRail}
          >
            {friends.map((friend) => {
              const state = sendStates[friend.targetUid] ?? 'idle';
              const handle = friend.targetUsername.replace(/^@+/u, '');
              return (
                <Pressable
                  key={friend.targetUid}
                  style={styles.friend}
                  onPress={() => sendToFriend(friend)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    state === 'sent' ? `Sent to ${handle}` : `Send this leap to ${handle}`
                  }
                >
                  <View style={styles.avatar}>
                    {friend.targetPhotoUrl ? (
                      <Image source={{ uri: friend.targetPhotoUrl }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarInitial}>
                        {handle[0]?.toUpperCase() ?? '?'}
                      </Text>
                    )}
                    {state === 'sending' || state === 'sent' ? (
                      <View style={styles.avatarVeil}>
                        {state === 'sending' ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="checkmark" size={26} color="#FFFFFF" />
                        )}
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.friendName, state === 'sent' && styles.friendNameSent]}
                    numberOfLines={1}
                  >
                    {state === 'sent' ? 'Sent' : handle}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.divider} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionRail}
        >
          {actions.map((action) => (
            <Pressable
              key={action.key}
              style={styles.action}
              onPress={action.onPress}
              disabled={action.busy}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <View
                style={[
                  styles.actionCircle,
                  action.tone === 'danger' && styles.actionCircleDanger,
                ]}
              >
                {action.busy ? (
                  <ActivityIndicator size="small" color={colors.moss} />
                ) : (
                  <Ionicons
                    name={action.icon}
                    size={23}
                    color={action.tone === 'danger' ? colors.coral : colors.text}
                  />
                )}
              </View>
              <Text style={styles.actionLabel} numberOfLines={2}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          style={styles.cancel}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}
