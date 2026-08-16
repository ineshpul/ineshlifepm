import * as React from 'react';
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

import { Brandmark } from '../components/Brandmark';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { CreatePostSheet } from '../components/modern/CreatePostSheet';
import { ModernActionRow } from '../components/modern/ModernActionRow';
import { ModernHeroSurface } from '../components/modern/ModernHeroSurface';
import {
  ModernPromptEyebrow,
  formatCountdownHMS,
} from '../components/modern/ModernPromptEyebrow';
import { ModernLeaderboardCallout } from '../components/modern/ModernLeaderboardCallout';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { useLiveCount } from '../state/live';
import { useCanViewOtherUsersVideos } from '../state/posting';
import { useAuth } from '../state/auth';
import { showInfo } from '../utils/ui';
import {
  navigateToLeaperboard,
  navigateToRecord,
} from '../navigation/navigationHelpers';
import { shareReferralInvite } from '../utils/shareReferralInvite';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { activeLeapStreakFromUserProfile } from '../lib/profileLeapStats';
import { computeFeedViewingFromNow } from '../utils/nyTime';

/** Oversized Bricolage prompt that still fits long leaps (mockup 01 uses a clamp). */
function promptTitleTypography(
  title: string
): Pick<TextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing'> {
  const len = title.trim().length;
  const size =
    len <= 22 ? 46 : len <= 32 ? 40 : len <= 46 ? 33 : len <= 70 ? 27 : len <= 94 ? 23 : 20;
  return {
    fontSize: size,
    lineHeight: Math.round(size * 1.07),
    letterSpacing: -(size * 0.04),
  };
}

function leapedLabel(count: number | null): string {
  if (count == null) return 'Counting today’s leaps…';
  if (count === 1) return '1 person has leaped';
  return `${count} people have leaped`;
}

