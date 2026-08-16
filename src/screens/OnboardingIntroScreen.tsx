import * as React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brandmark } from '../components/Brandmark';
import { IntroLeapOnboardingStep } from '../components/IntroLeapOnboardingStep';
import { ob, onboardingColors as c, onboardingFontAssets } from '../components/onboarding/onboardingFonts';
import { getPlayerFacingChallenge, useTodayChallenge } from '../state/challenge';
import { useLiveCount } from '../state/live';
import { useAuth } from '../state/auth';

const SCREEN_COUNT = 6;
const SWIPE_THRESHOLD = 45;
const SNAP_MS = 460;

function formatHMS(ms: number) {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function liveBarFillWidth(count: number | null | undefined): `${number}%` {
  if (typeof count !== 'number' || count <= 0) return '62%';
  return `${Math.min(100, Math.max(14, 8 + count * 5))}%` as `${number}%`;
}

type FinishAction = { type: 'done' } | { type: 'record' };

type Props = {
  onFinish: (action: FinishAction) => void;
};

function OnboardingProgressBar({ index }: { index: number }) {
  const fills = React.useRef(
    Array.from({ length: SCREEN_COUNT }, () => new Animated.Value(0))
  ).current;

  React.useEffect(() => {
    fills.forEach((fill, k) => {
      Animated.timing(fill, {
        toValue: k <= index ? 1 : 0,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    });
  }, [fills, index]);

  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6 }}>
      {fills.map((fill, k) => (
        <View
          key={k}
          style={{ flex: 1, height: 2, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' }}
        >
          <Animated.View
            style={{
              height: '100%',
              width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: c.accent,
              borderRadius: 2,
            }}
          />
        </View>
      ))}
    </View>
  );
}

function OnboardingPrimaryButton({
  title,
  onPress,
  height = 54,
}: {
  title: string;
  onPress: () => void;
  height?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height,
        width: '100%',
        borderRadius: 14,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: height >= 56 ? 15 : 14,
          fontFamily: ob.jakarta.bold,
          letterSpacing: 0.2,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function BobbingLogo() {
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -11] });
  const rotate = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-1deg', '1deg', '-1deg'] });

  return (
    <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
      <Brandmark size={84} />
    </Animated.View>
  );
}

function LockIllustration() {
  const pop = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pop, { toValue: 0, duration: 1260, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: 540, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pop]);

  const shackleY = pop.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <View
      style={{
        width: 114,
        height: 114,
        borderRadius: 57,
        backgroundColor: c.meBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 46, height: 58 }}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 8,
            width: 30,
            height: 26,
            borderWidth: 5,
            borderColor: c.accent,
            borderBottomWidth: 0,
            borderTopLeftRadius: 15,
            borderTopRightRadius: 15,
            transform: [{ translateY: shackleY }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 46,
            height: 36,
            borderRadius: 9,
            backgroundColor: c.accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 13,
            alignSelf: 'center',
            left: 20,
            width: 6,
            height: 11,
            borderRadius: 3,
            backgroundColor: c.bg,
          }}
        />
      </View>
    </View>
  );
}

function RecordPulseButton() {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.35, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 66,
          height: 66,
          borderRadius: 33,
          borderWidth: 3,
          borderColor: '#fff',
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <View
        style={{
          width: 66,
          height: 66,
          borderRadius: 33,
          borderWidth: 3,
          borderColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: c.coral }} />
      </View>
    </View>
  );
}

function ScreenHero({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 34, paddingBottom: 26 }}>
      <BobbingLogo />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: ob.jakarta.extrabold,
            fontSize: 42,
            letterSpacing: -2,
            lineHeight: 42,
            color: c.text,
          }}
        >
          One leap.{'\n'}Every day.
        </Text>
        <Text
          style={{
            marginTop: 20,
            maxWidth: 244,
            fontFamily: ob.jakarta.medium,
            fontSize: 15,
            lineHeight: 24,
            color: c.muted,
          }}
        >
          A single shared challenge, every day. That's the whole app. Welcome to Leap.
        </Text>
      </View>
      <OnboardingPrimaryButton title="Take the leap" onPress={onNext} height={56} />
      <Text
        style={{
          marginTop: 14,
          fontFamily: ob.jakarta.bold,
          fontSize: 11,
          letterSpacing: 1.5,
          color: c.muted,
        }}
      >
        TAKETHELEAP.APP
      </Text>
    </View>
  );
}

function ScreenNoScrolling({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 34, paddingBottom: 26 }}>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 12,
          letterSpacing: 1,
          color: c.muted,
          marginBottom: 12,
        }}
      >
        No free scrolling
      </Text>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 34,
          letterSpacing: -1.4,
          lineHeight: 36,
          color: c.text,
        }}
      >
        No scrolling{'\n'}until you{'\n'}show up.
      </Text>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <LockIllustration />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          style={{
            maxWidth: 250,
            fontFamily: ob.jakarta.medium,
            fontSize: 16,
            lineHeight: 26,
            color: c.soft,
          }}
        >
          Take the leap, then see the community with you.
        </Text>
      </View>
      <OnboardingPrimaryButton title="Next" onPress={onNext} />
    </View>
  );
}

