import * as React from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useSettingsPreferences } from '../state/settingsPreferences';

export function MutedUsersScreen() {
  const { preferences, patch } = useSettingsPreferences();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
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
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    name: { fontSize: 16, fontWeight: '800', color: colors.text },
    unmute: { fontSize: 15, fontWeight: '800', color: colors.coral },
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
    modalWrap: { flex: 1, justifyContent: 'center', padding: 24 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    modalCard: {
      borderRadius: 20,
      padding: 20,
      backgroundColor: colors.card,
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
      backgroundColor: colors.inputBg,
    },
    cancelBtn: { alignItems: 'center', padding: 8 },
    cancelText: { fontWeight: '800', color: colors.muted },
  }));

  const [modalOpen, setModalOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const remove = (name: string) => {
    patch({
      mutedUsernames: preferences.mutedUsernames.filter((u) => u !== name),
    });
  };

  const confirmAdd = () => {
    const u = draft.trim().replace(/^@/, '');
    if (!u) return;
    if (preferences.mutedUsernames.includes(u)) {
      setModalOpen(false);
      setDraft('');
      return;
    }
    patch({ mutedUsernames: [...preferences.mutedUsernames, u] });
    setModalOpen(false);
    setDraft('');
  };

  return (
    <Screen style={styles.screen}>
      <Text style={styles.hint}>Muted accounts are hidden from your feed.</Text>
      <FlatList
        data={preferences.mutedUsernames}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No muted users.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>@{item}</Text>
            <TouchableOpacity onPress={() => remove(item)} hitSlop={12}>
              <Text style={styles.unmute}>Unmute</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <TouchableOpacity style={styles.addBtn} onPress={() => setModalOpen(true)}>
        <Text style={styles.addText}>Mute someone</Text>
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mute user</Text>
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
            <PrimaryButton title="Mute" variant="green" onPress={confirmAdd} />
            <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
