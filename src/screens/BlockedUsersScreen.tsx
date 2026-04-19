import * as React from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useSettingsPreferences } from '../state/settingsPreferences';

export function BlockedUsersScreen() {
  const { preferences, patch } = useSettingsPreferences();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const remove = (name: string) => {
    patch({
      blockedUsernames: preferences.blockedUsernames.filter((u) => u !== name),
    });
  };

  const confirmAdd = () => {
    const u = draft.trim().replace(/^@/, '');
    if (!u) return;
    if (preferences.blockedUsernames.includes(u)) {
      setModalOpen(false);
      setDraft('');
      return;
    }
    patch({ blockedUsernames: [...preferences.blockedUsernames, u] });
    setModalOpen(false);
    setDraft('');
  };

  return (
    <Screen style={styles.screen}>
      <Text style={styles.hint}>Blocked accounts won&apos;t appear in your feed.</Text>
      <FlatList
        data={preferences.blockedUsernames}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No blocked users.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>@{item}</Text>
            <TouchableOpacity onPress={() => remove(item)} hitSlop={12}>
              <Text style={styles.unblock}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
        <Text style={styles.addText}>Block someone</Text>
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setModalOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Block user</Text>
            <Text style={styles.modalSub}>Enter the exact username (no @).</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="username"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <PrimaryButton title="Block" variant="green" onPress={confirmAdd} />
            <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  hint: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  list: { paddingBottom: 100, gap: 8 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 24, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  unblock: { fontSize: 15, fontWeight: '800', color: colors.coral },
  addBtn: {
    position: 'absolute',
    bottom: 28,
    left: 16,
    right: 16,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.moss,
    alignItems: 'center',
  },
  addText: { color: colors.white, fontWeight: '900', fontSize: 15 },
  modalRoot: { flex: 1, justifyContent: 'center' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCenter: { paddingHorizontal: 24, zIndex: 1 },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  modalSub: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cancelBtn: { alignItems: 'center', padding: 8 },
  cancelText: { fontWeight: '800', color: colors.muted },
});
