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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

import { Screen } from '../components/Screen';
import { useAuth } from '../state/auth';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { userVideosQuery } from '../lib/userVideosQuery';
import { showError } from '../utils/ui';
import { markAllNotificationsRead, subscribeFollowing, type FollowingRow } from '../services/social';
import { setAppBadgeCount } from '../services/pushNotifications';
import { formatLeapGainTodayBanner, formatLeapInchesDisplay } from '../lib/verticalScore';
import { useProfileStats } from '../components/profile/useProfileStats';
import { ProfileLeapsGrid } from '../components/profile/ProfileLeapsGrid';
import { HighestLeapSheet } from '../components/profile/HighestLeapSheet';
import { ProfileBpotdCalendar } from '../components/profile/ProfileBpotdCalendar';
import { ProfileWeeklyRecapRail } from '../components/profile/ProfileWeeklyRecapRail';
import { saveUserPublicProfile } from '../services/userProfile';
import { subscribeMyBestParts } from '../services/bestPartPosts';
import { navigateToBestPartInFeed } from '../navigation/navigationHelpers';
import type { BestPartPost } from '../types/bestPart';
import { UsernameTakenError } from '../services/usernameClaim';
import { useChallengeWindow } from '../state/challenge';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';

type MyVideo = {
  id: string;
  challengeDate: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  moderationStatus: string;
  leapInches: number;
  likesCount: number;
  commentsCount: number;
  posterUrl?: string;
};

