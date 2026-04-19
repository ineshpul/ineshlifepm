import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { useAppState } from '../state/appState';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { showError } from '../utils/ui';
import { subscribeFollowing, type FollowingRow } from '../services/social';

type MyVideo = {
  id: string;
  challengeDate: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  moderationStatus: string;
};

export function MeScreen() {
  const nav = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { clearPostedOverride } = useAppState();
  const [profile, setProfile] = React.useState<any>(null);
  const [myVideos, setMyVideos] = React.useState<MyVideo[]>([]);
  const [following, setFollowing] = React.useState<FollowingRow[]>([]);
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const confirmDelete = (v: MyVideo) => {
    if (!user?.uid) return;
    Alert.alert(
      'Delete video?',
      'This removes your post, comments, and likes. You can record again for that day if this was your only post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setDeletingId(v.id);
              try {
                await deleteOwnedVideo({ videoId: v.id, viewerUid: user.uid });
                clearPostedOverride();
              } catch (e) {
                showError('Delete failed', e);
              } finally {
                setDeletingId(null);
              }
            })(),
        },
      ]
    );
  };

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
    const q = query(collection(firestore(), 'videos'), where('uid', '==', user.uid), limit(50));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
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
          } satisfies MyVideo;
        });
        rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setMyVideos(rows);
      },
      () => setMyVideos([])
    );
  }, [user?.uid]);

  const username = String(profile?.username ?? user?.username ?? 'user');
  const schoolRaw =
    profile?.school != null && String(profile.school).trim() !== '' ? String(profile.school).trim() : '';
  const verticalInches = Number(profile?.verticalInches ?? 0);
  const streakDays = Number(profile?.streakDays ?? 0);
  const challengesCompleted = Number(profile?.challengesCompleted ?? 0);
  const likesReceived = Number(profile?.likesReceived ?? 0);

  const initials =
    (username.split(/[\s_]+/).filter(Boolean)[0]?.[0] ?? 'U').toUpperCase() +
    (username.split(/[\s_]+/).filter(Boolean)[1]?.[0] ?? '').toUpperCase();

  return (
    <Screen style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <Brandmark size={36} />
            <View>
              <Text style={styles.brand}>Leap</Text>
              <Text style={styles.sub}>PROFILE</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => nav.navigate('Notifications')} style={styles.iconBtn}>
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
            <Text style={styles.avatarText}>{initials || 'U'}</Text>
          </View>
          <Text style={styles.name}>{username}</Text>
          <Text style={styles.handle}>@{username}</Text>
          {schoolRaw ? (
            <View style={styles.schoolPill}>
              <Text style={styles.schoolText}>{schoolRaw}</Text>
            </View>
          ) : (
            <Text style={styles.schoolPlaceholder}>School — you can set this in a future update.</Text>
          )}
        </View>

        <View style={styles.jumpCard}>
          <View style={styles.jumpHeader}>
            <Text style={styles.jumpLabel}>JUMP HEIGHT</Text>
            <View style={styles.inPill}>
              <View style={styles.redDot} />
              <Text style={styles.inText}>IN</Text>
            </View>
          </View>
          <Text style={styles.jumpHeight}>{verticalInches}"</Text>
          <View style={styles.jumpBody}>
            <View style={styles.jumpBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.jumpTitle}>You are getting higher.</Text>
              <Text style={styles.jumpDesc}>
                Track your best jump in inches. More reps means more lift and a higher ceiling.
              </Text>
            </View>
          </View>
        </View>

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
            <View style={styles.followingList}>
              {following.map((f) => (
                <View key={f.targetUid} style={styles.followingRow}>
                  <Text style={styles.followingName}>@{f.targetUsername}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.leapsSection}>
          <Text style={styles.leapsTitle}>YOUR LEAPS</Text>
          <Text style={styles.leapsHint}>Videos you have posted (newest first).</Text>
          {myVideos.length === 0 ? (
            <Text style={styles.emptyLeaps}>No leaps yet — post from Today.</Text>
          ) : (
            myVideos.map((v) => (
              <View key={v.id} style={styles.leapCard}>
                <View style={styles.leapMeta}>
                  <View style={styles.leapMetaLeft}>
                    <Text style={styles.leapDate}>{v.challengeDate}</Text>
                    <Text
                      style={[
                        styles.leapStatus,
                        v.moderationStatus === 'approved' && styles.leapStatusOk,
                      ]}
                    >
                      {v.moderationStatus === 'approved'
                        ? 'Live'
                        : v.moderationStatus === 'pending'
                          ? 'Pending review'
                          : v.moderationStatus}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete(v)}
                    disabled={deletingId === v.id}
                    hitSlop={8}
                  >
                    <Text style={styles.deleteLink}>{deletingId === v.id ? '…' : 'Delete'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.leapPrompt} numberOfLines={2}>
                  {v.prompt}
                </Text>
                {v.url ? (
                  <Pressable
                    onPress={() => setPlayingId((id) => (id === v.id ? null : v.id))}
                    style={styles.leapVideoWrap}
                  >
                    <Video
                      source={{ uri: v.url }}
                      style={styles.leapVideo}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      shouldPlay={playingId === v.id}
                    />
                    {playingId !== v.id ? (
                      <View style={styles.playHint}>
                        <Text style={styles.playHintText}>Tap to play</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: {
    marginTop: 2,
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
  },
  avatarText: { fontSize: 22, fontWeight: '900', color: colors.text },
  name: { fontSize: 18, fontWeight: '900', color: colors.text },
  handle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: -2 },
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
  schoolPlaceholder: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  jumpCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 18,
    gap: 10,
  },
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
  jumpDesc: { marginTop: 4, fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '600' },
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
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    gap: 8,
  },
  followingTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  followingHint: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '600' },
  followingEmpty: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  followingList: { gap: 6, marginTop: 4 },
  followingRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  followingName: { fontSize: 14, fontWeight: '900', color: colors.text },
  leapsSection: { marginTop: 20, gap: 10 },
  leapsTitle: { fontSize: 11, letterSpacing: 2.2, fontWeight: '900', color: colors.muted },
  leapsHint: { fontSize: 13, lineHeight: 19, color: colors.muted, fontWeight: '600' },
  emptyLeaps: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  leapCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    gap: 8,
    marginBottom: 4,
  },
  leapMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leapMetaLeft: { flex: 1, gap: 2 },
  leapDate: { fontSize: 12, fontWeight: '800', color: colors.text },
  leapStatus: { fontSize: 11, fontWeight: '900', color: colors.muted },
  leapStatusOk: { color: colors.moss },
  deleteLink: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.coral,
    paddingLeft: 8,
  },
  leapPrompt: { fontSize: 13, fontWeight: '600', color: colors.muted },
  leapVideoWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  leapVideo: { width: '100%', height: 220 },
  playHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playHintText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
