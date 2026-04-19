import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';

import { Brandmark } from '../components/Brandmark';
import { GoogleAuthPanel } from '../components/GoogleAuthPanel';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from '../utils/authValidation';

function googleOAuthReady() {
  const g = (Constants.expoConfig?.extra as { googleAuth?: Record<string, string> } | undefined)
    ?.googleAuth;
  return !!(g?.webClientId || g?.iosClientId || g?.androidClientId);
}

export function SignUpScreen() {
  const nav = useNavigation<any>();
  const { signUp, signInWithGoogleIdToken, signInWithApple, saveBiometricCredentials } = useAuth();

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
      if (Platform.OS !== 'web') {
        Alert.alert(
          'Face ID / fingerprint',
          'Save this sign-in so you can unlock Leap with biometrics next time?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Save',
              onPress: () =>
                void saveBiometricCredentials(email.trim(), password).catch(() => {}),
            },
          ]
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    setBusy(true);
    try {
      await signInWithApple();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <Brandmark size={88} />
        </View>
        <Text style={styles.tagline}>Stop overthinking.</Text>
      </View>

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

        {googleOAuthReady() ? (
          <GoogleAuthPanel disabled={busy} onIdToken={signInWithGoogleIdToken} />
        ) : (
          <Text style={styles.oauthHint}>
            Add Google OAuth client IDs under <Text style={styles.mono}>expo.extra.googleAuth</Text> in
            app.json to enable Google sign-in.
          </Text>
        )}

        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={[styles.appleBtn, busy && styles.disabled]}
            disabled={busy}
            onPress={() => void onApple()}
          >
            <Text style={styles.appleText}>Continue with Apple</Text>
          </TouchableOpacity>
        ) : null}

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
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
  },
  logoWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: {
    marginTop: 18,
    fontSize: 11,
    letterSpacing: 2.6,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.muted2,
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
  oauthHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 16,
  },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }) },
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
