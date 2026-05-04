import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';

interface ReadonlyInfoRowProps {
  label: string;
  hint?: string;
  value: string;
  valueNumberOfLines?: number;
}

export function ReadonlyInfoRow({
  label,
  hint,
  value,
  valueNumberOfLines = 2,
}: ReadonlyInfoRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
      </View>
      <Text numberOfLines={valueNumberOfLines} style={styles.value}>
        {value}
      </Text>
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
  value: {
    ...typography.textStyles.body,
    color: colors.text.title,
    minWidth: 0,
  },
});
