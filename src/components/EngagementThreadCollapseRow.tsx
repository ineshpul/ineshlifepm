import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { THREAD_INDENT } from '../utils/commentThread';

type Props = {
  indentDepth: number;
  hiddenCount: number;
  layout: 'inline' | 'modal';
  onPress: () => void;
};

export const EngagementThreadCollapseRow = React.memo(function EngagementThreadCollapseRow({
  indentDepth,
  hiddenCount,
  layout,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    wrapModal: {
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border2,
    },
    chev: { marginTop: 1 },
    label: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.moss,
    },
  }));

  const isModal = layout === 'modal';
  const label =
    hiddenCount === 1 ? 'View 1 reply' : `View ${hiddenCount} replies`;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.wrap,
        isModal && styles.wrapModal,
        { marginLeft: indentDepth * THREAD_INDENT },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="chevron-down" size={16} color={colors.moss} style={styles.chev} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
});
