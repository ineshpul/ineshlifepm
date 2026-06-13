import * as React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import { isFirebaseConfigured } from '../firebase/firebase';
import {
  subscribeFollowing,
  syncFollowingProfilePhotos,
  type FollowingRow,
} from '../services/social';
import type { MainStackParamList } from '../navigation/types';
import { navigateToUserProfile } from '../navigation/navigationHelpers';

type Props = NativeStackScreenProps<MainStackParamList, 'FollowingList'>;

type ListRow = FollowingRow & { isMutual: boolean };

export function FollowingListScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
    offline: { padding: 24, textAlign: 'center', color: colors.muted, fontWeight: '600' },
    hint: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '600', marginBottom: 8 },
    list: { paddingBottom: 32, gap: 8, paddingTop: 2 },
    empty: { marginTop: 24, fontSize: 15, fontWeight: '700', color: colors.text },
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
    rowMutual: {
      borderColor: 'rgba(39, 174, 96, 0.45)',
      backgroundColor: 'rgba(39, 174, 96, 0.08)',
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
    avatarMutual: { borderColor: 'rgba(39, 174, 96, 0.5)' },
    avatarImg: { width: 40, height: 40 },
    avatarTxt: { fontSize: 15, fontWeight: '900', color: colors.moss },
    nameCol: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 15, fontWeight: '800', color: colors.coral },
    nameMutual: { color: colors.moss },
    mutualBadge: { fontSize: 11, fontWeight: '900', color: colors.moss },
  }));
  const listUid = route.params?.uid ?? user?.uid;
  const listUsername = route.params?.username?.replace(/^@+/u, '').trim();
  const isOwnList = !route.params?.uid || route.params.uid === user?.uid;

  const [following, setFollowing] = React.useState<FollowingRow[]>([]);
  const [viewerFollowing, setViewerFollowing] = React.useState<FollowingRow[]>([]);

  React.useLayoutEffect(() => {
    if (isOwnList) {
      navigation.setOptions({ title: 'Following' });
      return;
    }
    const who = listUsername ? `@${listUsername}` : 'Their following';
    navigation.setOptions({ title: who });
  }, [navigation, isOwnList, listUsername]);

  React.useEffect(() => {
    return subscribeFollowing(listUid, setFollowing);
  }, [listUid]);

  React.useEffect(() => {
    if (!user?.uid || isOwnList) {
      setViewerFollowing([]);
      return;
    }
    return subscribeFollowing(user.uid, setViewerFollowing);
  }, [user?.uid, isOwnList]);

  useFocusEffect(
    React.useCallback(() => {
      if (!listUid) return;
      void syncFollowingProfilePhotos(listUid);
    }, [listUid])
  );

  const mutualUids = React.useMemo(
    () => new Set(viewerFollowing.map((r) => r.targetUid)),
    [viewerFollowing]
  );

  const sortedRows = React.useMemo((): ListRow[] => {
    const rows = following.map((r) => ({
      ...r,
      isMutual: !isOwnList && mutualUids.has(r.targetUid),
    }));
    if (isOwnList) return rows;
    return [...rows].sort((a, b) => {
      if (a.isMutual === b.isMutual) return b.createdAtMs - a.createdAtMs;
      return a.isMutual ? -1 : 1;
    });
  }, [following, isOwnList, mutualUids]);

  if (!isFirebaseConfigured()) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.offline}>Connect Firebase to load following.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      {!isOwnList ? (
        <Text style={styles.hint}>
          Mutuals you both follow appear first with a green highlight.
        </Text>
      ) : (
        <Text style={styles.hint}>People you follow. Follower counts are not shown on Leap.</Text>
      )}
      <FlatList
        data={sortedRows}
        keyExtractor={(item) => item.targetUid}
        extraData={sortedRows.map((f) => `${f.targetUid}:${f.isMutual}:${f.targetPhotoUrl ?? ''}`).join('|')}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isOwnList ? 'Follow people from the Feed.' : 'No one to show yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const photo = (item.targetPhotoUrl ?? '').trim();
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                item.isMutual && styles.rowMutual,
                pressed && styles.rowPressed,
              ]}
              onPress={() =>
                navigateToUserProfile(navigation, {
                  uid: item.targetUid,
                  username: item.targetUsername,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open @${item.targetUsername} profile`}
            >
              <View style={[styles.avatar, item.isMutual && styles.avatarMutual]}>
                {photo ? (
                  <Image
                    key={`fol-${item.targetUid}`}
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
                <Text style={[styles.name, item.isMutual && styles.nameMutual]} numberOfLines={1}>
                  @{item.targetUsername}
                </Text>
                {item.isMutual ? <Text style={styles.mutualBadge}>Mutual</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
