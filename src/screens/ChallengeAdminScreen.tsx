import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  DEFAULT_MAX_RECORDING_ATTEMPTS,
  MAX_RECORDING_ATTEMPTS_CAP,
  MAX_TASK_DURATION_SECONDS,
  MIN_TASK_DURATION_SECONDS,
  TASK_DURATION_OPTIONS,
  normalizeMaxRecordingAttempts,
  normalizeTaskDurationSeconds,
  useChallengeWindow,
} from '../state/challenge';
import { showError, showInfo } from '../utils/ui';

const ATTEMPT_PRESETS = [1, 2, 3, 5, 10] as const;

export function ChallengeAdminScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const win = useChallengeWindow();

  const [title, setTitle] = React.useState('');
  const [durationInput, setDurationInput] = React.useState('60');
  const [attemptsInput, setAttemptsInput] = React.useState(String(DEFAULT_MAX_RECORDING_ATTEMPTS));
  const [busy, setBusy] = React.useState(false);

  const durationParsed = normalizeTaskDurationSeconds(durationInput);
  const attemptsParsed = normalizeMaxRecordingAttempts(attemptsInput);

  const applyDurationFromInput = React.useCallback(() => {
    const n = normalizeTaskDurationSeconds(durationInput);
    setDurationInput(String(n));
  }, [durationInput]);

  const applyAttemptsFromInput = React.useCallback(() => {
    const n = normalizeMaxRecordingAttempts(attemptsInput);
    setAttemptsInput(String(n));
  }, [attemptsInput]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isFirebaseConfigured()) return;
      try {
        const snap = await getDoc(doc(firestore(), 'challenges', win.dateKey));
        if (cancelled || !snap.exists()) return;
        const data: any = snap.data();
        setTitle(String(data?.title ?? ''));
        const d = normalizeTaskDurationSeconds(data?.maxDurationSeconds);
        setDurationInput(String(d));
        const a = normalizeMaxRecordingAttempts(data?.maxRecordingAttempts);
        setAttemptsInput(String(a));
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
    const duration = normalizeTaskDurationSeconds(durationInput);
    const attempts = normalizeMaxRecordingAttempts(attemptsInput);
    setDurationInput(String(duration));
    setAttemptsInput(String(attempts));

    setBusy(true);
    try {
      await setDoc(
        doc(firestore(), 'challenges', win.dateKey),
        {
          dateKey: win.dateKey,
          title: title.trim(),
          subtitle: deleteField(),
          maxDurationSeconds: duration,
          maxRecordingAttempts: attempts,
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
    <Screen style={styles.screenOuter} edges={['bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 12) + 24 },
        ]}
      >
        <Text style={styles.kicker}>ADMIN</Text>
        <Text style={styles.title}>Set today’s challenge</Text>
        <Text style={styles.meta}>Date key (NY): {win.dateKey}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>TITLE</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Prompt title" />
        </View>

        <Text style={styles.helper}>
          Players only see this title and length after 12:00 PM Eastern. Before noon they see “Today’s leap is loading…”;
          your edits here stay hidden until the drop.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>MAX LENGTH (SECONDS)</Text>
          <View style={styles.durationRow}>
            {TASK_DURATION_OPTIONS.map((sec) => (
              <Pressable
                key={sec}
                onPress={() => setDurationInput(String(sec))}
                style={[styles.durationChip, durationParsed === sec && styles.durationChipActive]}
              >
                <Text style={[styles.durationChipText, durationParsed === sec && styles.durationChipTextActive]}>
                  {sec}s
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.subLabel}>Custom ({MIN_TASK_DURATION_SECONDS}–{MAX_TASK_DURATION_SECONDS}s)</Text>
          <TextInput
            value={durationInput}
            onChangeText={setDurationInput}
            onBlur={applyDurationFromInput}
            keyboardType="number-pad"
            style={styles.input}
            placeholder={`${MIN_TASK_DURATION_SECONDS}–${MAX_TASK_DURATION_SECONDS}`}
          />
          <Text style={styles.durationHint}>Recording limit matches this length for everyone that day.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>RECORDING ATTEMPTS (PER DAY)</Text>
          <View style={styles.durationRow}>
            {ATTEMPT_PRESETS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setAttemptsInput(String(n))}
                style={[styles.durationChip, attemptsParsed === n && styles.durationChipActive]}
              >
                <Text style={[styles.durationChipText, attemptsParsed === n && styles.durationChipTextActive]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.subLabel}>Custom (1–{MAX_RECORDING_ATTEMPTS_CAP})</Text>
          <TextInput
            value={attemptsInput}
            onChangeText={setAttemptsInput}
            onBlur={applyAttemptsFromInput}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="3"
          />
          <Text style={styles.durationHint}>Each try counts when they start recording for the day’s leap.</Text>
        </View>

        <PrimaryButton title={busy ? 'PUBLISHING…' : 'PUBLISH'} variant="green" onPress={onPublish} disabled={busy} />
        <PrimaryButton title="BACK" variant="outline" onPress={() => nav.goBack()} style={{ marginTop: 12 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenOuter: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
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
  subLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
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
    flexWrap: 'wrap',
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
