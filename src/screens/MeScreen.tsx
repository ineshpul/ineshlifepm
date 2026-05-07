import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { showError } from '../utils/ui';
import { markAllNotificationsRead, subscribeFollowing, type FollowingRow } from '../services/social';
import { setAppBadgeCount } from '../services/pushNotifications';
import { verticalScoreTier } from '../lib/verticalScore';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';
import { saveUserPublicProfile } from '../services/userProfile';
import type { VerticalScoreBreakdownFirestore } from '../types/verticalScore';
import { computeFeedViewingFromNow, normalizeNyDateKey, prevNyDateKey } from '../utils/nyTime';

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={scoreBarStyles.row}>
      <Text style={scoreBarStyles.label}>{label}</Text>
      <View style={scoreBarStyles.track}>
        <View style={[scoreBarStyles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const scoreBarStyles = StyleSheet.create({
  row: { marginTop: 10, gap: 4 },
  label: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.6 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.moss,
  },
});

type MyVideo = {
  id: string;
  challengeDate: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  moderationStatus: string;
  likesCount: number;
  commentsCount: number;
};

export function MeScreen() {
  const nav = useNavigation<any>();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = React.useState<any>(null);
  const [myVideos, setMyVideos] = React.useState<MyVideo[]>([]);
  const [following, setFollowing] = React.useState<FollowingRow[]>([]);
  const [editProfileOpen, setEditProfileOpen] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [draftUsername, setDraftUsername] = React.useState('');
  const [draftBio, setDraftBio] = React.useState('');
  const [draftPhotoUri, setDraftPhotoUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    const ref = doc(firestore(), 'users', user.uid);
    return onSnapshot(ref, (snap) => setProfile(snap.exists() ? snap.data() : null));
  }, [user?.uid]);

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowing);
  }, [user?.uid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setMyVideos([]);
      return;
    }
    const q = query(collection(firestore(), 'videos'), where('uid', '==', user.uid), limit(120));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data: any = d.data();
            const createdAtMs =
              typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            return {
              id: d.id,
              challengeDate: String(data?.challengeDate ?? ''),
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              createdAtMs,
              moderationStatus: String(data?.moderationStatus ?? ''),
              likesCount: Number(data?.likesCount ?? 0),
              commentsCount: Number(data?.commentsCount ?? 0),
            } satisfies MyVideo;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 50);
        setMyVideos(rows);
      },
      () => setMyVideos([])
    );
  }, [user?.uid]);

  const username = String(profile?.username ?? user?.username ?? 'user');
  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = String(profile?.photoUrl ?? '').trim();
  const schoolRaw =
    profile?.school != null && String(profile.school).trim() !== '' ? String(profile.school).trim() : '';
  const highestJumpDisplayInches = Math.round(
    Number(profile?.highestJumpDisplayInches ?? 0)
  );
  const bestVerticalGainPoints = Math.round(Number(profile?.bestVerticalGainPoints ?? 0));
  const bestVerticalGainPostId = String(profile?.bestVerticalGainPostId ?? '').trim();
  const canOpenBestLeap = Boolean(bestVerticalGainPostId);
  const challengesCompleted = Number(profile?.challengesCompleted ?? 0);
  const likesReceivedStored = Number(profile?.likesReceived ?? 0);
  const streakDaysStored = Number(profile?.streakDays ?? 0);

  const { viewingChallengeDateKey } = React.useMemo(() => computeFeedViewingFromNow(Date.now()), []);

  const likesReceivedDerived = React.useMemo(() => {
    // `videos.likesCount` is maintained by Cloud Functions; summing here keeps the profile UI correct
    // even if we haven't backfilled user-level aggregates.
    return myVideos.reduce((sum, v) => sum + (Number.isFinite(v.likesCount) ? v.likesCount : 0), 0);
  }, [myVideos]);

  const streakDaysDerived = React.useMemo(() => {
    if (myVideos.length === 0) return 0;
    const postedKeys = new Set<string>();
    for (const v of myVideos) {
      const k = normalizeNyDateKey(v.challengeDate, viewingChallengeDateKey);
      if (k) postedKeys.add(k);
    }
    // If user hasn't posted for the active noon→noon cycle yet, show streak through yesterday (T−1),
    // since the user can still post today without losing streak until noon.
    let cursor = postedKeys.has(viewingChallengeDateKey)
      ? viewingChallengeDateKey
      : prevNyDateKey(viewingChallengeDateKey);
    let count = 0;
    for (let i = 0; i < 500; i++) {
      if (!postedKeys.has(cursor)) break;
      count += 1;
      cursor = prevNyDateKey(cursor);
    }
    return count;
  }, [myVideos, viewingChallengeDateKey]);

  const likesReceived = likesReceivedDerived > 0 ? likesReceivedDerived : likesReceivedStored;
  const streakDays = streakDaysDerived > 0 ? streakDaysDerived : streakDaysStored;

  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

  const verticalScore = Math.round(Number(profile?.verticalScore ?? 0));
  const breakdown: VerticalScoreBreakdownFirestore =
    profile?.verticalScoreBreakdown != null && typeof profile.verticalScoreBreakdown === 'object'
      ? (profile.verticalScoreBreakdown as VerticalScoreBreakdownFirestore)
      : { consistency: 0, engagement: 0, reliability: 0, bonus: 0 };
  const tier = verticalScoreTier(verticalScore);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid) return;
      void recomputeVerticalScoreForUser(user.uid);
    }, [user?.uid])
  );

  const openEditProfile = () => {
    setDraftUsername(username);
    setDraftBio(String(profile?.bio ?? ''));
    setDraftPhotoUri(photoUrl || null);
    setEditProfileOpen(true);
  };

  const pickEditPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError('Permission needed', new Error('Photo library access is required.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (uri) setDraftPhotoUri(uri);
  };

  const saveEditProfile = async () => {
    if (!user?.uid || !isFirebaseConfigured()) return;
    setEditSaving(true);
    try {
      const uri = draftPhotoUri?.trim() ?? '';
      const newPhotoLocal =
        uri && (uri.startsWith('file:') || uri.startsWith('content:') || uri.startsWith('ph://'))
          ? uri
          : undefined;
      const { photoUrl: uploaded } = await saveUserPublicProfile({
        uid: user.uid,
        username: draftUsername,
        bio: draftBio,
        newPhotoLocalUri: newPhotoLocal,
      });
      if (uploaded) setDraftPhotoUri(uploaded);
      setEditProfileOpen(false);
    } catch (e) {
      showError('Could not save profile', e);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Brandmark size={36} />
            <View style={styles.brandTextCol}>
              <Text style={styles.headerTagline} numberOfLines={2}>
                Leap
              </Text>
              <Text style={styles.sub}>PROFILE</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                if (user?.uid) {
                  void markAllNotificationsRead(user.uid).then(() => void setAppBadgeCount(0));
                }
                nav.navigate('Notifications');
              }}
              style={styles.iconBtn}
            >
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut}>
              <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initials || 'U'}</Text>
            )}
          </View>
          <Text style={styles.name}>{username}</Text>
          <Text style={styles.handle}>@{username}</Text>
          {bio ? <Text style={styles.profileBio}>{bio}</Text> : null}
          {schoolRaw ? (
            <View style={styles.schoolPill}>
              <Text style={styles.schoolText}>{schoolRaw}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.editProfileBtn} onPress={openEditProfile} activeOpacity={0.75}>
            <Text style={styles.editProfileBtnText}>Edit profile</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.coral} />
          </TouchableOpacity>
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreTitle}>VERTICAL SCORE</Text>
            <View style={styles.tierPill}>
              <Text style={styles.tierPillText}>{tier.label}</Text>
            </View>
          </View>
          <Text style={styles.scoreNumber}>{verticalScore}</Text>
          <Text style={styles.scoreTierHint}>{tier.hint}</Text>
          <Text style={styles.scoreFoot}>
            Rolling 14 days · recency-weighted · not editable
          </Text>
          <View style={styles.breakdownBlock}>
            <ScoreBar label="Consistency" value={breakdown.consistency} />
            <ScoreBar label="Engagement" value={breakdown.engagement} />
            <ScoreBar label="Bonus" value={breakdown.bonus} />
          </View>
        </View>

        <Pressable
          disabled={!canOpenBestLeap}
          onPress={() => {
            if (canOpenBestLeap) nav.navigate('VideoPost', { videoId: bestVerticalGainPostId });
          }}
          style={({ pressed }) => [
            styles.jumpCard,
            canOpenBestLeap && (pressed ? styles.jumpCardPressed : styles.jumpCardTappable),
          ]}
          accessibilityRole={canOpenBestLeap ? 'button' : undefined}
          accessibilityLabel={canOpenBestLeap ? 'Watch the leap for Highest Leap' : undefined}
        >
          <View style={styles.jumpHeader}>
            <Text style={styles.jumpLabel}>HIGHEST LEAP</Text>
            <View style={styles.inPill}>
              <View style={styles.redDot} />
              <Text style={styles.inText}>IN</Text>
            </View>
          </View>
          <Text style={styles.jumpHeight}>{highestJumpDisplayInches} in</Text>
          <View style={styles.jumpBody}>
            <View style={styles.jumpBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.jumpTitle}>
                {bestVerticalGainPoints > 0
                  ? `+${bestVerticalGainPoints} pts from one leap`
                  : 'Post leaps to build impact'}
              </Text>
            </View>
          </View>
          {canOpenBestLeap ? (
            <View style={styles.jumpWatchRow}>
              <Text style={styles.jumpWatchText}>Watch this leap</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.coral} />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{challengesCompleted}</Text>
            <Text style={styles.statLabel}>CHALLENGES{'\n'}COMPLETED</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{streakDays}</Text>
            <Text style={styles.statLabel}>DAY{'\n'}STREAK</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{likesReceived}</Text>
            <Text style={styles.statLabel}>LIKES{'\n'}RECEIVED</Text>
          </View>
        </View>

        <View style={styles.followingSection}>
          <Text style={styles.followingTitle}>FOLLOWING</Text>
          <Text style={styles.followingHint}>
            People you follow. Follower counts are not shown on Leap.
          </Text>
          {following.length === 0 ? (
            <Text style={styles.followingEmpty}>Follow people from the Feed.</Text>
          ) : (
            <TouchableOpacity
              style={styles.openLeapsCta}
              onPress={() => nav.navigate('FollowingList')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open following list"
            >
              <Text style={styles.openLeapsCtaText}>
                {following.length} {following.length === 1 ? 'person' : 'people'} you follow
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.coral} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.leapsSection}>
          <Text style={styles.leapsTitle}>YOUR LEAPS</Text>
          <Text style={styles.leapsHint}>
            Full-screen reel of your posts (same look as the main feed). Other people see theirs on their
            profile.
          </Text>
          <TouchableOpacity
            style={styles.openLeapsCta}
            onPress={() => nav.navigate('MyLeaps')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open your leaps feed"
          >
            <Text style={styles.openLeapsCtaText}>
              {myVideos.length > 0 ? `Open feed · ${myVideos.length} leap${myVideos.length === 1 ? '' : 's'}` : 'Open your leaps'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.coral} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={editProfileOpen} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => !editSaving && setEditProfileOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit profile</Text>
            <TouchableOpacity style={styles.modalPhotoRow} onPress={() => void pickEditPhoto()}>
              <View style={styles.modalAvatar}>
                {draftPhotoUri ? (
                  <Image source={{ uri: draftPhotoUri }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={32} color={colors.muted} />
                )}
              </View>
              <Text style={styles.modalPhotoHint}>Tap to change photo</Text>
            </TouchableOpacity>
            <Text style={styles.modalFieldLabel}>Username</Text>
            <TextInput
              value={draftUsername}
              onChangeText={setDraftUsername}
              placeholder="Username"
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
            />
            <Text style={styles.modalFieldLabel}>Bio</Text>
            <TextInput
              value={draftBio}
              onChangeText={setDraftBio}
              placeholder="Short bio"
              placeholderTextColor={colors.muted2}
              multiline
              style={[styles.modalInput, styles.modalBioInput]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => !editSaving && setEditProfileOpen(false)}
                disabled={editSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={() => void saveEditProfile()}
                disabled={editSaving}
              >
                {editSaving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18, flex: 1 },
  scroll: { paddingBottom: 28 },
  headerRow: {
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 },
  brandTextCol: { flex: 1, minWidth: 0, paddingTop: 2 },
  headerTagline: {
    marginTop: 0,
    fontSize: 20,
    letterSpacing: -0.4,
    fontWeight: '900',
    color: colors.text,
  },
  sub: {
    marginTop: 4,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: '900',
    color: colors.muted,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: { color: colors.muted, fontWeight: '800' },
  card: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 22, fontWeight: '900', color: colors.text },
  name: { fontSize: 18, fontWeight: '900', color: colors.text },
  handle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: -2 },
  profileBio: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  editProfileBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 84, 0.35)',
    backgroundColor: colors.white,
  },
  editProfileBtnText: { fontSize: 14, fontWeight: '900', color: colors.coral },
  schoolPill: {
    marginTop: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolText: { fontSize: 12, fontWeight: '800', color: colors.muted },
  scoreCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 18,
    gap: 6,
  },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  tierPill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierPillText: { fontSize: 11, fontWeight: '900', color: colors.text },
  scoreNumber: { fontSize: 44, fontWeight: '900', color: colors.text, marginTop: 4 },
  scoreTierHint: { fontSize: 13, fontWeight: '700', color: colors.muted, lineHeight: 18 },
  scoreFoot: { marginTop: 4, fontSize: 11, fontWeight: '600', color: colors.muted2, lineHeight: 16 },
  breakdownBlock: { marginTop: 8, paddingTop: 4 },
  jumpCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 18,
    gap: 10,
  },
  jumpCardTappable: { borderColor: 'rgba(255, 107, 84, 0.35)' },
  jumpCardPressed: { opacity: 0.92 },
  jumpWatchRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  jumpWatchText: { fontSize: 13, fontWeight: '900', color: colors.coral },
  jumpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jumpLabel: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  inPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  inText: { fontSize: 11, fontWeight: '900', color: colors.text },
  jumpHeight: { fontSize: 40, fontWeight: '900', color: colors.text, marginTop: -4 },
  jumpBody: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  jumpBar: { width: 6, height: 56, borderRadius: 3, backgroundColor: '#D1FAE5' },
  jumpTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  statNum: { fontSize: 20, fontWeight: '900', color: colors.text },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '900',
    color: colors.muted,
    textAlign: 'center',
  },
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 28,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  modalAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPhotoHint: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.muted },
  modalFieldLabel: { marginTop: 6, fontSize: 11, fontWeight: '900', color: colors.muted, letterSpacing: 1 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  modalBioInput: { minHeight: 88, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '800', color: colors.text },
  modalSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { fontSize: 15, fontWeight: '900', color: colors.white },
  leapsSection: { marginTop: 20, gap: 10 },
  leapsTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  leapsHint: { fontSize: 13, lineHeight: 19, color: colors.muted, fontWeight: '600' },
  openLeapsCta: {
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
  openLeapsCtaText: { fontSize: 15, fontWeight: '900', color: colors.text, flex: 1 },
});
