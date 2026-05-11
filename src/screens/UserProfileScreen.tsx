import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { MainStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useCanViewOtherUsersVideos } from '../state/posting';
import { FollowButton } from '../components/FollowButton';
import { UsernameLink } from '../components/UsernameLink';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { getOrCreateDm } from '../services/chat/chatFirestore';
import { subscribeFollowing, type FollowingRow } from '../services/social';
import { showError } from '../utils/ui';
import { verticalScoreToDisplayInches } from '../lib/verticalScore';

type Props = NativeStackScreenProps<MainStackParamList, 'UserProfile'>;

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

export function UserProfileScreen({ route, navigation }: Props) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { uid, username: usernameHint } = route.params;

  const [profile, setProfile] = React.useState<any>(null);
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [dmBusy, setDmBusy] = React.useState(false);
  const [followingRows, setFollowingRows] = React.useState<FollowingRow[]>([]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid) {
      setProfile(null);
      return;
    }
    const ref = doc(firestore(), 'users', uid);
    return onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null));
  }, [uid]);

  const profileUsername = profile?.username != null ? String(profile.username).trim() : '';
  React.useLayoutEffect(() => {
    const hint = usernameHint != null ? String(usernameHint).replace(/^@+/u, '').trim() : '';
    const title =
      profileUsername !== ''
        ? `@${profileUsername}`
        : hint !== ''
          ? `@${hint}`
          : 'Profile';
    navigation.setOptions({ title });
  }, [navigation, profileUsername, usernameHint]);

  const viewerUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
  const isSelf = Boolean(viewerUid && viewerUid === uid);
  const canViewOthersVideos = useCanViewOtherUsersVideos({
    uid: viewerUid || undefined,
    isAdmin: user?.isAdmin,
    isModerator: user?.isModerator,
  });
  const leapGateForOthers = !isSelf && !canViewOthersVideos;

  React.useEffect(() => {
    if (!isSelf || !user?.uid) {
      setFollowingRows([]);
      return;
    }
    return subscribeFollowing(user.uid, setFollowingRows);
  }, [isSelf, user?.uid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid) {
      setVideos([]);
      return;
    }
    const vUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
    const isViewerOwner = Boolean(vUid && vUid === uid);
    if (!isViewerOwner && !canViewOthersVideos) {
      setVideos([]);
      return;
    }
    const col = collection(firestore(), 'videos');
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
  }, [uid, user?.uid, usernameHint, profile?.username, canViewOthersVideos]);

  const username = String(profile?.username ?? usernameHint ?? 'user');
  const openDmWithUser = React.useCallback(async () => {
    if (!viewerUid || isSelf) return;
    setDmBusy(true);
    try {
      const id = await getOrCreateDm({
        currentUid: viewerUid,
        otherUid: uid,
        otherDisplayName: username,
      });
      nav.navigate('Tabs', {
        screen: 'Chat',
        params: {
          screen: 'Conversation',
          params: { conversationId: id, threadTitle: username },
        },
      });
    } catch (e) {
      showError('Could not open chat', e);
    } finally {
      setDmBusy(false);
    }
  }, [viewerUid, isSelf, uid, username, nav]);

  const openLeapsFeed = React.useCallback(() => {
    if (isSelf) {
      nav.navigate('MyLeaps');
      return;
    }
    if (leapGateForOthers) {
      nav.navigate('TakeTheLeapForLeaps', { uid, username: usernameHint ?? username });
      return;
    }
    nav.navigate('UserLeaps', { uid, username: usernameHint ?? username });
  }, [isSelf, nav, uid, usernameHint, username, leapGateForOthers]);

  const leapsStatNumber =
    leapGateForOthers && videos.length === 0 ? '—' : String(videos.length);

  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = String(
    profile?.photoUrl ?? profile?.photoURL ?? profile?.avatarUrl ?? ''
  ).trim();
  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

  const verticalScore = Math.round(Number(profile?.verticalScore ?? 0));
  const liveHeightIn = verticalScoreToDisplayInches(verticalScore);
  const highestJumpDisplayInches = Math.round(Number(profile?.highestJumpDisplayInches ?? 0));
  const bestVerticalGainPoints = Math.round(Number(profile?.bestVerticalGainPoints ?? 0));
  const bestVerticalGainPostId = String(profile?.bestVerticalGainPostId ?? '').trim();
  const canOpenBestLeap = Boolean(bestVerticalGainPostId);

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.card}>
          <View style={styles.avatar}>
            {photoUrl ? (
              <Image
                key={`profile-avatar-${uid}-${photoUrl}`}
                recyclingKey={`${uid}|${photoUrl}`}
                source={{ uri: photoUrl }}
                style={styles.avatarImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Text style={styles.avatarText}>{initials || 'U'}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{username}</Text>
            {isSelf ? (
              <Text style={styles.handle}>@{username}</Text>
            ) : (
              <UsernameLink uid={uid} username={username} style={styles.handle} />
            )}
            {bio ? <Text style={styles.bio}>{bio}</Text> : null}
          </View>
          {!isSelf && user?.uid ? (
            <View style={styles.profileActions}>
              <FollowButton
                viewerUid={user.uid}
                viewerUsername={user.username}
                targetUid={uid}
                targetUsername={username}
                targetPhotoUrl={photoUrl || null}
              />
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={() => void openDmWithUser()}
                disabled={dmBusy}
                accessibilityRole="button"
                accessibilityLabel="Message"
              >
                {dmBusy ? (
                  <ActivityIndicator size="small" color={colors.moss} />
                ) : (
                  <Text style={styles.messageBtnTxt}>Message</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>
              {liveHeightIn}
              <Text style={styles.statInSuffix}> in</Text>
            </Text>
            <Text style={styles.statLabel}>Live vertical</Text>
          </View>
          <Pressable
            disabled={!canOpenBestLeap}
            onPress={() => {
              if (!canOpenBestLeap) return;
              nav.navigate('VideoPost', { videoId: bestVerticalGainPostId });
            }}
            style={({ pressed }) => [styles.stat, canOpenBestLeap && pressed && styles.statPressed]}
            accessibilityRole={canOpenBestLeap ? 'button' : undefined}
            accessibilityLabel={canOpenBestLeap ? 'Watch their best leap' : undefined}
          >
            <Text style={styles.statNum}>{highestJumpDisplayInches} in</Text>
            <Text style={styles.statLabel}>Highest leap</Text>
            {bestVerticalGainPoints > 0 ? (
              <Text style={styles.statSub}>{isSelf ? 'Your highest ever leap' : 'Highest leap on the board'}</Text>
            ) : null}
            {canOpenBestLeap ? <Text style={styles.statLink}>Tap to watch leap</Text> : null}
          </Pressable>
        </View>

        <View style={styles.followingSection}>
          <Text style={styles.followingTitle}>FOLLOWING</Text>
          {isSelf ? (
            <>
              <Text style={styles.followingHint}>
                People you follow. Follower counts are not shown on Leap.
              </Text>
              {followingRows.length === 0 ? (
                <Text style={styles.followingEmpty}>Follow people from the Feed.</Text>
              ) : (
                <TouchableOpacity
                  style={styles.followingListCta}
                  onPress={() => nav.navigate('FollowingList')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Open following list"
                >
                  <Text style={styles.followingListCtaText}>
                    {followingRows.length} {followingRows.length === 1 ? 'person' : 'people'} you follow
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.coral} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.followingHint}>
              Who someone follows isn&apos;t listed on Leap — following lists are private.
            </Text>
          )}
        </View>

        <View style={styles.leapsSection}>
          <Text style={styles.leapsTitle}>{isSelf ? 'YOUR LEAPS' : `LEAPS · @${username}`}</Text>
          <Text style={styles.leapsHint}>
            {isSelf
              ? 'Full-screen reel of your posts (same look as the main feed).'
              : leapGateForOthers
                ? `Post your leap for today to unlock @${username}'s reel.`
                : `Full-screen reel of @${username}'s approved posts.`}
          </Text>
          <Pressable
            onPress={() => openLeapsFeed()}
            style={({ pressed }) => [styles.leapsStatCard, pressed && styles.statPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              isSelf ? 'Open your leaps' : leapGateForOthers ? 'Take the leap to view their reel' : `Open @${username} leaps feed`
            }
          >
            <Text style={styles.statNum}>{leapsStatNumber}</Text>
            <Text style={styles.statLabel}>Leaps</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingTop: 6, flex: 1 },
  scrollContent: { paddingBottom: 32, gap: 10 },
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
  profileActions: { alignItems: 'flex-end', gap: 8 },
  messageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.moss,
    backgroundColor: 'rgba(39, 174, 96, 0.08)',
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnTxt: { fontSize: 13, fontWeight: '800', color: colors.moss },
  bio: { marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  statNum: { fontSize: 20, fontWeight: '900', color: colors.text },
  statInSuffix: { fontSize: 13, fontWeight: '800', color: colors.muted },
  statLabel: { marginTop: 6, fontSize: 12, fontWeight: '800', color: colors.muted, lineHeight: 16 },
  statSub: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.muted },
  statLink: { marginTop: 6, fontSize: 11, fontWeight: '900', color: colors.coral },
  statPressed: { opacity: 0.92 },
  followingSection: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 12,
    gap: 6,
  },
  followingTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  followingHint: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '600' },
  followingEmpty: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  leapsSection: { marginTop: 10, gap: 10 },
  leapsTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  leapsHint: { fontSize: 13, lineHeight: 19, color: colors.muted, fontWeight: '600' },
  leapsStatCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'flex-start',
  },
  followingListCta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  followingListCtaText: { fontSize: 15, fontWeight: '900', color: colors.text, flex: 1 },
});
