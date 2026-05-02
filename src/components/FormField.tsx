import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';

interface FormFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, hint, children }: FormFieldProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[3],
  },
  copy: {
    gap: spacing[1],
  },
  label: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
  },
  hint: {
    ...typography.textStyles.caption,
  },
});
