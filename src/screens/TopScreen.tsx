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
import { useNavigation } from '@react-navigation/native';
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
} from '../utils/nyTime';
import { UsernameLink } from '../components/UsernameLink';
import { navigateToUserProfile } from '../navigation/navigationHelpers';
import { leaperTotalsToDisplayInches, verticalScoreToDisplayInches } from '../lib/verticalScore';

/** Human-readable countdown to the next Eastern noon leap boundary (same semantics as `msUntilNextLock`). */
function formatMsUntilNextDrop(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return 'soon';
}

const LIST_LIMIT = 100;

export function TopScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [timeframe, setTimeframe] = React.useState<LeaderboardTimeframe>('daily');
  const [rows, setRows] = React.useState<LeaderboardWireRow[]>([]);
  const [leaderboardHydrated, setLeaderboardHydrated] = React.useState(false);
  const [leaderboardError, setLeaderboardError] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState(() => Date.now());
  /**
   * All-time ranks by live **verticalScore** (0–100), tie-broken by **lifetimeVerticalXP** client-side.
   * If the verticalScore query returns no rows, fall back to **leaperLifetimePoints** for older data.
   */
  const [allTimeSortKey, setAllTimeSortKey] = React.useState<
    'leaperLifetimePoints' | 'verticalScore'
  >('verticalScore');
  const subscriptionIdRef = React.useRef(0);

  React.useEffect(() => {
    if (timeframe === 'all_time') setAllTimeSortKey('verticalScore');
  }, [timeframe]);

  React.useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  /**
   * Same window as the feed / `videos` leap cycle: **noon ET → next noon ET**, not a calendar day.
   * `viewingChallengeDateKey` matches server `leapChallengeDateKeyFromMs` for `leaperDayKey`.
   */
  const leapWindow = React.useMemo(() => computeFeedViewingFromNow(clock), [clock]);
  const leapDayKey = leapWindow.viewingChallengeDateKey;

  /** Fire `clock` right after the next Eastern noon so daily rankings reset immediately when the leap drops. */
  React.useEffect(() => {
    const ms = leapWindow.msUntilNextLock;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const delay = Math.min(ms + 400, 86_400_000);
    const id = setTimeout(() => setClock(Date.now()), delay);
    return () => clearTimeout(id);
  }, [leapWindow.msUntilNextLock, leapDayKey]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setRows([]);
      setLeaderboardError(null);
      setLeaderboardHydrated(true);
      return;
    }

    const subId = ++subscriptionIdRef.current;
    setRows([]);
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

        let q;
        if (timeframe === 'all_time') {
          q = query(
            collection(firestore(), 'users'),
            orderBy(allTimeSortKey, 'desc'),
            limit(LIST_LIMIT)
          );
        } else {
          /** Equality on a single string misses `2024-05-05` vs `2024-5-5` stored by older writes. */
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

            type Acc = {
              id: string;
              score: number;
              name: string;
              username: string;
              avatarUrl?: string;
              lifetimeVerticalXP?: number;
            };
            const acc: Acc[] = [];
            const tf = timeframe;

            snap.docs.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              let score = 0;
              const lifetimeXP = Number(data.lifetimeVerticalXP ?? data.leaperLifetimePoints ?? 0);
              if (tf === 'all_time') {
                score =
                  allTimeSortKey === 'leaperLifetimePoints'
                    ? Number(data.leaperLifetimePoints ?? 0)
                    : Number(data.verticalScore ?? 0);
              } else {
                score = Number(data.leaperDayPoints ?? 0);
              }
              if (!Number.isFinite(score)) score = 0;
              acc.push({
                id: d.id,
                score,
                name: leaderboardDisplayName(data),
                username: String(data.username ?? '').trim(),
                avatarUrl: leaderboardAvatarUrl(data),
                lifetimeVerticalXP: Number.isFinite(lifetimeXP) ? lifetimeXP : 0,
              });
            });

            /**
             * Daily shows leap-window engagement **only for people who actually posted an approved leap**
             * whose `challengeDate` matches the active leap or the calendar challenge day (how `videos` are keyed).
             * Otherwise anyone with legacy engagement on old posts could rank without posting this cycle.
             */
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

            if (
              tf === 'all_time' &&
              allTimeSortKey === 'verticalScore' &&
              snap.docs.length === 0
            ) {
              setAllTimeSortKey('leaperLifetimePoints');
              return;
            }

            const sorted =
              tf === 'all_time' && allTimeSortKey === 'verticalScore'
                ? sortAllTimeLeaderboardDocs(acc)
                : sortLeaderboardDocs(acc);
            setRows(wireRowsFromSorted(sorted, user?.uid));
            setLeaderboardError(null);
            setLeaderboardHydrated(true);
          },
          () => {
            if (subscriptionIdRef.current !== subId) return;
            if (timeframe === 'all_time' && allTimeSortKey === 'verticalScore') {
              setAllTimeSortKey('leaperLifetimePoints');
              return;
            }
            setRows([]);
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
  }, [user?.uid, timeframe, leapDayKey, allTimeSortKey]);

  const subTitle =
    timeframe === 'daily'
      ? 'Leaperboard'
      : allTimeSortKey === 'leaperLifetimePoints'
        ? 'Leaperboard'
        : 'Leaperboard';

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Brandmark size={36} />
          <View style={styles.headerText}>
            <Text style={styles.title}>How high can you jump?</Text>
            <Text style={styles.sub}>{subTitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segBtn, timeframe === 'daily' && styles.segBtnOn]}
          onPress={() => {
            setClock(Date.now());
            setTimeframe('daily');
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: timeframe === 'daily' }}
        >
          <Text style={[styles.segLabel, timeframe === 'daily' && styles.segLabelOn]}>Daily</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, timeframe === 'all_time' && styles.segBtnOn]}
          onPress={() => {
            setClock(Date.now());
            setTimeframe('all_time');
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: timeframe === 'all_time' }}
        >
          <Text style={[styles.segLabel, timeframe === 'all_time' && styles.segLabelOn]}>All-time</Text>
        </Pressable>
      </View>

      {leaderboardError ? (
        <Text style={styles.errorBanner} accessibilityRole="alert">
          {leaderboardError}
        </Text>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(x) => x.userId}
        extraData={{ timeframe, allTimeSortKey }}
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
                : 'No leaderboard data yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const isAllTime = timeframe === 'all_time' && allTimeSortKey === 'verticalScore';
          const isLifetimeFallback = timeframe === 'all_time' && allTimeSortKey === 'leaperLifetimePoints';
          const isDaily = timeframe === 'daily';
          let primaryIn = 0;
          if (isDaily) {
            primaryIn = leaperTotalsToDisplayInches(item.score);
          } else if (isAllTime) {
            primaryIn = verticalScoreToDisplayInches(item.score);
          } else if (isLifetimeFallback) {
            primaryIn = leaperTotalsToDisplayInches(item.score);
          }
          const scoreMain = `${primaryIn} in`;
          const topThree = item.rank <= 3;
          const podiumRow = topThree ? styles.rowGold : item.isCurrentUser ? styles.rowMe : null;
          const podiumRank = topThree ? styles.rankGold : item.isCurrentUser ? styles.rankMe : null;
          const openProfile = () =>
            navigateToUserProfile(nav, {
              uid: item.userId,
              username: item.username?.trim() || undefined,
            });
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                podiumRow,
                pressed && { opacity: 0.92 },
              ]}
              onPress={openProfile}
              accessibilityRole="button"
              accessibilityLabel={`Rank ${item.rank}, ${item.name}, ${scoreMain}`}
            >
              <Text style={[styles.rank, podiumRank]}>
                {item.rank}
              </Text>
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
                <View style={styles.rowBodyMain}>
                  <View style={styles.nameScoreRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.scoreCol}>
                      <Text style={[styles.score, item.isCurrentUser && styles.scoreMe]}>{scoreMain}</Text>
                    </View>
                  </View>
                  {item.username?.trim() ? (
                    <UsernameLink uid={item.userId} username={item.username.trim()} style={styles.handle} />
                  ) : null}
                </View>
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
    gap: 6,
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
  segLabel: { fontSize: 13, fontWeight: '800', color: colors.muted },
  segLabelOn: { color: colors.text },
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
  emptyLoading: {
    marginTop: 48,
    alignItems: 'center',
    gap: 14,
  },
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
  rank: {
    width: 28,
    fontSize: 16,
    fontWeight: '900',
    color: colors.muted,
    textAlign: 'center',
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
  rowBodyMain: { flex: 1, gap: 2 },
  nameScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 0 },
  handle: { fontSize: 12, fontWeight: '700', color: colors.muted },
  scoreCol: { alignItems: 'flex-end', justifyContent: 'center', maxWidth: '46%' },
  score: { fontSize: 15, fontWeight: '900', color: colors.moss },
  scoreMe: { color: colors.moss },
});
