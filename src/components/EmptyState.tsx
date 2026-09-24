import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, rhythm, shadows, spacing, typography } from '../design/tokens';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  variant?: 'card' | 'inline';
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  iconName = 'archive-outline',
  variant = 'inline',
}: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <View style={styles.inlineContainer}>
        {iconName && <Ionicons color={colors.text.tertiary} name={iconName} size={32} style={{ marginBottom: 4 }} />}
        <Text style={styles.inlineTitle}>{title}</Text>
        <Text style={styles.inlineDescription}>{description}</Text>
        {actionLabel && onAction ? (
          <View style={{ marginTop: 12 }}>
            <PrimaryButton label={actionLabel} onPress={onAction} tone="dark" />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.illustrationWrap}>
        <Ionicons color={colors.primary.default} name={iconName} size={44} />
      </View>
      <Text style={typography.textStyles.emptyTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} tone="dark" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  inlineTitle: {
    fontFamily: typography.family.base,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text.title,
  },
  inlineDescription: {
    fontFamily: typography.family.base,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
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
    marginTop: rhythm.cardContentGap,
    textAlign: 'center',
  },
});
