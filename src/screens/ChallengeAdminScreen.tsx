import * as React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  TASK_DURATION_OPTIONS,
  normalizeTaskDurationSeconds,
  type TaskDurationSeconds,
  useChallengeWindow,
} from '../state/challenge';
import { showError, showInfo } from '../utils/ui';

export function ChallengeAdminScreen() {
  const nav = useNavigation<any>();
  const win = useChallengeWindow();

  const [title, setTitle] = React.useState('');
  const [maxDurationSeconds, setMaxDurationSeconds] = React.useState<TaskDurationSeconds>(60);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFirebaseConfigured()) return;
      try {
        const snap = await getDoc(doc(firestore(), 'challenges', win.dateKey));
        if (cancelled || !snap.exists()) return;
        const data: any = snap.data();
        setTitle(String(data?.title ?? ''));
        setMaxDurationSeconds(normalizeTaskDurationSeconds(data?.maxDurationSeconds));
      } catch {
        // leave fields as-is
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [win.dateKey]);

  const onPublish = async () => {
    if (!isFirebaseConfigured()) {
      showError('Not configured', 'Firebase is not configured.');
      return;
    }
    if (!title.trim()) {
      showError('Missing title', 'Please enter a challenge title.');
      return;
    }
    setBusy(true);
    try {
      await setDoc(
        doc(firestore(), 'challenges', win.dateKey),
        {
          dateKey: win.dateKey,
          title: title.trim(),
          subtitle: deleteField(),
          maxDurationSeconds,
          updatedAt: serverTimestamp(),
          publishedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showInfo('Published', `Today’s leap updated for ${win.dateKey}.`);
      nav.goBack();
    } catch (e) {
      showError('Publish failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <Text style={styles.kicker}>ADMIN</Text>
      <Text style={styles.title}>Set today’s challenge</Text>
      <Text style={styles.meta}>Date key (NY): {win.dateKey}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>TITLE</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Prompt title" />
      </View>

      <Text style={styles.helper}>
        Only the title is editable for players. Instructions on Today are fixed (one take, post it fast) plus the time limit.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>MAX LENGTH (SECONDS)</Text>
        <View style={styles.durationRow}>
          {TASK_DURATION_OPTIONS.map((sec) => (
            <Pressable
              key={sec}
              onPress={() => setMaxDurationSeconds(sec)}
              style={[styles.durationChip, maxDurationSeconds === sec && styles.durationChipActive]}
            >
              <Text style={[styles.durationChipText, maxDurationSeconds === sec && styles.durationChipTextActive]}>
                {sec}s
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.durationHint}>Recording limit matches this length for everyone that day.</Text>
      </View>

      <PrimaryButton title={busy ? 'PUBLISHING…' : 'PUBLISH'} variant="green" onPress={onPublish} disabled={busy} />
      <PrimaryButton title="BACK" variant="outline" onPress={() => nav.goBack()} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: '900',
    color: colors.muted,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 6,
  },
  field: { gap: 8 },
  label: {
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '900',
    color: colors.muted2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: '#FAFBFC',
  },
  helper: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 17,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFBFC',
  },
  durationChipActive: {
    borderColor: colors.coral,
    backgroundColor: 'rgba(255, 107, 84, 0.1)',
  },
  durationChipText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.muted,
  },
  durationChipTextActive: {
    color: colors.coral,
  },
  durationHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
});
