import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, layout, metrics, spacing, typography } from '../design/tokens';
import { ContentCard } from './ContentCard';

interface SwitchFieldCardProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchFieldCard({
  label,
  hint,
  value,
  onValueChange,
  disabled = false,
}: SwitchFieldCardProps) {
  return (
    <ContentCard style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={colors.background.surface}
        trackColor={{ false: colors.border.strong, true: colors.primary.default }}
        value={value}
      />
    </ContentCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: metrics.minTouchSize + spacing[2],
  },
  copy: {
    flex: 1,
    gap: spacing[1],
    maxWidth: layout.maxReadableWidth,
  },
  label: {
    ...typography.textStyles.bodyStrong,
  },
  hint: {
    ...typography.textStyles.caption,
  },
});
