import * as React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { AuthHero } from '../components/AuthHero';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { PrimaryButton } from '../components/PrimaryButton';
import { TextField } from '../components/TextField';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { friendlySignInError } from '../utils/authErrors';
import { isValidEmail, isValidPassword, PASSWORD_MIN_LENGTH } from '../utils/authValidation';
import { resolveReferrerUsername } from '../services/referral';

export function SignUpScreen() {
  const nav = useNavigation<any>();
  const { signUp } = useAuth();

  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [invitedBy, setInvitedBy] = React.useState('');
  const [inviteStatus, setInviteStatus] = React.useState<'idle' | 'checking' | 'found' | 'missing'>(
    'idle'
  );
  const [busy, setBusy] = React.useState(false);

  const emailOk = isValidEmail(email);
  const pwOk = isValidPassword(password);
  const canSubmit = username.trim().length > 0 && emailOk && pwOk && !busy;

  const checkInvite = React.useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setInviteStatus('idle');
      return;
    }
    setInviteStatus('checking');
    try {
      const res = await resolveReferrerUsername(trimmed);
      if (res.found) {
        setInviteStatus('found');
        if (res.username !== invitedBy.trim()) {
          setInvitedBy(res.username);
        }
      } else {
        setInviteStatus('missing');
      }
    } catch {
      setInviteStatus('missing');
    }
  }, [invitedBy]);

  const onContinue = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await signUp({
        username: username.trim(),
        email: email.trim(),
        password,
        invitedByUsername: inviteOpen && invitedBy.trim() ? invitedBy.trim() : undefined,
      });
      Alert.alert(
        'Check your email',
        'We sent a verification link. If you do not see it in a few minutes, check your spam or junk folder. You can use the app now; finish verifying when you are ready.'
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

        {!inviteOpen ? (
          <TouchableOpacity
            onPress={() => setInviteOpen(true)}
            style={styles.inviteToggle}
            activeOpacity={0.7}
          >
            <Text style={styles.inviteToggleText}>Got an invite? Add who invited you</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.inviteBlock}>
            <TextField
              label="INVITED BY (OPTIONAL)"
              inputProps={{
                placeholder: 'username',
                autoCapitalize: 'none',
                autoCorrect: false,
                value: invitedBy,
                onChangeText: (t) => {
                  setInvitedBy(t);
                  setInviteStatus('idle');
                },
                onBlur: () => void checkInvite(invitedBy),
                returnKeyType: 'done',
              }}
            />
            {inviteStatus === 'checking' ? (
              <Text style={styles.inviteHint}>Checking…</Text>
            ) : null}
            {inviteStatus === 'found' ? (
              <Text style={styles.inviteOk}>✓ {invitedBy.trim()} found</Text>
            ) : null}
            {inviteStatus === 'missing' && invitedBy.trim().length > 0 ? (
              <Text style={styles.error}>Could not find that username — you can still sign up.</Text>
            ) : null}
          </View>
        )}

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
  inviteToggle: {
    paddingVertical: 4,
  },
  inviteToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.moss,
  },
  inviteBlock: {
    gap: 6,
  },
  inviteHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginTop: -4,
  },
  inviteOk: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.moss,
    marginTop: -4,
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
