import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface FormInputRowProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  errorMessage?: string | null;
  variant?: 'outline' | 'cell';
}

export function FormInputRow({
  label,
  hint,
  errorMessage,
  variant = 'cell',
  style,
  ...inputProps
}: FormInputRowProps) {
  return (
    <View style={[styles.row, variant === 'outline' && styles.rowOutline]}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
      </View>
      <TextInput
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={[
          styles.input,
          variant === 'outline' && styles.inputOutline,
          variant === 'cell' && styles.inputCell,
          errorMessage ? styles.errorInput : null,
          style
        ]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: rhythm.microGap,
  },
  rowOutline: {
    gap: rhythm.fieldContentGap,
    paddingVertical: spacing[3],
  },
  copy: {
    gap: rhythm.microGap,
    minWidth: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
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
    color: colors.text.title,
    minHeight: 40,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  inputCell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputOutline: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[2],
  },
  errorInput: {
    color: colors.semantic.danger,
  },
});
