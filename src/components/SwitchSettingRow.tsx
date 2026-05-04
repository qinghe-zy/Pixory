import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';

interface SwitchSettingRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchSettingRow({
  label,
  hint,
  value,
  onValueChange,
  disabled = false,
}: SwitchSettingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={colors.background.surface}
        trackColor={{ false: colors.border.strong, true: colors.primary.default }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing[3],
  },
  copy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  label: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
  },
  hint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
});
