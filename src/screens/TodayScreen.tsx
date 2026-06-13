import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FunctionsError } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { Brandmark } from '../components/Brandmark';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { useLiveCount } from '../state/live';
import { useAuth } from '../state/auth';
import { showInfo } from '../utils/ui';
import { navigateToRecord, navigateToUserProfile } from '../navigation/navigationHelpers';
import { shareReferralInvite } from '../utils/shareReferralInvite';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import { isFirebaseConfigured } from '../firebase/firebase';
import { subscribeUsersByUsernamePrefix, type UserSearchHit } from '../services/userSearch';
import { submitChallengeSuggestion } from '../services/challengeSuggestion';

function formatHMS(ms: number) {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(
    2,
    '0'
  )}`;
}

/** Scale prompt type so long leaps stay readable without dominating the screen. */
function promptTitleTypography(title: string): Pick<TextStyle, 'fontSize' | 'lineHeight'> {
  const len = title.trim().length;
  if (len <= 42) return { fontSize: 32, lineHeight: 38 };
  if (len <= 68) return { fontSize: 27, lineHeight: 33 };
  if (len <= 92) return { fontSize: 23, lineHeight: 29 };
  return { fontSize: 20, lineHeight: 26 };
}

function liveBarFillWidth(count: number | null | undefined): `${number}%` {
  if (typeof count !== 'number' || count <= 0) return '6%';
  return `${Math.min(100, Math.max(14, 8 + count * 5))}%` as `${number}%`;
}

export function TodayScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: {
    paddingHorizontal: 18,
  },
  header: {
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBtnText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.text,
  },
  headerBrand: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  brandName: {
    marginTop: 0,
    fontSize: 22,
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
  findBlock: {
    marginTop: 14,
  },
  findLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    marginBottom: 8,
  },
  findOffline: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  findInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: colors.card,
  },
  findLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  findLoadingTxt: { fontSize: 13, fontWeight: '700', color: colors.muted },
  findResultsWrap: {
    marginTop: 8,
    maxHeight: 200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  findResultsList: { flexGrow: 0 },
  findRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border2,
  },
  findRowName: { fontSize: 15, fontWeight: '800', color: colors.coral, flexShrink: 1 },
  findRowHint: { fontSize: 12, fontWeight: '700', color: colors.moss, marginLeft: 10 },
  findEmpty: {
    padding: 14,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  card: {
    marginTop: 18,
    flexShrink: 1,
    borderRadius: 22,
    backgroundColor: colors.cardTint,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.moss,
  },
  badgeText: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '900',
    color: colors.green,
  },
  title: {
    marginTop: 12,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  metaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
  },
  instructions: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: colors.green,
    fontWeight: '700',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
    flexShrink: 0,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  statsLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '800',
    color: colors.green,
  },
  statsCheer: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '900',
    color: colors.moss,
  },
  liveBarBg: {
    marginTop: 8,
    height: 4,
    width: '100%',
    borderRadius: 2,
    backgroundColor: '#DCE8D0',
    overflow: 'hidden',
  },
  liveBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.moss,
    minWidth: 6,
  },
  bottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  /** Same footprint as Record screen POST (PrimaryButton + postBtn). */
  leapBtn: {
    width: 220,
    borderRadius: 30,
  },
  bottomHint: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: '900',
    color: colors.text,
  },
  bottomActionsColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 20,
    alignSelf: 'center',
  },
  bottomActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    minHeight: 32,
  },
  suggestBtnTextStrong: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.coral,
    textAlign: 'center',
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.moss,
    textAlign: 'center',
  },
  modalKavRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalSub: { fontSize: 13, fontWeight: '600', color: colors.muted, lineHeight: 18 },
  modalInput: {
    minHeight: 110,
    maxHeight: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.card,
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modalBtnOutlineText: { fontSize: 14, fontWeight: '900', color: colors.text },
  modalBtnPrimary: { backgroundColor: colors.moss },
  modalBtnDisabled: { backgroundColor: '#C9D3C9' },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: colors.white },
}));
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, authReady } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
  const headerCountdown = window.isLive ? window.msUntilExpire : window.msUntilDrop;
  const liveCount = useLiveCount({
    enabled: window.isLive,
    challengeDateKey: challenge.dateKey,
  });

  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [suggestText, setSuggestText] = React.useState('');
  const [suggestSending, setSuggestSending] = React.useState(false);

  const sendSuggestion = React.useCallback(async () => {
    const body = suggestText.trim();
    if (!body || suggestSending) return;
    if (!isFirebaseConfigured() || !authReady || !user?.uid) {
      showInfo('Sign in required', 'Sign in to send a leap suggestion.');
      return;
    }
    setSuggestSending(true);
    try {
      await submitChallengeSuggestion(body);
      setSuggestOpen(false);
      setSuggestText('');
      showInfo('Thanks!', 'Your idea was sent to the Leap team.');
    } catch (e: unknown) {
      let msg = 'Something went wrong. Try again.';
      if (e instanceof FunctionsError && e.code === 'functions/unauthenticated') {
        msg =
          'Your session did not reach the server yet. Wait a moment and try again, or sign out and back in.';
      } else if (e instanceof Error) {
        msg = e.message;
      }
      showInfo('Could not send', msg);
    } finally {
      setSuggestSending(false);
    }
  }, [authReady, suggestSending, suggestText, user?.uid]);

  const [profileQ, setProfileQ] = React.useState('');
  const [debouncedProfileQ, setDebouncedProfileQ] = React.useState('');
  const [profileHits, setProfileHits] = React.useState<UserSearchHit[]>([]);
  const [profileSearchLoading, setProfileSearchLoading] = React.useState(false);

  const qNorm = React.useMemo(() => profileQ.trim().toLowerCase().replace(/^@+/u, ''), [profileQ]);
  const profileSearchPending = Boolean(qNorm && qNorm !== debouncedProfileQ);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedProfileQ(qNorm), 280);
    return () => clearTimeout(t);
  }, [qNorm]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid || !debouncedProfileQ) {
      setProfileHits([]);
      setProfileSearchLoading(false);
      return;
    }
    setProfileHits([]);
    setProfileSearchLoading(true);
    const unsub = subscribeUsersByUsernamePrefix(debouncedProfileQ, user.uid, 35, (hits) => {
      setProfileHits(hits);
      setProfileSearchLoading(false);
    });
    return () => unsub();
  }, [debouncedProfileQ, user?.uid]);

  const showProfileSpinner = Boolean(qNorm) && (profileSearchPending || profileSearchLoading);

  const titleType = React.useMemo(
    () => promptTitleTypography(facing.title),
    [facing.title]
  );
  const countdownLabel = window.isLive
    ? formatHMS(window.msUntilExpire)
    : formatHMS(window.msUntilDrop);
  const postedLabel = window.isLive
    ? typeof liveCount === 'number'
      ? `${liveCount} posted today`
      : '— posted today'
    : 'Opens at noon ET';
  const showBeFirst = window.isLive && liveCount === 0;

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap>
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.brandRow}>
            <Brandmark size={32} />
            <View style={styles.brandTextCol}>
              <Text style={styles.brandName}>Leap</Text>
              <Text style={styles.sub}>TODAY</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          {(user?.isAdmin || user?.isModerator) ? (
            <View style={styles.adminBtns}>
              {user?.isAdmin ? (
                <TouchableOpacity onPress={() => nav.navigate('ChallengeAdmin')} style={styles.adminBtn}>
                  <Text style={styles.adminBtnText}>SET</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => nav.navigate('AdminVideoModeration')} style={styles.adminBtn}>
                <Text style={styles.adminBtnText}>MOD</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.pill}>
            <View style={styles.redDot} />
            <Text style={styles.pillText}>{formatHMS(headerCountdown)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.findBlock}>
        <Text style={styles.findLabel}>Find someone on Leap</Text>
        {!isFirebaseConfigured() ? (
          <Text style={styles.findOffline}>Connect Firebase to search profiles.</Text>
        ) : (
          <>
            <TextInput
              style={styles.findInput}
              placeholder="Search by username"
              placeholderTextColor={colors.muted2}
              value={profileQ}
              onChangeText={setProfileQ}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {showProfileSpinner ? (
              <View style={styles.findLoading}>
                <ActivityIndicator color={colors.moss} />
                <Text style={styles.findLoadingTxt}>Searching…</Text>
              </View>
            ) : null}
            {qNorm && !showProfileSpinner ? (
              <View style={styles.findResultsWrap}>
                <FlatList
                  data={profileHits}
                  keyExtractor={(h) => h.uid}
                  scrollEnabled={profileHits.length > 4}
                  style={styles.findResultsList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={styles.findEmpty}>No users match that prefix.</Text>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.findRow}
                      onPress={() => {
                        setProfileQ('');
                        setDebouncedProfileQ('');
                        setProfileHits([]);
                        navigateToUserProfile(nav, { uid: item.uid, username: item.username });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${item.username} profile`}
                    >
                      <Text style={styles.findRowName}>@{item.username}</Text>
                      <Text style={styles.findRowHint}>Open profile</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>TODAY&apos;S LEAP</Text>
        </View>

        <Text style={[styles.title, titleType]}>{facing.title}</Text>
        <LeapLoadingFrog active={!facing.canRecord} />

        <View style={styles.metaRow}>
          <Text style={styles.instructions} numberOfLines={2}>
            {facing.instructionsLine}
          </Text>
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={14} color={colors.green} />
            <Text style={styles.timerText}>{countdownLabel}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.statsLabel} numberOfLines={1}>
            {postedLabel}
          </Text>
          {showBeFirst ? (
            <Text style={styles.statsCheer} numberOfLines={1}>
              Be first!
            </Text>
          ) : null}
        </View>
        <View style={styles.liveBarBg}>
          <View style={[styles.liveBarFill, { width: liveBarFillWidth(liveCount) }]} />
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: floatingTabContentClearance(insets.bottom) }]}>
        <PrimaryButton
          title="Leap"
          variant="green"
          onPress={() => {
            if (!facing.canRecord) {
              showInfo(
                'Not yet',
                'Today’s leap drops at 12:00 PM Eastern. The prompt stays hidden until then.'
              );
              return;
            }
            navigateToRecord(nav);
          }}
          style={styles.leapBtn}
        />
        <Text style={styles.bottomHint}>TAP TO RECORD</Text>
        <View style={styles.bottomActionsColumn}>
          <TouchableOpacity
            onPress={() => setSuggestOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Suggest a leap"
            style={styles.bottomActionBtn}
          >
            <Text style={styles.suggestBtnTextStrong} numberOfLines={2}>
              Suggest a leap
            </Text>
          </TouchableOpacity>
          {user?.uid ? (
            <TouchableOpacity
              onPress={() => void shareReferralInvite(user?.username ?? '')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Invite a friend for 5 inches"
              style={styles.bottomActionBtn}
            >
              <Text style={styles.inviteBtnText} numberOfLines={2}>
                Invite a friend for 5″
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal
        visible={suggestOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!suggestSending) setSuggestOpen(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKavRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 6 : 0}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => {
              if (!suggestSending) setSuggestOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss leap suggestion form"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.modalBackdrop,
              { paddingBottom: Math.max(insets.bottom, 14) + 6 },
            ]}
          >
            <View style={styles.modalCard}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Text style={styles.modalTitle}>Suggest a leap</Text>
                <Text style={styles.modalSub}>
                  Tap Send and we&apos;ll deliver your leap idea to the Leap team — no email app needed.
                </Text>
                <TextInput
                  value={suggestText}
                  onChangeText={setSuggestText}
                  placeholder="Type your leap idea…"
                  placeholderTextColor={colors.muted2}
                  multiline
                  style={styles.modalInput}
                  autoCorrect
                  autoCapitalize="sentences"
                  maxLength={1200}
                  editable={!suggestSending}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!suggestSending) setSuggestOpen(false);
                    }}
                    style={[styles.modalBtn, styles.modalBtnOutline, suggestSending && { opacity: 0.55 }]}
                    activeOpacity={0.85}
                    disabled={suggestSending}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel leap suggestion"
                  >
                    <Text style={styles.modalBtnOutlineText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void sendSuggestion()}
                    style={[
                      styles.modalBtn,
                      suggestText.trim() && !suggestSending
                        ? styles.modalBtnPrimary
                        : styles.modalBtnDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={!suggestText.trim() || suggestSending}
                    accessibilityRole="button"
                    accessibilityLabel="Send leap suggestion"
                  >
                    {suggestSending ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.modalBtnPrimaryText}>Send</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
