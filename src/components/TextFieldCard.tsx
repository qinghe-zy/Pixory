import { StyleSheet, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, metrics, radius, spacing, typography } from '../design/tokens';
import { ContentCard } from './ContentCard';
import { FormField } from './FormField';

interface TextFieldCardProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  errorMessage?: string | null;
}

export function TextFieldCard({
  label,
  hint,
  errorMessage,
  style,
  ...inputProps
}: TextFieldCardProps) {
  return (
    <ContentCard>
      <FormField hint={hint} label={label}>
        <TextInput
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={[styles.input, errorMessage ? styles.errorInput : null, style]}
          {...inputProps}
        />
      </FormField>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 42,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  errorInput: {
    borderColor: colors.semantic.danger,
  },
});
