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
  useWindowDimensions,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestPartCard } from '../components/BestPartCard';
import { ModernFeedModeSwitch } from '../components/modern/ModernFeedModeSwitch';
import { Screen } from '../components/Screen';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import { getBestPartById, subscribeCommunityBestParts } from '../services/bestPartPosts';
import { deleteOwnedBestPart } from '../services/deleteBestPart';
import { useAuth } from '../state/auth';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import type { BestPartPost } from '../types/bestPart';
import {
  formatNyDateKeyShort,
  nyDateKey,
  nyRecentChallengeDateKeys,
  prevNyDateKey,
} from '../utils/nyTime';
import { showError, showInfo } from '../utils/ui';
import { weekdayLabelForDateKey } from '../lib/bestPartWeek';

const COMMUNITY_DAY_WINDOW = 21;

type Props = {
  embedded?: boolean;
  onRequestDaily?: () => void;
  initialPostId?: string;
  onInitialPostHandled?: () => void;
};

function communityDayLabel(dateKey: string, todayKey: string): string {
  const short = formatNyDateKeyShort(dateKey);
  if (dateKey === todayKey) return `Today · ${short}`;
  if (dateKey === prevNyDateKey(todayKey)) return `Yesterday · ${short}`;
  return weekdayLabelForDateKey(dateKey);
}

