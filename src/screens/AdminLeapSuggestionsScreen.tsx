import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import {
  moderateChallengeSuggestion,
  subscribePendingSuggestions,
  type ChallengeSuggestion,
} from '../services/challengeSuggestion';
import { showError, showInfo } from '../utils/ui';

export function AdminLeapSuggestionsScreen() {
  const { colors } = useTheme();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const canMod = Boolean(user?.isAdmin || user?.isModerator);

  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, paddingHorizontal: 18, paddingTop: 18 },
    kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: c.muted },
    title: { fontSize: 22, fontWeight: '900', color: c.text, marginTop: 4 },
    helper: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      lineHeight: 18,
      marginTop: 8,
      marginBottom: 12,
    },
    listContent: { paddingBottom: 120, gap: 12 },
    center: { paddingVertical: 40, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, fontWeight: '700', color: c.muted },
    emptyBox: {
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      marginTop: 8,
    },
    emptyTitle: { fontSize: 16, fontWeight: '900', color: c.text },
    emptyBody: { marginTop: 8, fontSize: 13, fontWeight: '600', color: c.muted, lineHeight: 19 },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      padding: 14,
      gap: 12,
    },
    userLine: { fontSize: 14, fontWeight: '900', color: c.moss },
    prompt: { marginTop: 4, fontSize: 16, fontWeight: '800', color: c.text, lineHeight: 22 },
    meta: { marginTop: 6, fontSize: 11, fontWeight: '700', color: c.muted },
    actions: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1 },
    backBtn: { marginTop: 16, marginBottom: 24 },
  }));

  const [items, setItems] = React.useState<ChallengeSuggestion[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actingOn, setActingOn] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canMod) {
      setItems([]);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    return subscribePendingSuggestions(
      (rows) => {
        setItems(rows);
        setHydrated(true);
        setRefreshing(false);
      },
      (err) => {
        setItems([]);
        setHydrated(true);
        setRefreshing(false);
        showError('Queue failed', err);
      }
    );
  }, [canMod]);

  const act = async (id: string, action: 'approve' | 'reject' | 'remove') => {
    if (!canMod) return;
    setActingOn(id);
    try {
      await moderateChallengeSuggestion(id, action);
      showInfo(
        action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Removed',
        'Suggestion updated.'
      );
    } catch (e) {
      showError('Update failed', e);
    } finally {
      setActingOn(null);
    }
  };

  if (!canMod) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.title}>Leap suggestions</Text>
        <Text style={styles.helper}>This area is only available to admins and moderators.</Text>
        <PrimaryButton title="Back" variant="outline" onPress={() => nav.goBack()} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <Text style={styles.kicker}>MOD</Text>
      <Text style={styles.title}>Leap suggestions</Text>
      <Text style={styles.helper}>
        Approve ideas to put them on tomorrow’s ballot. Rejected ideas stay private. Winning leaps
        leave the pool automatically.
      </Text>

      {!hydrated ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.moss} />
          <Text style={styles.loadingText}>Loading queue…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 600);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No pending suggestions</Text>
              <Text style={styles.emptyBody}>
                When someone suggests a leap, it lands here until you approve it for voting.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = actingOn === item.id;
            return (
              <View style={styles.card}>
                <Text style={styles.userLine}>@{item.suggestedByUsername}</Text>
                <Text style={styles.prompt}>{item.text || 'Untitled leap'}</Text>
                <Text style={styles.meta}>{item.id}</Text>
                <View style={styles.actions}>
                  <PrimaryButton
                    title={busy ? '…' : 'Reject'}
                    variant="outline"
                    onPress={() => void act(item.id, 'reject')}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                  <PrimaryButton
                    title={busy ? '…' : 'Approve'}
                    variant="green"
                    onPress={() => void act(item.id, 'approve')}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                </View>
              </View>
            );
          }}
        />
      )}

      <TouchableOpacity
        onPress={() => nav.navigate('AdminVideoModeration')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
      >
        <Ionicons name="videocam-outline" size={16} color={colors.muted} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>Video moderation</Text>
      </TouchableOpacity>

      <PrimaryButton title="Back" variant="outline" onPress={() => nav.goBack()} style={styles.backBtn} />
    </Screen>
  );
}
