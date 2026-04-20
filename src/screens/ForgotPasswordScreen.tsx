import * as React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import { AuthHero } from '../components/AuthHero';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { isFirebaseConfigured } from '../firebase/firebase';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { friendlySignInError } from '../utils/authErrors';
import { isValidEmail } from '../utils/authValidation';

export function ForgotPasswordScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { sendPasswordResetEmail } = useAuth();

  const initialEmail = typeof route.params?.email === 'string' ? route.params.email : '';
  const [email, setEmail] = React.useState(initialEmail);
  const [busy, setBusy] = React.useState(false);

  const emailOk = isValidEmail(email);

  const onSend = async () => {
    if (!emailOk) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return;
    }
    if (!isFirebaseConfigured()) {
      Alert.alert(
        'Reset unavailable',
        'Firebase is not configured in this build. Add expo.extra.firebase in app.json.'
      );
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(email.trim());
      Alert.alert(
        'Check your email',
        'If an account exists for that address, we sent a link to reset your password. Check spam folders too.',
        [{ text: 'OK', onPress: () => nav.navigate('SignIn') }]
      );
    } catch (e: unknown) {
      Alert.alert('Could not send reset', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen contentContainerStyle={styles.screen}>
      <AuthHero />

      <View style={styles.form}>
        <Text style={styles.rules}>
          Enter the email you used for Leap. We will send a link to choose a new password.
        </Text>

        <TextField
          label="EMAIL"
          inputProps={{
            placeholder: 'your@email.com',
            keyboardType: 'email-address',
            autoCapitalize: 'none',
            value: email,
            onChangeText: setEmail,
            returnKeyType: 'done',
          }}
        />
        {!emailOk && email.length > 0 ? (
          <Text style={styles.error}>Enter a valid email (example@domain.com).</Text>
        ) : null}

        <PrimaryButton
          title={busy ? 'PLEASE WAIT' : 'SEND RESET LINK'}
          onPress={() => void onSend()}
          disabled={busy}
          variant="black"
          style={styles.cta}
        />

        <TouchableOpacity onPress={() => nav.navigate('SignIn')} style={styles.bottomLink}>
          <Text style={styles.bottomText}>
            Remembered it? <Text style={styles.bottomTextStrong}>Back to sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  form: {
    gap: 14,
    paddingBottom: 18,
  },
  rules: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 17,
  },
  error: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.coral,
    marginTop: -6,
  },
  cta: {
    marginTop: 4,
  },
  bottomLink: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  bottomText: {
    fontSize: 13,
    color: colors.muted,
  },
  bottomTextStrong: {
    color: colors.text,
    fontWeight: '800',
  },
});
