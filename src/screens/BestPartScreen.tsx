import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestPartCard } from '../components/BestPartCard';
import { Brandmark } from '../components/Brandmark';
import { FeedCameraRollSaveBanner } from '../components/FeedCameraRollSaveBanner';
import { Screen } from '../components/Screen';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import {
  navigateToBestPartCapture,
  navigateToBestPartWeekRecap,
} from '../navigation/navigationHelpers';
import {
  isNySunday,
  weekPostsForRecap,
  weekRangeLabel,
  currentBestPartWeekDateKeys,
  weekdayLabelForDateKey,
} from '../lib/bestPartWeek';
import { useAuth } from '../state/auth';
import { useBackgroundBestPartUpload } from '../state/backgroundBestPartUpload';
import {
  subscribeCommunityBestParts,
  subscribeMyBestParts,
} from '../services/bestPartPosts';
import { deleteOwnedBestPart } from '../services/deleteBestPart';
import { prefetchWeekRecapClips } from '../services/bestPartWeekRecapCache';
import {
  takeCameraRollSaveOffer,
  type CameraRollSaveOffer,
} from '../state/pendingCameraRollSave';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { BestPartPost } from '../types/bestPart';
import {
  formatNyDateKeyShort,
  nyDateKey,
  nyRecentChallengeDateKeys,
  prevNyDateKey,
} from '../utils/nyTime';
import { showError, showInfo } from '../utils/ui';

type Segment = 'mine' | 'community';

const COMMUNITY_DAY_WINDOW = 21;

function communityDayLabel(dateKey: string, todayKey: string): string {
  const short = formatNyDateKeyShort(dateKey);
  if (dateKey === todayKey) return `Today · ${short}`;
  if (dateKey === prevNyDateKey(todayKey)) return `Yesterday · ${short}`;
  return weekdayLabelForDateKey(dateKey);
}