export function TodayScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    scroll: {
      flexGrow: 1,
      paddingBottom: 12,
    },
    hero: {
      paddingHorizontal: 22,
      paddingBottom: 22,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    headerGroup: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      flexShrink: 1,
      minWidth: 0,
    },
    brandTile: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    adminBtn: {
      height: 34,
      paddingHorizontal: 11,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      backgroundColor: c.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    adminBtnText: {
      fontSize: 11,
      fontFamily: typography.bodyBold,
      letterSpacing: 1.2,
      color: c.text,
    },
    streakChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      paddingHorizontal: 11,
      height: 38,
      borderRadius: 14,
      backgroundColor: 'rgba(255, 91, 57, 0.10)',
      borderWidth: 1,
      borderColor: 'rgba(255, 91, 57, 0.24)',
    },
    streakText: {
      fontFamily: typography.bodyBold,
      fontSize: 13,
      color: c.danger,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      backgroundColor: c.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    callout: {
      marginTop: 16,
    },
    eyebrow: {
      marginTop: 22,
    },
    promptWrap: {
      marginTop: 18,
      justifyContent: 'center' as const,
      minHeight: 128,
    },
    prompt: {
      fontFamily: typography.displayExtraBold,
      color: c.text,
    },
    instructions: {
      marginTop: 14,
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
      lineHeight: 18,
      color: c.green,
    },
    heroFooter: {
      marginTop: 20,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
    },
    heroFooterText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.bodySemiBold,
      fontSize: 13,
      color: c.green,
    },
    cheer: {
      fontFamily: typography.bodyExtraBold,
      fontSize: 13,
      color: c.coral,
      flexShrink: 0,
    },
    gatePill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      flexShrink: 0,
    },
    gateText: {
      fontFamily: typography.bodyBold,
      fontSize: 12,
      color: c.muted2,
    },
    body: {
      paddingHorizontal: 22,
      paddingTop: 18,
      gap: 14,
    },
    suggestTile: {
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border2,
    },
    bottom: {
      alignItems: 'center' as const,
      paddingTop: 2,
    },
    leapBtn: {
      width: '100%' as const,
      maxWidth: 360,
      borderRadius: 28,
    },
    bottomHint: {
      marginTop: 10,
      fontSize: 11,
      letterSpacing: 2.2,
      fontFamily: typography.bodyBold,
      color: c.muted,
    },
    inviteBtn: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    inviteBtnText: {
      fontSize: 13,
      fontFamily: typography.bodyBold,
      color: c.green,
      textAlign: 'center' as const,
    },
  }));

  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
  const liveCount = useLiveCount({
    enabled: window.isLive,
    challengeDateKey: challenge.dateKey?.trim() ? challenge.dateKey : undefined,
  });
  const feedUnlocked = useCanViewOtherUsersVideos({
    uid: user?.uid,
    isAdmin: user?.isAdmin,
    isModerator: user?.isModerator,
    experimentCohort: user?.experimentCohort,
  });
  const [streakDays, setStreakDays] = React.useState(0);
  const [suggestOpen, setSuggestOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setStreakDays(0);
      return;
    }
    const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
    const unsub = onSnapshot(
      doc(firestore(), 'users', user.uid),
      (snap) => {
        const data = (snap.data() ?? {}) as Record<string, unknown>;
        setStreakDays(
          activeLeapStreakFromUserProfile({
            profile: data,
            todayLeapDayKey: viewingChallengeDateKey,
          })
        );
      },
      () => setStreakDays(0)
    );
    return unsub;
  }, [user?.uid]);

  const titleType = React.useMemo(() => promptTitleTypography(facing.title), [facing.title]);
  const countdownMs = window.isLive ? window.msUntilExpire : window.msUntilDrop;
  const countdownLabel = window.isLive
    ? `${formatCountdownHMS(countdownMs)} left`
    : `opens in ${formatCountdownHMS(countdownMs)}`;
  const showBeFirst = window.isLive && liveCount === 0;

  return (
    <Screen edges={['left', 'right', 'bottom']} dismissKeyboardOnTap>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: floatingTabContentClearance(insets.bottom) + 12 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ModernHeroSurface style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <View style={styles.header}>
            <View style={styles.headerGroup}>
              <View style={styles.brandTile}>
                <Brandmark size={24} />
              </View>
              {user?.isAdmin ? (
                <TouchableOpacity
                  onPress={() => nav.navigate('ChallengeAdmin')}
                  style={styles.adminBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Set today's leap"
                >
                  <Text style={styles.adminBtnText}>SET</Text>
                </TouchableOpacity>
              ) : null}
              {user?.isAdmin || user?.isModerator ? (
                <TouchableOpacity
                  onPress={() => nav.navigate('AdminVideoModeration')}
                  style={styles.adminBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Video moderation"
                >
                  <Text style={styles.adminBtnText}>MOD</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.headerGroup}>
              {streakDays > 0 ? (
                <View
                  style={styles.streakChip}
                  accessibilityLabel={`Leap streak ${streakDays} days`}
                >
                  <Ionicons name="flame" size={15} color={colors.danger} />
                  <Text style={styles.streakText}>{streakDays}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => nav.navigate('Notifications')}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.callout}>
            <ModernLeaderboardCallout
              title="The Leaperboard"
              subtitle="Daily · Weekly · All-time"
              onPress={() => navigateToLeaperboard(nav)}
            />
          </View>

          <View style={styles.eyebrow}>
            <ModernPromptEyebrow
              label="TODAY'S LEAP"
              timeLabel={countdownLabel}
              live={window.isLive}
            />
          </View>

          <View style={styles.promptWrap}>
            <Text style={[styles.prompt, titleType]}>{facing.title}</Text>
          </View>

          <Text style={styles.instructions} numberOfLines={2}>
            {facing.instructionsLine}
          </Text>
          <LeapLoadingFrog active={!facing.canRecord} />

          <View style={styles.heroFooter}>
            <Text style={styles.heroFooterText} numberOfLines={1}>
              {window.isLive ? leapedLabel(liveCount) : 'Opens at noon ET'}
            </Text>
            {showBeFirst ? <Text style={styles.cheer}>Be first!</Text> : null}
            {user?.uid ? (
              <View style={styles.gatePill}>
                <Ionicons
                  name={feedUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
                  size={13}
                  color={feedUnlocked ? colors.green : colors.muted2}
                />
                <Text style={[styles.gateText, feedUnlocked && { color: colors.green }]}>
                  {feedUnlocked ? 'Unlocked' : 'Locked'}
                </Text>
              </View>
            ) : null}
          </View>
        </ModernHeroSurface>

        <View style={styles.body}>
          <ModernActionRow
            title="Suggest tomorrow's leap"
            subtitle="Send an idea to the Leap team"
            leading={<Ionicons name="bulb-outline" size={21} color={colors.green} />}
            leadingStyle={styles.suggestTile}
            onPress={() => setSuggestOpen(true)}
            accessibilityHint="Opens the suggestion composer"
          />

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
            {user?.uid ? (
              <TouchableOpacity
                onPress={() => void shareReferralInvite(user?.username ?? '')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Invite a friend for 5 inches"
                style={styles.inviteBtn}
              >
                <Text style={styles.inviteBtnText} numberOfLines={2}>
                  Invite a friend for 5″
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <CreatePostSheet
        visible={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        initialStep="suggest"
      />
    </Screen>
  );
}
