import * as React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { colors } from '../theme/colors';

WebBrowser.maybeCompleteAuthSession();

type Extra = {
  googleAuth?: {
    webClientId?: string;
    iosClientId?: string;
    androidClientId?: string;
  };
};

export function GoogleAuthPanel({
  disabled,
  onIdToken,
}: {
  disabled?: boolean;
  onIdToken: (idToken: string) => Promise<void>;
}) {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  const g = extra.googleAuth;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: g?.webClientId,
    iosClientId: g?.iosClientId,
    androidClientId: g?.androidClientId,
  });

  React.useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken =
      'params' in response && response.params && typeof response.params.id_token === 'string'
        ? response.params.id_token
        : null;
    if (!idToken) return;
    void (async () => {
      try {
        await onIdToken(idToken);
      } catch (e: unknown) {
        Alert.alert('Google sign-in failed', e instanceof Error ? e.message : 'Unknown error');
      }
    })();
  }, [response, onIdToken]);

  return (
    <TouchableOpacity
      style={[styles.btn, disabled && styles.btnDisabled]}
      disabled={disabled || !request}
      onPress={() => void promptAsync()}
    >
      <Text style={styles.text}>Continue with Google</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  btnDisabled: { opacity: 0.45 },
  text: { fontSize: 14, fontWeight: '800', color: colors.text },
});
