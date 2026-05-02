import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, metrics, radius, shadows, spacing } from '../design/tokens';

interface ContentCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ContentCard({ children, style }: ContentCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...shadows.sm,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: metrics.cardPadding,
  },
});
