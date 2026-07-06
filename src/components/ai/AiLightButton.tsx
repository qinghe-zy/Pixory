import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

type AiLightButtonVariant = 'solid' | 'outline' | 'ghost';

interface AiLightButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: AiLightButtonVariant;
  style?: StyleProp<ViewStyle>;
}

export function AiLightButton({ label, onPress, loading = false, disabled = false, variant = 'solid', style }: AiLightButtonProps) {
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
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={variant === 'solid' ? aiLightColors.onDark : aiLightColors.primary} size="small" /> : null}
        <Text style={[styles.label, variant === 'solid' ? styles.solidLabel : styles.subtleLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: spacing[10],
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    width: '100%',
  },
  solid: {
    backgroundColor: aiLightColors.primary,
  },
  outline: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.82,
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
    color: aiLightColors.onDark,
  },
  subtleLabel: {
    color: aiLightColors.primaryActive,
  },
});
