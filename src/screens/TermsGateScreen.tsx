import * as React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { LEGAL_DOCS } from '../content/settingsLegal';
import { useAuth } from '../state/auth';
import { acceptTerms } from '../state/termsAcceptance';
import { showError } from '../utils/ui';

export function TermsGateScreen() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const onAccept = async () => {
    if (!user?.uid) return;
    setBusy(true);
    try {
      await acceptTerms(user.uid);
    } catch (e) {
      showError('Could not save acceptance', e);
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    Alert.alert('Decline Terms?', 'You must accept the Terms to use Leap.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

  return (
    <Screen style={styles.screen} dismissKeyboardOnTap>
      <View style={styles.header}>
        <Text style={styles.title}>Terms of use</Text>
        <Text style={styles.sub}>
          Before you can view or post content, you must accept the Terms and Community Guidelines.
        </Text>
      </View>

      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.h}>Terms</Text>
          <Text style={styles.p}>{LEGAL_DOCS.terms.body}</Text>
          <View style={styles.div} />
          <Text style={styles.h}>Community guidelines</Text>
          <Text style={styles.p}>{LEGAL_DOCS.community.body}</Text>
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title={busy ? 'Saving…' : 'I agree'} variant="green" onPress={onAccept} disabled={busy} />
        <TouchableOpacity onPress={() => void onDecline()} disabled={busy} accessibilityRole="button">
          <Text style={styles.decline}>Decline</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  header: { gap: 6 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.muted },
  card: {
    marginTop: 12,
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  body: { padding: 14, paddingBottom: 18 },
  h: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 8 },
  p: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text },
  div: { height: 1, backgroundColor: colors.border2, marginVertical: 14 },
  footer: { paddingTop: 12, gap: 10, alignItems: 'center' },
  decline: { fontSize: 14, fontWeight: '800', color: colors.muted },
});

