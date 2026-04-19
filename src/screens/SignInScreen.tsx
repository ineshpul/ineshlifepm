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

export function SignInScreen() {
  const nav = useNavigation<any>();
  const {
    signIn,
    signInWithGoogleIdToken,
    signInWithApple,
    saveBiometricCredentials,
    tryBiometricSignIn,
    isBiometricSaved,
  } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [bioSaved, setBioSaved] = React.useState(false);

  React.useEffect(() => {
    void isBiometricSaved().then(setBioSaved);
  }, [isBiometricSaved]);

  const emailOk = isValidEmail(email);
  const pwOk = isValidPassword(password);
  const canSubmit = emailOk && pwOk && !busy;

  const onFaceId = async () => {
    setBusy(true);
    try {
      await tryBiometricSignIn();
    } catch (e: unknown) {
      Alert.alert('Could not sign in', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onContinue = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
      if (Platform.OS !== 'web') {
        Alert.alert(
          'Face ID / fingerprint',
          'Save this sign-in so you can unlock Leap with biometrics next time?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Save',
              onPress: () =>
                void saveBiometricCredentials(email.trim(), password).then(() =>
                  setBioSaved(true)
                ),
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

        {bioSaved ? (
          <TouchableOpacity
            style={[styles.bioBtn, busy && styles.bioBtnDisabled]}
            onPress={onFaceId}
            disabled={busy}
          >
            <Text style={styles.bioBtnText}>Use Face ID or fingerprint</Text>
          </TouchableOpacity>
        ) : null}

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
            style={[styles.appleBtn, busy && styles.bioBtnDisabled]}
            disabled={busy}
            onPress={() => void onApple()}
          >
            <Text style={styles.appleText}>Continue with Apple</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={() => nav.navigate('SignUp')} style={styles.bottomLink}>
          <Text style={styles.bottomText}>
            New here? <Text style={styles.bottomTextStrong}>Create account</Text>
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
  bioBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardTint,
  },
  bioBtnDisabled: { opacity: 0.5 },
  bioBtnText: { fontSize: 13, fontWeight: '900', color: colors.text },
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
