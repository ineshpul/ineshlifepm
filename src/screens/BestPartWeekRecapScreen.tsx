import * as React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  currentBestPartWeekDateKeys,
  filterPostsInWeek,
  weekdayLabelForDateKey,
  weekRangeLabel,
} from '../lib/bestPartWeek';
import type { MainStackParamList } from '../navigation/types';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
export function BestPartWeekRecapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'BestPartWeekRecap'>>();
  const posts = React.useMemo(() => {
    const raw = Array.isArray(route.params?.posts) ? route.params.posts : [];
    const mapped = raw.map((p) => ({
      ...p,
      uid: '',
      username: '',
      isPrivate: false,
      deleted: false,
      likesCount: 0,
      commentsCount: 0,
      storagePath: '',
    }));
    return filterPostsInWeek(mapped, currentBestPartWeekDateKeys());
  }, [route.params?.posts]);

  const [index, setIndex] = React.useState(0);
  const post = posts[index] ?? null;
  const weekLabel = weekRangeLabel(currentBestPartWeekDateKeys());

  const styles = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: '#0E0E0E' },
    media: { ...({ position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 }) },
    top: {
      position: 'absolute' as const,
      top: insets.top + 10,
      left: 16,
      right: 16,
      zIndex: 3,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    meta: { flex: 1, paddingRight: 12 },
    kicker: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.2,
    },
    title: { color: '#fff', fontSize: 20, fontWeight: '900' as const, marginTop: 4 },
    close: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    bottom: {
      position: 'absolute' as const,
      left: 18,
      right: 18,
      bottom: insets.bottom + 24,
      zIndex: 3,
      gap: 12,
    },
    day: {
      color: c.moss,
      fontSize: 12,
      fontWeight: '800' as const,
      letterSpacing: 1.1,
    },
    caption: { color: '#fff', fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
    progressRow: { flexDirection: 'row' as const, gap: 4, marginBottom: 8 },
    pip: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
    pipOn: { backgroundColor: '#fff' },
    hint: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 13,
      fontWeight: '600' as const,
      textAlign: 'center' as const,
    },
    empty: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 24,
      gap: 12,
    },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700' as const, textAlign: 'center' as const },
  }));

  const advance = () => {
    if (posts.length === 0) {
      navigation.goBack();
      return;
    }
    if (index >= posts.length - 1) {
      navigation.goBack();
      return;
    }
    setIndex((i) => i + 1);
  };

  if (!post) {
    return (
      <View style={[styles.root, styles.empty]}>
        <Text style={styles.emptyText}>No moments in this week yet.</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.moss, fontWeight: '800' }}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.root} onPress={advance}>
      {post.mediaType === 'photo' ? (
        <Image source={{ uri: post.url }} style={styles.media} resizeMode="cover" />
      ) : (
        <Video
          key={post.id}
          source={{ uri: post.url }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          useNativeControls={false}
        />
      )}

      <View style={styles.top}>
        <View style={styles.meta}>
          <Text style={styles.kicker}>YOUR WEEK · {weekLabel}</Text>
          <Text style={styles.title}>
            Moment {index + 1} of {posts.length}
          </Text>
        </View>
        <Pressable style={styles.close} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {posts.map((p, i) => (
            <View key={p.id} style={[styles.pip, i <= index && styles.pipOn]} />
          ))}
        </View>
        <Text style={styles.day}>{weekdayLabelForDateKey(post.dateKey).toUpperCase()}</Text>
        <Text style={styles.caption}>{post.caption}</Text>
        <Text style={styles.hint}>Tap to keep playing</Text>
      </View>
    </Pressable>
  );
}
