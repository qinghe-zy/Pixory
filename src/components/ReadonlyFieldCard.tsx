import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../design/tokens';
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
          <Text numberOfLines={2} style={styles.value}>
            {value}
          </Text>
        </View>
      </FormField>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'transparent',
    borderColor: colors.border.divider,
    borderRadius: radius.md,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 0,
  },
  value: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
});
