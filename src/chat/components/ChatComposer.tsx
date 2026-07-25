import * as React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ReplyRef } from '../types';

type Props = {
  draft: string;
  onChangeDraft: (text: string) => void;
  replyTo: ReplyRef | null;
  onClearReply: () => void;
  onSend: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  uploadBusy?: boolean;
  uploadProgress?: number;
  bottomPad: number;
};

export function ChatComposer({
  draft,
  onChangeDraft,
  replyTo,
  onClearReply,
  onSend,
  onPickImage,
  onPickVideo,
  onFocus,
  onBlur,
  uploadBusy,
  uploadProgress = 0,
  bottomPad,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    dock: {
      backgroundColor: c.card,
    },
    replyBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
      gap: 8,
    },
    replyBarTxt: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: c.muted },
    uploadBar: { padding: 8, backgroundColor: c.cardTint },
    uploadTxt: { fontWeight: '700' as const, color: c.text },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      paddingHorizontal: 10,
      paddingTop: 10,
      gap: 8,
      backgroundColor: c.card,
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 120,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border2,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: '500' as const,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.moss,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    sendBtnDisabled: {
      opacity: 0.45,
    },
    mediaBtn: {
      width: 36,
      height: 42,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  }));

  const canSend = draft.trim().length > 0 || Boolean(replyTo);

  return (
    <View style={styles.dock}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarTxt} numberOfLines={2}>
            Replying to: {replyTo.textSnippet}
          </Text>
          <TouchableOpacity onPress={onClearReply} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ) : null}
      {uploadBusy ? (
        <View style={styles.uploadBar}>
          <Text style={styles.uploadTxt}>Uploading… {uploadProgress}%</Text>
        </View>
      ) : null}
      <View style={[styles.row, { paddingBottom: Math.max(bottomPad, 10) }]}>
        <TouchableOpacity style={styles.mediaBtn} onPress={onPickImage} accessibilityLabel="Send photo">
          <Ionicons name="image-outline" size={24} color={colors.moss} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaBtn} onPress={onPickVideo} accessibilityLabel="Send video">
          <Ionicons name="videocam-outline" size={24} color={colors.moss} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor={colors.muted2}
          value={draft}
          onChangeText={onChangeDraft}
          onFocus={onFocus}
          onBlur={onBlur}
          multiline
          scrollEnabled
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityLabel="Send message"
        >
          <Ionicons name="send" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
