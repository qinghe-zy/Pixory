import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  iconName = 'archive-outline',
}: EmptyStateProps) {
  return (
    <View style={styles.card}>
      <View style={styles.illustrationWrap}>
        <Ionicons color={colors.primary.default} name={iconName} size={44} />
      </View>
      <Text style={typography.textStyles.emptyTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.sm,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.emptyState.radius,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 320,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[7],
    width: '100%',
  },
  illustrationWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.border.default,
    borderRadius: componentTokens.emptyState.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.emptyState.illustrationSize,
    justifyContent: 'center',
    marginBottom: componentTokens.emptyState.illustrationGap,
    width: componentTokens.emptyState.illustrationSize,
  },
  description: {
    ...typography.textStyles.emptyDescription,
    marginBottom: componentTokens.emptyState.descriptionGap,
    marginTop: spacing[2],
    textAlign: 'center',
  },
});
