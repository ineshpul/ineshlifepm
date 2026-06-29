import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useThemedStyles } from '../theme/ThemeProvider';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  count: number | null;
  loading?: boolean;
};

export function FeedSinceLastLeapBanner({ count, loading }: Props) {
  const nav = useNavigation<any>();

  const styles = useThemedStyles((c) => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.coral,
      lineHeight: 18,
    },
    leapPill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.green,
    },
    leapPillText: {
      fontSize: 13,
      fontWeight: '800',
      color: c.white,
      letterSpacing: 0.4,
    },
  }));

  let body: string;
  if (loading) {
    body = 'People posted since your last leap. Post to see them!';
  } else if (count != null && count > 0) {
    const peopleLabel = count === 1 ? '1 person posted' : `${count} people posted`;
    body = `${peopleLabel} since your last leap. Post to see them!`;
  } else {
    body = "Post today's leap to see what's new!";
  }

  return (
    <View style={styles.bar}>
      <Text style={styles.text}>{body}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leap"
        onPress={() => navigateToRecord(nav)}
        style={({ pressed }) => [styles.leapPill, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.leapPillText}>Leap</Text>
      </Pressable>
    </View>
  );
}
