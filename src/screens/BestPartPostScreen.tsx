import * as React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';

import { BestPartCard } from '../components/BestPartCard';
import { Screen } from '../components/Screen';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { MainStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { BestPartPost } from '../types/bestPart';

function mapPost(id: string, data: Record<string, unknown>): BestPartPost | null {
  const uid = typeof data.uid === 'string' ? data.uid : '';
  const dateKey = typeof data.dateKey === 'string' ? data.dateKey : '';
  const caption = typeof data.caption === 'string' ? data.caption : '';
  const mediaType = data.mediaType === 'photo' || data.mediaType === 'video' ? data.mediaType : null;
  const url = typeof data.url === 'string' ? data.url : '';
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';
  if (!uid || !dateKey || !mediaType || !url || !storagePath) return null;
  return {
    id,
    uid,
    username: typeof data.username === 'string' ? data.username : 'user',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : undefined,
    dateKey,
    caption,
    mediaType,
    url,
    storagePath,
    feedUrl: typeof data.feedUrl === 'string' ? data.feedUrl : undefined,
    feedStoragePath: typeof data.feedStoragePath === 'string' ? data.feedStoragePath : undefined,
    secondaryUrl: typeof data.secondaryUrl === 'string' ? data.secondaryUrl : undefined,
    secondaryStoragePath:
      typeof data.secondaryStoragePath === 'string' ? data.secondaryStoragePath : undefined,
    feedSecondaryUrl:
      typeof data.feedSecondaryUrl === 'string' ? data.feedSecondaryUrl : undefined,
    feedSecondaryStoragePath:
      typeof data.feedSecondaryStoragePath === 'string'
        ? data.feedSecondaryStoragePath
        : undefined,
    feedEncodeVersion:
      typeof data.feedEncodeVersion === 'string' ? data.feedEncodeVersion : undefined,
    dualFrontIsPrimary: data.dualFrontIsPrimary === true,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
    isPrivate: data.isPrivate === true,
    deleted: data.deleted === true,
    likesCount: typeof data.likesCount === 'number' ? data.likesCount : 0,
    commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function BestPartPostScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const route = useRoute<RouteProp<MainStackParamList, 'BestPartPost'>>();
  const bestPartId = route.params.bestPartId;
  const [post, setPost] = React.useState<BestPartPost | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [missing, setMissing] = React.useState(false);

  const styles = useThemedStyles((c) => ({
    screen: { paddingHorizontal: 18, paddingTop: 12 },
    center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
    msg: { color: c.muted2, fontWeight: '600' as const, textAlign: 'center' as const, fontSize: 15 },
  }));

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !bestPartId) {
      setLoading(false);
      setMissing(true);
      return;
    }
    return onSnapshot(
      doc(firestore(), 'bestParts', bestPartId),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setMissing(true);
          setPost(null);
          return;
        }
        const mapped = mapPost(snap.id, snap.data() as Record<string, unknown>);
        if (!mapped || mapped.deleted) {
          setMissing(true);
          setPost(null);
          return;
        }
        if (mapped.isPrivate && mapped.uid !== user?.uid) {
          setMissing(true);
          setPost(null);
          return;
        }
        setMissing(false);
        setPost(mapped);
      },
      () => {
        setLoading(false);
        setMissing(true);
      }
    );
  }, [bestPartId, user?.uid]);

  if (loading) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={colors.green} />
      </Screen>
    );
  }

  if (missing || !post) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.msg}>This moment is private or no longer available.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <BestPartCard post={post} showOwner />
        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}
