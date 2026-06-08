import * as React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import type { ReplyTargetPayload } from './EngagementCommentRow';

type Props = {
  draft: string;
  onChangeText: (t: string) => void;
  replyTarget: ReplyTargetPayload | null;
  onClearReply: () => void;
  sending: boolean;
  onSend: () => void;
  forModal: boolean;
  reelLayout: boolean;
  onComposerFocus?: () => void;
};

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 128;

export const EngagementCommentComposer = React.memo(function EngagementCommentComposer({
  draft,
  onChangeText,
  replyTarget,
  onClearReply,
  sending,
  onSend,
  forModal,
  reelLayout,
  onComposerFocus,
}: Props) {
  const inputRef = React.useRef<TextInput>(null);
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);

  React.useEffect(() => {
    if (!draft.trim()) setInputHeight(MIN_INPUT_HEIGHT);
  }, [draft]);

  React.useEffect(() => {
    if (!replyTarget) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [replyTarget]);

  return (
    <View
      style={[
        styles.compose,
        reelLayout && !forModal && styles.composeReel,
        forModal && styles.composeModal,
      ]}
    >
      {replyTarget ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarTxt} numberOfLines={1}>
            Replying to @{replyTarget.username}
          </Text>
          <TouchableOpacity onPress={onClearReply} hitSlop={10} accessibilityLabel="Cancel reply">
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.composeRow}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={onChangeText}
          placeholder={replyTarget ? `Reply to @${replyTarget.username}…` : 'Add a comment…'}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            forModal && styles.inputModal,
            { height: Math.max(MIN_INPUT_HEIGHT, inputHeight) },
          ]}
          editable={!sending}
          maxLength={500}
          multiline
          scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
          textAlignVertical="top"
          onContentSizeChange={(e) => {
            const next = Math.min(
              MAX_INPUT_HEIGHT,
              Math.max(MIN_INPUT_HEIGHT, e.nativeEvent.contentSize.height + (Platform.OS === 'ios' ? 20 : 16))
            );
            setInputHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
          }}
          onFocus={() => onComposerFocus?.()}
          autoCorrect
          spellCheck
          textContentType="none"
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            !draft.trim() && styles.sendBtnDisabled,
            pressed && draft.trim() && !sending && styles.sendBtnPressed,
          ]}
          hitSlop={10}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          onPress={() => {
            if (!draft.trim() || sending) return;
            onSend();
          }}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
        >
          {sending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.sendText}>Post</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  compose: {
    marginTop: 4,
    gap: 0,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  composeReel: {
    marginTop: 0,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  composeModal: {
    marginTop: 0,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border2,
    paddingBottom: 6,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.border2,
  },
  replyBarTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.moss,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    backgroundColor: colors.bg,
    maxHeight: MAX_INPUT_HEIGHT,
  },
  inputModal: {
    backgroundColor: colors.cardTint,
    borderColor: colors.border2,
  },
  sendBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: colors.moss,
    minWidth: 80,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.88,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: colors.white,
    fontWeight: '900',
    fontSize: 14,
  },
});
