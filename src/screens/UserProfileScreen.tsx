import * as React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { colors } from '../theme/colors';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { FollowButton } from '../components/FollowButton';
import { normalizeTaskDurationSeconds } from '../state/challenge';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

type ProfileVideo = {
  id: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  moderationStatus: string;
  maxDurationSeconds: number;
  likesCount: number;
  commentsCount: number;
  ownerUid: string;
  username: string;
};

export function UserProfileScreen({ route }: Props) {
  const isFocused = useIsFocused();
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { uid, username: usernameHint } = route.params;

  const [profile, setProfile] = React.useState<any>(null);
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [playingId, setPlayingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isFocused) setPlayingId(null);
  }, [isFocused]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid) {
      setProfile(null);
      return;
    }
    const ref = doc(firestore(), 'users', uid);
    return onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null));
  }, [uid]);

  const viewerUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
  const isSelf = Boolean(viewerUid && viewerUid === uid);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid) {
      setVideos([]);
      return;
    }
    const vUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
    const isViewerOwner = Boolean(vUid && vUid === uid);
    const col = collection(firestore(), 'videos');
    // Non-owners may only read `approved` videos (see firestore.rules). A query that could return
    // pending/rejected docs fails entirely for other users — filter so the query is rule-safe.
    const q = isViewerOwner
      ? query(col, where('uid', '==', uid), limit(120))
      : query(col, where('uid', '==', uid), where('moderationStatus', '==', 'approved'), limit(120));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .filter((d) => !Boolean((d.data() as any)?.deleted))
          .map((d) => {
            const data: any = d.data();
            const createdAtMs =
              typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            return {
              id: d.id,
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              createdAtMs,
              moderationStatus: String(data?.moderationStatus ?? ''),
              maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
              likesCount: Number(data?.likesCount ?? 0),
              commentsCount: Number(data?.commentsCount ?? 0),
              ownerUid: String(data?.uid ?? uid),
              username: String(data?.username ?? usernameHint ?? profile?.username ?? 'user'),
            } satisfies ProfileVideo;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 50);
        setVideos(rows);
      },
      () => setVideos([])
    );
  }, [uid, user?.uid, usernameHint, profile?.username]);

  const username = String(profile?.username ?? usernameHint ?? 'user');
  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = String(profile?.photoUrl ?? '').trim();
  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

  const verticalScore = Math.round(Number(profile?.verticalScore ?? 0));
  const highestJumpDisplayInches = Math.round(
    Number(profile?.highestJumpDisplayInches ?? 0)
  );
  const bestVerticalGainPoints = Math.round(Number(profile?.bestVerticalGainPoints ?? 0));
  const bestVerticalGainPostId = String(profile?.bestVerticalGainPostId ?? '').trim();
  const canOpenBestLeap = Boolean(bestVerticalGainPostId);

  return (
    <Screen style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials || 'U'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{username}</Text>
          <Text style={styles.handle}>@{username}</Text>
          {bio ? <Text style={styles.bio}>{bio}</Text> : null}
        </View>
        {!isSelf && user?.uid ? (
          <FollowButton
            viewerUid={user.uid}
            viewerUsername={user.username}
            targetUid={uid}
            targetUsername={username}
          />
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{verticalScore}</Text>
          <Text style={styles.statLabel}>Vertical</Text>
        </View>
        <Pressable
          disabled={!canOpenBestLeap}
          onPress={() => {
            if (canOpenBestLeap) nav.navigate('VideoPost', { videoId: bestVerticalGainPostId });
          }}
          style={({ pressed }) => [styles.stat, canOpenBestLeap && pressed && styles.statPressed]}
          accessibilityRole={canOpenBestLeap ? 'button' : undefined}
          accessibilityLabel={canOpenBestLeap ? 'Watch the leap for Highest Leap' : undefined}
        >
          <Text style={styles.statNum}>{highestJumpDisplayInches} in</Text>
          <Text style={styles.statLabel}>Highest Leap</Text>
          {bestVerticalGainPoints > 0 ? (
            <Text style={styles.statSub}>+{bestVerticalGainPoints} pts from one leap</Text>
          ) : null}
          {canOpenBestLeap ? (
            <Text style={styles.statLink}>Tap to watch leap</Text>
          ) : null}
        </Pressable>
      </View>

      <FlatList
        data={videos}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.videoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.videoPrompt} numberOfLines={2}>
                {item.prompt || 'Leap'}
              </Text>
              <Text style={styles.videoMeta}>
                {item.maxDurationSeconds}s · {item.moderationStatus || 'posted'} · {item.likesCount} likes ·{' '}
                {item.commentsCount} comments
              </Text>
            </View>
            {item.url ? (
              <Pressable
                onPress={() => setPlayingId((id) => (id === item.id ? null : item.id))}
                style={styles.videoWrap}
              >
                <Video
                  source={{ uri: item.url }}
                  style={styles.video}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  shouldPlay={isFocused && playingId === item.id}
                />
                {playingId !== item.id ? (
                  <View style={styles.playHint}>
                    <Text style={styles.playHintText}>Tap to play</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
            {user?.uid ? (
              <FeedPostEngagement
                videoId={item.id}
                videoOwnerUid={item.ownerUid}
                shareTitle={`${item.username} on Leap`}
                shareUrl={item.url}
                viewerUid={user.uid}
                viewerUsername={user.username}
              />
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingTop: 10, flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(39, 174, 96, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(39, 174, 96, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 18, fontWeight: '900', color: colors.moss },
  name: { fontSize: 16, fontWeight: '900', color: colors.text },
  handle: { marginTop: 2, fontSize: 12, fontWeight: '700', color: colors.muted },
  bio: { marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  statNum: { fontSize: 20, fontWeight: '900', color: colors.text },
  statLabel: { marginTop: 6, fontSize: 12, fontWeight: '800', color: colors.muted, lineHeight: 16 },
  statSub: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.muted },
  statLink: { marginTop: 6, fontSize: 11, fontWeight: '900', color: colors.coral },
  statPressed: { opacity: 0.92 },
  list: { paddingTop: 10, paddingBottom: 80, gap: 8 },
  empty: { marginTop: 24, textAlign: 'center', color: colors.muted, fontWeight: '700' },
  videoRow: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    gap: 10,
  },
  videoPrompt: { fontSize: 14, fontWeight: '800', color: colors.text, lineHeight: 18 },
  videoMeta: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.muted },
  videoWrap: {
    marginTop: 4,
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  playHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playHintText: { color: colors.white, fontWeight: '900', fontSize: 13 },
});
