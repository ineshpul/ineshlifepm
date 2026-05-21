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
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { HighestLeapSheet } from '../components/profile/HighestLeapSheet';
import { useProfileStats } from '../components/profile/useProfileStats';
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
import { formatLeapGainTodayBanner, formatLeapInchesDisplay } from '../lib/verticalScore';
import { showFollowingListToOthers } from '../lib/profileVisibility';
import {
  normalizeUsernameHint,
  photoUrlFromRecord,
  resolveProfileIdentity,
  usernameFromRecord,
} from '../lib/resolveProfileIdentity';
import { profileScreenStyles as ps } from '../styles/profileScreenStyles';

type Props = NativeStackScreenProps<MainStackParamList, 'UserProfile'>;

type ProfileFetchStatus = 'loading' | 'ready' | 'error';

type ProfileVideo = {
  id: string;
  challengeDate: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  moderationStatus: string;
  leapInches: number;
  maxDurationSeconds: number;
  likesCount: number;
  commentsCount: number;
  ownerUid: string;
  username: string;
  photoUrl: string;
};

function logUserProfileFetch(
  label: string,
  uid: string,
  snap: DocumentSnapshot | null,
  err?: unknown
) {
  if (!__DEV__) return;
  const exists = snap?.exists() ?? false;
  const data = exists && snap ? (snap.data() as Record<string, unknown>) : null;
  console.log('[UserProfile] profile fetch', {
    label,
    uid,
    exists,
    username: data?.username,
    photoUrl: data?.photoUrl ?? data?.photoURL ?? data?.avatarUrl,
    err: err != null ? String(err) : undefined,
  });
}

