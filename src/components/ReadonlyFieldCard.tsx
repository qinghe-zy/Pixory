import { StyleSheet, Text, View } from 'react-native';

import { colors, metrics, radius, spacing, typography } from '../design/tokens';
import { ContentCard } from './ContentCard';
import { FormField } from './FormField';

interface ReadonlyFieldCardProps {
  label: string;
  hint?: string;
  value: string;
}

export function ReadonlyFieldCard({ label, hint, value }: ReadonlyFieldCardProps) {
  return (
    <ContentCard>
      <FormField hint={hint} label={label}>
        <View style={styles.box}>
          <Text style={styles.value}>{value}</Text>
        </View>
      </FormField>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
  },
  value: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
});