export function MeScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: { paddingHorizontal: 22, flex: 1 },
  scroll: { paddingBottom: 28 },
  headerRow: {
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  brandTextCol: { flex: 1, minWidth: 0 },
  headerTagline: {
    fontFamily: typography.displayExtraBold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.9,
    color: colors.text,
  },
  sub: {
    marginTop: 2,
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    color: colors.muted2,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: { fontFamily: typography.bodyBold, color: colors.muted, fontSize: 12 },
  card: {
    marginTop: 18,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border2,
    padding: 16,
    alignItems: 'flex-start',
  },
  identityRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityText: { flex: 1, minWidth: 0 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontFamily: typography.displayExtraBold, fontSize: 24, color: colors.text },
  name: {
    fontFamily: typography.displayExtraBold,
    fontSize: 26,
    lineHeight: 29,
    letterSpacing: -0.8,
    color: colors.text,
  },
  handle: { fontFamily: typography.bodySemiBold, fontSize: 13, color: colors.muted2, marginTop: 2 },
  profileBio: {
    marginTop: 14,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  editProfileBtn: {
    width: '100%',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    backgroundColor: colors.inputBg,
  },
  editProfileBtnText: { fontFamily: typography.bodyBold, fontSize: 14, color: colors.text },
  schoolPill: {
    marginTop: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolText: { fontFamily: typography.bodySemiBold, fontSize: 12, color: colors.muted },
  scoreCard: {
    marginTop: 14,
    borderRadius: 24,
    backgroundColor: colors.cardTint,
    padding: 20,
    gap: 6,
  },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreTitle: {
    fontFamily: typography.bodyBold,
    fontSize: 11.5,
    letterSpacing: 1.7,
    color: colors.green,
  },
  tierPill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierPillText: { fontSize: 11, fontWeight: '900', color: colors.text },
  scoreNumber: {
    fontFamily: typography.displayExtraBold,
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -1.8,
    color: colors.text,
    marginTop: 4,
  },
  scoreInSuffix: { fontSize: 22, fontWeight: '800', color: colors.muted },
  scoreTierHint: {
    fontFamily: typography.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  scoreLifetimeFoot: { marginTop: 2, fontSize: 12, fontWeight: '800', color: colors.text },
  decayFoot: { marginTop: 6, fontSize: 11, fontWeight: '700', color: colors.muted },
  breakdownBlock: { marginTop: 8, paddingTop: 4 },
  jumpCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  inText: { fontSize: 11, fontWeight: '900', color: colors.text },
  jumpHeight: { fontSize: 40, fontWeight: '900', color: colors.text, marginTop: -4 },
  jumpBody: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  jumpBar: { width: 6, height: 56, borderRadius: 3, backgroundColor: '#D1FAE5' },
  jumpTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 11, alignItems: 'stretch' },
  dailyBanner: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
    backgroundColor: colors.cardTint,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  dailyBannerText: { fontSize: 16, fontWeight: '900', color: colors.moss },
  profileTabs: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border2,
  },
  profileTab: { paddingBottom: 10 },
  profileTabOn: { borderBottomWidth: 2.5, borderBottomColor: colors.text },
  profileTabText: {
    fontFamily: typography.bodySemiBold,
    fontSize: 14.5,
    color: colors.muted2,
  },
  profileTabTextOn: { fontFamily: typography.bodyBold, color: colors.text },
  tabPanel: { paddingTop: 2 },
  tabHint: {
    marginTop: 12,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  stat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statStreak: {
    backgroundColor: 'rgba(255, 91, 57, 0.09)',
    borderColor: 'rgba(255, 91, 57, 0.2)',
  },
  statTappable: { borderColor: 'rgba(39, 174, 96, 0.35)' },
  statPressed: { opacity: 0.92 },
  statNum: {
    fontFamily: typography.displayExtraBold,
    fontSize: 20,
    lineHeight: 25,
    color: colors.text,
    textAlign: 'center',
  },
  statNumCoral: { color: colors.coral },
  statLabel: {
    fontFamily: typography.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    color: colors.muted,
    textAlign: 'center',
    flexShrink: 0,
  },
  followingSection: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 6,
  },
  followingTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  followingHint: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '600' },
  followingEmpty: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
  },
  openLeapsCtaText: {
    fontFamily: typography.bodyBold,
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
}));
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarClearance = floatingTabContentClearance(insets.bottom);
  const scrollRef = React.useRef<ScrollView>(null);
  const { user, signOut } = useAuth();
  const [profile, setProfile] = React.useState<any>(null);
  const [myVideos, setMyVideos] = React.useState<MyVideo[]>([]);
  const [bestParts, setBestParts] = React.useState<BestPartPost[]>([]);
  const [following, setFollowing] = React.useState<FollowingRow[]>([]);
  const [editProfileOpen, setEditProfileOpen] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [draftUsername, setDraftUsername] = React.useState('');
  const [draftBio, setDraftBio] = React.useState('');
  const [draftPhotoUri, setDraftPhotoUri] = React.useState<string | null>(null);
  const [profileSection, setProfileSection] = React.useState<'leaps' | 'best'>('leaps');
  const [bestLeapOpen, setBestLeapOpen] = React.useState(false);

  const scrollProfileToTop = React.useCallback((animated: boolean) => {
    scrollRef.current?.scrollTo({ y: 0, animated });
  }, []);

  /** Always land at the top when opening Me from another tab (or swiping onto it). */
  useFocusEffect(
    React.useCallback(() => {
      scrollProfileToTop(false);
    }, [scrollProfileToTop])
  );

  /** Re-tapping the profile tab while already on Me also jumps to the top. */
  React.useEffect(() => {
    const unsub = nav.addListener('tabPress', () => {
      scrollProfileToTop(true);
    });
    return unsub;
  }, [nav, scrollProfileToTop]);

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
    const q = userVideosQuery({ uid: user.uid, limitN: 120 });
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
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
              likesCount: Number(data?.likesCount ?? 0),
              commentsCount: Number(data?.commentsCount ?? 0),
              posterUrl:
                typeof data?.posterUrl === 'string' && data.posterUrl.trim()
                  ? data.posterUrl.trim()
                  : undefined,
            } satisfies MyVideo;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setMyVideos(rows);
      },
      () => setMyVideos([])
    );
  }, [user?.uid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setBestParts([]);
      return;
    }
    return subscribeMyBestParts(user.uid, setBestParts, () => setBestParts([]));
  }, [user?.uid]);

  const username = String(profile?.username ?? user?.username ?? 'user');
  const bio = String(profile?.bio ?? '').trim();
  const photoUrl = String(profile?.photoUrl ?? '').trim();
  const schoolRaw =
    profile?.school != null && String(profile.school).trim() !== '' ? String(profile.school).trim() : '';
  useChallengeWindow();
  const stats = useProfileStats(profile as Record<string, unknown> | undefined, myVideos);
  const canOpenBestLeap = Boolean(stats.bestPostId) || stats.highestDayIn > 0;

  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

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
      if (e instanceof UsernameTakenError) {
        showError('Username taken', e);
      } else {
        showError('Could not save profile', e);
      }
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarClearance }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.brandTextCol}>
              <Text style={styles.headerTagline} numberOfLines={1}>
                Your profile
              </Text>
              <Text style={styles.sub}>@{username}</Text>
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
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials || 'U'}</Text>
              )}
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>{username}</Text>
              <Text style={styles.handle}>
                @{username} · {following.length} following
              </Text>
              {schoolRaw ? (
                <View style={styles.schoolPill}>
                  <Text style={styles.schoolText}>{schoolRaw}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {bio ? <Text style={styles.profileBio}>{bio}</Text> : null}
          <TouchableOpacity style={styles.editProfileBtn} onPress={openEditProfile} activeOpacity={0.75}>
            <Text style={styles.editProfileBtnText}>Edit profile</Text>
            <Ionicons name="create-outline" size={17} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreTitle}>ALL-TIME VERTICAL</Text>
          <Text style={styles.scoreNumber}>{formatLeapInchesDisplay(stats.allTimeIn)}</Text>
          <Text style={styles.scoreTierHint}>All-time distance travelled from leaping</Text>
        </View>

        <View style={styles.statsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.stat,
              canOpenBestLeap && styles.statTappable,
              pressed && styles.statPressed,
            ]}
            onPress={() => setBestLeapOpen(true)}
            disabled={!canOpenBestLeap}
            accessibilityRole="button"
            accessibilityLabel="View your best leap"
          >
            <Text style={styles.statNum}>{formatLeapInchesDisplay(stats.highestDayIn)}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>BEST LEAP</Text>
          </Pressable>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{formatLeapInchesDisplay(stats.weeklyLeapIn)}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>THIS WEEK</Text>
          </View>
          <View style={[styles.stat, styles.statStreak]}>
            <Text style={[styles.statNum, styles.statNumCoral]}>{stats.streakDays}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>STREAK</Text>
          </View>
        </View>

        {stats.hasPostedTodayLeap ? (
          <View style={styles.dailyBanner}>
            <Text style={styles.dailyBannerText}>{formatLeapGainTodayBanner(stats.dailyLeapIn)}</Text>
          </View>
        ) : null}

        <View style={styles.profileTabs}>
          {(['leaps', 'best'] as const).map((section) => {
            const selected = profileSection === section;
            return (
              <Pressable
                key={section}
                style={[styles.profileTab, selected && styles.profileTabOn]}
                onPress={() => setProfileSection(section)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.profileTabText, selected && styles.profileTabTextOn]}>
                  {section === 'leaps' ? 'Leaps' : 'BPOTD'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabPanel}>
          {profileSection === 'leaps' ? (
            <ProfileLeapsGrid
              videos={myVideos}
              onOpen={(videoId) => nav.navigate('MyLeaps', { initialVideoId: videoId })}
            />
          ) : (
            <>
              <ProfileBpotdCalendar
                posts={bestParts}
                onOpenPost={(bestPartId) => navigateToBestPartInFeed(bestPartId, nav)}
              />
              <ProfileWeeklyRecapRail posts={bestParts} username={username} />
            </>
          )}
        </View>

        {following.length === 0 ? (
          <TouchableOpacity
            style={styles.openLeapsCta}
            onPress={() => nav.navigate('FollowingList')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open following list"
          >
            <Text style={styles.openLeapsCtaText}>Follow people from the Feed</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.coral} />
          </TouchableOpacity>
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

      <HighestLeapSheet
        visible={bestLeapOpen}
        onClose={() => setBestLeapOpen(false)}
        postId={stats.bestPostId}
        fallbackInches={stats.highestDayIn}
      />
    </Screen>
  );
}