export function BestPartScreen({
  embedded = false,
  onRequestDaily,
  initialPostId,
  onInitialPostHandled,
}: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { preferences } = useSettingsPreferences();
  const todayKey = nyDateKey();

  const [communityDateKey, setCommunityDateKey] = React.useState(todayKey);
  const [community, setCommunity] = React.useState<BestPartPost[]>([]);
  const [notificationTargetPost, setNotificationTargetPost] =
    React.useState<BestPartPost | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dayPickerOpen, setDayPickerOpen] = React.useState(false);
  const [activePostId, setActivePostId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [slotHeight, setSlotHeight] = React.useState(0);
  const listRef = React.useRef<FlatList<BestPartPost>>(null);
  const pendingInitialPostIdRef = React.useRef(String(initialPostId ?? '').trim());

  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: '#101411' },
    slot: { flex: 1, minHeight: 0, backgroundColor: '#101411' },
    list: { flex: 1 },
    modeSwitch: {
      position: 'absolute' as const,
      top: 8,
      left: 0,
      right: 0,
      zIndex: 30,
    },
    dayDropdown: {
      position: 'absolute' as const,
      top: 64,
      left: 14,
      zIndex: 30,
      maxWidth: '75%' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(15,24,18,0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    dayDropdownText: {
      flexShrink: 1,
      color: '#FFFFFF',
      fontSize: 13,
      fontFamily: typography.bodySemiBold,
    },
    empty: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 28,
      gap: 10,
      backgroundColor: '#101411',
    },
    emptyTitle: {
      color: '#FFFFFF',
      fontSize: 18,
      fontFamily: typography.displayBold,
      textAlign: 'center' as const,
    },
    emptyBody: {
      color: 'rgba(255,255,255,0.62)',
      fontSize: 14,
      lineHeight: 20,
      fontFamily: typography.bodyMedium,
      textAlign: 'center' as const,
    },
    pickerRoot: {
      flex: 1,
      justifyContent: 'flex-end' as const,
      backgroundColor: 'rgba(0,0,0,0.42)',
    },
    pickerBackdrop: { ...StyleSheet.absoluteFillObject },
    pickerCard: {
      maxHeight: '70%' as const,
      paddingTop: 16,
      paddingHorizontal: 18,
      paddingBottom: Math.max(insets.bottom, 16),
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      backgroundColor: c.card,
    },
    pickerTitle: {
      marginBottom: 10,
      color: c.text,
      fontSize: 16,
      fontWeight: '800' as const,
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
    pickerLabel: { color: c.text, fontSize: 16, fontWeight: '600' as const },
    pickerLabelOn: { color: c.green, fontWeight: '800' as const },
    pickerDone: {
      marginTop: 12,
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: c.cardTint,
    },
    pickerDoneText: { color: c.green, fontSize: 15, fontWeight: '800' as const },
  }));

  const blockedUsernames = React.useMemo(
    () => new Set(preferences.blockedUsernames.map((name) => name.toLowerCase())),
    [preferences.blockedUsernames]
  );
  const hiddenIds = React.useMemo(
    () => new Set(preferences.hiddenVideoIds),
    [preferences.hiddenVideoIds]
  );
  const data = React.useMemo(() => {
    const merged =
      notificationTargetPost &&
      notificationTargetPost.dateKey === communityDateKey &&
      !community.some((post) => post.id === notificationTargetPost.id)
        ? [notificationTargetPost, ...community]
        : community;
    return merged.filter(
        (post) =>
          !hiddenIds.has(post.id) &&
          !blockedUsernames.has(String(post.username ?? '').toLowerCase())
      );
  }, [blockedUsernames, community, communityDateKey, hiddenIds, notificationTargetPost]);
  const communityDays = React.useMemo(
    () => nyRecentChallengeDateKeys(todayKey, COMMUNITY_DAY_WINDOW),
    [todayKey]
  );
  const tabBarClearance = floatingTabContentClearance(insets.bottom);
  const pageHeight =
    slotHeight > 0 ? slotHeight : Math.max(380, windowHeight - insets.top);

  React.useEffect(() => {
    const id = String(initialPostId ?? '').trim();
    if (!id) return;
    pendingInitialPostIdRef.current = id;
    let cancelled = false;
    void getBestPartById(id)
      .then((post) => {
        if (cancelled || !post) return;
        setNotificationTargetPost(post);
        setCommunityDateKey(post.dateKey);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialPostId]);

  React.useEffect(() => {
    setLoading(true);
    setCommunity([]);
    setActivePostId(null);
    const unsubscribe = subscribeCommunityBestParts(
      communityDateKey,
      (posts) => {
        setCommunity(posts);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        showError('Could not load community', error);
      }
    );
    return unsubscribe;
  }, [communityDateKey]);

  React.useEffect(() => {
    setActivePostId((current) =>
      current && data.some((post) => post.id === current) ? current : data[0]?.id ?? null
    );
  }, [data]);

  React.useEffect(() => {
    const targetId = pendingInitialPostIdRef.current;
    if (!targetId || pageHeight <= 40) return;
    const index = data.findIndex((post) => post.id === targetId);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: index * pageHeight, animated: false });
      setActivePostId(targetId);
      pendingInitialPostIdRef.current = '';
      onInitialPostHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [data, onInitialPostHandled, pageHeight]);

  const onSlotLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.floor(event.nativeEvent.layout.height);
    if (nextHeight > 0) {
      setSlotHeight((current) => (Math.abs(current - nextHeight) > 2 ? nextHeight : current));
    }
  }, []);

  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: ViewToken<BestPartPost>[] }) => {
      const visible = viewableItems.find((token) => token.isViewable && token.item?.id);
      setActivePostId(visible?.item.id ?? null);
    }
  ).current;
  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 1,
  }).current;

  const requestDaily = React.useCallback(() => {
    if (onRequestDaily) {
      onRequestDaily();
      return;
    }
    (navigation as any).navigate('Feed', { mode: 'daily' });
  }, [navigation, onRequestDaily]);

  const confirmDelete = React.useCallback(
    (post: BestPartPost) => {
      if (!user?.uid || post.uid !== user.uid) return;
      Alert.alert(
        'Delete this moment?',
        'It will be removed from your profile and the community reel.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setDeletingId(post.id);
                try {
                  await deleteOwnedBestPart({ bestPartId: post.id, viewerUid: user.uid });
                  showInfo('Deleted', 'Moment removed.');
                } catch (error) {
                  showError('Could not delete', error);
                } finally {
                  setDeletingId(null);
                }
              })();
            },
          },
        ]
      );
    },
    [user?.uid]
  );

  return (
    <Screen
      style={styles.screen}
      edges={embedded ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.slot} onLayout={onSlotLayout}>
        <ModernFeedModeSwitch
          active="best"
          onDailyPress={requestDaily}
          onBestPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          style={styles.modeSwitch}
        />
        <Pressable
          style={styles.dayDropdown}
          onPress={() => setDayPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Community date, ${communityDayLabel(communityDateKey, todayKey)}`}
        >
          <Ionicons name="calendar-outline" size={16} color="#8FE3A8" />
          <Text style={styles.dayDropdownText} numberOfLines={1}>
            {communityDayLabel(communityDateKey, todayKey)}
          </Text>
          <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.72)" />
        </Pressable>

        <FlatList
          ref={listRef}
          style={styles.list}
          data={data}
          keyExtractor={(post) => post.id}
          extraData={`${activePostId ?? ''}:${deletingId ?? ''}:${pageHeight}:${isFocused ? 1 : 0}`}
          pagingEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          getItemLayout={
            slotHeight > 0
              ? (_, index) => ({
                  length: pageHeight,
                  offset: pageHeight * index,
                  index,
                })
              : undefined
          }
          contentContainerStyle={data.length === 0 ? { flexGrow: 1 } : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? (
                <ActivityIndicator size="large" color={colors.moss} />
              ) : (
                <>
                  <Ionicons name="people-outline" size={42} color={colors.moss} />
                  <Text style={styles.emptyTitle}>
                    {communityDateKey === todayKey
                      ? 'No public moments today'
                      : `No public moments for ${weekdayLabelForDateKey(communityDateKey)}`}
                  </Text>
                  <Text style={styles.emptyBody}>Pick another day from the date menu.</Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <BestPartCard
              post={item}
              showOwner
              autoPlay={isFocused && activePostId === item.id}
              playbackEnabled={isFocused}
              onDelete={
                user?.uid && item.uid === user.uid ? () => confirmDelete(item) : undefined
              }
              actionsDisabled={deletingId === item.id}
              reelHeight={pageHeight}
              bottomClearance={tabBarClearance}
            />
          )}
        />
      </View>

      <Modal
        visible={dayPickerOpen}
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
                const selected = key === communityDateKey;
                return (
                  <Pressable
                    style={styles.pickerRow}
                    onPress={() => {
                      setCommunityDateKey(key);
                      setDayPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.pickerLabel, selected && styles.pickerLabelOn]}>
                      {communityDayLabel(key, todayKey)}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={20} color={colors.moss} />
                    ) : null}
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
    </Screen>
  );
}
