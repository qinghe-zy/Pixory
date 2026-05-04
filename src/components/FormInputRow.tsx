import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';

interface FormInputRowProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  errorMessage?: string | null;
}

export function FormInputRow({
  label,
  hint,
  errorMessage,
  style,
  ...inputProps
}: FormInputRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
      </View>
      <TextInput
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={[styles.input, errorMessage ? styles.errorInput : null, style]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
  copy: {
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
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 40,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  errorInput: {
    borderColor: colors.semantic.danger,
  },
});
