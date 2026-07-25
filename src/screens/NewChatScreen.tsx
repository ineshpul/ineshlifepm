import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { Screen } from '../components/Screen';
import { useAuth } from '../state/auth';
import type { ChatStackParamList } from '../navigation/ChatStack';
import { subscribeFollowing, syncFollowingProfilePhotos, type FollowingRow } from '../services/social';
import { isFirebaseConfigured } from '../firebase/firebase';
import { getOrCreateDm } from '../services/chat/chatFirestore';
import { ChatHeaderIconButton } from '../chat/components/ChatHeaderIconButton';
import { showError } from '../utils/ui';
import { UsernameLink } from '../components/UsernameLink';

type Props = NativeStackScreenProps<ChatStackParamList, 'NewChat'>;

export function NewChatScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  shareBanner: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.cardTint,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  shareLabel: { fontSize: 12, fontWeight: '900', color: colors.muted, letterSpacing: 0.4 },
  shareTxt: { fontSize: 14, fontWeight: '900', color: colors.text },
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
  },
  searchAfterShare: {
    marginTop: 10,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8, paddingTop: 2 },
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
  name: { fontSize: 15, fontWeight: '800' },
  empty: { padding: 24, textAlign: 'center', color: colors.muted, fontWeight: '600' },
}));
  const { user } = useAuth();
  const [rows, setRows] = React.useState<FollowingRow[]>([]);
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const sharePost = route.params?.sharePost;
  const cancelShare = React.useCallback(() => {
    navigation.replace('ChatInbox');
  }, [navigation]);

  React.useEffect(() => {
    // When sharing, use the native stack header (avoid double headers).
    if (!sharePost) return;
    navigation.setOptions({
      title: 'Share',
      headerBackVisible: false,
      headerLeft: () => (
        <ChatHeaderIconButton
          name="close"
          onPress={cancelShare}
          accessibilityLabel="Cancel sharing"
          size={22}
        />
      ),
    });
    return () => {
      navigation.setOptions({ title: 'New message', headerLeft: undefined, headerBackVisible: true });
    };
  }, [navigation, sharePost, cancelShare]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    return subscribeFollowing(user.uid, setRows);
  }, [user?.uid]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid) return;
      void syncFollowingProfilePhotos(user.uid);
    }, [user?.uid])
  );

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
    <Screen style={styles.screen} dismissKeyboardOnTap edges={['bottom', 'left', 'right']}>
      {sharePost ? (
        <View style={styles.shareBanner}>
          <Text style={styles.shareLabel}>Sharing</Text>
          <Text style={styles.shareTxt} numberOfLines={1}>
            {sharePost.title || 'Leap clip'}
          </Text>
        </View>
      ) : null}
      <TextInput
        style={[styles.search, sharePost ? styles.searchAfterShare : undefined]}
        placeholder="Search people you follow"
        placeholderTextColor={colors.muted2}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
      />
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.targetUid}
        extraData={rows.map((r) => `${r.targetUid}:${r.targetPhotoUrl ?? ''}`).join('|')}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Follow people first, then message them here.</Text>}
        renderItem={({ item }) => {
          const photo = (item.targetPhotoUrl ?? '').trim();
          const isBusy = busy === item.targetUid;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && !isBusy && styles.rowPressed]}
              onPress={() => void openDm(item.targetUid, item.targetUsername)}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.targetUsername}`}
            >
              <View style={styles.avatar}>
                {photo ? (
                  <Image
                    key={`newchat-${item.targetUid}`}
                    recyclingKey={item.targetUid}
                    source={{ uri: photo }}
                    style={styles.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarTxt}>{item.targetUsername.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.nameCol}>
                <UsernameLink uid={item.targetUid} username={item.targetUsername} style={styles.name} />
              </View>
              {isBusy ? (
                <ActivityIndicator color={colors.moss} size="small" />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
              )}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
