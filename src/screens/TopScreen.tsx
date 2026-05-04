import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { nyDateKey, nySundayWeekStartKey } from '../utils/nyTime';

type Board = 'daily' | 'weekly' | 'alltime';

type Row = { id: string; username: string; points: number };

export function TopScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [board, setBoard] = React.useState<Board>('daily');
  const [rows, setRows] = React.useState<Row[]>([]);
  const [leaderboardHydrated, setLeaderboardHydrated] = React.useState(false);
  const [clock, setClock] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dayKey = React.useMemo(() => nyDateKey(new Date(clock)), [clock]);
  const weekKey = React.useMemo(() => nySundayWeekStartKey(clock), [clock]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setRows([]);
      setLeaderboardHydrated(true);
      return;
    }

    setLeaderboardHydrated(false);
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let firstSnap = false;

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLeaderboardHydrated(true);
    }, 15_000);

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;

        let q;
        if (board === 'alltime') {
          q = query(collection(firestore(), 'users'), orderBy('verticalScore', 'desc'), limit(50));
        } else {
          const keyField = board === 'daily' ? 'leaperDayKey' : 'leaperWeekKey';
          const pointsField = board === 'daily' ? 'leaperDayPoints' : 'leaperWeekPoints';
          const keyValue = board === 'daily' ? dayKey : weekKey;
          q = query(
            collection(firestore(), 'users'),
            where(keyField, '==', keyValue),
            orderBy(pointsField, 'desc'),
            limit(50)
          );
        }

        unsub = onSnapshot(
          q,
          (snap) => {
            setRows(
              snap.docs.map((d) => {
                const data: any = d.data();
                if (board === 'alltime') {
                  const vs = Number(data?.verticalScore ?? 0);
                  return {
                    id: d.id,
                    username: String(data?.username ?? 'user'),
                    points: Number.isFinite(vs) ? vs : 0,
                  };
                }
                const pointsField = board === 'daily' ? 'leaperDayPoints' : 'leaperWeekPoints';
                const pts = Number(data?.[pointsField] ?? 0);
                return {
                  id: d.id,
                  username: String(data?.username ?? 'user'),
                  points: Number.isFinite(pts) ? pts : 0,
                };
              })
            );
            if (!firstSnap) {
              firstSnap = true;
              setLeaderboardHydrated(true);
            }
          },
          () => {
            setRows([]);
            if (!firstSnap) {
              firstSnap = true;
              setLeaderboardHydrated(true);
            }
          }
        );
      })
      .catch(() => {
        if (!cancelled) setLeaderboardHydrated(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsub?.();
    };
  }, [user?.uid, board, dayKey, weekKey]);

  const subTitle =
    board === 'daily'
      ? `Daily leaperboard · NY today (${dayKey})`
      : board === 'weekly'
        ? `Weekly leaperboard · week of Sun ${weekKey} (NY, resets each Sunday)`
        : 'All-time · Vertical score (last 14 days of leaps)';

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
          style={[styles.segBtn, board === 'daily' && styles.segBtnOn]}
          onPress={() => setBoard('daily')}
          accessibilityRole="tab"
          accessibilityState={{ selected: board === 'daily' }}
        >
          <Text style={[styles.segLabel, board === 'daily' && styles.segLabelOn]}>Daily</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, board === 'weekly' && styles.segBtnOn]}
          onPress={() => setBoard('weekly')}
          accessibilityRole="tab"
          accessibilityState={{ selected: board === 'weekly' }}
        >
          <Text style={[styles.segLabel, board === 'weekly' && styles.segLabelOn]}>Weekly</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, board === 'alltime' && styles.segBtnOn]}
          onPress={() => setBoard('alltime')}
          accessibilityRole="tab"
          accessibilityState={{ selected: board === 'alltime' }}
        >
          <Text style={[styles.segLabel, board === 'alltime' && styles.segLabelOn]}>All-time</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !leaderboardHydrated ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator size="large" color={colors.moss} />
              <Text style={styles.emptyLoadingText}>Loading leaperboard…</Text>
            </View>
          ) : (
            <Text style={styles.empty}>
              {board === 'daily'
                ? 'No scores for today yet — likes and comments on your leaps earn daily points.'
                : board === 'weekly'
                  ? 'No scores for this week yet — keep posting and engaging.'
                  : 'No leaperboard yet. Post and engage to climb the board.'}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const isMe = Boolean(user?.uid && item.id === user.uid);
          const scoreLabel = board === 'alltime' ? `${item.points} in` : `${item.points} pts`;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, isMe && styles.rowMe, pressed && { opacity: 0.92 }]}
              onPress={() =>
                nav.navigate('UserProfile', {
                  uid: item.id,
                  username: item.username,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.username} profile`}
            >
              <Text style={[styles.rank, isMe && styles.rankMe]}>{index + 1}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.username}</Text>
                <Text style={[styles.score, isMe && styles.scoreMe]}>{scoreLabel}</Text>
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
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
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
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  score: { fontSize: 15, fontWeight: '900', color: colors.moss },
  scoreMe: { color: colors.moss },
});
