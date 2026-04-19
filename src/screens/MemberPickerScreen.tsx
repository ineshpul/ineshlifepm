import * as React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { subscribeFollowing, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';

type Props = NativeStackScreenProps<ChatStackParamList, 'MemberPicker'>;

export function MemberPickerScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const existing = route.params.existingUids ?? [];
  const [rows, setRows] = React.useState<FollowingRow[]>([]);
  const [sel, setSel] = React.useState<Set<string>>(new Set(existing));

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    return subscribeFollowing(user.uid, setRows);
  }, [user?.uid]);

  const toggle = (uid: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  };

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={rows.filter((r) => r.targetUid !== user?.uid)}
        keyExtractor={(r) => r.targetUid}
        renderItem={({ item }) => {
          const on = sel.has(item.targetUid);
          return (
            <TouchableOpacity style={styles.row} onPress={() => toggle(item.targetUid)}>
              <Text style={styles.name}>@{item.targetUsername}</Text>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.moss : colors.muted2} />
            </TouchableOpacity>
          );
        }}
      />
      <View style={styles.footer}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
  },
  name: { fontSize: 16, fontWeight: '800' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
});