export function UserProfileScreen({ route, navigation }: Props) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { uid, username: usernameHint } = route.params;
  const hintUsername = normalizeUsernameHint(usernameHint);

  const [profile, setProfile] = React.useState<Record<string, unknown> | null>(null);
  const [profileStatus, setProfileStatus] = React.useState<ProfileFetchStatus>('loading');
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [videosHydrated, setVideosHydrated] = React.useState(false);
  const [dmBusy, setDmBusy] = React.useState(false);
  const [theirFollowing, setTheirFollowing] = React.useState<FollowingRow[]>([]);
  const [highestLeapOpen, setHighestLeapOpen] = React.useState(false);
  const profileRetryDoneRef = React.useRef(false);

  React.useEffect(() => {
    profileRetryDoneRef.current = false;
    if (!isFirebaseConfigured() || !uid) {
      setProfile(null);
      setProfileStatus('ready');
      return;
    }

    setProfile(null);
    setProfileStatus('loading');
    const ref = doc(firestore(), 'users', uid);

    const finishReady = (snap: DocumentSnapshot, label: string) => {
      logUserProfileFetch(label, uid, snap);
      setProfile(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
      setProfileStatus('ready');
    };

    const retryFetch = (reason: string) => {
      if (profileRetryDoneRef.current) {
        setProfileStatus('error');
        return;
      }
      profileRetryDoneRef.current = true;
      void getDoc(ref)
        .then((retrySnap) => finishReady(retrySnap, `retry-getDoc:${reason}`))
        .catch((e) => {
          logUserProfileFetch(`retry-getDoc-error:${reason}`, uid, null, e);
          setProfileStatus('error');
        });
    };

    const handleSnapshot = (snap: DocumentSnapshot, label: string) => {
      const exists = snap.exists();
      const data = exists ? (snap.data() as Record<string, unknown>) : null;
      const username = usernameFromRecord(data);
      const photoUrl = photoUrlFromRecord(data);
      const emptyIdentity = !exists || (username === '' && photoUrl === '');

      setProfile(data);
      if (emptyIdentity && !profileRetryDoneRef.current) {
        retryFetch(label);
        return;
      }
      setProfileStatus('ready');
      logUserProfileFetch(label, uid, snap);
    };

    return onSnapshot(
      ref,
      (snap) => handleSnapshot(snap, 'onSnapshot'),
      (err) => {
        logUserProfileFetch('onSnapshot-error', uid, null, err);
        retryFetch('onSnapshot-error');
      }
    );
  }, [uid]);

  const newestVideo = videos[0];
  const identity = React.useMemo(
    () =>
      resolveProfileIdentity({
        profile,
        usernameHint: hintUsername || undefined,
        videoFallback: newestVideo
          ? { username: newestVideo.username, photoUrl: newestVideo.photoUrl }
          : null,
      }),
    [profile, hintUsername, newestVideo]
  );

  const profileUsername = identity.username;
  React.useLayoutEffect(() => {
    const title = profileUsername !== '' ? `@${profileUsername}` : hintUsername !== '' ? `@${hintUsername}` : 'Profile';
    navigation.setOptions({ title });
  }, [navigation, profileUsername, hintUsername]);

  const viewerUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
  const isSelf = Boolean(viewerUid && viewerUid === uid);
  const canViewOthersVideos = useCanViewOtherUsersVideos({
    uid: viewerUid || undefined,
    isAdmin: user?.isAdmin,
    isModerator: user?.isModerator,
  });
  const leapGateForOthers = !isSelf && !canViewOthersVideos;
  const followingVisible = showFollowingListToOthers(profile ?? undefined);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid || isSelf || !followingVisible) {
      setTheirFollowing([]);
      return;
    }
    return subscribeFollowing(uid, setTheirFollowing);
  }, [uid, isSelf, followingVisible]);

  React.useEffect(() => {
    setVideosHydrated(false);
    if (!isFirebaseConfigured() || !uid) {
      setVideos([]);
      setVideosHydrated(true);
      return;
    }
    const vUid = user?.uid ?? firebaseAuth().currentUser?.uid ?? '';
    const isViewerOwner = Boolean(vUid && vUid === uid);
    if (!isViewerOwner && !canViewOthersVideos) {
      setVideos([]);
      setVideosHydrated(true);
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
          .filter((d) => !Boolean((d.data() as Record<string, unknown>)?.deleted))
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            const createdAtMs =
              typeof (data.createdAt as { toMillis?: () => number })?.toMillis === 'function'
                ? (data.createdAt as { toMillis: () => number }).toMillis()
                : 0;
            const leapInches = Number(data.leapInches ?? data.leapInchesAwarded ?? 0);
            const videoUsername = String(data.username ?? '').trim();
            return {
              id: d.id,
              challengeDate: String(data.challengeDate ?? ''),
              prompt: String(data.prompt ?? data.challengeTitle ?? ''),
              url: String(data.url ?? ''),
              createdAtMs,
              moderationStatus: String(data.moderationStatus ?? ''),
              leapInches: Number.isFinite(leapInches) ? leapInches : 0,
              maxDurationSeconds: normalizeTaskDurationSeconds(data.maxDurationSeconds),
              likesCount: Number(data.likesCount ?? 0),
              commentsCount: Number(data.commentsCount ?? 0),
              ownerUid: String(data.uid ?? uid),
              username: videoUsername,
              photoUrl: photoUrlFromRecord(data),
            } satisfies ProfileVideo;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setVideos(rows);
        setVideosHydrated(true);
      },
      () => {
        setVideos([]);
        setVideosHydrated(true);
      }
    );
  }, [uid, user?.uid, canViewOthersVideos]);

  const stats = useProfileStats(profile ?? undefined, videos);

  const identityPending =
    profileStatus === 'loading' ||
    (profileStatus === 'ready' &&
      profileUsername === '' &&
      hintUsername === '' &&
      !videosHydrated);

  const identityUnavailable = profileStatus === 'error' && profileUsername === '' && hintUsername === '';

  const openDmWithUser = React.useCallback(async () => {
    if (!viewerUid || isSelf || !profileUsername) return;
    setDmBusy(true);
    try {
      const id = await getOrCreateDm({
        currentUid: viewerUid,
        otherUid: uid,
        otherDisplayName: profileUsername,
      });
      nav.navigate('Tabs', {
        screen: 'Chat',
        params: {
          screen: 'Conversation',
          params: { conversationId: id, threadTitle: profileUsername },
        },
      });
    } catch (e) {
      showError('Could not open chat', e);
    } finally {
      setDmBusy(false);
    }
  }, [viewerUid, isSelf, uid, profileUsername, nav]);

  const openLeapsFeed = React.useCallback(() => {
    if (isSelf) {
      nav.navigate('MyLeaps');
      return;
    }
    const leapUsername = profileUsername || hintUsername;
    if (leapGateForOthers) {
      nav.navigate('TakeTheLeapForLeaps', { uid, username: leapUsername || undefined });
      return;
    }
    nav.navigate('UserLeaps', { uid, username: leapUsername || undefined });
  }, [isSelf, nav, uid, hintUsername, profileUsername, leapGateForOthers]);

  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = identity.photoUrl;
  const initials =
    (profileUsername.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? hintUsername[0] ?? 'U').toUpperCase() +
    (profileUsername.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

  const leapsCtaLabel =
    videos.length > 0
      ? `Open feed · ${videos.length} leap${videos.length === 1 ? '' : 's'}`
      : leapGateForOthers
        ? 'Take the leap to view their feed'
        : 'Open feed';

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ps.scroll}
      >
        <View style={ps.card}>
          <View style={ps.avatar}>
            {identityPending ? (
              <ActivityIndicator size="large" color={colors.moss} />
            ) : photoUrl ? (
              <Image
                key={`profile-avatar-${uid}-${photoUrl}`}
                recyclingKey={`${uid}|${photoUrl}`}
                source={{ uri: photoUrl }}
                style={ps.avatarImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <Text style={ps.avatarText}>{initials || 'U'}</Text>
            )}
          </View>
          {identityPending ? (
            <ActivityIndicator style={styles.nameLoader} size="small" color={colors.moss} />
          ) : identityUnavailable ? (
            <Text style={ps.name}>Profile</Text>
          ) : profileUsername ? (
            <>
              <Text style={ps.name}>{profileUsername}</Text>
              {isSelf ? (
                <Text style={ps.handle}>@{profileUsername}</Text>
              ) : (
                <UsernameLink uid={uid} username={profileUsername} style={ps.handle} />
              )}
            </>
          ) : null}
          {bio ? <Text style={ps.profileBio}>{bio}</Text> : null}
          {!isSelf && user?.uid && profileUsername ? (
            <View style={ps.profileActionsRow}>
              <FollowButton
                viewerUid={user.uid}
                viewerUsername={user.username}
                targetUid={uid}
                targetUsername={profileUsername}
                targetPhotoUrl={photoUrl || null}
              />
              <TouchableOpacity
                style={ps.messageBtn}
                onPress={() => void openDmWithUser()}
                disabled={dmBusy}
                accessibilityRole="button"
                accessibilityLabel="Message"
              >
                {dmBusy ? (
                  <ActivityIndicator size="small" color={colors.moss} />
                ) : (
                  <Text style={ps.messageBtnTxt}>Message</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={ps.scoreCard}>
          <Text style={ps.scoreTitle}>ALL-TIME VERTICAL</Text>
          <Text style={ps.scoreNumber}>{formatLeapInchesDisplay(stats.allTimeIn)}</Text>
          <Text style={ps.scoreTierHint}>All-time distance travelled from leaping</Text>
        </View>

        <View style={ps.statsRow}>
          <Pressable
            style={({ pressed }) => [ps.stat, ps.statTappable, pressed && ps.statPressed]}
            onPress={() => setHighestLeapOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View highest leap"
          >
            <Text style={ps.statNum}>{formatLeapInchesDisplay(stats.highestDayIn)}</Text>
            <Text style={ps.statLabel}>HIGHEST{'\n'}LEAP</Text>
          </Pressable>
          <View style={ps.stat}>
            <Text style={ps.statNum}>{formatLeapInchesDisplay(stats.weeklyLeapIn)}</Text>
            <Text style={ps.statLabel}>WEEKLY{'\n'}TOTAL</Text>
          </View>
          <View style={ps.stat}>
            <Text style={ps.statNum}>{stats.streakDays}</Text>
            <Text style={ps.statLabel}>DAY{'\n'}STREAK</Text>
          </View>
        </View>

        {stats.hasPostedTodayLeap ? (
          <View style={ps.dailyBanner}>
            <Text style={ps.dailyBannerText}>{formatLeapGainTodayBanner(stats.dailyLeapIn)}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={ps.openLeapsCta}
          onPress={() => openLeapsFeed()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={leapsCtaLabel}
        >
          <Text style={ps.openLeapsCtaText}>{leapsCtaLabel}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.coral} />
        </TouchableOpacity>

        {!isSelf && followingVisible && theirFollowing.length > 0 && profileUsername ? (
          <TouchableOpacity
            style={ps.openLeapsCta}
            onPress={() => nav.navigate('FollowingList', { uid, username: profileUsername })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open following list"
          >
            <Text style={ps.openLeapsCtaText}>
              {theirFollowing.length} {theirFollowing.length === 1 ? 'person' : 'people'} they follow
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.coral} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <HighestLeapSheet
        visible={highestLeapOpen}
        onClose={() => setHighestLeapOpen(false)}
        postId={stats.bestPostId}
        fallbackInches={stats.highestDayIn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingTop: 6, flex: 1 },
  nameLoader: { marginTop: 8, marginBottom: 4 },
});
