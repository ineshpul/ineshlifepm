import * as React from 'react';
import { Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FeedPostEngagement } from './FeedPostEngagement';
import { FeedPostVideo, ReelVideoPlaceholder } from './FeedPostVideo';
import { FollowButton } from './FollowButton';
import { LockedLeapFrame } from './LockedLeapFrame';
import { UsernameLink } from './UsernameLink';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { FeedPlaybackUrls } from '../lib/feedPlaybackUrls';
import { typography } from '../theme/typography';

/** Delay Firestore engagement listeners until the swipe has settled. */
const ENGAGEMENT_MOUNT_DELAY_MS = 220;

type FeedReelItem = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  secondaryUrl?: string;
  dualFrontIsPrimary?: boolean;
  mediaType?: 'video' | 'photo';
  ownerUid: string;
  moderationStatus: string;
  maxDurationSeconds: number;
  challengeDate: string;
  likesCount: number;
  commentsCount: number;
  coLeapInvitees?: Array<{ uid: string; username: string; status: 'pending' | 'confirmed' }>;
};

type Props = {
  item: FeedReelItem;
  pageHeight: number;
  sheetBottom: number;
  tabBarClearance: number;
  /** Keep a paused decoder warm for this row (active ± neighbors). */
  mountVideo: boolean;
  /** Only the settled active reel should decode+play audio. */
  shouldPlay: boolean;
  isFocused: boolean;
  freezeLocked: boolean;
  showLockedOverlay: boolean;
  overlayUnlocking: boolean;
  showPreviousLeapsChip: boolean;
  showSwipeHint: boolean;
  dayTag: string | null;
  playback: FeedPlaybackUrls;
  posterUrl?: string | null;
  dataSaver: boolean;
  viewerUid?: string;
  viewerUsername?: string;
  canStaffMod: boolean;
  deletingId: string | null;
  nullingId: string | null;
  showFollowButton: boolean;
  showEngagement: boolean;
  onReelSheetLayout: (videoId: string, e: LayoutChangeEvent) => void;
  onReelActivate: (videoId: string) => void;
  onReady?: (videoId: string) => void;
  onConfirmDelete: (item: Pick<FeedReelItem, 'id' | 'ownerUid'>) => void;
  onConfirmStaffNull: (item: Pick<FeedReelItem, 'id' | 'ownerUid' | 'moderationStatus'>) => void;
};

function DeferredMount({
  active,
  delayMs,
  children,
  placeholder,
}: {
  active: boolean;
  delayMs: number;
  children: React.ReactNode;
  placeholder?: React.ReactNode;
}) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  if (!show) return <>{placeholder ?? null}</>;
  return <>{children}</>;
}

