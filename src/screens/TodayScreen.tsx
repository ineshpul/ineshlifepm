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
} from 'react-native';
import { FunctionsError } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brandmark } from '../components/Brandmark';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { getDayKey } from '../lib/leapDayKey';
import { useLiveCount } from '../state/live';
import { LEAP_BOTTOM_TAGLINE } from '../content/challengeCopy';
import { useAuth } from '../state/auth';
import { showInfo } from '../utils/ui';
import { navigateToRecord, navigateToUserProfile } from '../navigation/navigationHelpers';
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

export function TodayScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, authReady } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
  const headerCountdown = window.isLive ? window.msUntilExpire : window.msUntilDrop;
  /** Leap noon→noon NY day key — must match `dailyChallengeStats/{dayKey}` writes on approval. */
  const leapDayKey = getDayKey('America/New_York');
  const liveCount = useLiveCount(leapDayKey, { enabled: window.isLive });

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
          <View style={styles.redDot} />
          <Text style={styles.badgeText}>TODAY&apos;S LEAP</Text>
        </View>

        <Text style={styles.title}>{facing.title}</Text>
        <Text style={styles.instructions}>{facing.instructionsLine}</Text>
        <LeapLoadingFrog active={!facing.canRecord} />

        <View style={styles.cardFooter}>
          <View style={styles.expirePill}>
            <Text style={styles.expireText}>
              {window.isLive
                ? `Expires in ${formatHMS(window.msUntilExpire)}`
                : `Drops in ${formatHMS(window.msUntilDrop)}`}
            </Text>
          </View>
          <View style={styles.liveRow}>
            <View style={styles.liveBarBg}>
              <View style={styles.liveBarFill} />
            </View>
            <Text style={styles.liveText} numberOfLines={1}>
              {window.isLive
                ? typeof liveCount === 'number'
                  ? `${liveCount} posted today`
                  : '— posted today'
                : 'N/A posted today'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottom}>
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
        <TouchableOpacity
          onPress={() => setSuggestOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Suggest a leap"
          style={styles.suggestBtn}
        >
          <Text style={styles.suggestBtnText}>{LEAP_BOTTOM_TAGLINE}</Text>
          <Text style={styles.suggestBtnTextStrong}>Suggest a leap</Text>
        </TouchableOpacity>
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    borderRadius: 22,
    backgroundColor: colors.cardTint,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  badgeText: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '900',
    color: colors.muted,
  },
  title: {
    marginTop: 14,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    color: colors.text,
  },
  instructions: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontWeight: '600',
  },
  cardFooter: {
    marginTop: 14,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  expirePill: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  expireText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  liveBarBg: {
    height: 3,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 40,
    maxWidth: 112,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    overflow: 'hidden',
  },
  liveBarFill: {
    height: 3,
    width: '36%',
    maxWidth: 40,
    borderRadius: 2,
    backgroundColor: '#F97316',
  },
  liveText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
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
  bottomSub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  suggestBtn: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  suggestBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
  },
  suggestBtnTextStrong: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '900',
    color: colors.coral,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
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
    backgroundColor: colors.white,
  },
  modalBtnOutlineText: { fontSize: 14, fontWeight: '900', color: colors.text },
  modalBtnPrimary: { backgroundColor: colors.moss },
  modalBtnDisabled: { backgroundColor: '#C9D3C9' },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: colors.white },
});

