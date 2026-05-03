import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, componentTokens, spacing, typography } from '../design/tokens';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        active ? styles.active : styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.text, active ? styles.activeText : styles.inactiveText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: componentTokens.filterChip.radius,
    height: componentTokens.filterChip.height,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: componentTokens.filterChip.horizontalPadding,
  },
  active: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inactive: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.78,
  },
  text: {
    ...typography.textStyles.caption,
    fontWeight: '500',
    lineHeight: 18,
    maxWidth: 180,
  },
  activeText: {
    color: colors.primary.active,
  },
  inactiveText: {
    color: colors.text.primary,
  },
});
