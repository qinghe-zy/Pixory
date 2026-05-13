import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface FormTextareaRowProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  minHeight?: number;
  errorMessage?: string | null;
}

export function FormTextareaRow({
  label,
  hint,
  minHeight = 88,
  errorMessage,
  style,
  ...inputProps
}: FormTextareaRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
      </View>
      <TextInput
        multiline
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={[styles.input, { minHeight }, errorMessage ? styles.errorInput : null, style]}
        textAlignVertical="top"
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: rhythm.fieldContentGap,
    paddingVertical: spacing[3],
  },
  copy: {
    gap: rhythm.microGap,
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  errorInput: {
    borderColor: colors.semantic.danger,
  },
});