function ScreenRecord({ onNext }: { onNext: () => void }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 34, paddingBottom: 26 }}>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 12,
          letterSpacing: 1,
          color: c.muted,
          marginBottom: 12,
        }}
      >
        The take
      </Text>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 30,
          letterSpacing: -1,
          lineHeight: 32,
          color: c.text,
        }}
      >
        One take. No edits.
      </Text>
      <View
        style={{
          marginTop: 24,
          flex: 1,
          minHeight: 120,
          borderRadius: 18,
          backgroundColor: c.cam,
          borderWidth: 1,
          borderColor: c.line,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.coral }} />
          <Text style={{ fontFamily: ob.mono.regular, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>0:42</Text>
        </View>
        <RecordPulseButton />
      </View>
      <Text
        style={{
          marginTop: 22,
          fontFamily: ob.jakarta.medium,
          fontSize: 15,
          lineHeight: 24,
          color: c.soft,
        }}
      >
        Record it the moment you do it. What you film is what posts. No filters, no follower counts.
      </Text>
      <View style={{ marginTop: 22 }}>
        <OnboardingPrimaryButton title="Next" onPress={onNext} />
      </View>
    </View>
  );
}

function ScreenLeaperboard({ onNext }: { onNext: () => void }) {
  const rows: Array<{ rank: string; name: string; score: string; highlight?: boolean }> = [
    { rank: '1', name: 'Jordan M.', score: '42.0″' },
    { rank: '2', name: 'Priya K.', score: '39.5″' },
    { rank: '3', name: 'You', score: '38.0″', highlight: true },
  ];

  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 34, paddingBottom: 26 }}>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 12,
          letterSpacing: 1,
          color: c.muted,
          marginBottom: 12,
        }}
      >
        Consistency
      </Text>
      <Text
        style={{
          fontFamily: ob.jakarta.bold,
          fontSize: 30,
          letterSpacing: -1,
          lineHeight: 32,
          color: c.text,
        }}
      >
        Post every day.
      </Text>
      <View style={{ marginTop: 24 }}>
        {rows.map((row, i) => (
          <View
            key={row.rank}
            style={
              row.highlight
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    paddingVertical: 13,
                    paddingHorizontal: 12,
                    marginTop: 6,
                    marginHorizontal: -10,
                    borderRadius: 12,
                    backgroundColor: c.meBg,
                  }
                : {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    paddingVertical: 13,
                    paddingHorizontal: 2,
                    borderBottomWidth: i < 2 ? 1 : 0,
                    borderBottomColor: c.line,
                  }
            }
          >
            <Text
              style={{
                width: 16,
                fontFamily: ob.mono.regular,
                fontSize: 14,
                color: row.highlight ? c.accent : c.muted,
                fontWeight: row.highlight ? '500' : '400',
              }}
            >
              {row.rank}
            </Text>
            <Text
              style={{
                flex: 1,
                fontFamily: row.highlight ? ob.jakarta.extrabold : ob.jakarta.bold,
                fontSize: 15,
                color: c.text,
              }}
            >
              {row.name}
            </Text>
            <Text
              style={{
                fontFamily: ob.mono.medium,
                fontSize: 14,
                color: c.accent,
              }}
            >
              {row.score}
            </Text>
          </View>
        ))}
      </View>
      <Text
        style={{
          marginTop: 20,
          fontFamily: ob.jakarta.medium,
          fontSize: 14,
          lineHeight: 22,
          color: c.soft,
        }}
      >
        Show up daily and climb the Leaperboard. It rewards consistency, not followers, not clout.
      </Text>
      <View style={{ marginTop: 'auto', paddingTop: 16 }}>
        <OnboardingPrimaryButton title="Take the leap" onPress={onNext} />
      </View>
    </View>
  );
}

