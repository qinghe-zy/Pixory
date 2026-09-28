import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiLightChipProps {
  active?: boolean;
  dense?: boolean;
  label: string;
  onPress: () => void;
}

export function AiLightChip({ active = false, dense = false, label, onPress }: AiLightChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.base, dense && styles.dense, active && styles.active, pressed && styles.pressed]}
    >
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  dense: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  active: {
    backgroundColor: aiLightColors.primary,
    borderColor: aiLightColors.primary,
  },
  pressed: {
    opacity: 0.78,
  },
  label: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  activeLabel: {
    color: aiLightColors.onDark,
  },
});
