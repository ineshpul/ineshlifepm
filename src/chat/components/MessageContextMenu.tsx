import * as React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { CHAT_REACTION_EMOJIS } from '../constants';

type Action = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickEmoji: (emoji: string) => void;
  actions: Action[];
};

export function MessageContextMenu({ visible, onClose, onPickEmoji, actions }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 24,
    },
    stack: { width: '100%' as const, maxWidth: 320, alignItems: 'center' as const, gap: 10 },
    emojiBar: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'center' as const,
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 28,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    emojiBtn: { paddingHorizontal: 6, paddingVertical: 4 },
    emoji: { fontSize: 30 },
    actionMenu: {
      width: '100%' as const,
      borderRadius: 14,
      overflow: 'hidden' as const,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    actionRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border2,
    },
    actionRowLast: { borderBottomWidth: 0 },
    actionLabel: { fontSize: 16, fontWeight: '700' as const, color: c.text, flex: 1 },
    actionLabelDanger: { color: c.danger },
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.stack} onPress={(e) => e.stopPropagation()}>
          <View style={styles.emojiBar}>
            {CHAT_REACTION_EMOJIS.map((em) => (
              <TouchableOpacity
                key={em}
                style={styles.emojiBtn}
                activeOpacity={0.65}
                onPress={() => onPickEmoji(em)}
                accessibilityLabel={`React with ${em}`}
              >
                <Text style={styles.emoji}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actionMenu}>
            {actions.map((a, i) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.actionRow, i === actions.length - 1 && styles.actionRowLast]}
                activeOpacity={0.7}
                onPress={() => {
                  a.onPress();
                  onClose();
                }}
              >
                <Ionicons
                  name={a.icon}
                  size={20}
                  color={a.destructive ? colors.danger : colors.text}
                />
                <Text style={[styles.actionLabel, a.destructive && styles.actionLabelDanger]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
