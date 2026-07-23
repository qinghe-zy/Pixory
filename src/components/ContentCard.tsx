import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, metrics, radius, rhythm, shadows, spacing } from '../design/tokens';

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
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: Math.max(spacing[3], metrics.cardPadding - spacing[2]),
  },
});
