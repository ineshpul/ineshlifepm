import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BestPartCard } from '../components/BestPartCard';
import { Brandmark } from '../components/Brandmark';
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
} from '../lib/bestPartWeek';
import { useAuth } from '../state/auth';
import {
  subscribeCommunityBestParts,
  subscribeMyBestParts,
} from '../services/bestPartPosts';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { BestPartPost } from '../types/bestPart';
import { nyDateKey } from '../utils/nyTime';
import { showError } from '../utils/ui';

type Segment = 'mine' | 'community';

export function BestPartScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [segment, setSegment] = React.useState<Segment>('mine');
  const [mine, setMine] = React.useState<BestPartPost[]>([]);
  const [community, setCommunity] = React.useState<BestPartPost[]>([]);
  const [loading, setLoading] = React.useState(true);

  const styles = useThemedStyles((c) => ({
    screen: { paddingHorizontal: 18 },
    header: {
      paddingTop: 12,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 14,
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
      marginBottom: 16,
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
      paddingVertical: 48,
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
      marginTop: 8,
      alignSelf: 'stretch' as const,
      backgroundColor: c.green,
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexDirection: 'row' as const,
      gap: 8,
    },
    ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' as const },
    hint: {
      marginTop: 8,
      textAlign: 'center' as const,
      fontSize: 11,
      fontWeight: '700' as const,
      letterSpacing: 1.1,
      color: c.muted2,
    },
    listPad: { paddingBottom: floatingTabContentClearance(insets.bottom) + 88 },
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
      marginBottom: 14,
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

  React.useEffect(() => {
    if (segment !== 'community') return;
    setLoading(true);
    const unsub = subscribeCommunityBestParts(
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
  }, [segment]);

  const todayKey = nyDateKey();
  const postedToday = mine.some((p) => p.dateKey === todayKey);
  const data = segment === 'mine' ? mine : community;
  const weekPosts = React.useMemo(() => weekPostsForRecap(mine), [mine]);
  const showWeekCard = segment === 'mine' && weekPosts.length > 0;
  const sunday = isNySunday();

  const openCapture = () => navigateToBestPartCapture(navigation as never);

  const openWeekRecap = () => {
    navigateToBestPartWeekRecap(navigation as never, {
      posts: weekPosts.map((p) => ({
        id: p.id,
        dateKey: p.dateKey,
        caption: p.caption,
        mediaType: p.mediaType,
        url: p.url,
      })),
    });
  };

  return (
    <Screen style={styles.screen} edges={['top', 'left', 'right']}>
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

      <View style={styles.segments}>
        <Pressable
          style={[styles.segBtn, segment === 'mine' && styles.segBtnOn]}
          onPress={() => setSegment('mine')}
        >
          <Text style={[styles.segText, segment === 'mine' && styles.segTextOn]}>Mine</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, segment === 'community' && styles.segBtnOn]}
          onPress={() => setSegment('community')}
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
            <Text style={styles.weekTitle}>
              {sunday ? 'Your week is ready' : 'Your week so far'}
            </Text>
            <Text style={styles.weekSub}>
              Play back your {weekPosts.length} best moment{weekPosts.length === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.weekPlay}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
        </Pressable>
      ) : null}

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={segment === 'mine' ? 'sunny-outline' : 'people-outline'}
                size={40}
                color={colors.moss}
              />
              <Text style={styles.emptyTitle}>
                {segment === 'mine' ? 'No moments yet' : 'No public moments yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {segment === 'mine'
                  ? 'Capture one good moment today through Leap’s camera. Photo or short video with a caption.'
                  : 'When people share publicly, their best parts of the day show up here. No leap gate.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <BestPartCard post={item} showOwner={segment === 'community'} />
          )}
        />
      )}

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable style={styles.cta} onPress={openCapture} accessibilityRole="button">
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.ctaText}>
            {postedToday ? 'Retake today’s moment' : 'Post the best part of your day'}
          </Text>
        </Pressable>
        <Text style={styles.hint}>CAPTURED LIVE IN LEAP · NO UPLOADS</Text>
      </View>
    </Screen>
  );
}
