import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enterPlayback } from '../camera/audioSessionGate';
import { BestPartCaptionText } from '../components/BestPartCaptionText';
import {
  bestPartWeekDateKeys,
  filterPostsInWeek,
  weekdayLabelForDateKey,
  weekRangeLabel,
} from '../lib/bestPartWeek';
import type { MainStackParamList } from '../navigation/types';
import {
  ensureWeekRecapLocalUri,
  peekWeekRecapLocalUri,
  prefetchWeekRecapClips,
} from '../services/bestPartWeekRecapCache';
import { saveBestPartWeekRecapToCameraRoll } from '../services/saveBestPartWeekRecap';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

const PHOTO_DWELL_MS = 3200;
const MEDIA_ASPECT = 4 / 5;

function clipPlayUrl(post: { mediaType: 'photo' | 'video'; url: string; feedUrl?: string }): string {
  return (post.feedUrl || post.url).trim();
}

function RecapVideo({
  uri,
  onEnded,
  onBufferingChange,
}: {
  uri: string;
  onEnded: () => void;
  onBufferingChange?: (buffering: boolean) => void;
}) {
  const onEndedRef = React.useRef(onEnded);
  onEndedRef.current = onEnded;
  const onBufferingRef = React.useRef(onBufferingChange);
  onBufferingRef.current = onBufferingChange;
  const activeUriRef = React.useRef(uri);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.timeUpdateEventInterval = 0.4;
    // Match feed tuning — start ASAP on progressive MP4s.
    p.bufferOptions = {
      preferredForwardBufferDuration: 2,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.25,
    };
  });

  const tryPlay = React.useCallback(() => {
    try {
      player.muted = false;
      player.volume = 1;
      player.play();
      onBufferingRef.current?.(false);
    } catch {
      /* ignore */
    }
  }, [player]);

  // Keep one player; swap source instead of remounting (avoids cold AVPlayer startup each clip).
  React.useEffect(() => {
    if (activeUriRef.current === uri) return;
    activeUriRef.current = uri;
    onBufferingRef.current?.(true);
    let cancelled = false;
    void (async () => {
      try {
        await player.replaceAsync({ uri });
        if (cancelled) return;
        tryPlay();
      } catch {
        if (cancelled) return;
        try {
          player.replace({ uri }, true);
          tryPlay();
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, player, tryPlay]);

  React.useEffect(() => {
    onBufferingRef.current?.(true);
    tryPlay();

    const readySub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') tryPlay();
      if (status === 'loading') onBufferingRef.current?.(true);
    });
    const endSub = player.addListener('playToEnd', () => {
      onEndedRef.current();
    });

    return () => {
      try {
        readySub.remove();
        endSub.remove();
        player.pause();
      } catch {
        /* ignore */
      }
    };
  }, [player, tryPlay]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
      playsInline
    />
  );
}

export function BestPartWeekRecapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'BestPartWeekRecap'>>();
  const username = (route.params?.username ?? '').trim() || 'user';
  const weekKeys = React.useMemo(
    () => bestPartWeekDateKeys(route.params?.weekStartKey),
    [route.params?.weekStartKey]
  );
  const posts = React.useMemo(() => {
    const raw = Array.isArray(route.params?.posts) ? route.params.posts : [];
    const mapped = raw.map((p) => ({
      ...p,
      uid: '',
      username,
      isPrivate: false,
      deleted: false,
      likesCount: 0,
      commentsCount: 0,
      storagePath: '',
    }));
    return filterPostsInWeek(mapped, weekKeys);
  }, [route.params?.posts, username, weekKeys]);

  const [index, setIndex] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [buffering, setBuffering] = React.useState(true);
  const [resolvedUri, setResolvedUri] = React.useState<string | null>(null);
  const post = posts[index] ?? null;
  const weekLabel = weekRangeLabel(weekKeys);

  const mediaFrameStyle = React.useMemo(() => {
    const { width: screenW, height: screenH } = Dimensions.get('window');
    const topChrome = insets.top + 72;
    const bottomChrome = insets.bottom + 168;
    const availH = Math.max(240, screenH - topChrome - bottomChrome);
    const availW = Math.max(240, screenW - 24);
    let w = availW;
    let h = w / MEDIA_ASPECT;
    if (h > availH) {
      h = availH;
      w = h * MEDIA_ASPECT;
    }
    return { width: w, height: h, borderRadius: 18, overflow: 'hidden' as const };
  }, [insets.bottom, insets.top]);

  const styles = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: '#0E0E0E' },
    stage: {
      ...StyleSheet.absoluteFillObject,
      top: insets.top + 72,
      bottom: insets.bottom + 168,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 1,
    },
    mediaFrame: {
      backgroundColor: '#111',
    },
    spinner: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 2,
    },
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
    topActions: { flexDirection: 'row' as const, gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    tapLeft: {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      bottom: 0,
      width: '28%' as const,
      zIndex: 2,
    },
    tapRight: {
      position: 'absolute' as const,
      right: 0,
      top: 0,
      bottom: 0,
      width: '28%' as const,
      zIndex: 2,
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
    hashtag: { color: c.moss, fontSize: 18, fontWeight: '800' as const, lineHeight: 24 },
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

  // Audio session once for the screen — don't serialize every clip behind enterPlayback + 240ms.
  React.useEffect(() => {
    void enterPlayback();
  }, []);

  // Prefetch all week videos as soon as the recap opens (current first).
  React.useEffect(() => {
    const urls = posts.filter((p) => p.mediaType === 'video').map(clipPlayUrl).filter(Boolean);
    if (urls.length === 0) return;
    const ordered = [...urls.slice(index), ...urls.slice(0, index)];
    prefetchWeekRecapClips(ordered);
  }, [posts, index]);

  // Prefer a cached local file. If a prefetch is already in flight (Sunday card warm),
  // give it a short head start before streaming the remote URL.
  React.useEffect(() => {
    if (!post || post.mediaType !== 'video') {
      setResolvedUri(null);
      setBuffering(false);
      return;
    }
    const remote = clipPlayUrl(post);
    const peeked = peekWeekRecapLocalUri(remote);
    if (peeked) {
      setResolvedUri(peeked);
      setBuffering(true);
      return;
    }

    setResolvedUri(null);
    setBuffering(true);
    let cancelled = false;
    let settled = false;
    const commit = (uri: string) => {
      if (cancelled || settled) return;
      settled = true;
      setResolvedUri(uri);
    };

    const fallback = setTimeout(() => commit(remote), 400);
    void ensureWeekRecapLocalUri(remote)
      .then((local) => {
        clearTimeout(fallback);
        commit(local);
      })
      .catch(() => {
        clearTimeout(fallback);
        commit(remote);
      });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, [post?.id]);

  const advance = React.useCallback(() => {
    if (posts.length === 0) {
      navigation.goBack();
      return;
    }
    if (index >= posts.length - 1) {
      navigation.goBack();
      return;
    }
    setIndex((i) => i + 1);
  }, [index, navigation, posts.length]);

  const goBackOne = React.useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const downloadWeek = React.useCallback(() => {
    if (saving) return;
    setSaving(true);
    void (async () => {
      try {
        const result = await saveBestPartWeekRecapToCameraRoll({
          clips: posts.map((p) => ({
            mediaType: p.mediaType,
            url: p.url,
            feedUrl: p.feedUrl,
          })),
          username,
        });
        Alert.alert(
          'Saved',
          result.stitched
            ? `Your week (${result.clipCount} moments) is in your camera roll.`
            : result.clipCount === 1
              ? 'Your week recap is in your camera roll.'
              : `Saved ${result.clipCount} week moments to your camera roll.`
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save your week.';
        Alert.alert('Could not save', message);
      } finally {
        setSaving(false);
      }
    })();
  }, [posts, saving, username]);

  React.useEffect(() => {
    if (!post || post.mediaType !== 'photo') return;
    const t = setTimeout(advance, PHOTO_DWELL_MS);
    return () => clearTimeout(t);
  }, [advance, post]);

  // Prefetch photo URIs via Image cache.
  React.useEffect(() => {
    posts
      .filter((p) => p.mediaType === 'photo' && p.url)
      .forEach((p) => {
        void Image.prefetch(p.url).catch(() => {});
      });
  }, [posts]);

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

  const isVideo = post.mediaType === 'video';

  return (
    <View style={styles.root}>
      <View style={styles.stage} pointerEvents="none">
        <View style={[styles.mediaFrame, mediaFrameStyle]}>
          {isVideo ? (
            resolvedUri ? (
              <RecapVideo
                key={`${post.id}:${resolvedUri}`}
                uri={resolvedUri}
                onEnded={advance}
                onBufferingChange={setBuffering}
              />
            ) : null
          ) : (
            <Image source={{ uri: post.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {isVideo && (buffering || !resolvedUri) ? (
            <View style={styles.spinner}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
      </View>

      <Pressable style={styles.tapLeft} onPress={goBackOne} accessibilityLabel="Previous moment" />
      <Pressable style={styles.tapRight} onPress={advance} accessibilityLabel="Next moment" />

      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.meta} pointerEvents="none">
          <Text style={styles.kicker}>YOUR WEEK · {weekLabel}</Text>
          <Text style={styles.title}>
            Moment {index + 1} of {posts.length}
          </Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            style={styles.iconBtn}
            onPress={downloadWeek}
            hitSlop={8}
            disabled={saving}
            accessibilityLabel="Download week recap"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#fff" />
            )}
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.bottom} onPress={advance}>
        <View style={styles.progressRow}>
          {posts.map((p, i) => (
            <View key={p.id} style={[styles.pip, i <= index && styles.pipOn]} />
          ))}
        </View>
        <Text style={styles.day}>{weekdayLabelForDateKey(post.dateKey).toUpperCase()}</Text>
        <BestPartCaptionText
          text={post.caption}
          style={styles.caption}
          hashtagStyle={styles.hashtag}
        />
        <Text style={styles.hint}>Tap side to skip · download for camera roll</Text>
      </Pressable>
    </View>
  );
}
