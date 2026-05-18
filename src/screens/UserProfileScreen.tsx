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
import { profileScreenStyles as ps } from '../styles/profileScreenStyles';

type Props = NativeStackScreenProps<MainStackParamList, 'UserProfile'>;

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
};

export function UserProfileScreen({ route, navigation }: Props) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const { uid, username: usernameHint } = route.params;

  const [profile, setProfile] = React.useState<any>(null);
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [dmBusy, setDmBusy] = React.useState(false);
  const [theirFollowing, setTheirFollowing] = React.useState<FollowingRow[]>([]);
  const [highestLeapOpen, setHighestLeapOpen] = React.useState(false);

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
  const followingVisible = showFollowingListToOthers(profile as Record<string, unknown> | undefined);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid || isSelf || !followingVisible) {
      setTheirFollowing([]);
      return;
    }
    return subscribeFollowing(uid, setTheirFollowing);
  }, [uid, isSelf, followingVisible]);

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
            const leapInches = Number(data?.leapInches ?? data?.leapInchesAwarded ?? 0);
            return {
              id: d.id,
              challengeDate: String(data?.challengeDate ?? ''),
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              createdAtMs,
              moderationStatus: String(data?.moderationStatus ?? ''),
              leapInches: Number.isFinite(leapInches) ? leapInches : 0,
              maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
              likesCount: Number(data?.likesCount ?? 0),
              commentsCount: Number(data?.commentsCount ?? 0),
              ownerUid: String(data?.uid ?? uid),
              username: String(data?.username ?? usernameHint ?? profile?.username ?? 'user'),
            } satisfies ProfileVideo;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setVideos(rows);
      },
      () => setVideos([])
    );
  }, [uid, user?.uid, usernameHint, profile?.username, canViewOthersVideos]);

  const username = String(profile?.username ?? usernameHint ?? 'user');
  const stats = useProfileStats(profile as Record<string, unknown> | undefined, videos);

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

  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = String(
    profile?.photoUrl ?? profile?.photoURL ?? profile?.avatarUrl ?? ''
  ).trim();
  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

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
            {photoUrl ? (
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
          <Text style={ps.name}>{username}</Text>
          {isSelf ? (
            <Text style={ps.handle}>@{username}</Text>
          ) : (
            <UsernameLink uid={uid} username={username} style={ps.handle} />
          )}
          {bio ? <Text style={ps.profileBio}>{bio}</Text> : null}
          {!isSelf && user?.uid ? (
            <View style={ps.profileActionsRow}>
              <FollowButton
                viewerUid={user.uid}
                viewerUsername={user.username}
                targetUid={uid}
                targetUsername={username}
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

        {!isSelf && followingVisible && theirFollowing.length > 0 ? (
          <TouchableOpacity
            style={ps.openLeapsCta}
            onPress={() => nav.navigate('FollowingList', { uid, username })}
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
});
