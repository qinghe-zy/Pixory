import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';

interface OptionSelectRowProps {
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function OptionSelectRow({
  label,
  meta,
  selected,
  onPress,
  disabled = false,
}: OptionSelectRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.selected : null,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.label, selected ? styles.selectedLabel : null]}>
          {label}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={[styles.check, selected ? styles.selectedCheck : null]}>
        {selected ? <Ionicons color={colors.text.inverse} name="checkmark" size={13} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 48,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  selected: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.82,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  selectedLabel: {
    color: colors.primary.active,
    fontWeight: '500',
  },
  meta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  check: {
    alignItems: 'center',
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  selectedCheck: {
    backgroundColor: colors.primary.default,
    borderColor: colors.primary.default,
  },
});