function ScreenTodayGlimpse({
  onRecord,
  onReplay,
}: {
  onRecord: () => void;
  onReplay: () => void;
}) {
  const { user } = useAuth();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
  const count = useLiveCount({ enabled: Boolean(user?.uid) });

  const challengeTitle =
    facing.title.trim() && facing.title !== "Loading today's leap…"
      ? facing.title
      : "Walk up to a stranger and act like you've already met";

  const postedLabel =
    typeof count === 'number' ? `${count} posted today` : '128 posted today';

  const countdown = formatHMS(window.msUntilExpire);
  const progressWidth = liveBarFillWidth(count);

  return (
    <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
          <Brandmark size={28} />
          <View>
            <Text style={{ fontFamily: ob.jakarta.extrabold, fontSize: 20, lineHeight: 20, color: c.text }}>
              Leap
            </Text>
            <Text
              style={{
                marginTop: 3,
                fontFamily: ob.jakarta.bold,
                fontSize: 10,
                letterSpacing: 2,
                color: c.muted,
              }}
            >
              TODAY
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            height: 32,
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 16,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.coral }} />
          <Text style={{ fontFamily: ob.mono.regular, fontSize: 12, color: c.text }}>{countdown}</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 22,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 20,
          padding: 20,
          backgroundColor: c.bg,
        }}
      >
        <Text
          style={{
            fontFamily: ob.jakarta.bold,
            fontSize: 10,
            letterSpacing: 1.4,
            color: c.accent,
          }}
        >
          TODAY'S LEAP
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontFamily: ob.jakarta.bold,
            fontSize: 26,
            letterSpacing: -0.6,
            lineHeight: 30,
            color: c.text,
          }}
        >
          {challengeTitle}
        </Text>
        <Text
          style={{
            marginTop: 16,
            fontFamily: ob.jakarta.semibold,
            fontSize: 12,
            color: c.muted,
          }}
        >
          {postedLabel}
        </Text>
        <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: progressWidth, backgroundColor: c.accent }} />
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'flex-end', gap: 10, paddingTop: 24 }}>
        <OnboardingPrimaryButton title="Record today's leap" onPress={onRecord} height={56} />
        <Pressable accessibilityRole="button" onPress={onReplay} style={{ paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ fontFamily: ob.jakarta.semibold, fontSize: 12, color: c.muted }}>↺ Replay intro</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OnboardingIntroScreen({ onFinish }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [fontsLoaded] = useFonts(onboardingFontAssets);
  const [index, setIndex] = React.useState(0);
  const offset = React.useRef(new Animated.Value(0)).current;
  const indexRef = React.useRef(0);
  const animatingRef = React.useRef(false);

  const snapToIndex = React.useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(SCREEN_COUNT - 1, nextIndex));
      indexRef.current = clamped;
      setIndex(clamped);
      animatingRef.current = true;
      const target = -clamped * width;
      Animated.timing(offset, {
        toValue: target,
        duration: SNAP_MS,
        easing: Easing.bezier(0.215, 0.61, 0.355, 1),
        useNativeDriver: true,
      }).start(() => {
        animatingRef.current = false;
      });
    },
    [offset, width]
  );

  const goNext = React.useCallback(() => {
    snapToIndex(indexRef.current + 1);
  }, [snapToIndex]);

  const goNextFromIntroLeap = React.useCallback(() => {
    snapToIndex(indexRef.current + 1);
  }, [snapToIndex]);

  const goReplay = React.useCallback(() => {
    snapToIndex(0);
  }, [snapToIndex]);

  const handleRecord = React.useCallback(() => {
    if (user?.uid) {
      onFinish({ type: 'record' });
    } else {
      onFinish({ type: 'done' });
    }
  }, [onFinish, user?.uid]);

  React.useEffect(() => {
    offset.setValue(-indexRef.current * width);
  }, [offset, width]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          !animatingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
        onPanResponderGrant: () => {
          offset.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
          const base = -indexRef.current * width;
          const next = base + g.dx;
          const min = -(SCREEN_COUNT - 1) * width;
          const clamped = Math.max(min, Math.min(0, next));
          offset.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          let next = indexRef.current;
          if (g.dx < -SWIPE_THRESHOLD) next += 1;
          else if (g.dx > SWIPE_THRESHOLD) next -= 1;
          snapToIndex(next);
        },
        onPanResponderTerminate: (_, g) => {
          let next = indexRef.current;
          if (g.dx < -SWIPE_THRESHOLD) next += 1;
          else if (g.dx > SWIPE_THRESHOLD) next -= 1;
          snapToIndex(next);
        },
      }),
    [offset, snapToIndex, width]
  );

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <OnboardingProgressBar index={index} />
      <View style={{ flex: 1, overflow: 'hidden' }} {...panResponder.panHandlers}>
        <Animated.View
          style={{
            flexDirection: 'row',
            height: '100%',
            width: width * SCREEN_COUNT,
            transform: [{ translateX: offset }],
          }}
        >
          <View style={{ width, height: '100%' }}>
            <ScreenHero onNext={goNext} />
          </View>
          <View style={{ width, height: '100%' }}>
            <ScreenNoScrolling onNext={goNext} />
          </View>
          <View style={{ width, height: '100%' }}>
            <ScreenRecord onNext={goNext} />
          </View>
          <View style={{ width, height: '100%' }}>
            <ScreenLeaperboard onNext={goNext} />
          </View>
          <View style={{ width, height: '100%' }}>
            <IntroLeapOnboardingStep onDone={goNextFromIntroLeap} />
          </View>
          <View style={{ width, height: '100%' }}>
            <ScreenTodayGlimpse onRecord={handleRecord} onReplay={goReplay} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

export type { FinishAction as OnboardingFinishAction };
