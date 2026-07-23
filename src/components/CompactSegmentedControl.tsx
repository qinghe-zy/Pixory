import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MediaPickerSource } from '../database/repositories/settingsRepository';
import { colors, radius, spacing, typography } from '../design/tokens';

interface CompactSegmentedControlProps {
  disabled?: boolean;
  onChange: (value: MediaPickerSource) => void;
  value: MediaPickerSource;
}

const OPTIONS: Array<{ label: string; value: MediaPickerSource }> = [
  { label: '相册', value: 'album' },
  { label: '文件', value: 'files' },
];

export function CompactSegmentedControl({
  disabled = false,
  onChange,
  value,
}: CompactSegmentedControlProps) {
  return (
    <View accessibilityRole="tablist" style={[styles.root, disabled && styles.disabled]}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityLabel={`从${option.label}选择`}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selectedOption,
              pressed && !disabled && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.background.page,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 44,
    padding: spacing[1],
  },
  option: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 54,
    paddingHorizontal: spacing[3],
  },
  selectedOption: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  selectedLabel: {
    color: colors.primary.active,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.72,
  },
});
