import { StyleSheet, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

import { colors, metrics, radius, spacing, typography } from '../design/tokens';
import { ContentCard } from './ContentCard';
import { FormField } from './FormField';

interface MultilineFieldCardProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  minHeight?: number;
  errorMessage?: string | null;
}

export function MultilineFieldCard({
  label,
  hint,
  minHeight = 120,
  errorMessage,
  style,
  ...inputProps
}: MultilineFieldCardProps) {
  return (
    <ContentCard>
      <FormField hint={hint} label={label}>
        <TextInput
          multiline
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={[styles.input, { minHeight }, errorMessage ? styles.errorInput : null, style]}
          textAlignVertical="top"
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
    borderWidth: 1,
    color: colors.text.title,
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  errorInput: {
    borderColor: colors.semantic.danger,
  },
});
