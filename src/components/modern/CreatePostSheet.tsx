import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';
import { LeapSuggestionBlock } from '../LeapSuggestionBlock';
import { ModernActionRow } from './ModernActionRow';
import { formatCountdownHMS } from './ModernPromptEyebrow';
import { getPlayerFacingChallenge, useTodayChallenge } from '../../state/challenge';
import {
  navigateToBestPartCapture,
  navigateToRecord,
} from '../../navigation/navigationHelpers';
import { showInfo } from '../../utils/ui';

type SheetStep = 'menu' | 'suggest';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Today's suggest card jumps straight to the composer. */
  initialStep?: SheetStep;
};

/**
 * "+ tapped" sheet from mockup 06 — Today's Leap, Best Part Of Your Day, Suggest tomorrow's
 * leap. Every action routes through the existing screens/services; nothing here is stubbed.
 */
export function CreatePostSheet({ visible, onClose, initialStep = 'menu' }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {visible ? <CreatePostSheetBody onClose={onClose} initialStep={initialStep} /> : null}
    </Modal>
  );
}

function CreatePostSheetBody({
  onClose,
  initialStep,
}: {
  onClose: () => void;
  initialStep: SheetStep;
}) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { challenge, window } = useTodayChallenge();
  const facing = getPlayerFacingChallenge(challenge, window);
  const [step, setStep] = React.useState<SheetStep>(initialStep);

  const styles = useThemedStyles((c) => ({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end' as const,
      backgroundColor: c.overlay,
    },
    keyboardHost: {
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Math.max(insets.bottom, 16) + 14,
      gap: 10,
    },
    handle: {
      alignSelf: 'center' as const,
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.switchTrackOff,
      marginBottom: 10,
    },
    titleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingHorizontal: 4,
      paddingBottom: 6,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.displayExtraBold,
      fontSize: 25,
      lineHeight: 30,
      color: c.text,
      letterSpacing: -1,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    suggestNote: {
      marginTop: 2,
      paddingHorizontal: 4,
      fontFamily: typography.bodySemiBold,
      fontSize: 12,
      lineHeight: 17,
      color: c.muted,
    },
    leapTile: { backgroundColor: c.green },
    bestTile: { backgroundColor: 'rgba(255, 91, 57, 0.10)' },
    suggestTile: {
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border2,
    },
    cancel: {
      marginTop: 6,
      height: 52,
      borderRadius: 20,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    cancelText: {
      fontFamily: typography.bodyBold,
      fontSize: 16,
      color: c.muted,
    },
  }));

  /** Let the sheet dismiss before the camera / capture screen pushes. */
  const closeThen = React.useCallback(
    (run: () => void) => {
      onClose();
      requestAnimationFrame(run);
    },
    [onClose]
  );

  const leapSubtitle = window.isLive
    ? `${facing.title} · ${formatCountdownHMS(window.msUntilExpire)} left`
    : `Opens at noon ET · in ${formatCountdownHMS(window.msUntilDrop)}`;

  return (
    <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
      <KeyboardAvoidingView
        style={styles.keyboardHost}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          {step === 'menu' ? (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>What are you posting?</Text>
              </View>

              <ModernActionRow
                title="Today's Leap"
                subtitle={leapSubtitle}
                leading={<Ionicons name="videocam" size={22} color={colors.white} />}
                leadingStyle={styles.leapTile}
                chevronColor={colors.text}
                onPress={() => {
                  if (!facing.canRecord) {
                    showInfo(
                      'Not yet',
                      'Today’s leap drops at 12:00 PM Eastern. The prompt stays hidden until then.'
                    );
                    return;
                  }
                  closeThen(() => navigateToRecord(nav));
                }}
              />

              <ModernActionRow
                title="Best Part Of Your Day"
                subtitle="Post any moment · no prompt"
                leading={<Ionicons name="star" size={20} color={colors.coral} />}
                leadingStyle={styles.bestTile}
                chevronColor={colors.coral}
                onPress={() => closeThen(() => navigateToBestPartCapture(nav))}
              />

              <ModernActionRow
                title="Suggest tomorrow's leap"
                subtitle="Send an idea to the Leap team"
                leading={<Ionicons name="bulb-outline" size={21} color={colors.green} />}
                leadingStyle={styles.suggestTile}
                onPress={() => setStep('suggest')}
              />
            </>
          ) : (
            <>
              <View style={styles.titleRow}>
                <Pressable
                  onPress={() => setStep('menu')}
                  style={styles.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Back to post options"
                >
                  <Ionicons name="chevron-back" size={19} color={colors.text} />
                </Pressable>
                <Text style={styles.title}>Suggest tomorrow&apos;s leap</Text>
              </View>
              <LeapSuggestionBlock />
              <Text style={styles.suggestNote}>
                Ideas go to the Leap team for an upcoming daily leap.
              </Text>
            </>
          )}

          <Pressable
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Pressable>
  );
}
