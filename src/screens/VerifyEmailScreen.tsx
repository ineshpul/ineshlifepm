import * as React from 'react';
import { Alert, AppState, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemedStyles } from '../theme/ThemeProvider';
import { useAuth } from '../state/auth';
import { friendlySignInError } from '../utils/authErrors';

/**
 * Blocks the rest of the app until the password account’s email is verified.
 * (Banner-only UX let people use tabs while still unverified.)
 */
export function VerifyEmailScreen() {
  const { user, resendEmailVerification, refreshEmailVerification, signOut } = useAuth();
  const styles = useThemedStyles((colors) => ({
    screen: {
      paddingHorizontal: 20,
      justifyContent: 'center',
    },
    card: {
      padding: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 12,
    },
    title: { fontSize: 20, fontWeight: '900', color: colors.text },
    body: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.muted },
    emph: { color: colors.text, fontWeight: '800' },
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    btnDisabled: { opacity: 0.55 },
    btnText: { fontSize: 13, fontWeight: '900', color: colors.text },
    signOut: { marginTop: 8, borderRadius: 14 },
  }));
  const [busy, setBusy] = React.useState(false);
  const [resendCooldownSec, setResendCooldownSec] = React.useState(0);

  React.useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const t = setTimeout(() => setResendCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldownSec]);

  React.useEffect(() => {
    void refreshEmailVerification();
  }, [refreshEmailVerification]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshEmailVerification();
    });
    return () => sub.remove();
  }, [refreshEmailVerification]);

  const email = user?.email ?? '';

  const onResend = async () => {
    if (busy || resendCooldownSec > 0) return;
    setBusy(true);
    try {
      await resendEmailVerification();
      setResendCooldownSec(30);
      Alert.alert('Verification email sent', 'Check your inbox (and spam) for the latest email.');
    } catch (e) {
      Alert.alert('Could not resend', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      Alert.alert('Could not sign out', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  const onVerified = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await refreshEmailVerification();
      if (!ok) {
        Alert.alert(
          'Not verified yet',
          'We still do not see your email as verified. Open the latest verification email and tap the link again.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We sent a link to <Text style={styles.emph}>{email}</Text>. Tap it in your mail app, then return here and
          use “I’ve verified”.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, (busy || resendCooldownSec > 0) && styles.btnDisabled]}
            disabled={busy || resendCooldownSec > 0}
            onPress={() => void onResend()}
          >
            <Text style={styles.btnText}>
              {resendCooldownSec > 0 ? `Resend (${resendCooldownSec}s)` : 'Resend email'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={() => void onVerified()}>
            <Text style={styles.btnText}>I’ve verified</Text>
          </TouchableOpacity>
        </View>
        <PrimaryButton
          title="Sign out"
          variant="outline"
          onPress={() => void onSignOut()}
          disabled={busy}
          style={styles.signOut}
        />
      </View>
    </Screen>
  );
}
