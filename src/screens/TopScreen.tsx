import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

import { Screen } from '../components/Screen';
import { UsernameSearchBlock } from '../components/UsernameSearchBlock';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import {
  initialsFromDisplayName,
  leaderboardAvatarUrl,
  leaderboardDisplayName,
  sortAllTimeLeaderboardDocs,
  sortLeaderboardDocs,
  wireRowsFromSorted,
  type LeaderboardTimeframe,
  type LeaderboardWireRow,
} from '../lib/leaderboardRows';
import { computeFeedViewingFromNow, normalizeNyDateKey } from '../utils/nyTime';
import {
  getCurrentWeekKey,
  getPriorWeekKey,
  msUntilNextWeekReset,
  normalizeWeekKey,
} from '../lib/getCurrentWeekKey';
import { logWeeklyLeaperboardWeekKeyDebug } from '../lib/weekKeyDebug';
import { UsernameLink } from '../components/UsernameLink';
import { navigateToUserProfile } from '../navigation/navigationHelpers';
import {
  cumulativeLeapInchesFromUser,
  dailyLeapInchesFromUser,
  formatLeapGainDisplay,
  formatLeapInchesDisplay,
  priorWeekLeapInchesFromUser,
  weekOverWeekGrowthPct,
  weeklyLeapInchesFromUser,
} from '../lib/verticalScore';
import { leaderboardStreakDaysFromUser } from '../lib/profileLeapStats';
import { podiumTierStyles } from '../lib/leaderboardPodiumTheme';
import { showUsernameSearchOnLeaderboard } from '../lib/usernameSearchRollout';

const LIST_LIMIT = 100;

/** Step 1 verify: set to `'2026-05-17'` to force the Firestore query; null = use getCurrentWeekKey(). */
const WEEK_KEY_QUERY_HARDCODE: string | null = null;

type AccRow = {
  id: string;
  score: number;
  name: string;
  username: string;
  avatarUrl?: string;
  lifetimeInches?: number;
  priorWeek?: number;
  streakDays?: number;
};

function pickMostImproved(acc: AccRow[]): {
  userId: string;
  name: string;
  username: string;
  growthPct: number;
  weekInches: number;
} | null {
  let best: AccRow | null = null;
  let bestPct = -Infinity;
  for (const row of acc) {
    if (row.score <= 0) continue;
    const prior = row.priorWeek ?? 0;
    if (prior <= 0) continue;
    const pct = weekOverWeekGrowthPct(row.score, prior);
    if (pct <= 0) continue;
    if (pct > bestPct || (pct === bestPct && row.score > (best?.score ?? 0))) {
      bestPct = pct;
      best = row;
    }
  }
  if (!best) return null;
  return {
    userId: best.id,
    name: best.name,
    username: best.username,
    growthPct: Math.round(bestPct),
    weekInches: best.score,
  };
}

