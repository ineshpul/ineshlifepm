import * as React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors } from '../../theme/colors';
import { PrimaryButton } from '../../components/PrimaryButton';

type Props = {
  visible: boolean;
  mode: 'block' | 'report';
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

export function BlockReportModal({ visible, mode, onClose, onConfirm }: Props) {
  const [reason, setReason] = React.useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.back}>
        <View style={styles.card}>
          <Text style={styles.title}>{mode === 'block' ? 'Block user?' : 'Report message'}</Text>
          <Text style={styles.sub}>
            {mode === 'block'
              ? 'They won’t be able to message you and you won’t see their DMs.'
              : 'Tell us briefly what’s wrong. Our moderation queue reviews reports.'}
          </Text>
          {mode === 'report' ? (
            <TextInput
              style={styles.input}
              placeholder="Reason"
              placeholderTextColor={colors.muted2}
              value={reason}
              onChangeText={setReason}
              multiline
            />
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <PrimaryButton
              title={mode === 'block' ? 'Block' : 'Submit'}
              variant="green"
              onPress={() => {
                onConfirm(reason.trim());
                setReason('');
                onClose();
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  card: {
    borderRadius: 18,
    backgroundColor: colors.white,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, fontWeight: '600', lineHeight: 20 },
  input: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    textAlignVertical: 'top',
    fontWeight: '600',
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancel: { justifyContent: 'center', paddingHorizontal: 12 },
  cancelTxt: { fontSize: 16, fontWeight: '800', color: colors.muted },
});
