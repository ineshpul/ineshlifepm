import * as React from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthHero } from '../components/AuthHero';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { requireLoginEmailOtp } from '../config/requireLoginEmailOtp';
import { isFirebaseConfigured } from '../firebase/firebase';
import { sendLoginOtpEmail, verifyLoginOtpCode } from '../services/loginOtp';
import { colors } from '../theme/colors';
import { useAuth, type EmailPasswordSignInResult } from '../state/auth';
import { friendlySignInError } from '../utils/authErrors';
import { isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from '../utils/authValidation';

export function SignInScreen() {
  const nav = useNavigation<any>();
  const { signInWithEmailPassword } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<'credentials' | 'otp'>('credentials');
  const [otpId, setOtpId] = React.useState('');
  const [otpCode, setOtpCode] = React.useState('');
  const passwordRef = React.useRef('');

  const otpEnabled = requireLoginEmailOtp() && isFirebaseConfigured();

  /** If OTP was turned off (or extra was stale), leave the code step so email/password works. */
  React.useEffect(() => {
    if (otpEnabled) return;
    setStep('credentials');
    setOtpId('');
    setOtpCode('');
    passwordRef.current = '';
  }, [otpEnabled]);

  /** If Firebase never settles, `busy` must not stay true forever (grey disabled Continue). */
  React.useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => {
      setBusy(false);
      Alert.alert(
        'Sign-in is slow',
        'The request is taking a long time. Check your connection, then tap Continue again.'
      );
    }, 55_000);
    return () => clearTimeout(t);
  }, [busy]);

  const emailOk = isValidEmail(email);
  const pwOk = isValidPassword(password);
  const otpDigits = otpCode.replace(/\s/g, '');

  const finishEmailSignIn = async () => {
    const pw = passwordRef.current || password;
    let res: EmailPasswordSignInResult;
    try {
      res = await signInWithEmailPassword({ email: email.trim(), password: pw });
    } catch (e: unknown) {
      Alert.alert('Sign-in error', e instanceof Error ? e.message : 'Unknown error');
      return;
    }
    if (!res.ok) {
      if (res.reason === 'invalid_credential') {
        Alert.alert(
          'Sign in failed',
          'Wrong email or password. Double-check your password, or create an account if you have not signed up yet.'
        );
      } else {
        Alert.alert('Sign in failed', res.message);
      }
      return;
    }
    setStep('credentials');
    setOtpId('');
    setOtpCode('');
    passwordRef.current = '';
  };

  const onContinue = async () => {
    if (busy) return;
    if (!emailOk) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return;
    }
    if (!pwOk) {
      Alert.alert('Check your password', `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      if (requireLoginEmailOtp() && !isFirebaseConfigured()) {
        Alert.alert(
          'Sign-in',
          'Email verification is enabled but Firebase is not configured. Add expo.extra.firebase or turn off requireLoginEmailOtp.'
        );
        return;
      }
      if (otpEnabled) {
        const { otpId: id } = await sendLoginOtpEmail(email.trim());
        passwordRef.current = password;
        setOtpId(id);
        setOtpCode('');
        setStep('otp');
        return;
      }
      await finishEmailSignIn();
    } catch (e: unknown) {
      Alert.alert('Could not continue', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyOtp = async () => {
    if (busy) return;
    if (!otpId || otpDigits.length !== 6) {
      Alert.alert('Enter the code', 'Enter the 6-digit code we emailed you, then try again.');
      return;
    }
    setBusy(true);
    try {
      await verifyLoginOtpCode(otpId, otpDigits);
      await finishEmailSignIn();
    } catch (e: unknown) {
      Alert.alert('Verification failed', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  const onResendOtp = async () => {
    if (!emailOk || busy) return;
    setBusy(true);
    try {
      const { otpId: id } = await sendLoginOtpEmail(email.trim());
      setOtpId(id);
      setOtpCode('');
      Alert.alert(
        'Code sent',
        'Check your inbox for a new 6-digit code. If it does not arrive, look in spam or junk.'
      );
    } catch (e: unknown) {
      Alert.alert('Could not resend', friendlySignInError(e));
    } finally {
      setBusy(false);
    }
  };

  const onBackFromOtp = () => {
    setStep('credentials');
    setOtpId('');
    setOtpCode('');
    passwordRef.current = '';
  };

  // Apple sign-in removed for now (email/password only).

  return (
    <KeyboardScreen contentContainerStyle={styles.screen}>
      <AuthHero />

      <View style={styles.form}>
        {step === 'otp' ? (
          <Text style={styles.rules}>
            We sent a 6-digit code to <Text style={styles.emailEmph}>{email.trim()}</Text>. Enter it
            below, then sign in. If you do not see it, check spam or junk. Codes expire in 10 minutes.
          </Text>
        ) : (
          <Text style={styles.rules}>
            Use a valid email address. Password must be at least {PASSWORD_MIN_LENGTH} characters.
          </Text>
        )}

        {step === 'credentials' ? (
          <>
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
              <Text style={styles.error}>
                Password must be at least {PASSWORD_MIN_LENGTH} characters.
              </Text>
            ) : null}

            {isFirebaseConfigured() ? (
              <TouchableOpacity
                onPress={() =>
                  nav.navigate('ForgotPassword', email.trim() ? { email: email.trim() } : {})
                }
                style={styles.forgotLink}
                disabled={busy}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}

            <PrimaryButton
              title={busy ? 'PLEASE WAIT' : 'CONTINUE'}
              onPress={() => void onContinue()}
              disabled={busy}
              variant="black"
              style={styles.cta}
            />
          </>
        ) : (
          <>
            <TextField
              label="6-DIGIT CODE"
              inputProps={{
                placeholder: '000000',
                keyboardType: 'number-pad',
                maxLength: 6,
                value: otpCode,
                onChangeText: (t) => setOtpCode(t.replace(/[^\d]/g, '')),
                returnKeyType: 'done',
              }}
            />

            <PrimaryButton
              title={busy ? 'PLEASE WAIT' : 'VERIFY & SIGN IN'}
              onPress={() => void onVerifyOtp()}
              disabled={busy}
              variant="black"
              style={styles.cta}
            />

            <TouchableOpacity onPress={() => void onResendOtp()} disabled={busy} style={styles.linkBtn}>
              <Text style={[styles.linkText, busy && styles.linkDisabled]}>Resend code</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onBackFromOtp} disabled={busy} style={styles.linkBtn}>
              <Text style={[styles.linkText, busy && styles.linkDisabled]}>Change email or password</Text>
            </TouchableOpacity>
          </>
        )}

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
  emailEmph: {
    color: colors.text,
    fontWeight: '800',
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
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.moss,
  },
  linkDisabled: { opacity: 0.45 },
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
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -4,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.moss,
  },
});
