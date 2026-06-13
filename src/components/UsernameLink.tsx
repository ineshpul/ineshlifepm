import * as React from 'react';
import { Pressable, Text, type StyleProp, type TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useThemedStyles } from '../theme/ThemeProvider';
import { navigateToUserProfile } from '../navigation/navigationHelpers';

export type UsernameLinkProps = {
  uid: string;
  username: string;
  /** Default true — renders `@handle`. */
  showAt?: boolean;
  style?: StyleProp<TextStyle>;
  disabled?: boolean;
};

export function UsernameLink({ uid, username, showAt = true, style, disabled }: UsernameLinkProps) {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles((colors) => ({
    /** Only tint — preserves font weight/size from `style`. */
    linkTint: { color: colors.coral },
    fallback: { fontWeight: '800', color: colors.text },
  }));

  const clean = String(username ?? '')
    .replace(/^@+/u, '')
    .trim();
  const label = showAt ? `@${clean || 'user'}` : clean || 'user';

  if (!uid || !clean) {
    return (
      <Text style={[styles.fallback, style]} numberOfLines={1}>
        {label}
      </Text>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={() => navigateToUserProfile(navigation, { uid, username: clean })}
      hitSlop={6}
      accessibilityRole="link"
      accessibilityLabel={`Open profile ${label}`}
    >
      <Text style={[style, styles.linkTint]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
