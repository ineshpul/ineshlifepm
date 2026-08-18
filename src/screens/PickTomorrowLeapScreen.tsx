import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FunctionsError } from 'firebase/functions';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { useAuth } from '../state/auth';
import { isFirebaseConfigured } from '../firebase/firebase';
import {
  submitChallengeSuggestion,
  subscribeApprovedSuggestions,
  subscribeMyVoteForBallot,
  voteTomorrowLeap,
  type ChallengeSuggestion,
} from '../services/challengeSuggestion';
import { activeBallotDateKey, msUntilBallotClose } from '../utils/nyTime';
import { showInfo } from '../utils/ui';

function formatCountdownShort(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function PickTomorrowLeapScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, authReady } = useAuth();

  const styles = useThemedStyles((c) => ({
    screen: { flex: 1, backgroundColor: c.bg },
    headerPad: { paddingHorizontal: 18, paddingTop: 8 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 14,
    },
    title: {
      fontFamily: typography.displayExtraBold,
      fontSize: 28,
      color: c.text,
      letterSpacing: -0.6,
    },
    countdownRow: {
      marginTop: 8,
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    countdownMuted: {
      fontFamily: typography.bodySemiBold,
      fontSize: 14,
      color: c.muted,
    },
    countdownAccent: {
      fontFamily: typography.bodyBold,
      fontSize: 14,
      color: c.coral,
    },
    searchWrap: {
      marginTop: 16,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 14,
      height: 48,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: typography.bodyMedium,
      color: c.text,
      paddingVertical: 0,
    },
    rewardBanner: {
      marginTop: 14,
      borderRadius: 18,
      backgroundColor: 'rgba(46, 125, 74, 0.12)',
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 14,
    },
    rewardPlus: {
      fontFamily: typography.displayExtraBold,
      fontSize: 28,
      color: c.moss,
      letterSpacing: -0.5,
    },
    rewardCopy: {
      flex: 1,
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
      lineHeight: 18,
      color: c.text,
    },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: 18,
      paddingTop: 14,
      gap: 10,
    },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    cardSelected: {
      borderColor: c.moss,
      backgroundColor: 'rgba(46, 125, 74, 0.08)',
    },
    cardDisabled: {
      opacity: 0.72,
    },
    cardTitle: {
      fontFamily: typography.bodyBold,
      fontSize: 16,
      color: c.text,
      lineHeight: 22,
    },
    cardMeta: {
      marginTop: 6,
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
      color: c.muted,
    },
    footerNote: {
      marginTop: 8,
      marginBottom: 10,
      textAlign: 'center' as const,
      fontFamily: typography.bodySemiBold,
      fontSize: 12,
      color: c.muted,
    },
    suggestKicker: {
      fontFamily: typography.bodyBold,
      fontSize: 11,
      letterSpacing: 1.4,
      color: c.muted,
      marginBottom: 8,
    },
    composer: {
      paddingHorizontal: 18,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    inputRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 96,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: typography.bodyMedium,
      backgroundColor: c.inputBg,
      color: c.text,
      textAlignVertical: 'top' as const,
    },
    sendBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.moss,
    },
    sendBtnDisabled: {
      backgroundColor: '#C9D3C9',
    },
    sendBtnText: {
      fontSize: 14,
      fontFamily: typography.bodyBold,
      color: c.white,
    },
    empty: {
      paddingVertical: 28,
      alignItems: 'center' as const,
      gap: 8,
    },
    emptyTitle: {
      fontFamily: typography.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    emptyBody: {
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
      color: c.muted,
      textAlign: 'center' as const,
      lineHeight: 18,
      paddingHorizontal: 12,
    },
  }));

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const nowMs = Date.now();
  const ballotDateKey = activeBallotDateKey(nowMs);
  const msLeft = msUntilBallotClose(nowMs);
  const votingOpen = msLeft > 0;

  const [items, setItems] = React.useState<ChallengeSuggestion[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [myVoteId, setMyVoteId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [votingId, setVotingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) {
      setItems([]);
      setHydrated(true);
      return;
    }
    return subscribeApprovedSuggestions(
      (rows) => {
        setItems(rows);
        setHydrated(true);
      },
      () => {
        setItems([]);
        setHydrated(true);
      }
    );
  }, []);

  React.useEffect(() => {
    if (!user?.uid || !ballotDateKey) {
      setMyVoteId(null);
      return;
    }
    return subscribeMyVoteForBallot(user.uid, ballotDateKey, (vote) => {
      setMyVoteId(vote?.suggestionId ?? null);
    });
  }, [user?.uid, ballotDateKey]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@+/u, '');
    if (!q) return items;
    return items.filter((row) => {
      const text = row.text.toLowerCase();
      const user = row.suggestedByUsername.toLowerCase();
      return text.includes(q) || user.includes(q);
    });
  }, [items, search]);

  const onVote = async (suggestionId: string) => {
    if (!votingOpen) {
      showInfo('Voting closed', 'Come back after noon for the next ballot.');
      return;
    }
    if (myVoteId) {
      showInfo('Already voted', 'One vote per day — yours is locked in.');
      return;
    }
    if (!authReady || !user?.uid) {
      showInfo('Sign in required', 'Sign in to vote.');
      return;
    }
    setVotingId(suggestionId);
    try {
      await voteTomorrowLeap(suggestionId);
      setMyVoteId(suggestionId);
      showInfo('Vote counted', 'Thanks — see you at noon.');
    } catch (e: unknown) {
      let msg = 'Something went wrong. Try again.';
      if (e instanceof FunctionsError) {
        if (e.code === 'functions/already-exists') msg = 'You already voted today.';
        else if (e.message) msg = e.message;
      } else if (e instanceof Error) {
        msg = e.message;
      }
      showInfo('Could not vote', msg);
    } finally {
      setVotingId(null);
    }
  };

  const onSuggest = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (!authReady || !user?.uid) {
      showInfo('Sign in required', 'Sign in to suggest a leap.');
      return;
    }
    setSending(true);
    try {
      await submitChallengeSuggestion(body);
      setDraft('');
      showInfo('Submitted', 'Your leap is pending approval — if it wins, you get +5″.');
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
      setSending(false);
    }
  };

  const canSend = Boolean(draft.trim()) && !sending;

  return (
    <Screen style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.headerPad}>
          <Pressable
            onPress={() => nav.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Pick tomorrow's leap.</Text>
          <View style={styles.countdownRow}>
            <Text style={styles.countdownMuted}>Voting closes at noon · </Text>
            <Text style={styles.countdownAccent}>
              {votingOpen ? formatCountdownShort(msLeft) : 'closed'}
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.muted2} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search @username or a leap."
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <View style={styles.rewardBanner}>
            <Text style={styles.rewardPlus}>+5″</Text>
            <Text style={styles.rewardCopy}>
              Suggest a leap. If yours gets picked, five inches go straight to your vertical.
            </Text>
          </View>
        </View>

        {!hydrated ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={colors.moss} />
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={filtered}
            keyExtractor={(x) => x.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 12 },
            ]}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No leaps on the ballot yet</Text>
                <Text style={styles.emptyBody}>
                  Suggest one below — once it’s approved, everyone can vote.
                </Text>
              </View>
            }
            ListFooterComponent={
              <Text style={styles.footerNote}>One vote per day · tap the leap you want tomorrow.</Text>
            }
            renderItem={({ item }) => {
              const selected = myVoteId === item.id;
              const lockedOut = Boolean(myVoteId) && !selected;
              const busy = votingId === item.id;
              return (
                <Pressable
                  onPress={() => void onVote(item.id)}
                  disabled={!votingOpen || Boolean(myVoteId) || busy}
                  style={[
                    styles.card,
                    selected && styles.cardSelected,
                    (lockedOut || !votingOpen) && styles.cardDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !votingOpen || Boolean(myVoteId) }}
                >
                  <Text style={styles.cardTitle}>{item.text}</Text>
                  <Text style={styles.cardMeta}>
                    by @{item.suggestedByUsername} · {item.voteCount}{' '}
                    {item.voteCount === 1 ? 'vote' : 'votes'}
                    {selected ? ' · your pick' : ''}
                    {busy ? ' · …' : ''}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <Text style={styles.suggestKicker}>SUGGEST YOUR OWN · +5″ IF IT WINS</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="A leap nobody's done yet..."
              placeholderTextColor={colors.muted2}
              multiline
              maxLength={200}
              editable={!sending}
            />
            <Pressable
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={() => void onSuggest()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send leap suggestion"
            >
              {sending ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.sendBtnText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
