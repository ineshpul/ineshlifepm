import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { ChatScreenHeader } from '../chat/components/ChatScreenHeader';
import {
  subscribeMutualFollows,
  syncFollowingProfilePhotos,
  type FollowingRow,
} from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';

type Props = NativeStackScreenProps<ChatStackParamList, 'MemberPicker'>;

export function MemberPickerScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    selectedStrip: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
      gap: 8,
    },
    selectedLabel: {
      fontSize: 12,
      fontWeight: '800' as const,
      color: c.muted,
      letterSpacing: 0.3,
    },
    chipScroll: { flexGrow: 0 },
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
      marginTop: 8,
      marginBottom: 10,
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
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    rowPressed: { opacity: 0.75 },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
    },
    avatarImg: { width: 44, height: 44 },
    avatarTxt: { fontSize: 16, fontWeight: '800' as const, color: c.moss },
    nameCol: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: '700' as const, color: c.text },
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
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border2,
      backgroundColor: c.bg,
    },
  }));

  const existing = route.params.existingUids ?? [];
  const [rows, setRows] = React.useState<FollowingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState<Set<string>>(() => new Set(existing));

  const goBack = React.useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('NewGroup', { pickedUids: Array.from(sel) });
  }, [navigation, sel]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <ChatScreenHeader
          title="Add people"
          onBack={goBack}
          backAccessibilityLabel="Back to New group"
        />
      ),
    });
  }, [navigation, goBack]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeMutualFollows(user.uid, (next) => {
      setRows(next.filter((r) => r.targetUid !== user.uid));
      setLoading(false);
    });
  }, [user?.uid]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid) return;
      void syncFollowingProfilePhotos(user.uid);
    }, [user?.uid])
  );

  const selectedPeople = React.useMemo(() => {
    const byUid = new Map(rows.map((r) => [r.targetUid, r]));
    return Array.from(sel)
      .map((uid) => {
        const row = byUid.get(uid);
        const label = (row?.targetUsername ?? '').replace(/^@+/u, '') || 'member';
        return {
          uid,
          label,
          photo: (row?.targetPhotoUrl ?? '').trim(),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [sel, rows]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@+/u, '');
    if (!s) return rows;
    return rows.filter((r) => r.targetUsername.toLowerCase().replace(/^@+/u, '').includes(s));
  }, [rows, q]);

  const toggle = (uid: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  };

  const emptyCopy = loading
    ? 'Loading people…'
    : q.trim()
      ? 'No mutual follows match that name.'
      : 'Only people you follow who follow you back can be added to a group.';

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap edges={['bottom', 'left', 'right']}>
      {selectedPeople.length > 0 ? (
        <View style={styles.selectedStrip}>
          <Text style={styles.selectedLabel}>
            {selectedPeople.length} selected — tap to remove
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {selectedPeople.map((p) => (
              <Pressable
                key={p.uid}
                style={styles.chip}
                onPress={() => toggle(p.uid)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.label}`}
              >
                <View style={styles.chipAvatar}>
                  {p.photo ? (
                    <Image source={{ uri: p.photo }} style={styles.chipAvatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.chipAvatarTxt}>{p.label.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.chipName} numberOfLines={1}>
                  {p.label}
                </Text>
                <Ionicons name="close" size={14} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text style={styles.hint}>People you follow who follow you back</Text>
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
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.moss} style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.targetUid}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{emptyCopy}</Text>}
          renderItem={({ item }) => {
            const on = sel.has(item.targetUid);
            const photo = (item.targetPhotoUrl ?? '').trim();
            const label = item.targetUsername.replace(/^@+/u, '') || 'user';
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => toggle(item.targetUid)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${on ? 'Deselect' : 'Select'} ${label}`}
              >
                <View style={styles.avatar}>
                  {photo ? (
                    <Image
                      recyclingKey={item.targetUid}
                      source={{ uri: photo }}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.avatarTxt}>{label.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.nameCol}>
                  <Text style={styles.name} numberOfLines={1}>
                    @{label}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? colors.moss : colors.muted2}
                />
              </Pressable>
            );
          }}
        />
      )}
      <View style={styles.footer}>
        <PrimaryButton
          title={sel.size === 0 ? 'Select people' : `Done · ${sel.size}`}
          variant="green"
          disabled={sel.size === 0}
          onPress={() =>
            navigation.navigate({
              name: 'NewGroup',
              params: { pickedUids: Array.from(sel) },
              merge: true,
            })
          }
        />
      </View>
    </Screen>
  );
}
