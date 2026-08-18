import * as React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { useUserAvatar } from '../hooks/useUserAvatar';
import { FeedPostEngagement } from './FeedPostEngagement';
import { FeedPostVideo, ReelVideoPlaceholder } from './FeedPostVideo';
import { FeedReelScrim } from './FeedReelScrim';
import { FollowButton } from './FollowButton';
import { LockedLeapFrame } from './LockedLeapFrame';
import { UsernameLink } from './UsernameLink';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { FeedPlaybackUrls } from '../lib/feedPlaybackUrls';
import { typography } from '../theme/typography';

/** Delay Firestore engagement listeners until the swipe has settled. */
const ENGAGEMENT_MOUNT_DELAY_MS = 220;

/** Fade heights for the legibility gradients behind the top tabs and the caption block. */
const REEL_TOP_SCRIM_HEIGHT = 190;
const REEL_BOTTOM_SCRIM_HEIGHT = 340;

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
  /** Denormalized owner avatar on the post; falls back to a `users/{uid}` lookup. */
  photoUrl?: string;
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
  showSwipeHint: boolean;
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
  showSwipeHint,
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
  const avatarUrl = useUserAvatar(item.ownerUid, item.photoUrl);

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
      <FeedReelScrim edge="top" height={REEL_TOP_SCRIM_HEIGHT} strength={0.5} />
      <FeedReelScrim edge="bottom" height={REEL_BOTTOM_SCRIM_HEIGHT} strength={0.72} />

      <View
        style={[styles.overlayBottom, { paddingBottom: tabBarClearance }]}
        onLayout={onSheetLayout}
      >
        <View style={styles.metaCol}>
          <View style={styles.metaTopRow}>
            <View style={styles.reelAvatar}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  recyclingKey={`${item.ownerUid}|${avatarUrl}`}
                  style={styles.reelAvatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <Text style={styles.reelAvatarText}>{item.username[0]?.toUpperCase()}</Text>
              )}
            </View>
            <UsernameLink uid={item.ownerUid} username={item.username} style={styles.reelUser} />
            {showFollowButton && viewerUid && viewerUsername ? (
              <FollowButton
                viewerUid={viewerUid}
                viewerUsername={viewerUsername}
                targetUid={item.ownerUid}
                targetUsername={item.username}
                hideWhenFollowing
              />
            ) : null}
            {viewerUid === item.ownerUid && item.moderationStatus === 'pending' ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Pending review</Text>
              </View>
            ) : null}
            {canStaffMod && item.moderationStatus === 'nulled' ? (
              <View style={[styles.statusPill, styles.statusPillMuted]}>
                <Text style={styles.statusPillText}>Nulled</Text>
              </View>
            ) : null}
          </View>
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
          <Text style={styles.reelPrompt} numberOfLines={3}>
            {item.prompt}
          </Text>
          {showSwipeHint ? (
            <View style={styles.reelSwipeRail} pointerEvents="none">
              <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.reelSwipeRailText}>Swipe for more leaps</Text>
              <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.7)" />
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[styles.actionRailAnchor, { paddingBottom: tabBarClearance + 6 }]}
        pointerEvents="box-none"
      >
        {viewerUid ? (
          <View style={styles.actionRail}>
            {viewerUsername ? (
              <DeferredMount
                active={showEngagement && !showLockedOverlay}
                delayMs={ENGAGEMENT_MOUNT_DELAY_MS}
                placeholder={<View style={styles.railPlaceholder} />}
              >
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
              </DeferredMount>
            ) : null}

            {item.ownerUid === viewerUid ? (
              <TouchableOpacity
                style={styles.railChip}
                onPress={() => onConfirmDelete(item)}
                disabled={deletingId === item.id}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Delete this leap"
              >
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color="#FFB4A2" />
                ) : (
                  <Ionicons name="trash-outline" size={19} color="#FFB4A2" />
                )}
              </TouchableOpacity>
            ) : null}

            {canStaffMod &&
            item.ownerUid !== viewerUid &&
            item.moderationStatus === 'approved' ? (
              <TouchableOpacity
                style={styles.railChip}
                onPress={() => onConfirmStaffNull(item)}
                disabled={nullingId === item.id}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Null this leap"
              >
                {nullingId === item.id ? (
                  <ActivityIndicator size="small" color="#FF8A75" />
                ) : (
                  <Ionicons name="ban-outline" size={19} color="#FF8A75" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
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
    a.showSwipeHint === b.showSwipeHint &&
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
    overlayBottom: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      paddingHorizontal: 14,
      paddingTop: 12,
      gap: 8,
    },
    metaCol: {
      flex: 1,
      minWidth: 0,
      /** Clears the floating right rail so captions never run under it. */
      paddingRight: 64,
      paddingBottom: 6,
      gap: 4,
    },
    metaTopRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 2,
    },
    reelAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden' as const,
      backgroundColor: '#1C7C43',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.34)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    reelAvatarImg: {
      width: '100%' as const,
      height: '100%' as const,
    },
    reelAvatarText: {
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
    },
    reelUser: {
      fontSize: 15,
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
      flexShrink: 1,
    },
    reelCoLeap: {
      fontSize: 12,
      fontFamily: typography.bodySemiBold,
      color: '#8FE3A8',
    },
    statusPill: {
      flexShrink: 0,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(12, 20, 15, 0.5)',
      borderWidth: 1,
      borderColor: 'rgba(143, 227, 168, 0.45)',
    },
    statusPillMuted: {
      borderColor: 'rgba(255,255,255,0.28)',
    },
    statusPillText: {
      fontSize: 11,
      fontFamily: typography.bodyBold,
      color: '#DCF5E3',
      letterSpacing: 0.2,
    },
    reelPrompt: {
      fontSize: 14,
      lineHeight: 19,
      fontFamily: typography.bodyMedium,
      color: 'rgba(255,255,255,0.92)',
    },
    /** Rail bottom-aligns with the caption baseline, TikTok/Reels style. */
    actionRailAnchor: {
      position: 'absolute' as const,
      right: 6,
      top: 0,
      bottom: 0,
      justifyContent: 'flex-end' as const,
      alignItems: 'center' as const,
    },
    actionRail: {
      width: 56,
      alignItems: 'center' as const,
    },
    /** Owner delete / staff null — quiet glyphs under the engagement stack. */
    railChip: {
      marginTop: 18,
      width: 34,
      height: 34,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      opacity: 0.75,
    },
    /** Matches the mounted rail height so icons don't shift when engagement attaches. */
    railPlaceholder: {
      width: 56,
      height: 172,
    },
    reelSwipeRail: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingTop: 6,
      opacity: 0.85,
    },
    reelSwipeRailText: {
      fontSize: 12,
      fontFamily: typography.bodyBold,
      color: 'rgba(255,255,255,0.72)',
      letterSpacing: 0.3,
    },
  }));
