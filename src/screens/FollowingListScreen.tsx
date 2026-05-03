import * as React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { isFirebaseConfigured } from '../firebase/firebase';
import {
  subscribeFollowing,
  syncFollowingProfilePhotos,
  type FollowingRow,
} from '../services/social';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'FollowingList'>;

export function FollowingListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [following, setFollowing] = React.useState<FollowingRow[]>([]);

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowing);
  }, [user?.uid]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid) return;
      void syncFollowingProfilePhotos(user.uid);
    }, [user?.uid])
  );

  if (!isFirebaseConfigured()) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.offline}>Connect Firebase to load following.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <Text style={styles.hint}>People you follow. Follower counts are not shown on Leap.</Text>
      <FlatList
        data={following}
        keyExtractor={(item) => item.targetUid}
        extraData={following.map((f) => `${f.targetUid}:${f.targetPhotoUrl ?? ''}`).join('|')}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Follow people from the Feed.</Text>}
        renderItem={({ item }) => {
          const photo = (item.targetPhotoUrl ?? '').trim();
          return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() =>
              navigation.navigate('UserProfile', { uid: item.targetUid, username: item.targetUsername })
            }
            accessibilityRole="button"
            accessibilityLabel={`Open @${item.targetUsername} profile`}
          >
            <View style={styles.avatar}>
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
            <Text style={styles.name} numberOfLines={1}>
              @{item.targetUsername}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted2} />
          </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
  name: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '800', color: colors.text },
});
