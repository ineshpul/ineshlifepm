import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { AuthHero } from '../components/AuthHero';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { friendlySignInError } from '../utils/authErrors';
import { isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from '../utils/authValidation';

export function SignUpScreen() {
  const nav = useNavigation<any>();
  const { signUp } = useAuth();

  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const emailOk = isValidEmail(email);
  const pwOk = isValidPassword(password);
  const canSubmit = username.trim().length > 0 && emailOk && pwOk && !busy;

  const onContinue = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await signUp({ username: username.trim(), email: email.trim(), password });
      Alert.alert(
        'Check your email',
        'We sent a verification link. You can use the app now; finish verifying when you are ready.'
      );
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
      if (code === 'auth/email-already-in-use') {
        Alert.alert('Account exists', 'An account already exists for that email. Sign in instead.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => nav.navigate('SignIn') },
        ]);
      } else {
        Alert.alert('Sign up', friendlySignInError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  // Apple sign-in removed for now (email/password only).

  return (
    <KeyboardScreen contentContainerStyle={styles.screen}>
      <AuthHero />

      <View style={styles.form}>
        <Text style={styles.rules}>
          Use a valid email address. Password must be at least {PASSWORD_MIN_LENGTH} characters.
        </Text>

        <TextField
          label="USERNAME"
          inputProps={{
            placeholder: 'what should we call you?',
            value: username,
            onChangeText: setUsername,
            returnKeyType: 'next',
          }}
        />
        <TextField
          label="EMAIL"
          inputProps={{
            placeholder: 'your@email.com',
            keyboardType: 'email-address',
            autoCapitalize: 'none',
            value: email,
            onChangeText: setEmail,
            returnKeyType: 'next',
          }}
        />
        {!emailOk && email.length > 0 ? (
          <Text style={styles.error}>Enter a valid email (example@domain.com).</Text>
        ) : null}

        <TextField
          label="PASSWORD"
          inputProps={{
            placeholder: `at least ${PASSWORD_MIN_LENGTH} characters`,
            secureTextEntry: true,
            value: password,
            onChangeText: setPassword,
            returnKeyType: 'done',
          }}
        />
        {!pwOk && password.length > 0 ? (
          <Text style={styles.error}>Password must be at least {PASSWORD_MIN_LENGTH} characters.</Text>
        ) : null}

        <PrimaryButton
          title={busy ? 'PLEASE WAIT' : 'CONTINUE'}
          onPress={onContinue}
          disabled={!canSubmit}
          variant="black"
          style={styles.cta}
        />

        <TouchableOpacity onPress={() => nav.navigate('SignIn')} style={styles.bottomLink}>
          <Text style={styles.bottomText}>
            Already have an account? <Text style={styles.bottomTextStrong}>Sign in</Text>
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
  appleBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  appleText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  disabled: { opacity: 0.5 },
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
