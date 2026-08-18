import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  count: number | null;
  loading?: boolean;
};

/** Reel chrome is always dark, so this bar uses fixed glass tokens (not theme card colors). */
export function FeedSinceLastLeapBanner({ count, loading }: Props) {
  const nav = useNavigation<any>();

  const styles = useThemedStyles(() => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 9,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(10, 17, 12, 0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontFamily: typography.bodySemiBold,
      color: '#FFFFFF',
      lineHeight: 18,
    },
    leapPill: {
      paddingHorizontal: 15,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: '#2F9E5A',
    },
    leapPillText: {
      fontSize: 13,
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
  }));

  let body: string;
  if (loading) {
    body = 'Posts since your leap. Post to see them!';
  } else if (count != null && count > 0) {
    const postsLabel = count === 1 ? '1 post' : `${count} posts`;
    body = `${postsLabel} since your leap. Post to see them!`;
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