export function TopScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: { paddingHorizontal: 22, flex: 1 },
  header: { paddingTop: 10, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: typography.displayExtraBold,
    fontSize: 30,
    color: colors.text,
    lineHeight: 34,
    letterSpacing: -1.1,
  },
  sub: {
    marginTop: 4,
    fontFamily: typography.bodySemiBold,
    fontSize: 12.5,
    color: colors.muted2,
  },
  segment: {
    flexDirection: 'row',
    marginBottom: 14,
    padding: 3,
    borderRadius: 14,
    backgroundColor: colors.border2,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: colors.card,
    borderWidth: 0,
  },
  segLabel: { fontFamily: typography.bodySemiBold, fontSize: 13.5, color: colors.muted2 },
  segLabelOn: { fontFamily: typography.bodyBold, color: colors.text },
  mostImprovedCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.highlightCardBorder,
    backgroundColor: colors.highlightCardBg,
  },
  mostImprovedBadge: { fontSize: 13, fontWeight: '900', color: colors.highlightCardBadge },
  mostImprovedName: { marginTop: 4, fontSize: 17, fontWeight: '900', color: colors.text },
  mostImprovedMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.muted },
  errorBanner: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  list: { paddingBottom: 24 },
  empty: { marginTop: 24, fontSize: 14, fontWeight: '600', color: colors.muted },
  emptyLoading: { marginTop: 48, alignItems: 'center', gap: 14 },
  emptyLoadingText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  rowAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  rowMe: {
    backgroundColor: colors.leaderboardMeBg,
  },
  rankCol: {
    width: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontFamily: typography.displayBold,
    fontSize: 17,
    color: colors.muted2,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rankMe: { color: colors.moss },
  avatarSlot: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardTint,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardTint,
  },
  avatarInitials: { fontFamily: typography.bodyBold, fontSize: 13, color: colors.text },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  identityCol: { flex: 1, minWidth: 0 },
  name: { fontFamily: typography.bodySemiBold, fontSize: 14.5, color: colors.text, lineHeight: 20, minWidth: 0 },
  metaLine: { fontFamily: typography.bodyMedium, fontSize: 12, marginTop: 1, lineHeight: 16 },
  metaLinePlaceholder: { height: 16, marginTop: 2 },
  scoreCol: { alignItems: 'flex-end', flexShrink: 0, minWidth: 72 },
  score: {
    fontFamily: typography.displayBold,
    fontSize: 16,
    color: colors.text2,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  scoreMe: { color: colors.moss },
  streakLine: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
    color: colors.highlightCardBorder,
    fontVariant: ['tabular-nums'],
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
    marginTop: 4,
    marginBottom: 16,
  },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumSlotWinner: { flex: 1.12 },
  podiumCrown: { height: 21, fontSize: 15 },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.cardTint,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  podiumAvatarWinner: { width: 62, height: 62, borderRadius: 21 },
  podiumCard: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.card,
  },
  podiumCardWinner: {
    paddingVertical: 14,
    borderColor: colors.highlightCardBorder,
    backgroundColor: colors.highlightCardBg,
  },
  podiumRank: {
    fontFamily: typography.displayExtraBold,
    fontSize: 20,
    lineHeight: 22,
    color: colors.muted2,
  },
  podiumName: {
    marginTop: 4,
    fontFamily: typography.bodyBold,
    fontSize: 12.5,
    color: colors.text,
    maxWidth: '100%',
  },
  podiumScore: {
    marginTop: 2,
    fontFamily: typography.displayExtraBold,
    fontSize: 18,
    color: colors.green,
  },
}));
  const nav = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  /** Opened from Daily Leaps as a stack screen (not a bottom tab). */
  const asStackScreen = route.name === 'Leaperboard';
  const bottomClearance = asStackScreen
    ? Math.max(insets.bottom, 12) + 20
    : floatingTabContentClearance(insets.bottom);
  const { user } = useAuth();
  const isStaffUser = Boolean(user?.isAdmin || user?.isModerator);
  const showUsernameSearch = showUsernameSearchOnLeaderboard(isStaffUser);
  const [timeframe, setTimeframe] = React.useState<LeaderboardTimeframe>('daily');
  const [rows, setRows] = React.useState<LeaderboardWireRow[]>([]);
  const [mostImproved, setMostImproved] = React.useState<{
    userId: string;
    name: string;
    username: string;
    growthPct: number;
    weekInches: number;
  } | null>(null);
  const [leaderboardHydrated, setLeaderboardHydrated] = React.useState(false);
  const [leaderboardError, setLeaderboardError] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState(() => Date.now());
  const subscriptionIdRef = React.useRef(0);

  const leapWindow = React.useMemo(() => computeFeedViewingFromNow(clock), [clock]);
  const leapDayKey = leapWindow.viewingChallengeDateKey;
  const weekKey = React.useMemo(
    () => getCurrentWeekKey(new Date(clock), 'America/New_York'),
    [clock]
  );

  React.useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const ms = leapWindow.msUntilNextLock;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const delay = Math.min(ms + 400, 86_400_000);
    const id = setTimeout(() => setClock(Date.now()), delay);
    return () => clearTimeout(id);
  }, [leapWindow.msUntilNextLock, leapDayKey]);

  /** Leap week rolls at NY Sunday noon (when the new week’s leap launches). */
  React.useEffect(() => {
    const ms = msUntilNextWeekReset(clock);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const id = setTimeout(() => setClock(Date.now()), Math.min(ms + 400, 8 * 86_400_000));
    return () => clearTimeout(id);
  }, [weekKey, clock]);

  useFocusEffect(
    React.useCallback(() => {
      if (timeframe !== 'weekly') return;
      const key = getCurrentWeekKey(new Date(), 'America/New_York');
      // eslint-disable-next-line no-console
      console.log('[weekly leaperboard] getCurrentWeekKey() =>', key);
    }, [timeframe])
  );

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setRows([]);
      setMostImproved(null);
      setLeaderboardError(null);
      setLeaderboardHydrated(true);
      return;
    }

    const subId = ++subscriptionIdRef.current;
    setRows([]);
      setMostImproved(null);
    setLeaderboardError(null);
    setLeaderboardHydrated(false);

    let cancelled = false;
    let unsub: (() => void) | undefined;

    const safetyTimer = setTimeout(() => {
      if (!cancelled && subscriptionIdRef.current === subId) {
        setLeaderboardHydrated(true);
      }
    }, 15_000);

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled || subscriptionIdRef.current !== subId) return;

        if (timeframe === 'daily') {
          const dayKey = normalizeNyDateKey(leapDayKey, '');

          const publishDaily = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => {
            if (cancelled || subscriptionIdRef.current !== subId) return;
            const acc: AccRow[] = [];
            snap.docs.forEach((d) => {
              const data = d.data();
              const storedKey = normalizeNyDateKey(String(data.leaperDayKey ?? ''), '');
              if (storedKey && storedKey !== dayKey) return;
              const score = dailyLeapInchesFromUser(data, dayKey);
              if (score <= 0) return;
              acc.push({
                id: d.id,
                score,
                name: leaderboardDisplayName(data),
                username: String(data.username ?? '').trim(),
                avatarUrl: leaderboardAvatarUrl(data),
                lifetimeInches: cumulativeLeapInchesFromUser(data),
                streakDays: leaderboardStreakDaysFromUser({
                  profile: data,
                  todayLeapDayKey: dayKey,
                  isCurrentUser: d.id === user?.uid,
                }),
              });
            });
            setMostImproved(null);
            const sorted = sortLeaderboardDocs(acc);
            setRows(wireRowsFromSorted(sorted, user?.uid));
            setLeaderboardError(null);
            setLeaderboardHydrated(true);
          };

          const keyedQ = query(
            collection(firestore(), 'users'),
            where('leaperDayKey', '==', dayKey),
            orderBy('leaperDayPoints', 'desc'),
            limit(LIST_LIMIT)
          );

          const broadQ = query(
            collection(firestore(), 'users'),
            orderBy('leaperDayPoints', 'desc'),
            limit(LIST_LIMIT)
          );

          unsub = onSnapshot(
            keyedQ,
            (snap) => publishDaily(snap),
            () => {
              if (cancelled || subscriptionIdRef.current !== subId) return;
              unsub?.();
              unsub = onSnapshot(
                broadQ,
                (snap) => publishDaily(snap),
                () => {
                  if (subscriptionIdRef.current !== subId) return;
                  setRows([]);
                  setMostImproved(null);
                  setLeaderboardError('Could not load the leaperboard. Pull to refresh or try again.');
                  setLeaderboardHydrated(true);
                }
              );
            }
          );
          return;
        }

        if (timeframe === 'weekly') {
          const computedWeekKey = getCurrentWeekKey(new Date(clock), 'America/New_York');
          // eslint-disable-next-line no-console
          console.log('[weekly leaperboard] getCurrentWeekKey() =>', computedWeekKey);
          void logWeeklyLeaperboardWeekKeyDebug();
          const currentWeekKey = WEEK_KEY_QUERY_HARDCODE ?? computedWeekKey;
          const wk = normalizeWeekKey(currentWeekKey);
          const priorWk = getPriorWeekKey(wk) ?? '';

          const publishWeekly = (snap: { docs: { id: string; data: () => Record<string, unknown> }[] }) => {
            if (cancelled || subscriptionIdRef.current !== subId) return;
            const acc: AccRow[] = [];
            snap.docs.forEach((d) => {
              const data = d.data();
              const storedKey = normalizeWeekKey(String(data.leaperWeekKey ?? ''));
              if (storedKey && storedKey !== wk) return;
              const score = weeklyLeapInchesFromUser(data, wk);
              if (score <= 0) return;
              const priorWeek = priorWk ? priorWeekLeapInchesFromUser(data, priorWk) : 0;
              acc.push({
                id: d.id,
                score,
                name: leaderboardDisplayName(data),
                username: String(data.username ?? '').trim(),
                avatarUrl: leaderboardAvatarUrl(data),
                lifetimeInches: cumulativeLeapInchesFromUser(data),
                priorWeek,
                streakDays: leaderboardStreakDaysFromUser({
                  profile: data,
                  todayLeapDayKey: leapDayKey,
                  isCurrentUser: d.id === user?.uid,
                }),
              });
            });
            setMostImproved(pickMostImproved(acc));
            const sorted = sortLeaderboardDocs(acc);
            setRows(wireRowsFromSorted(sorted, user?.uid));
            setLeaderboardError(null);
            setLeaderboardHydrated(true);
          };

          const keyedQ = query(
            collection(firestore(), 'users'),
            where('leaperWeekKey', '==', wk),
            orderBy('leaperWeekPoints', 'desc'),
            limit(LIST_LIMIT)
          );

          const broadQ = query(
            collection(firestore(), 'users'),
            orderBy('leaperWeekPoints', 'desc'),
            limit(LIST_LIMIT)
          );

          unsub = onSnapshot(
            keyedQ,
            (snap) => publishWeekly(snap),
            () => {
              if (cancelled || subscriptionIdRef.current !== subId) return;
              unsub?.();
              unsub = onSnapshot(
                broadQ,
                (snap) => publishWeekly(snap),
                () => {
                  if (subscriptionIdRef.current !== subId) return;
                  setRows([]);
                  setMostImproved(null);
                  setLeaderboardError('Could not load the leaperboard. Pull to refresh or try again.');
                  setLeaderboardHydrated(true);
                }
              );
            }
          );
          return;
        }

        const q = query(
          collection(firestore(), 'users'),
          orderBy('leaperLifetimePoints', 'desc'),
          limit(LIST_LIMIT)
        );

        unsub = onSnapshot(
          q,
          (snap) => {
            if (subscriptionIdRef.current !== subId) return;

            const acc: AccRow[] = [];

            snap.docs.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              const score = cumulativeLeapInchesFromUser(data);
              acc.push({
                id: d.id,
                score,
                name: leaderboardDisplayName(data),
                username: String(data.username ?? '').trim(),
                avatarUrl: leaderboardAvatarUrl(data),
                lifetimeInches: score,
                streakDays: leaderboardStreakDaysFromUser({
                  profile: data,
                  todayLeapDayKey: leapDayKey,
                  isCurrentUser: d.id === user?.uid,
                }),
              });
            });

            setMostImproved(null);
            const sorted = sortAllTimeLeaderboardDocs(acc);
            setRows(wireRowsFromSorted(sorted, user?.uid));
            setLeaderboardError(null);
            setLeaderboardHydrated(true);
          },
          () => {
            if (subscriptionIdRef.current !== subId) return;
            setRows([]);
            setMostImproved(null);
            setLeaderboardError('Could not load the leaperboard. Pull to refresh or try again.');
            setLeaderboardHydrated(true);
          }
        );
      })
      .catch(() => {
        if (cancelled || subscriptionIdRef.current !== subId) return;
        setRows([]);
        setLeaderboardError('Could not load the leaperboard. Pull to refresh or try again.');
        setLeaderboardHydrated(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsub?.();
    };
  }, [user?.uid, timeframe, leapDayKey, weekKey]);

  const scoreForRow = (item: LeaderboardWireRow) => {
    if (timeframe === 'daily') return formatLeapGainDisplay(item.score);
    if (timeframe === 'weekly') return formatLeapInchesDisplay(item.score);
    return formatLeapInchesDisplay(item.score);
  };
  const podiumRows = rows.slice(0, 3);
  const listRows = rows.slice(3);
  const timeframeDetail =
    timeframe === 'daily'
      ? 'today’s standings'
      : timeframe === 'weekly'
        ? 'week ends Sunday'
        : 'all-time standings';

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {asStackScreen ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => nav.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Back to feed"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.headerLeft}>
            <View style={styles.headerText}>
              <Text style={styles.title}>The Leaperboard</Text>
              <Text style={styles.sub}>
                {rows.length} {rows.length === 1 ? 'leaper' : 'leapers'} · {timeframeDetail}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.segment}>
        {(['daily', 'weekly', 'all_time'] as const).map((tf) => (
          <Pressable
            key={tf}
            style={[styles.segBtn, timeframe === tf && styles.segBtnOn]}
            onPress={() => {
              setClock(Date.now());
              setTimeframe(tf);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: timeframe === tf }}
          >
            <Text style={[styles.segLabel, timeframe === tf && styles.segLabelOn]}>
              {tf === 'daily' ? 'Daily' : tf === 'weekly' ? 'Weekly' : 'All-time'}
            </Text>
          </Pressable>
        ))}
      </View>

      {showUsernameSearch ? <UsernameSearchBlock /> : null}

      {timeframe === 'weekly' && mostImproved ? (
        <Pressable
          style={styles.mostImprovedCard}
          onPress={() =>
            navigateToUserProfile(nav, {
              uid: mostImproved.userId,
              username: mostImproved.username || undefined,
            })
          }
        >
          <Text style={styles.mostImprovedBadge}>🔥 Most Improved</Text>
          <Text style={styles.mostImprovedName} numberOfLines={1}>
            {mostImproved.name}
          </Text>
          <Text style={styles.mostImprovedMeta}>
            +{mostImproved.growthPct}% vs last week · {formatLeapInchesDisplay(mostImproved.weekInches)} this week
          </Text>
        </Pressable>
      ) : null}

      {leaderboardError ? (
        <Text style={styles.errorBanner} accessibilityRole="alert">
          {leaderboardError}
        </Text>
      ) : null}

      <FlatList
        data={listRows}
        keyExtractor={(x) => x.userId}
        extraData={{ timeframe, weekKey }}
        contentContainerStyle={[styles.list, { paddingBottom: bottomClearance }]}
        ListHeaderComponent={
          podiumRows.length > 0 ? (
            <View style={styles.podium}>
              {[podiumRows[1], podiumRows[0], podiumRows[2]].map((item, index) => {
                if (!item) return <View key={`empty-${index}`} style={styles.podiumSlot} />;
                const winner = item.rank === 1;
                return (
                  <Pressable
                    key={item.userId}
                    style={[styles.podiumSlot, winner && styles.podiumSlotWinner]}
                    onPress={() =>
                      navigateToUserProfile(nav, {
                        uid: item.userId,
                        username: item.username?.trim() || undefined,
                      })
                    }
                  >
                    <Text style={styles.podiumCrown}>{winner ? '👑' : ''}</Text>
                    <View style={[styles.podiumAvatar, winner && styles.podiumAvatarWinner]}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.avatarInitials}>{initialsFromDisplayName(item.name)}</Text>
                      )}
                    </View>
                    <View style={[styles.podiumCard, winner && styles.podiumCardWinner]}>
                      <Text
                        style={[
                          styles.podiumRank,
                          winner ? { color: colors.podiumRank } : null,
                        ]}
                      >
                        {item.rank}
                      </Text>
                      <Text style={styles.podiumName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.podiumScore}>{scoreForRow(item)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null
        }
        ListEmptyComponent={
          rows.length > 0 ? null : !leaderboardHydrated ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator size="large" color={colors.moss} />
              <Text style={styles.emptyLoadingText}>Loading leaperboard…</Text>
            </View>
          ) : leaderboardError ? null : (
            <Text style={styles.empty} accessibilityRole="text">
              {timeframe === 'daily'
                ? 'No daily standings yet — post an approved leap for this leap window to show up on the board.'
                : timeframe === 'weekly'
                  ? 'No weekly standings yet — earn inches this leap week (Sun noon–Sun noon ET) to rank.'
                  : 'No leaderboard data yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const scoreMain = scoreForRow(item);
          const hasMetaLine = Boolean(
            item.username?.trim() || (item.streakDays && item.streakDays > 0)
          );
          const podium =
            item.rank >= 1 && item.rank <= 3
              ? podiumTierStyles(item.rank, isDark)
              : null;
          const isMe = item.isCurrentUser && !podium;

          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                podium ? { backgroundColor: podium.bg } : null,
                isMe ? styles.rowMe : null,
                pressed && { opacity: 0.92 },
              ]}
              onPress={() =>
                navigateToUserProfile(nav, {
                  uid: item.userId,
                  username: item.username?.trim() || undefined,
                })
              }
            >
              {podium || isMe ? (
                <View
                  style={[
                    styles.rowAccent,
                    { backgroundColor: podium?.accent ?? colors.moss },
                  ]}
                />
              ) : null}
              <View style={styles.rankCol}>
                <Text
                  style={[
                    styles.rank,
                    podium ? { color: podium.rank } : null,
                    isMe ? styles.rankMe : null,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {item.rank}
                </Text>
              </View>
              <View style={styles.avatarSlot}>
                <View
                  style={[
                    styles.avatarWrap,
                    podium ? { borderWidth: 2, borderColor: podium.ring } : null,
                  ]}
                >
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitials}>{initialsFromDisplayName(item.name)}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowMeta}>
                  <View style={styles.identityCol}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {hasMetaLine ? (
                      item.username?.trim() ? (
                        <UsernameLink
                          uid={item.userId}
                          username={item.username.trim()}
                          style={styles.metaLine}
                        />
                      ) : (
                        <View style={styles.metaLinePlaceholder} />
                      )
                    ) : null}
                  </View>
                  <View style={styles.scoreCol}>
                    <Text style={[styles.score, item.isCurrentUser && styles.scoreMe]}>{scoreMain}</Text>
                    {hasMetaLine ? (
                      item.streakDays && item.streakDays > 0 ? (
                        <Text style={styles.streakLine}>🔥 {item.streakDays}</Text>
                      ) : (
                        <View style={styles.metaLinePlaceholder} />
                      )
                    ) : null}
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
