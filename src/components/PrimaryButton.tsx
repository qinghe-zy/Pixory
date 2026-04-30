import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, spacing, typography } from '../design/tokens';

type ButtonVariant = 'solid' | 'ghost' | 'outline';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'solid',
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'solid' ? styles.solid : variant === 'outline' ? styles.outline : styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={variant === 'solid' ? colors.text.inverse : colors.primary.default} size="small" />
        ) : null}
        <Text
          style={[
            styles.label,
            variant === 'solid' ? styles.solidLabel : variant === 'outline' ? styles.outlineLabel : styles.ghostLabel,
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
    width: '100%',
  },
  solid: {
    backgroundColor: colors.primary.default,
  },
  outline: {
    backgroundColor: colors.background.surface,
    borderColor: colors.primary.default,
    borderWidth: 1,
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
    ...typography.textStyles.sectionTitle,
    fontWeight: '500',
  },
  solidLabel: {
    color: colors.text.inverse,
  },
  outlineLabel: {
    color: colors.primary.default,
  },
  ghostLabel: {
    color: colors.primary.default,
  },
});
