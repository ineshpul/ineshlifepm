import * as React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brandmark } from './Brandmark';
import { useThemedStyles } from '../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

const AUTO_DISMISS_MS = 2200;

function CelebrationMark() {
  const pop = React.useRef(new Animated.Value(0)).current;
  const bob = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const popLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pop, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    popLoop.start();
    bobLoop.start();
    return () => {
      popLoop.stop();
      bobLoop.stop();
    };
  }, [pop, bob]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
      <Brandmark size={88} />
    </Animated.View>
  );
}

/** First-ever post: celebrated transition from Tier 1 teaser into the full feed. */
export function FeedGraduationMoment({ visible, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const backdrop = React.useRef(new Animated.Value(0)).current;
  const content = React.useRef(new Animated.Value(0)).current;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useThemedStyles((c) => ({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingTop: insets.top + 12,
      paddingBottom: insets.bottom + 12,
    },
    card: {
      width: '100%',
      maxWidth: 320,
      borderRadius: 22,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      paddingVertical: 28,
      paddingHorizontal: 22,
      alignItems: 'center',
      gap: 10,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.4,
      color: c.moss,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 28,
      fontWeight: '900',
      color: c.text,
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    body: {
      fontSize: 15,
      fontWeight: '600',
      color: c.muted,
      textAlign: 'center',
      lineHeight: 22,
      marginTop: 2,
    },
    hint: {
      fontSize: 12,
      fontWeight: '600',
      color: c.muted2,
      marginTop: 8,
    },
  }));

  const dismiss = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDismiss();
  }, [onDismiss]);

  React.useEffect(() => {
    if (!visible) {
      backdrop.setValue(0);
      content.setValue(0);
      return;
    }

    let reduceMotion = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotion = v;
      if (reduceMotion) {
        backdrop.setValue(1);
        content.setValue(1);
      } else {
        Animated.parallel([
          Animated.timing(backdrop, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.spring(content, {
            toValue: 1,
            friction: 7,
            tension: 80,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });

    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, backdrop, content, dismiss]);

  const contentScale = content.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const contentOpacity = content;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <Pressable style={{ flex: 1 }} onPress={dismiss} accessibilityRole="button">
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Animated.View
            style={[styles.card, { opacity: contentOpacity, transform: [{ scale: contentScale }] }]}
          >
            <CelebrationMark />
            <Text style={styles.kicker}>First leap</Text>
            <Text style={styles.title}>You&apos;re in</Text>
            <Text style={styles.body}>
              The feed is yours. Post today&apos;s Leap to unlock what&apos;s ahead.
            </Text>
            <Text style={styles.hint}>Tap anywhere to continue</Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
