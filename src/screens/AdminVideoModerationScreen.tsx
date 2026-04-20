import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { showError, showInfo } from '../utils/ui';

type QueueItem = {
  id: string;
  uid: string;
  username: string;
  prompt: string;
  url: string;
  challengeDate: string;
  createdAtMs: number;
  maxDurationSeconds: number;
};

export function AdminVideoModerationScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [actingOn, setActingOn] = React.useState<string | null>(null);

  const [manualId, setManualId] = React.useState('');
  const [manualMeta, setManualMeta] = React.useState('');

  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!user?.isAdmin || !isFirebaseConfigured()) {
      setItems([]);
      setHydrated(true);
      return;
    }

    setHydrated(false);
    const q = query(
      collection(firestore(), 'videos'),
      where('moderationStatus', '==', 'pending'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snap) => {
        const rows: QueueItem[] = snap.docs
          .filter((d) => !Boolean((d.data() as any)?.deleted))
          .map((d) => {
            const data: any = d.data();
            const createdAtMs =
              typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            return {
              id: d.id,
              uid: String(data?.uid ?? ''),
              username: String(data?.username ?? 'user'),
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              challengeDate: String(data?.challengeDate ?? ''),
              createdAtMs,
              maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
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
  }, [user?.isAdmin]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Realtime listener updates automatically; brief UX feedback.
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const setStatus = async (id: string, next: 'approved' | 'rejected') => {
    if (!user?.isAdmin || !isFirebaseConfigured()) {
      showError('Not allowed', new Error('Admin only.'));
      return;
    }
    setActingOn(id);
    try {
      await updateDoc(doc(firestore(), 'videos', id), { moderationStatus: next });
      showInfo(next === 'approved' ? 'Approved' : 'Rejected', `Video ${id}`);
    } catch (e) {
      showError('Update failed', e);
    } finally {
      setActingOn(null);
    }
  };

  const deleteVideoDoc = async (id: string) => {
    if (!user?.isAdmin || !isFirebaseConfigured()) {
      showError('Not allowed', new Error('Admin only.'));
      return;
    }
    setActingOn(id);
    try {
      await deleteDoc(doc(firestore(), 'videos', id));
      showInfo('Deleted', `Video ${id} was deleted.`);
      if (manualId.trim() === id) {
        setManualMeta('Deleted.');
      }
    } catch (e) {
      showError('Delete failed', e);
    } finally {
      setActingOn(null);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert(
      'Delete this video?',
      'This deletes the Firestore video document. It does not remove the file from Storage yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteVideoDoc(id) },
      ]
    );
  };

  const confirmReject = (item: QueueItem) => {
    Alert.alert(
      'Reject this leap?',
      `@${item.username}\n${item.prompt ? item.prompt.slice(0, 120) : item.id}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => void setStatus(item.id, 'rejected'),
        },
      ]
    );
  };

  const loadManual = async () => {
    const id = manualId.trim();
    if (!id || !isFirebaseConfigured()) return;
    try {
      const snap = await getDoc(doc(firestore(), 'videos', id));
      if (!snap.exists()) {
        setManualMeta('Not found.');
        return;
      }
      const d: any = snap.data();
      const lines = [
        `Status: ${String(d?.moderationStatus ?? '')}`,
        `Owner: ${String(d?.uid ?? '')}`,
        `@${String(d?.username ?? '')}`,
        `Date: ${String(d?.challengeDate ?? '')}`,
      ];
      setManualMeta(lines.join('\n'));
    } catch (e) {
      setManualMeta('');
      showError('Load failed', e);
    }
  };

  const setManualStatus = (next: 'approved' | 'rejected') => {
    const id = manualId.trim();
    if (!id) return;
    if (next === 'rejected') {
      Alert.alert('Reject this video?', id, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => void setStatus(id, 'rejected') },
      ]);
    } else {
      void setStatus(id, 'approved');
    }
  };

  if (!user?.isAdmin) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.title}>Moderation</Text>
        <Text style={styles.helper}>This area is only available to admins.</Text>
        <PrimaryButton title="Back" variant="outline" onPress={() => nav.goBack()} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <Text style={styles.kicker}>ADMIN</Text>
      <Text style={styles.title}>Video moderation</Text>
      <Text style={styles.helper}>
        Pending posts appear here. Approve to show in the feed and on profiles, or reject to take down.
      </Text>

      {!hydrated ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.moss} />
          <Text style={styles.loadingText}>Loading queue…</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No pending videos</Text>
              <Text style={styles.emptyBody}>
                Set <Text style={{ fontWeight: '900' }}>requirePostModeration: true</Text> in
                app.json → expo.extra so new uploads are “pending” and land here. Otherwise only
                posts you mark pending (e.g. in console) show up. You can always look up a video by
                ID below.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = actingOn === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {item.url ? (
                    <TouchableOpacity
                      style={styles.thumbWrap}
                      onPress={() => nav.navigate('VideoPost', { videoId: item.id })}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Preview full video"
                    >
                      <Video
                        source={{ uri: item.url }}
                        style={styles.thumbVideo}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay={false}
                        isMuted
                        useNativeControls={false}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.thumbWrap, styles.thumbPlaceholder]}>
                      <Text style={styles.thumbPlaceholderText}>No URL</Text>
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.userLine}>@{item.username}</Text>
                    <Text style={styles.prompt} numberOfLines={3}>
                      {item.prompt || 'Leap'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.challengeDate || '—'} · {item.id}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <PrimaryButton
                    title={busy ? '…' : 'Reject'}
                    variant="outline"
                    onPress={() => confirmReject(item)}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                  <PrimaryButton
                    title={busy ? '…' : 'Delete'}
                    variant="outline"
                    onPress={() => confirmDelete(item.id)}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                  <PrimaryButton
                    title={busy ? '…' : 'Approve'}
                    variant="green"
                    onPress={() => void setStatus(item.id, 'approved')}
                    disabled={busy}
                    style={styles.actionBtn}
                  />
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.manualSection}>
              <Text style={styles.manualKicker}>LOOKUP BY ID</Text>
              <Text style={styles.manualHint}>Optional — paste a Firestore video document id.</Text>
              <TextInput
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="uid_2026-04-19"
                placeholderTextColor={colors.muted2}
                style={styles.input}
              />
              <PrimaryButton title="Load" variant="outline" onPress={() => void loadManual()} />
              {manualMeta ? (
                <View style={styles.metaBox}>
                  <Text style={styles.metaText}>{manualMeta}</Text>
                </View>
              ) : null}
              <View style={styles.manualActions}>
                <PrimaryButton
                  title="Reject"
                  variant="outline"
                  onPress={() => setManualStatus('rejected')}
                  disabled={!manualId.trim()}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Delete"
                  variant="outline"
                  onPress={() => confirmDelete(manualId.trim())}
                  disabled={!manualId.trim()}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Approve"
                  variant="outline"
                  onPress={() => void setManualStatus('approved')}
                  disabled={!manualId.trim()}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          }
        />
      )}

      <PrimaryButton title="Back" variant="outline" onPress={() => nav.goBack()} style={styles.backBtn} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18, paddingTop: 18 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: colors.muted },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 4 },
  helper: { fontSize: 13, fontWeight: '600', color: colors.muted, lineHeight: 18, marginTop: 8, marginBottom: 8 },
  list: { flex: 1 },
  center: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '700', color: colors.muted },
  listContent: { paddingBottom: 120, gap: 12 },
  emptyBox: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginTop: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  emptyBody: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colors.muted, lineHeight: 19 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumbWrap: {
    width: 88,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  thumbVideo: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  cardBody: { flex: 1, minWidth: 0 },
  userLine: { fontSize: 15, fontWeight: '900', color: colors.moss },
  prompt: { marginTop: 4, fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 19 },
  meta: { marginTop: 6, fontSize: 11, fontWeight: '700', color: colors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
  manualSection: { marginTop: 28, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  manualKicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: colors.muted },
  manualHint: { fontSize: 12, fontWeight: '600', color: colors.muted, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.white,
  },
  metaBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.cardTint,
  },
  metaText: { fontSize: 12, fontWeight: '700', color: colors.text, lineHeight: 18 },
  manualActions: { flexDirection: 'row', gap: 10 },
  backBtn: { marginTop: 16, marginBottom: 24 },
});