function FeedReelRowInner({
  item,
  pageHeight,
  sheetBottom,
  tabBarClearance,
  mountVideo,
  shouldPlay,
  isFocused,
  freezeLocked,
  showLockedOverlay,
  overlayUnlocking,
  showPreviousLeapsChip,
  showSwipeHint,
  dayTag,
  playback,
  posterUrl,
  dataSaver,
  viewerUid,
  viewerUsername,
  canStaffMod,
  deletingId,
  nullingId,
  showFollowButton,
  showEngagement,
  onReelSheetLayout,
  onReelActivate,
  onReady,
  onConfirmDelete,
  onConfirmStaffNull,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();

  const onSheetLayout = React.useCallback(
    (e: LayoutChangeEvent) => onReelSheetLayout(item.id, e),
    [item.id, onReelSheetLayout]
  );

  return (
    <View style={[styles.reelPage, { height: pageHeight }]} collapsable={false}>
      <View style={styles.reelVideoSlot}>
        {freezeLocked && isFocused ? (
          <LockedLeapFrame posterUrl={posterUrl} unlocking={overlayUnlocking} />
        ) : mountVideo ? (
          <FeedPostVideo
            reel
            url={playback.url}
            secondaryUrl={playback.secondaryUrl}
            dualFrontIsPrimary={playback.dualFrontIsPrimary}
            mediaType={item.mediaType}
            shouldPlay={shouldPlay}
            isMuted={false}
            useNativeControls
            maxDurationSeconds={item.maxDurationSeconds}
            dataSaver={dataSaver}
            analyticsVideoId={item.id}
            videoOwnerUid={item.ownerUid}
            viewerUid={viewerUid}
            viewerUsername={viewerUsername}
            posterUrl={posterUrl}
            onReelActivate={onReelActivate}
            onReady={onReady}
          />
        ) : (
          <ReelVideoPlaceholder posterUrl={posterUrl} />
        )}
      </View>
      <View style={styles.topScrim} pointerEvents="none" />
      <View style={styles.bottomScrim} pointerEvents="none" />

      <View
        style={[styles.reelSheet, { paddingBottom: tabBarClearance }]}
        onLayout={onSheetLayout}
      >
        <View style={styles.reelSheetTop}>
          <View style={styles.reelAvatar}>
            <Text style={styles.reelAvatarText}>{item.username[0]?.toUpperCase()}</Text>
          </View>
          <View style={styles.reelTextCol}>
            <UsernameLink uid={item.ownerUid} username={item.username} style={styles.reelUser} />
            {item.coLeapInvitees && item.coLeapInvitees.length > 0 ? (
              <Text style={styles.reelCoLeap} numberOfLines={2}>
                Co-Leap with{' '}
                {item.coLeapInvitees
                  .map((i) => {
                    const handle = `@${i.username.replace(/^@+/u, '')}`;
                    return i.status === 'confirmed' ? handle : `${handle} (pending)`;
                  })
                  .join(' · ')}
              </Text>
            ) : null}
            {dayTag ? <Text style={styles.reelDayTag}>{dayTag}</Text> : null}
            <Text style={styles.reelPrompt} numberOfLines={2}>
              {item.prompt}
            </Text>
          </View>
          <View style={styles.reelSheetActions}>
            {showFollowButton && viewerUid && viewerUsername ? (
              <FollowButton
                viewerUid={viewerUid}
                viewerUsername={viewerUsername}
                targetUid={item.ownerUid}
                targetUsername={item.username}
              />
            ) : null}
            {canStaffMod && item.ownerUid !== viewerUid ? (
              item.moderationStatus === 'nulled' ? (
                <Text style={styles.nulledBadge}>Nulled</Text>
              ) : item.moderationStatus === 'approved' ? (
                <TouchableOpacity
                  onPress={() => onConfirmStaffNull(item)}
                  disabled={nullingId === item.id}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Null this leap"
                >
                  <Text style={styles.nullLink}>{nullingId === item.id ? '…' : 'Null'}</Text>
                </TouchableOpacity>
              ) : null
            ) : null}
            {viewerUid && item.ownerUid === viewerUid ? (
              <>
                {item.moderationStatus === 'pending' ? (
                  <Text style={styles.pendingBadge}>Pending review</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => onConfirmDelete(item)}
                  disabled={deletingId === item.id}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete video"
                >
                  <Text style={styles.deleteLink}>{deletingId === item.id ? '…' : 'Delete'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
        {viewerUid && viewerUsername ? (
          <DeferredMount
            active={showEngagement && !showLockedOverlay}
            delayMs={ENGAGEMENT_MOUNT_DELAY_MS}
            placeholder={
              <View style={styles.reelEngagementPlaceholder}>
                <Text style={styles.reelEngagementPlaceholderText}>
                  Swipe to this leap — likes and comments load on the clip in view.
                </Text>
              </View>
            }
          >
            <View style={[styles.reelEngagementScroll, styles.engagementGlass]}>
              <FeedPostEngagement
                reelLayout
                videoId={item.id}
                videoOwnerUid={item.ownerUid}
                videoOwnerUsername={item.username}
                shareTitle={`${item.username} on Leap`}
                shareUrl={item.url}
                challengePrompt={item.prompt}
                viewerUid={viewerUid}
                viewerUsername={viewerUsername}
                initialLikesCount={item.likesCount}
                initialCommentsCount={item.commentsCount}
              />
            </View>
          </DeferredMount>
        ) : viewerUid ? (
          <View style={styles.reelEngagementPlaceholder}>
            <Text style={styles.reelEngagementPlaceholderText}>
              Swipe to this leap — likes and comments load on the clip in view.
            </Text>
          </View>
        ) : null}
        {showSwipeHint ? (
          <View style={styles.reelSwipeRail} pointerEvents="none">
            <Ionicons name="chevron-down" size={13} color={colors.muted} />
            <Text style={styles.reelSwipeRailText}>Swipe for more leaps</Text>
            <Ionicons name="chevron-down" size={13} color={colors.muted} />
          </View>
        ) : null}
      </View>
      {showPreviousLeapsChip ? (
        <View style={[styles.previousLeapsChip, { bottom: sheetBottom + 12 }]} pointerEvents="none">
          <Ionicons name="calendar-outline" size={15} color={colors.moss} />
          <Text style={styles.previousLeapsChipText}>Previous leaps</Text>
        </View>
      ) : null}
    </View>
  );
}

function propsEqual(a: Props, b: Props): boolean {
  return (
    a.item === b.item &&
    a.pageHeight === b.pageHeight &&
    a.sheetBottom === b.sheetBottom &&
    a.tabBarClearance === b.tabBarClearance &&
    a.mountVideo === b.mountVideo &&
    a.shouldPlay === b.shouldPlay &&
    a.isFocused === b.isFocused &&
    a.freezeLocked === b.freezeLocked &&
    a.showLockedOverlay === b.showLockedOverlay &&
    a.overlayUnlocking === b.overlayUnlocking &&
    a.showPreviousLeapsChip === b.showPreviousLeapsChip &&
    a.showSwipeHint === b.showSwipeHint &&
    a.dayTag === b.dayTag &&
    a.playback.url === b.playback.url &&
    a.playback.secondaryUrl === b.playback.secondaryUrl &&
    a.playback.dualFrontIsPrimary === b.playback.dualFrontIsPrimary &&
    a.posterUrl === b.posterUrl &&
    a.dataSaver === b.dataSaver &&
    a.viewerUid === b.viewerUid &&
    a.viewerUsername === b.viewerUsername &&
    a.canStaffMod === b.canStaffMod &&
    a.deletingId === b.deletingId &&
    a.nullingId === b.nullingId &&
    a.showFollowButton === b.showFollowButton &&
    a.showEngagement === b.showEngagement &&
    a.onReelSheetLayout === b.onReelSheetLayout &&
    a.onReelActivate === b.onReelActivate &&
    a.onReady === b.onReady &&
    a.onConfirmDelete === b.onConfirmDelete &&
    a.onConfirmStaffNull === b.onConfirmStaffNull
  );
}

/** Memoized full-page reel — isolates scroll activation from sheet/meta churn. */
export const FeedReelRow = React.memo(FeedReelRowInner, propsEqual);

const useStyles = () =>
  useThemedStyles((colors) => ({
    reelPage: {
      width: '100%',
      backgroundColor: '#101411',
    },
    reelVideoSlot: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    topScrim: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      height: 172,
      backgroundColor: 'rgba(5,10,7,0.25)',
    },
    bottomScrim: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: 330,
      backgroundColor: 'rgba(5,10,7,0.56)',
    },
    reelSheet: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'column',
      backgroundColor: 'transparent',
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 10,
    },
    reelSheetTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 4,
    },
    reelAvatar: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: '#1C7C43',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.34)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reelAvatarText: {
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
    },
    reelTextCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    reelUser: {
      fontSize: 15,
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
    },
    reelCoLeap: {
      fontSize: 12,
      fontFamily: typography.bodySemiBold,
      color: '#8FE3A8',
      marginTop: 1,
    },
    reelDayTag: {
      fontSize: 11,
      fontFamily: typography.bodyBold,
      color: '#8FE3A8',
      marginBottom: 2,
    },
    reelPrompt: {
      fontSize: 13,
      lineHeight: 18,
      fontFamily: typography.bodyMedium,
      color: 'rgba(255,255,255,0.78)',
    },
    reelSheetActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    nullLink: {
      fontSize: 13,
      fontWeight: '800',
      color: '#C0392B',
      paddingTop: 2,
    },
    nulledBadge: {
      fontSize: 12,
      fontWeight: '900',
      color: colors.muted,
      letterSpacing: 0.4,
    },
    pendingBadge: {
      fontSize: 12,
      fontFamily: typography.bodyBold,
      color: '#8FE3A8',
      letterSpacing: 0.3,
    },
    deleteLink: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.coral,
      paddingTop: 2,
    },
    reelEngagementScroll: {
      alignSelf: 'stretch',
    },
    engagementGlass: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    reelEngagementPlaceholder: {
      minHeight: 48,
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    reelEngagementPlaceholderText: {
      fontSize: 12,
      fontFamily: typography.bodyMedium,
      color: 'rgba(255,255,255,0.72)',
      textAlign: 'center',
    },
    reelSwipeRail: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 6,
      paddingBottom: 2,
      opacity: 0.85,
    },
    reelSwipeRailText: {
      fontSize: 12,
      fontFamily: typography.bodyBold,
      color: 'rgba(255,255,255,0.72)',
      letterSpacing: 0.3,
    },
    previousLeapsChip: {
      position: 'absolute',
      alignSelf: 'center',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 24,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.94)',
      borderWidth: 1,
      borderColor: 'rgba(45, 90, 61, 0.25)',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    previousLeapsChipText: {
      fontSize: 13,
      fontWeight: '900',
      color: colors.moss,
      letterSpacing: 0.4,
    },
  }));
