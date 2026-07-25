import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, backgroundColor: colors.bg },
    hint: {
      marginHorizontal: 16,
      marginTop: 10,
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
      lineHeight: 18,
    },
    search: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontWeight: '600',
      backgroundColor: colors.card,
      color: colors.text,
    },
    list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowOn: {
      borderColor: colors.moss,
      backgroundColor: colors.cardTint,
    },
    rowPressed: { opacity: 0.88 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    avatarImg: { width: 40, height: 40 },
    avatarTxt: { fontSize: 15, fontWeight: '900', color: colors.moss },
    nameCol: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '800', color: colors.text },
    empty: {
      padding: 24,
      textAlign: 'center',
      color: colors.muted,
      fontWeight: '600',
      lineHeight: 22,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
      backgroundColor: colors.bg,
    },
    selectedMeta: { fontSize: 13, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  }));

  const existing = route.params.existingUids ?? [];
  const [rows, setRows] = React.useState<FollowingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState<Set<string>>(() => new Set(existing));

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

  const selectedCount = sel.size;

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap edges={['bottom', 'left', 'right']}>
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
                style={({ pressed }) => [
                  styles.row,
                  on && styles.rowOn,
                  pressed && styles.rowPressed,
                ]}
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
        <Text style={styles.selectedMeta}>
          {selectedCount === 0
            ? 'Select at least one person'
            : `${selectedCount} selected`}
        </Text>
        <PrimaryButton
          title="Done"
          variant="green"
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
