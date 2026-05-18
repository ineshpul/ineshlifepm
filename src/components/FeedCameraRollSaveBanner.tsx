import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { saveVideoToCameraRoll } from '../services/saveVideoToCameraRoll';
import { showError, showInfo } from '../utils/ui';

type Props = {
  clipUri: string;
  onDismiss: () => void;
};

export function FeedCameraRollSaveBanner({ clipUri, onDismiss }: Props) {
  const [busy, setBusy] = React.useState(false);

  const onSave = () => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await saveVideoToCameraRoll(clipUri);
        showInfo('Saved', 'Saved to camera roll.');
        onDismiss();
      } catch (e) {
        showError('Could not save', e);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name="images-outline" size={20} color={colors.moss} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Save to camera roll?</Text>
        <Text style={styles.sub}>Save this post to your camera roll?</Text>
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
            onPress={onDismiss}
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
        onPress={onDismiss}
        disabled={busy}
        style={styles.closeBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color={colors.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
});
