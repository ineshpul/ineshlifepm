import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Brandmark } from '../components/Brandmark';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useTodayChallenge } from '../state/challenge';
import { useLiveCount } from '../state/live';
import { useAuth } from '../state/auth';

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
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const headerCountdown = window.isLive ? window.msUntilExpire : window.msUntilDrop;
  const liveCount = useLiveCount(window.dateKey);

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View>
          <View style={styles.brandRow}>
            <Brandmark size={32} />
            <View>
              <Text style={styles.brand}>Leap</Text>
            </View>
          </View>
          <Text style={styles.sub}>TODAY</Text>
        </View>
        <View style={styles.headerRight}>
          {user?.isAdmin && (
            <TouchableOpacity onPress={() => nav.navigate('ChallengeAdmin')} style={styles.adminBtn}>
              <Text style={styles.adminBtnText}>SET</Text>
            </TouchableOpacity>
          )}
          <View style={styles.pill}>
            <View style={styles.redDot} />
            <Text style={styles.pillText}>{formatHMS(headerCountdown)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <View style={styles.redDot} />
          <Text style={styles.badgeText}>TODAY&apos;S LEAP</Text>
        </View>

        <Text style={styles.title}>{challenge.title}</Text>
        <Text style={styles.desc}>{challenge.subtitle}</Text>
        <Text style={styles.taskLength}>Task: up to {challenge.maxDurationSeconds}s</Text>

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
              {typeof liveCount === 'number' ? `${liveCount} posted today` : '— posted today'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottom}>
        <PrimaryButton
          title="LEAP"
          variant="green"
          onPress={() => nav.navigate('Record')}
          style={styles.leapBtn}
        />
        <Text style={styles.bottomHint}>TAP TO RECORD</Text>
        <Text style={styles.bottomSub}>
          One take · up to {challenge.maxDurationSeconds}s · post it fast.
        </Text>
      </View>
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: '900',
    color: colors.muted,
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
  desc: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: '600',
  },
  taskLength: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  cardFooter: {
    marginTop: 18,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  expirePill: {
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  expireText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveBarBg: {
    height: 4,
    width: 68,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    overflow: 'hidden',
  },
  liveBarFill: {
    height: 4,
    width: 22,
    borderRadius: 2,
    backgroundColor: '#F97316',
  },
  liveText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
  },
  bottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  leapBtn: {
    width: 220,
    height: 60,
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
});

