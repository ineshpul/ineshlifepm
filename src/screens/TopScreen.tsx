import * as React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';

type Row = { id: string; username: string; verticalScore: number };

export function TopScreen() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [leaderboardHydrated, setLeaderboardHydrated] = React.useState(false);

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
        const q = query(
          collection(firestore(), 'users'),
          orderBy('verticalScore', 'desc'),
          limit(50)
        );
        unsub = onSnapshot(
          q,
          (snap) => {
            setRows(
              snap.docs.map((d) => {
                const data: any = d.data();
                return {
                  id: d.id,
                  username: String(data?.username ?? 'user'),
                  verticalScore: Number(data?.verticalScore ?? 0),
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
  }, [user?.uid]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Brandmark size={36} />
          <View>
            <Text style={styles.title}>How high can you jump?</Text>
            <Text style={styles.sub}>Leaderboard · last 14 days</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !leaderboardHydrated ? (
            <View style={styles.emptyLoading}>
              <ActivityIndicator size="large" color={colors.moss} />
              <Text style={styles.emptyLoadingText}>Loading leaderboard…</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No leaderboard yet. Post and engage to climb the board.</Text>
          )
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.username}</Text>
              <Text style={styles.score}>{item.verticalScore}</Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, flex: 1 },
  header: { paddingTop: 12, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted },
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
  rank: {
    width: 28,
    fontSize: 16,
    fontWeight: '900',
    color: colors.muted,
    textAlign: 'center',
  },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  score: { fontSize: 15, fontWeight: '900', color: colors.moss },
});