export function BestPartScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { preferences } = useSettingsPreferences();
  const {
    isActive: backgroundUploadActive,
    pendingBestPart,
    cancelBackgroundBestPart,
  } = useBackgroundBestPartUpload();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const blockedUsernames = React.useMemo(
    () => new Set(preferences.blockedUsernames.map((u) => u.toLowerCase())),
    [preferences.blockedUsernames]
  );
  const hiddenIds = React.useMemo(
    () => new Set(preferences.hiddenVideoIds),
    [preferences.hiddenVideoIds]
  );
  const [segment, setSegment] = React.useState<Segment>('mine');
  const [mine, setMine] = React.useState<BestPartPost[]>([]);
  const [community, setCommunity] = React.useState<BestPartPost[]>([]);
  const [communityDateKey, setCommunityDateKey] = React.useState(() => nyDateKey());
  const [dayPickerOpen, setDayPickerOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [cameraRollSaveOffer, setCameraRollSaveOffer] =
    React.useState<CameraRollSaveOffer | null>(null);
  const listRef = React.useRef<FlatList<BestPartPost>>(null);

  useFocusEffect(
    React.useCallback(() => {
      const offer = takeCameraRollSaveOffer();
      if (offer) setCameraRollSaveOffer(offer);
      // Tab entry always lands on Mine from the top (not the prior scroll position).
      setSegment('mine');
      setDayPickerOpen(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }, [])
  );

  const styles = useThemedStyles((c) => ({
    screen: { flex: 1 },
    list: { flex: 1 },
    header: {
      paddingTop: 8,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 12,
    },
    brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
    titleBlock: { gap: 2 },
    kicker: {
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.4,
      color: c.moss,
    },
    title: { fontSize: 26, fontWeight: '900' as const, color: c.text, letterSpacing: -0.5 },
    segments: {
      flexDirection: 'row' as const,
      backgroundColor: c.cardTint,
      borderRadius: 14,
      padding: 4,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
    },
    segBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 11,
      alignItems: 'center' as const,
    },
    segBtnOn: { backgroundColor: c.card },
    segText: { fontSize: 14, fontWeight: '700' as const, color: c.muted2 },
    segTextOn: { color: c.green },
    empty: {
      paddingVertical: 56,
      paddingHorizontal: 12,
      alignItems: 'center' as const,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800' as const,
      color: c.text,
      textAlign: 'center' as const,
    },
    emptyBody: {
      fontSize: 14,
      lineHeight: 20,
      color: c.muted2,
      textAlign: 'center' as const,
      maxWidth: 280,
    },
    cta: {
      alignSelf: 'stretch' as const,
      backgroundColor: c.green,
      borderRadius: 999,
      paddingVertical: 15,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexDirection: 'row' as const,
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' as const },
    listPad: {
      paddingHorizontal: 18,
      paddingBottom: floatingTabContentClearance(insets.bottom) + 16,
    },
    listPadWithFab: {
      paddingHorizontal: 18,
      paddingBottom: floatingTabContentClearance(insets.bottom) + 76,
    },
    fabWrap: {
      position: 'absolute' as const,
      left: 18,
      right: 18,
      bottom: floatingTabContentClearance(insets.bottom) + 8,
    },
    weekCard: {
      borderRadius: 18,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 18,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
    },
    weekCopy: { flex: 1, gap: 3 },
    weekKicker: {
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.1,
      color: c.moss,
    },
    weekTitle: { fontSize: 16, fontWeight: '800' as const, color: c.text },
    weekSub: { fontSize: 13, color: c.muted2, fontWeight: '600' as const },
    weekPlay: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.green,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    dayDropdown: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      marginBottom: 14,
      maxWidth: '100%' as const,
    },
    dayDropdownText: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: c.text,
      flexShrink: 1,
    },
    saveBanner: {
      marginHorizontal: 0,
      marginBottom: 12,
    },
    pickerRoot: {
      flex: 1,
      justifyContent: 'flex-end' as const,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    pickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    pickerCard: {
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 16,
      paddingBottom: Math.max(insets.bottom, 16),
      paddingHorizontal: 18,
      maxHeight: '70%' as const,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
    },
    pickerTitle: {
      fontSize: 16,
      fontWeight: '800' as const,
      color: c.text,
      marginBottom: 10,
      textAlign: 'center' as const,
    },
    pickerList: { flexGrow: 0 },
    pickerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.profileAccentBorder,
    },
    pickerRowOn: {},
    pickerLabel: { fontSize: 16, fontWeight: '600' as const, color: c.text },
    pickerLabelOn: { color: c.green, fontWeight: '800' as const },
    pickerDone: {
      marginTop: 12,
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: c.cardTint,
    },
    pickerDoneText: { fontSize: 15, fontWeight: '800' as const, color: c.green },
  }));

  React.useEffect(() => {
    if (!user?.uid) {
      setMine([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeMyBestParts(
      user.uid,
      (posts) => {
        setMine(posts);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        showError('Could not load your moments', err);
      }
    );
    return unsub;
  }, [user?.uid]);

  const todayKey = nyDateKey();

  React.useEffect(() => {
    if (segment !== 'community') return;
    setLoading(true);
    setCommunity([]);
    const unsub = subscribeCommunityBestParts(
      communityDateKey,
      (posts) => {
        setCommunity(posts);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        showError('Could not load community', err);
      }
    );
    return unsub;
  }, [segment, communityDateKey]);

  const communityDays = React.useMemo(
    () => nyRecentChallengeDateKeys(todayKey, COMMUNITY_DAY_WINDOW),
    [todayKey]
  );

  const pendingToday =
    pendingBestPart && pendingBestPart.dateKey === todayKey ? pendingBestPart : null;
  const postedToday =
    mine.some((p) => p.dateKey === todayKey) || Boolean(pendingToday);
  const mineWithPending = React.useMemo((): BestPartPost[] => {
    if (!pendingToday) return mine;
    if (mine.some((p) => p.id === pendingToday.id)) return mine;
    const optimistic: BestPartPost = {
      id: pendingToday.id,
      uid: pendingToday.uid,
      username: pendingToday.username,
      dateKey: pendingToday.dateKey,
      caption: pendingToday.caption,
      mediaType: pendingToday.mediaType,
      url: pendingToday.localUri,
      storagePath: '',
      secondaryUrl: pendingToday.secondaryUri ?? undefined,
      dualFrontIsPrimary: pendingToday.dualFrontIsPrimary,
      durationSeconds: pendingToday.durationSeconds,
      isPrivate: pendingToday.isPrivate,
      deleted: false,
      likesCount: 0,
      commentsCount: 0,
    };
    return [optimistic, ...mine];
  }, [mine, pendingToday]);
  const data = React.useMemo(() => {
    const raw = segment === 'mine' ? mineWithPending : community;
    if (segment === 'mine') {
      return raw.filter((p) => !hiddenIds.has(p.id));
    }
    return raw.filter(
      (p) =>
        !hiddenIds.has(p.id) && !blockedUsernames.has(String(p.username ?? '').toLowerCase())
    );
  }, [segment, mineWithPending, community, hiddenIds, blockedUsernames]);
  const weekPosts = React.useMemo(() => weekPostsForRecap(mine), [mine]);
  // Sunday-only — hide mid-week “your week so far” chrome that crowded the feed.
  const showWeekCard = segment === 'mine' && isNySunday() && weekPosts.length > 0;

  // Warm week-recap clips while the Sunday card is visible so playback isn't cold-start.
  React.useEffect(() => {
    if (!showWeekCard) return;
    const urls = weekPosts
      .filter((p) => p.mediaType === 'video')
      .map((p) => (p.feedUrl || p.url).trim())
      .filter(Boolean);
    prefetchWeekRecapClips(urls);
  }, [showWeekCard, weekPosts]);
  // Bottom CTA only on Mine when you haven’t posted yet. After posting, Redo lives on today’s card.
  const showPostFab = segment === 'mine' && !postedToday;
  const todayPostId = React.useMemo(() => {
    if (segment !== 'mine') return null;
    return mineWithPending.find((p) => p.dateKey === todayKey)?.id ?? null;
  }, [mineWithPending, segment, todayKey]);

  const [visibleIds, setVisibleIds] = React.useState<Set<string>>(() => new Set());
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: BestPartPost }> }) => {
      setVisibleIds(new Set(viewableItems.map((v) => v.item.id)));
    }
  ).current;
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 55 }).current;

  const openCapture = () => {
    if (backgroundUploadActive) {
      showInfo('Still uploading', 'Wait for today’s moment to finish uploading.');
      return;
    }
    navigateToBestPartCapture(navigation as never);
  };

  const confirmDelete = (post: BestPartPost) => {
    if (!user?.uid || post.uid !== user.uid) return;
    Alert.alert(
      'Delete this moment?',
      'It will be removed from Mine and Community. You can post again for that day if it was today.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeletingId(post.id);
              try {
                if (pendingBestPart?.id === post.id) {
                  cancelBackgroundBestPart();
                }
                await deleteOwnedBestPart({ bestPartId: post.id, viewerUid: user.uid });
                showInfo('Deleted', 'Moment removed.');
              } catch (e) {
                showError('Could not delete', e);
              } finally {
                setDeletingId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const openWeekRecap = () => {
    if (!isNySunday()) return;
    navigateToBestPartWeekRecap(navigation as never, {
      username: user?.username ?? weekPosts[0]?.username ?? 'user',
      posts: weekPosts.map((p) => ({
        id: p.id,
        dateKey: p.dateKey,
        caption: p.caption,
        mediaType: p.mediaType,
        url: p.url,
        feedUrl: p.feedUrl,
      })),
    });
  };

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Brandmark size={36} />
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>YOUR MOMENTS</Text>
            <Text style={styles.title}>Best of the day</Text>
          </View>
        </View>
        <Ionicons name="sunny" size={28} color={colors.moss} />
      </View>

      {cameraRollSaveOffer ? (
        <FeedCameraRollSaveBanner
          clipUri={cameraRollSaveOffer.uri}
          challenge={cameraRollSaveOffer.challenge}
          onDismiss={() => setCameraRollSaveOffer(null)}
          style={styles.saveBanner}
        />
      ) : null}

      <View style={styles.segments}>
        <Pressable
          style={[styles.segBtn, segment === 'mine' && styles.segBtnOn]}
          onPress={() => {
            setDayPickerOpen(false);
            setSegment('mine');
          }}
        >
          <Text style={[styles.segText, segment === 'mine' && styles.segTextOn]}>Mine</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, segment === 'community' && styles.segBtnOn]}
          onPress={() => {
            setCommunityDateKey(nyDateKey());
            setDayPickerOpen(false);
            setSegment('community');
          }}
        >
          <Text style={[styles.segText, segment === 'community' && styles.segTextOn]}>Community</Text>
        </Pressable>
      </View>

      {showWeekCard ? (
        <Pressable style={styles.weekCard} onPress={openWeekRecap} accessibilityRole="button">
          <View style={styles.weekCopy}>
            <Text style={styles.weekKicker}>
              YOUR WEEK · {weekRangeLabel(currentBestPartWeekDateKeys())}
            </Text>
            <Text style={styles.weekTitle}>Your week is ready</Text>
            <Text style={styles.weekSub}>
              Play back your {weekPosts.length} best moment{weekPosts.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.weekPlay}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </Pressable>
      ) : null}

      {segment === 'community' ? (
        <Pressable
          style={styles.dayDropdown}
          onPress={() => setDayPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Community date, ${communityDayLabel(communityDateKey, todayKey)}`}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.moss} />
          <Text style={styles.dayDropdownText} numberOfLines={1}>
            {communityDayLabel(communityDateKey, todayKey)}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.muted2} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen style={styles.screen} edges={['top', 'left', 'right']}>
      {loading && data.length === 0 ? (
        <View style={[styles.listPad, styles.empty]}>
          {listHeader}
          <ActivityIndicator color={colors.green} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          key={segment}
          style={styles.list}
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={showPostFab ? styles.listPadWithFab : styles.listPad}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={segment === 'mine' ? 'sunny-outline' : 'people-outline'}
                size={40}
                color={colors.moss}
              />
              <Text style={styles.emptyTitle}>
                {segment === 'mine'
                  ? 'No moments yet'
                  : communityDateKey === todayKey
                    ? 'No public moments today'
                    : `No public moments for ${weekdayLabelForDateKey(communityDateKey)}`}
              </Text>
              {segment === 'community' ? (
                <Text style={styles.emptyBody}>
                  Pick another day from the date menu above.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const isMineTab = segment === 'mine';
            const isOwn = Boolean(user?.uid && item.uid === user.uid);
            return (
              <BestPartCard
                post={item}
                showOwner={segment === 'community'}
                autoPlay={segment === 'community' && visibleIds.has(item.id)}
                onRetake={isMineTab && item.id === todayPostId ? openCapture : undefined}
                onDelete={isOwn ? () => confirmDelete(item) : undefined}
                actionsDisabled={backgroundUploadActive || deletingId === item.id}
              />
            );
          }}
        />
      )}

      <Modal
        visible={dayPickerOpen && segment === 'community'}
        transparent
        animationType="fade"
        onRequestClose={() => setDayPickerOpen(false)}
      >
        <View style={styles.pickerRoot}>
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => setDayPickerOpen(false)}
            accessibilityLabel="Close date picker"
          />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Browse a day</Text>
            <FlatList
              style={styles.pickerList}
              data={communityDays}
              keyExtractor={(key) => key}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: key }) => {
                const on = key === communityDateKey;
                return (
                  <Pressable
                    style={[styles.pickerRow, on && styles.pickerRowOn]}
                    onPress={() => {
                      setCommunityDateKey(key);
                      setDayPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.pickerLabel, on && styles.pickerLabelOn]}>
                      {communityDayLabel(key, todayKey)}
                    </Text>
                    {on ? <Ionicons name="checkmark" size={20} color={colors.moss} /> : null}
                  </Pressable>
                );
              }}
            />
            <Pressable style={styles.pickerDone} onPress={() => setDayPickerOpen(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {segment === 'mine' && showPostFab ? (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            style={[styles.cta, backgroundUploadActive && { opacity: 0.55 }]}
            onPress={openCapture}
            accessibilityRole="button"
            disabled={backgroundUploadActive}
          >
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.ctaText}>Post the best part of your day</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
