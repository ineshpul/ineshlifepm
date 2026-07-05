import * as React from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FunctionsError } from 'firebase/functions';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import { isFirebaseConfigured } from '../firebase/firebase';
import { submitChallengeSuggestion } from '../services/challengeSuggestion';
import { showInfo } from '../utils/ui';

export function LeapSuggestionBlock() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    block: { marginBottom: 0 },
    label: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      marginBottom: 8,
    },
    offline: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 96,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
      backgroundColor: colors.card,
      color: colors.text,
      textAlignVertical: 'top',
    },
    sendBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.moss,
    },
    sendBtnDisabled: {
      backgroundColor: '#C9D3C9',
    },
    sendBtnText: {
      fontSize: 14,
      fontWeight: '900',
      color: colors.white,
    },
  }));

  const { user, authReady } = useAuth();
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const canSend = Boolean(text.trim()) && !sending;

  const send = React.useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!isFirebaseConfigured() || !authReady || !user?.uid) {
      showInfo('Sign in required', 'Sign in to send a leap suggestion.');
      return;
    }
    setSending(true);
    try {
      await submitChallengeSuggestion(body);
      setText('');
      showInfo('Thanks!', 'Your idea was sent to the Leap team.');
    } catch (e: unknown) {
      let msg = 'Something went wrong. Try again.';
      if (e instanceof FunctionsError && e.code === 'functions/unauthenticated') {
        msg =
          'Your session did not reach the server yet. Wait a moment and try again, or sign out and back in.';
      } else if (e instanceof Error) {
        msg = e.message;
      }
      showInfo('Could not send', msg);
    } finally {
      setSending(false);
    }
  }, [authReady, sending, text, user?.uid]);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Suggest a leap</Text>
      {!isFirebaseConfigured() ? (
        <Text style={styles.offline}>Connect Firebase to send suggestions.</Text>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Share a leap idea…"
            placeholderTextColor={colors.muted2}
            value={text}
            onChangeText={setText}
            multiline
            autoCorrect
            autoCapitalize="sentences"
            maxLength={1200}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => void send()}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send leap suggestion"
          >
            {sending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
