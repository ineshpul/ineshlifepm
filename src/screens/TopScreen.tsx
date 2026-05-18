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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
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
import {
  challengeDateKeysForFirestoreIn,
  computeChallengeWindowFromNow,
  computeFeedViewingFromNow,
  msUntilNextNySundayWeekStart,
  nySundayWeekStartKey,
  prevNySundayWeekStartKey,
} from '../utils/nyTime';
import { fetchUserProfilesByIds } from '../lib/fetchUserProfiles';
import { weeklyLeaderboardFromVideos } from '../lib/weeklyLeaderboard';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';
import { UsernameLink } from '../components/UsernameLink';
import { navigateToUserProfile } from '../navigation/navigationHelpers';
import {
  cumulativeLeapInchesFromUser,
  dailyLeapInchesFromUser,
  formatLeapGainDisplay,
  formatLeapInchesDisplay,
  weekOverWeekGrowthPct,
} from '../lib/verticalScore';

const LIST_LIMIT = 100;

type AccRow = {
  id: string;
  score: number;
  name: string;
  username: string;
  avatarUrl?: string;
  lifetimeInches?: number;
  priorWeek?: number;
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
  const nav = useNavigation<any>();
  const { user } = useAuth();
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
  const weekKey = React.useMemo(() => nySundayWeekStartKey(clock), [clock]);

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
    const ms = msUntilNextNySundayWeekStart(clock);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const id = setTimeout(() => setClock(Date.now()), Math.min(ms + 400, 8 * 86_400_000));
    return () => clearTimeout(id);
  }, [weekKey, clock]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid || timeframe !== 'weekly') return;
      void recomputeVerticalScoreForUser(user.uid);
    }, [user?.uid, timeframe])
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

        if (timeframe === 'weekly') {
          void (async () => {
            try {
              const fromVideos = await weeklyLeaderboardFromVideos(weekKey);
              if (cancelled || subscriptionIdRef.current !== subId) return;
              const prevWeekKey = prevNySundayWeekStartKey(weekKey);
              const prevVideos = prevWeekKey ? await weeklyLeaderboardFromVideos(prevWeekKey) : [];
              if (cancelled || subscriptionIdRef.current !== subId) return;
              const priorByUid = new Map(prevVideos.map((r) => [r.uid, r.score]));
              const profiles = await fetchUserProfilesByIds(fromVideos.map((r) => r.uid));
              if (cancelled || subscriptionIdRef.current !== subId) return;

              const acc: AccRow[] = fromVideos.map((v) => {
                const ud = profiles.get(v.uid);
                return {
                  id: v.uid,
                  score: v.score,
                  name: ud ? leaderboardDisplayName(ud) : v.username,
                  username: String(ud?.username ?? v.username).trim() || v.username,
                  avatarUrl: ud ? leaderboardAvatarUrl(ud) : undefined,
                  lifetimeInches: ud ? cumulativeLeapInchesFromUser(ud) : undefined,
                  priorWeek: priorByUid.get(v.uid) ?? 0,
                };
              });

              setMostImproved(pickMostImproved(acc));
              const sorted = sortLeaderboardDocs(acc);
              setRows(wireRowsFromSorted(sorted, user?.uid));
              setLeaderboardError(null);
              setLeaderboardHydrated(true);
            } catch {
              if (cancelled || subscriptionIdRef.current !== subId) return;
              setRows([]);
              setMostImproved(null);
              setLeaderboardError('Could not load the leaperboard. Pull to refresh or try again.');
              setLeaderboardHydrated(true);
            }
          })();
          return;
        }

        let q;
        if (timeframe === 'all_time') {
          q = query(
            collection(firestore(), 'users'),
            orderBy('leaperLifetimePoints', 'desc'),
            limit(LIST_LIMIT)
          );
        } else {
          const dayIn = challengeDateKeysForFirestoreIn([leapDayKey]);
          q = query(
            collection(firestore(), 'users'),
            where('leaperDayKey', 'in', dayIn),
            orderBy('leaperDayPoints', 'desc'),
            limit(LIST_LIMIT)
          );
        }

        unsub = onSnapshot(
          q,
          (snap) => {
            if (subscriptionIdRef.current !== subId) return;

            const acc: AccRow[] = [];
            const tf = timeframe;

            snap.docs.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              let score = 0;
              if (tf === 'all_time') {
                score = cumulativeLeapInchesFromUser(data);
              } else {
                score = dailyLeapInchesFromUser(data);
              }
              if (!Number.isFinite(score)) score = 0;
              acc.push({
                id: d.id,
                score,
                name: leaderboardDisplayName(data),
                username: String(data.username ?? '').trim(),
                avatarUrl: leaderboardAvatarUrl(data),
                lifetimeInches: cumulativeLeapInchesFromUser(data),
              });
            });

            setMostImproved(null);

            if (tf === 'daily') {
              void (async () => {
                const sid = subId;
                try {
                  const calendarChallengeKey = computeChallengeWindowFromNow(clock).dateKey;
                  const inKeys = challengeDateKeysForFirestoreIn([leapDayKey, calendarChallengeKey]);
                  if (inKeys.length === 0) {
                    if (subscriptionIdRef.current !== sid) return;
                    setRows([]);
                    setLeaderboardError(null);
                    setLeaderboardHydrated(true);
                    return;
                  }
                  const vq = query(
                    collection(firestore(), 'videos'),
                    where('challengeDate', 'in', inKeys.slice(0, 30)),
                    where('moderationStatus', '==', 'approved'),
                    limit(500)
                  );
                  const vs = await getDocs(vq);
                  if (subscriptionIdRef.current !== sid) return;
                  const postedUid = new Set<string>();
                  vs.forEach((doc) => {
                    const data = doc.data() as Record<string, unknown>;
                    if (String(data.moderationStatus ?? '') === 'nulled') return;
                    const u = String(data.uid ?? '').trim();
                    if (u) postedUid.add(u);
                  });
                  const filtered = acc.filter((row) => postedUid.has(row.id));
                  const sorted = sortLeaderboardDocs(filtered);
                  setRows(wireRowsFromSorted(sorted, user?.uid));
                  setLeaderboardError(null);
                  setLeaderboardHydrated(true);
                } catch {
                  if (subscriptionIdRef.current !== sid) return;
                  const sorted = sortLeaderboardDocs(acc);
                  setRows(wireRowsFromSorted(sorted, user?.uid));
                  setLeaderboardHydrated(true);
                }
              })();
              return;
            }

            const sorted =
              tf === 'all_time' ? sortAllTimeLeaderboardDocs(acc) : sortLeaderboardDocs(acc);
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
  }, [user?.uid, timeframe, leapDayKey, weekKey, clock]);

  const scoreForRow = (item: LeaderboardWireRow) => {
    if (timeframe === 'daily') return formatLeapGainDisplay(item.score);
    return formatLeapInchesDisplay(item.score);
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Brandmark size={36} />
          <View style={styles.headerText}>
            <Text style={styles.title}>How high can you jump?</Text>
            <Text style={styles.sub}>Leaperboard</Text>
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
        data={rows}
        keyExtractor={(x) => x.userId}
        extraData={{ timeframe, weekKey }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !leaderboardHydrated ? (
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
          const topThree = item.rank <= 3;
          const podiumRow = topThree ? styles.rowGold : item.isCurrentUser ? styles.rowMe : null;
          const podiumRank = topThree ? styles.rankGold : item.isCurrentUser ? styles.rankMe : null;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, podiumRow, pressed && { opacity: 0.92 }]}
              onPress={() =>
                navigateToUserProfile(nav, {
                  uid: item.userId,
                  username: item.username?.trim() || undefined,
                })
              }
            >
              <View style={styles.rankCol}>
                <Text
                  style={[styles.rank, podiumRank]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {item.rank}
                </Text>
              </View>
              <View style={styles.avatarWrap}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initialsFromDisplayName(item.name)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.nameScoreRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.score, item.isCurrentUser && styles.scoreMe]}>{scoreMain}</Text>
                </View>
                {item.username?.trim() ? (
                  <UsernameLink uid={item.userId} username={item.username.trim()} style={styles.handle} />
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, flex: 1 },
  header: { paddingTop: 12, paddingBottom: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.muted },
  segment: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.cardTint,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  segBtnOn: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segLabel: { fontSize: 12, fontWeight: '800', color: colors.muted },
  segLabelOn: { color: colors.text },
  mostImprovedCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E67E22',
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
  },
  mostImprovedBadge: { fontSize: 13, fontWeight: '900', color: '#C0392B' },
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
  list: { paddingBottom: 24, gap: 10 },
  empty: { marginTop: 24, fontSize: 14, fontWeight: '600', color: colors.muted },
  emptyLoading: { marginTop: 48, alignItems: 'center', gap: 14 },
  emptyLoadingText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  rowGold: {
    borderColor: '#C9A227',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.16)',
  },
  rowMe: {
    borderColor: colors.moss,
    borderWidth: 2,
    backgroundColor: 'rgba(39, 174, 96, 0.08)',
  },
  rankCol: {
    width: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.muted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rankMe: { color: colors.moss },
  rankGold: { color: '#B8860B' },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.cardTint,
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardTint,
  },
  avatarInitials: { fontSize: 14, fontWeight: '900', color: colors.text },
  rowBody: { flex: 1, minWidth: 0 },
  nameScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 0 },
  handle: { fontSize: 12, fontWeight: '700', color: colors.muted },
  score: { fontSize: 15, fontWeight: '900', color: colors.moss },
  scoreMe: { color: colors.moss },
});
