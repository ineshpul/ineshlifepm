import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from './PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { subscribeUsersByUsernamePrefix, type UserSearchHit } from '../services/userSearch';
import { subscribeMutualFollows, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import {
  MAX_CO_LEAP_INVITEES,
  type CoLeapInviteePick,
} from '../types/coLeap';

type Props = {
  visible: boolean;
  viewerUid: string;
  initial: readonly CoLeapInviteePick[];
  onClose: () => void;
  onDone: (picks: CoLeapInviteePick[]) => void;
};

export function CoLeapInvitePickerModal({
  visible,
  viewerUid,
  initial,
  onClose,
  onDone,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingTop: Math.max(12, insets.top),
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    title: { fontSize: 17, fontWeight: '900' as const, color: c.text },
    close: { fontSize: 15, fontWeight: '700' as const, color: c.moss },
    hint: {
      marginHorizontal: 16,
      marginTop: 12,
      fontSize: 13,
      fontWeight: '600' as const,
      color: c.muted,
      lineHeight: 18,
    },
    search: {
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '600' as const,
      backgroundColor: c.card,
      color: c.text,
    },
    chipStrip: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
    },
    chipRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingRight: 8,
    },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingLeft: 4,
      paddingRight: 8,
      paddingVertical: 4,
      borderRadius: 16,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    chipAvatarImg: { width: 24, height: 24 },
    chipAvatarTxt: { fontSize: 11, fontWeight: '800' as const, color: c.moss },
    chipName: { fontSize: 13, fontWeight: '700' as const, color: c.text, maxWidth: 100 },
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 10,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 40, height: 40 },
    avatarTxt: { fontSize: 15, fontWeight: '800' as const, color: c.moss },
    name: { flex: 1, fontSize: 16, fontWeight: '700' as const, color: c.text },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    checkOn: { backgroundColor: c.moss, borderColor: c.moss },
    empty: {
      padding: 28,
      textAlign: 'center' as const,
      color: c.muted,
      fontWeight: '600' as const,
      lineHeight: 22,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Math.max(16, insets.bottom + 8),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border2,
      backgroundColor: c.bg,
    },
  }));

  const [q, setQ] = React.useState('');
  const [mutuals, setMutuals] = React.useState<FollowingRow[]>([]);
  const [searchHits, setSearchHits] = React.useState<UserSearchHit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<Map<string, CoLeapInviteePick>>(() => {
    const m = new Map<string, CoLeapInviteePick>();
    for (const p of initial) m.set(p.uid, p);
    return m;
  });

  React.useEffect(() => {
    if (!visible) return;
    const m = new Map<string, CoLeapInviteePick>();
    for (const p of initial) m.set(p.uid, p);
    setSel(m);
    setQ('');
  }, [visible, initial]);

  React.useEffect(() => {
    if (!visible || !isFirebaseConfigured() || !viewerUid) {
      setMutuals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeMutualFollows(viewerUid, (next) => {
      setMutuals(next.filter((r) => r.targetUid !== viewerUid));
      setLoading(false);
    });
  }, [visible, viewerUid]);

  React.useEffect(() => {
    if (!visible || !isFirebaseConfigured()) {
      setSearchHits([]);
      return;
    }
    const prefix = q.trim();
    if (prefix.length < 1) {
      setSearchHits([]);
      return;
    }
    return subscribeUsersByUsernamePrefix(prefix, viewerUid, 20, setSearchHits);
  }, [visible, q, viewerUid]);

  const rows: CoLeapInviteePick[] = React.useMemo(() => {
    const prefix = q.trim();
    if (prefix.length >= 1) {
      return searchHits.map((h) => ({
        uid: h.uid,
        username: h.username,
        ...(h.photoUrl ? { photoUrl: h.photoUrl } : {}),
      }));
    }
    return mutuals.map((r) => ({
      uid: r.targetUid,
      username: r.targetUsername,
      ...(r.targetPhotoUrl ? { photoUrl: r.targetPhotoUrl } : {}),
    }));
  }, [q, searchHits, mutuals]);

  const selectedList = React.useMemo(() => Array.from(sel.values()), [sel]);

  const toggle = (pick: CoLeapInviteePick) => {
    setSel((prev) => {
      const n = new Map(prev);
      if (n.has(pick.uid)) {
        n.delete(pick.uid);
        return n;
      }
      if (n.size >= MAX_CO_LEAP_INVITEES) return prev;
      n.set(pick.uid, {
        uid: pick.uid,
        username: pick.username.replace(/^@+/u, '') || 'user',
        ...(pick.photoUrl ? { photoUrl: pick.photoUrl } : {}),
      });
      return n;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Co-Leap</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.close}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Invite up to {MAX_CO_LEAP_INVITEES} people. They confirm with one tap for streak + 3in (you
          keep full inches). They can still post their own Leap today.
        </Text>
        {selectedList.length > 0 ? (
          <View style={styles.chipStrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              {selectedList.map((p) => {
                const label = p.username.replace(/^@+/u, '') || 'user';
                return (
                  <Pressable
                    key={p.uid}
                    style={styles.chip}
                    onPress={() => toggle(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${label}`}
                  >
                    <View style={styles.chipAvatar}>
                      {p.photoUrl ? (
                        <Image source={{ uri: p.photoUrl }} style={styles.chipAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.chipAvatarTxt}>{label.slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.chipName} numberOfLines={1}>
                      {label}
                    </Text>
                    <Ionicons name="close" size={14} color={colors.muted} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <TextInput
          style={styles.search}
          placeholder="Search by username"
          placeholderTextColor={colors.muted2}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {loading && rows.length === 0 && !q.trim() ? (
          <ActivityIndicator color={colors.moss} style={{ marginTop: 28 }} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.uid}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {q.trim()
                  ? 'No users match that name.'
                  : 'Search for friends, or pick from people you follow who follow you back.'}
              </Text>
            }
            renderItem={({ item }) => {
              const label = item.username.replace(/^@+/u, '') || 'user';
              const on = sel.has(item.uid);
              const atCap = !on && sel.size >= MAX_CO_LEAP_INVITEES;
              return (
                <Pressable
                  style={[styles.row, atCap && { opacity: 0.45 }]}
                  onPress={() => toggle(item)}
                  disabled={atCap}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <View style={styles.avatar}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <Text style={styles.avatarTxt}>{label.slice(0, 1).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    @{label}
                  </Text>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
        <View style={styles.footer}>
          <PrimaryButton
            title={
              selectedList.length === 0
                ? 'Continue without invites'
                : selectedList.length === 1
                  ? 'Invite 1 person'
                  : `Invite ${selectedList.length} people`
            }
            variant="green"
            onPress={() => onDone(selectedList)}
          />
        </View>
      </View>
    </Modal>
  );
}
