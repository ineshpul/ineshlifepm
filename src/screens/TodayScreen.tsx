import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Brandmark } from '../components/Brandmark';
import { LeapLoadingFrog } from '../components/LeapLoadingFrog';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { useLiveCount } from '../state/live';
import { LEAP_BOTTOM_TAGLINE } from '../content/challengeCopy';
import { useAuth } from '../state/auth';
import { showInfo } from '../utils/ui';

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
  const facing = getPlayerFacingChallenge(challenge, window);
  const headerCountdown = window.isLive ? window.msUntilExpire : window.msUntilDrop;
  const liveCount = useLiveCount(window.dateKey);

  return (
    <Screen style={styles.screen}>
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
          {user?.isAdmin && (
            <View style={styles.adminBtns}>
              <TouchableOpacity onPress={() => nav.navigate('ChallengeAdmin')} style={styles.adminBtn}>
                <Text style={styles.adminBtnText}>SET</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => nav.navigate('AdminVideoModeration')} style={styles.adminBtn}>
                <Text style={styles.adminBtnText}>MOD</Text>
              </TouchableOpacity>
            </View>
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
              {typeof liveCount === 'number' ? `${liveCount} posted today` : '— posted today'}
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
            nav.navigate('Record');
          }}
          style={styles.leapBtn}
        />
        <Text style={styles.bottomHint}>TAP TO RECORD</Text>
        <Text style={styles.bottomSub}>{LEAP_BOTTOM_TAGLINE}</Text>
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
});

