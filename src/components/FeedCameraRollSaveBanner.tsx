import * as React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { ChallengeWatermarkInfo } from '../services/challengeWatermarkCapture';
import { cleanupStagedCameraRollFile, saveVideoToCameraRoll } from '../services/saveVideoToCameraRoll';
import { showError, showInfo } from '../utils/ui';

type Props = {
  clipUri: string;
  challenge: ChallengeWatermarkInfo;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
};

export function FeedCameraRollSaveBanner({ clipUri, challenge, onDismiss, style }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginHorizontal: 12,
      marginBottom: 8,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1, gap: 4 },
    title: { fontSize: 14, fontWeight: '900', color: colors.text },
    sub: { fontSize: 12, fontWeight: '600', color: colors.muted, lineHeight: 17 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    saveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.moss,
      minWidth: 64,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 13, fontWeight: '900', color: colors.white },
    notNowBtn: { paddingVertical: 8, paddingHorizontal: 4 },
    notNowText: { fontSize: 13, fontWeight: '800', color: colors.muted },
    btnDisabled: { opacity: 0.65 },
    closeBtn: { padding: 2 },
  }));

  const [busy, setBusy] = React.useState(false);

  const dismissAndCleanup = () => {
    void cleanupStagedCameraRollFile(clipUri);
    onDismiss();
  };

  const onSave = () => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await saveVideoToCameraRoll(clipUri, challenge);
        showInfo('Saved', 'Saved to camera roll.');
        dismissAndCleanup();
      } catch (e) {
        showError('Could not save', e);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="images-outline" size={20} color={colors.moss} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Save to camera roll?</Text>
        <Text style={styles.sub}>
          {challenge.variant === 'bestPart'
            ? 'Includes the Leap logo, date, and @username as a watermark.'
            : "Includes today's leap as a watermark."}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onSave}
            disabled={busy}
            style={[styles.saveBtn, busy && styles.btnDisabled]}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={dismissAndCleanup}
            disabled={busy}
            style={styles.notNowBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={dismissAndCleanup}
        disabled={busy}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}
