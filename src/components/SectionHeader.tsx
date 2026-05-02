import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, metrics, spacing, typography } from '../design/tokens';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  rightElement?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  rightElement,
}: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightElement ?? (actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={({ pressed }) => [pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    minHeight: metrics.minTouchSize,
  },
  copy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    ...typography.textStyles.sectionTitle,
  },
  subtitle: {
    ...typography.textStyles.caption,
  },
  actionLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.8,
  },
});
