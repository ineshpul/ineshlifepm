import * as React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { PrimaryButton } from './PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  count: number | null;
  loading?: boolean;
};

export function FeedSinceLastLeapBanner({ count, loading }: Props) {
  const nav = useNavigation<any>();
  const { colors } = useTheme();

  const styles = useThemedStyles((c) => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    lockBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: {
      flex: 1,
      gap: 8,
    },
    title: {
      fontSize: 14,
      fontWeight: '900',
      color: c.text,
      lineHeight: 19,
    },
    cta: {
      width: '100%',
      maxWidth: 200,
      borderRadius: 28,
      height: 44,
    },
  }));

  let body: string;
  if (loading) {
    body = 'Since your last leap, people are leaping. Post yours to see them.';
  } else if (count != null && count > 0) {
    const peopleLabel = count === 1 ? '1 person leaped' : `${count} people leaped`;
    body = `Since your last leap, ${peopleLabel}. Post yours to see them.`;
  } else {
    body = 'Since your last leap, new leaps are waiting. Post yours to see them.';
  }

  return (
    <View style={styles.bar}>
      <View style={styles.lockBox}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.green} />
        ) : (
          <Ionicons name="lock-closed-outline" size={22} color={colors.green} />
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>{body}</Text>
        <PrimaryButton
          title="Leap"
          variant="green"
          onPress={() => navigateToRecord(nav)}
          style={styles.cta}
        />
      </View>
    </View>
  );
}
