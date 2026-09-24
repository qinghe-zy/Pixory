import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, spacing, typography } from '../design/tokens';
import { aiLightColors } from './ai/aiLightTheme';

type ButtonVariant = 'solid' | 'ghost' | 'outline';
type ButtonTone = 'default' | 'ai' | 'danger' | 'dark';
type ButtonShape = 'default' | 'rectangular';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  compact?: boolean;
  tone?: ButtonTone;
  fullWidth?: boolean;
  shape?: ButtonShape;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'solid',
  compact = false,
  tone = 'default',
  fullWidth = true,
  shape = 'default',
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  const indicatorColor =
    variant === 'solid'
      ? colors.text.inverse
      : tone === 'ai'
        ? aiLightColors.primaryText
        : tone === 'danger'
          ? colors.semantic.danger
          : colors.primary.default;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        shape === 'rectangular' && styles.rectangular,
        compact && styles.compact,
        variant === 'solid' ? styles.solid : variant === 'outline' ? styles.outline : styles.ghost,
        variant === 'solid' && tone === 'ai' ? styles.aiSolid : null,
        variant === 'solid' && tone === 'danger' ? styles.dangerSolid : null,
        variant === 'solid' && tone === 'dark' ? styles.darkSolid : null,
        variant === 'outline' && tone === 'ai' ? styles.aiOutline : null,
        variant === 'outline' && tone === 'dark' ? styles.darkOutline : null,
        isDisabled && styles.disabled,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={indicatorColor} size="small" />
        ) : null}
        <Text
          style={[
            styles.label,
            variant === 'solid' ? styles.solidLabel : variant === 'outline' ? styles.outlineLabel : styles.ghostLabel,
            variant !== 'solid' && tone === 'ai' ? styles.aiLabel : null,
            variant !== 'solid' && tone === 'danger' ? styles.dangerLabel : null,
            variant === 'outline' && tone === 'dark' ? styles.darkOutlineLabel : null,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: componentTokens.primaryButton.radius,
    height: componentTokens.primaryButton.height,
    justifyContent: 'center',
    paddingHorizontal: componentTokens.primaryButton.horizontalPadding,
  },
  rectangular: {
    borderRadius: 4,
  },
  fullWidth: {
    width: '100%',
  },
  compact: {
    height: Math.round(componentTokens.primaryButton.height * 0.7),
  },
  solid: {
    backgroundColor: colors.primary.default,
  },
  aiSolid: {
    backgroundColor: aiLightColors.primary,
  },
  dangerSolid: {
    backgroundColor: colors.semantic.danger,
  },
  darkSolid: {
    backgroundColor: '#111111',
  },
  outline: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderWidth: 1,
  },
  darkOutline: {
    backgroundColor: '#ffffff',
    borderColor: '#000000',
  },
  aiOutline: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.84,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  label: {
    ...typography.textStyles.bodyStrong,
    fontWeight: '500',
  },
  solidLabel: {
    color: colors.text.inverse,
  },
  outlineLabel: {
    color: colors.primary.default,
  },
  darkOutlineLabel: {
    color: '#000000',
  },
  ghostLabel: {
    color: colors.primary.default,
  },
  aiLabel: {
    color: aiLightColors.primaryText,
  },
  dangerLabel: {
    color: colors.semantic.danger,
  },
});
