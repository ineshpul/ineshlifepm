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
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Audio, Video, ResizeMode } from 'expo-av';
import { doc, onSnapshot } from 'firebase/firestore';

import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { TakeTheLeapGate } from '../components/TakeTheLeapGate';
import { UsernameLink } from '../components/UsernameLink';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useCanViewOtherUsersVideos } from '../state/posting';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { recordVideoView } from '../services/recordVideoView';
import { useSettingsPreferences } from '../state/settingsPreferences';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPost'>;

export function VideoPostScreen({ route }: Props) {
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
    return onSnapshot(
      ref,
      (snap) => {
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
        setRow({
          url,
          prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
          username: String(data?.username ?? 'user'),
          ownerUid: String(data?.uid ?? ''),
          moderationStatus: String(data?.moderationStatus ?? ''),
          maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
        });
        setLoadState('ready');
      },
      () => {
        setRow(null);
        setLoadState('error');
      }
    );
  }, [videoId]);

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
                source={{ uri: row.url }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay={isFocused}
                isLooping={false}
                progressUpdateIntervalMillis={preferences.dataSaver ? 1000 : 250}
              />
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

const styles = StyleSheet.create({
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
  userLine: { marginTop: 4, fontSize: 15, fontWeight: '900' },
  prompt: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '700', color: colors.muted },
});
