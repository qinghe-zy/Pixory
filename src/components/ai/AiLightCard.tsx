import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, rhythm, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiLightCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'card' | 'surface' | 'dark';
}

export function AiLightCard({ children, style, variant = 'surface' }: AiLightCardProps) {
  return <View style={[styles.card, variant === 'card' ? styles.cardFill : variant === 'dark' ? styles.darkFill : styles.surfaceFill, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  cardFill: {
    backgroundColor: aiLightColors.card,
  },
  surfaceFill: {
    backgroundColor: aiLightColors.surface,
  },
  darkFill: {
    backgroundColor: aiLightColors.dark,
    borderColor: aiLightColors.dark,
  },
});
