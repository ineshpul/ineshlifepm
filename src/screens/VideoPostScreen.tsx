import * as React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { TakeTheLeapGate } from '../components/TakeTheLeapGate';
import { UsernameLink } from '../components/UsernameLink';
import { Screen } from '../components/Screen';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useCanViewOtherUsersVideos } from '../state/posting';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { recordVideoView } from '../services/recordVideoView';
import { useSettingsPreferences } from '../state/settingsPreferences';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPost'>;

export function VideoPostScreen({ route }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  hint: { fontSize: 13, fontWeight: '700', color: colors.muted },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, fontWeight: '600', color: colors.muted, textAlign: 'center', lineHeight: 20 },
  scrollContent: { paddingBottom: 32, gap: 10 },
  videoWrap: {
    marginTop: 4,
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  video: { width: '100%', height: '100%' },
  pip: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 96,
    height: 132,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0B1020',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  pipVideo: { width: '100%', height: '100%' },
  userLine: { marginTop: 4, fontSize: 15, fontWeight: '900' },
  prompt: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '700', color: colors.muted },
}));
  const { videoId } = route.params;
  const isFocused = useIsFocused();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const viewerUid = user?.uid ?? '';
  const { preferences } = useSettingsPreferences();
  const canViewOthersVideos = useCanViewOtherUsersVideos({
    uid: user?.uid,
    isAdmin: user?.isAdmin,
    isModerator: user?.isModerator,
  });

  const ownerFromId = React.useMemo<string>(() => {
    const raw = String(videoId ?? '');
    const idx = raw.indexOf('_');
    if (idx <= 0) return '';
    return raw.slice(0, idx);
  }, [videoId]);
  const isOwnById = Boolean(viewerUid && ownerFromId && ownerFromId === viewerUid);
  const gateById = !isOwnById && !canViewOthersVideos;

  const [loadState, setLoadState] = React.useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [row, setRow] = React.useState<{
    url: string;
    /** Companion PIP clip for BeReal-style dual-camera posts. */
    secondaryUrl?: string;
    dualFrontIsPrimary?: boolean;
    prompt: string;
    username: string;
    ownerUid: string;
    moderationStatus: string;
    maxDurationSeconds: number;
  } | null>(null);

  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (gateById) return;
    if (!isFirebaseConfigured() || !videoId) {
      setRow(null);
      setLoadState('missing');
      return;
    }
    const ref = doc(firestore(), 'videos', videoId);
    let alive = true;
    setLoadState('loading');
    void getDoc(ref)
      .then((snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          setRow(null);
          setLoadState('missing');
          return;
        }
        const data: any = snap.data();
        const url = String(data?.url ?? '');
        if (!url) {
          setRow(null);
          setLoadState('missing');
          return;
        }
        const secondaryUrl = String(data?.secondaryUrl ?? '').trim();
        const dualFrontIsPrimary = data?.dualFrontIsPrimary === true;
        setRow({
          url,
          ...(secondaryUrl ? { secondaryUrl } : {}),
          ...(dualFrontIsPrimary ? { dualFrontIsPrimary: true } : {}),
          prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
          username: String(data?.username ?? 'user'),
          ownerUid: String(data?.uid ?? ''),
          moderationStatus: String(data?.moderationStatus ?? ''),
          maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
        });
        setLoadState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setRow(null);
        setLoadState('error');
      });
    return () => {
      alive = false;
    };
  }, [videoId, gateById]);

  const blockOtherPeoplesPost =
    gateById ||
    (loadState === 'ready' &&
      row != null &&
      Boolean(viewerUid) &&
      String(row.ownerUid) !== String(viewerUid) &&
      !canViewOthersVideos);

  React.useEffect(() => {
    if (!isFocused || loadState !== 'ready' || !videoId || blockOtherPeoplesPost) return;
    void recordVideoView(videoId);
  }, [isFocused, loadState, videoId, blockOtherPeoplesPost]);

  const [keyboardPad, setKeyboardPad] = React.useState(0);
  const primaryVideoRef = React.useRef<Video>(null);
  const secondaryVideoRef = React.useRef<Video>(null);
  const secondarySyncPosRef = React.useRef(0);
  const [primaryPlaying, setPrimaryPlaying] = React.useState(false);
  const dualFrontIsPrimary = row?.dualFrontIsPrimary === true;
  const secondaryCarriesAudio = Boolean(row?.secondaryUrl && dualFrontIsPrimary);
  const secondaryShouldPlay = isFocused && primaryPlaying;
  React.useEffect(() => {
    if (isFocused) return;
    setPrimaryPlaying(false);
    void (async () => {
      try {
        await primaryVideoRef.current?.pauseAsync();
        await primaryVideoRef.current?.unloadAsync();
        await secondaryVideoRef.current?.pauseAsync();
        await secondaryVideoRef.current?.unloadAsync();
      } catch {
        // ignore
      }
    })();
  }, [isFocused]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        setPrimaryPlaying(false);
        void (async () => {
          try {
            await primaryVideoRef.current?.pauseAsync();
            await primaryVideoRef.current?.unloadAsync();
            await secondaryVideoRef.current?.pauseAsync();
            await secondaryVideoRef.current?.unloadAsync();
          } catch {
            // ignore
          }
        })();
      };
    }, [])
  );

  React.useEffect(() => {
    setPrimaryPlaying(false);
    secondarySyncPosRef.current = 0;
  }, [row?.url, row?.secondaryUrl]);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardPad(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardPad(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollRef = React.useRef<ScrollView>(null);

  if (blockOtherPeoplesPost) {
    return <TakeTheLeapGate variant="feed" />;
  }

  return (
    <Screen style={styles.screen}>
      {loadState === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.moss} />
          <Text style={styles.hint}>Loading leap…</Text>
        </View>
      ) : null}

      {loadState === 'missing' ? (
        <View style={styles.center}>
          <Text style={styles.title}>Leap not found</Text>
          <Text style={styles.body}>This post may have been removed or is not visible yet.</Text>
        </View>
      ) : null}

      {loadState === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.title}>Can’t open this leap</Text>
          <Text style={styles.body}>You may not have access, or the post is still in review.</Text>
        </View>
      ) : null}

      {loadState === 'ready' && row ? (
        <View style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 32 + keyboardPad },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.videoWrap}>
              <Video
                ref={primaryVideoRef}
                source={{ uri: row.url }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay={isFocused}
                isLooping={false}
                isMuted={secondaryCarriesAudio}
                volume={secondaryCarriesAudio ? 0 : 1}
                progressUpdateIntervalMillis={preferences.dataSaver ? 1000 : 250}
                onPlaybackStatusUpdate={(status) => {
                  if (!status.isLoaded) return;
                  const playing = Boolean(status.isPlaying);
                  setPrimaryPlaying(playing);
                  if (row.secondaryUrl) {
                    const pos = status.positionMillis ?? 0;
                    if (Math.abs(pos - secondarySyncPosRef.current) >= 150) {
                      secondarySyncPosRef.current = pos;
                      void (async () => {
                        try {
                          await secondaryVideoRef.current?.setPositionAsync(pos);
                          if (playing) await secondaryVideoRef.current?.playAsync();
                        } catch {
                          // ignore
                        }
                      })();
                    } else if (playing) {
                      void secondaryVideoRef.current?.playAsync().catch(() => {});
                    }
                  }
                  if (status.didJustFinish) {
                    void (async () => {
                      try {
                        await secondaryVideoRef.current?.pauseAsync();
                        await secondaryVideoRef.current?.setPositionAsync(0);
                        secondarySyncPosRef.current = 0;
                      } catch {
                        // ignore
                      }
                    })();
                  }
                }}
              />
              {row.secondaryUrl ? (
                <View style={styles.pip} pointerEvents="none">
                  <Video
                    ref={secondaryVideoRef}
                    source={{ uri: row.secondaryUrl }}
                    style={styles.pipVideo}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={secondaryShouldPlay}
                    isMuted={!dualFrontIsPrimary}
                    isLooping={false}
                    volume={dualFrontIsPrimary ? 1 : 0}
                    progressUpdateIntervalMillis={preferences.dataSaver ? 2000 : 1000}
                  />
                </View>
              ) : null}
            </View>

            <UsernameLink uid={row.ownerUid} username={row.username} style={styles.userLine} />
            <Text style={styles.prompt}>{row.prompt || 'Leap'}</Text>
            <Text style={styles.meta}>
              {row.maxDurationSeconds}s · {row.moderationStatus || 'posted'}
            </Text>

            {user?.uid ? (
              <FeedPostEngagement
                videoId={videoId}
                videoOwnerUid={row.ownerUid}
                videoOwnerUsername={row.username}
                shareTitle={`${row.username} on Leap`}
                shareUrl={row.url}
                challengePrompt={row.prompt}
                viewerUid={user.uid}
                viewerUsername={user.username}
                onCommentComposerFocus={() => {
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  });
                }}
              />
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </Screen>
  );
}
