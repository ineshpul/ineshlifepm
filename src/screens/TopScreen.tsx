import * as React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';

type Row = { id: string; username: string; verticalInches: number };

export function TopScreen() {
  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) {
      setRows([]);
      return;
    }
    const q = query(
      collection(firestore(), 'users'),
      orderBy('verticalInches', 'desc'),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => {
            const data: any = d.data();
            return {
              id: d.id,
              username: String(data?.username ?? 'user'),
              verticalInches: Number(data?.verticalInches ?? 0),
            };
          })
        );
      },
      () => setRows([])
    );
  }, []);

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Brandmark size={36} />
          <View>
            <Text style={styles.title}>Top jumps</Text>
            <Text style={styles.sub}>Leaderboard by jump height</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No jump data yet. Log a height on your profile later.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.username}</Text>
              <Text style={styles.inches}>{item.verticalInches}"</Text>
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
  inches: { fontSize: 15, fontWeight: '900', color: colors.moss },
});
