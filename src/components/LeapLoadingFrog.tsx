import * as React from 'react';
import { Animated, Dimensions, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

const FROG_W = 52;

function FrogArt({ dark, styles }: { dark?: boolean; styles: ReturnType<typeof useFrogStyles> }) {
  const { colors } = useTheme();
  // Classic Material greens — independent of the modern forest `moss` token.
  const body = dark ? '#5AD98A' : '#4CAF50';
  const belly = dark ? '#A7F3D0' : '#DCEDC8';
  const eyeWhite = colors.white;
  return (
    <View style={styles.frogRoot} accessibilityLabel="Loading frog">
      <View style={[styles.body, { backgroundColor: body }]}>
        <View style={[styles.belly, { backgroundColor: belly }]} />
        <View style={styles.eyes}>
          <View style={[styles.eye, { backgroundColor: eyeWhite }]}>
            <View style={styles.pupil} />
          </View>
          <View style={[styles.eye, { backgroundColor: eyeWhite }]}>
            <View style={styles.pupil} />
          </View>
        </View>
      </View>
      <View style={styles.legs}>
        <View style={[styles.leg, { backgroundColor: body }]} />
        <View style={[styles.leg, { backgroundColor: body }]} />
      </View>
    </View>
  );
}

function useFrogStyles() {
  return useThemedStyles((colors) => ({
    track: {
      marginTop: 14,
      height: 56,
      width: '100%',
      overflow: 'hidden',
      borderRadius: 14,
      backgroundColor: 'rgba(76, 175, 80, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    trackDark: {
      backgroundColor: 'rgba(90, 217, 138, 0.12)',
      borderColor: 'rgba(90, 217, 138, 0.25)',
    },
    wrap: {
      position: 'absolute',
      left: 0,
      bottom: 6,
    },
    frogRoot: {
      width: FROG_W,
      alignItems: 'center',
    },
    body: {
      width: 46,
      height: 34,
      borderRadius: 18,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    belly: {
      position: 'absolute',
      width: 22,
      height: 16,
      borderRadius: 10,
      bottom: 4,
      opacity: 0.55,
    },
    eyes: {
      flexDirection: 'row',
      gap: 10,
      marginTop: -4,
    },
    eye: {
      width: 14,
      height: 14,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pupil: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.text,
    },
    legs: {
      flexDirection: 'row',
      gap: 18,
      marginTop: -2,
    },
    leg: {
      width: 10,
      height: 8,
      borderBottomLeftRadius: 6,
      borderBottomRightRadius: 6,
    },
  }));
}

/**
 * Cartoon frog that hops across while today's leap is still "loading" (before noon Eastern).
 */
export function LeapLoadingFrog({ active, dark }: { active: boolean; dark?: boolean }) {
  const styles = useFrogStyles();
  const x = React.useRef(new Animated.Value(-FROG_W)).current;
  const y = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!active) {
      x.stopAnimation();
      y.stopAnimation();
      return;
    }
    const screenW = Dimensions.get('window').width;
    const endX = screenW + FROG_W;
    x.setValue(-FROG_W);
    y.setValue(0);

    const moveX = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: endX,
          duration: 5200,
          useNativeDriver: true,
        }),
        Animated.timing(x, { toValue: -FROG_W, duration: 0, useNativeDriver: true }),
      ])
    );

    const hop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -16, duration: 160, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(y, { toValue: -16, duration: 160, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.delay(120),
      ])
    );

    moveX.start();
    hop.start();
    return () => {
      moveX.stop();
      hop.stop();
    };
  }, [active, x, y]);

  if (!active) return null;

  return (
    <View style={[styles.track, dark ? styles.trackDark : null]} pointerEvents="none">
      <Animated.View style={[styles.wrap, { transform: [{ translateX: x }, { translateY: y }] }]}>
        <FrogArt dark={dark} styles={styles} />
      </Animated.View>
    </View>
  );
}
