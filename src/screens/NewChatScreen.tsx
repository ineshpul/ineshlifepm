import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { subscribeFollowing, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import { getOrCreateDm } from '../services/chat/chatFirestore';
import { showError } from '../utils/ui';

type Props = NativeStackScreenProps<ChatStackParamList, 'NewChat'>;

export function NewChatScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<FollowingRow[]>([]);
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const sharePost = route.params?.sharePost;
  const cancelShare = React.useCallback(() => {
    navigation.replace('ChatInbox');
  }, [navigation]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    return subscribeFollowing(user.uid, setRows);
  }, [user?.uid]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.targetUsername.toLowerCase().includes(s));
  }, [rows, q]);

  const openDm = async (otherUid: string, username: string) => {
    if (!user?.uid) return;
    setBusy(otherUid);
    try {
      const id = await getOrCreateDm({
        currentUid: user.uid,
        otherUid,
        otherDisplayName: username,
      });
      navigation.replace('Conversation', {
        conversationId: id,
        threadTitle: username,
        pendingShare: sharePost,
      });
    } catch (e) {
      showError('Could not open chat', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap>
      {sharePost ? (
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={cancelShare}
            accessibilityRole="button"
            accessibilityLabel="Cancel sharing"
            hitSlop={10}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Share</Text>
          <View style={styles.topRightSpacer} />
        </View>
      ) : null}
      {sharePost ? (
        <View style={styles.shareBanner}>
          <Text style={styles.shareTxt}>Sharing: {sharePost.title || 'Leap clip'}</Text>
        </View>
      ) : null}
      <TextInput
        style={styles.search}
        placeholder="Search people you follow"
        placeholderTextColor={colors.muted2}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
      />
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.targetUid}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Follow people first, then message them here.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => void openDm(item.targetUid, item.targetUsername)}
            disabled={busy === item.targetUid}
          >
            <Text style={styles.name}>@{item.targetUsername}</Text>
            {busy === item.targetUid ? <ActivityIndicator color={colors.moss} /> : null}
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  topRightSpacer: { width: 40, height: 40 },
  shareBanner: { padding: 14, backgroundColor: colors.cardTint, borderBottomWidth: 1, borderBottomColor: colors.border },
  shareTxt: { fontWeight: '800', color: colors.text },
  search: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
  },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  empty: { padding: 24, textAlign: 'center', color: colors.muted, fontWeight: '600' },
});
