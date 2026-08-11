import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export function AiVersionStepper({
  currentIndex,
  nextAccessibilityLabel = '下一版',
  total,
  onPrevious,
  onNext,
  previousAccessibilityLabel = '上一版',
}: {
  currentIndex: number;
  nextAccessibilityLabel?: string;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  previousAccessibilityLabel?: string;
}) {
  const atFirst = currentIndex <= 1;
  const atLast = currentIndex >= total;

  return (
    <View style={styles.versionControl}>
      <Pressable
        accessibilityLabel={previousAccessibilityLabel}
        accessibilityRole="button"
        disabled={atFirst}
        hitSlop={8}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.versionButton,
          atFirst && styles.disabled,
          pressed && !atFirst && styles.pressed,
        ]}
      >
        <Ionicons color={aiLightColors.muted} name="chevron-back" size={14} />
      </Pressable>
      <Text style={styles.versionText}>{currentIndex}/{total}</Text>
      <Pressable
        accessibilityLabel={nextAccessibilityLabel}
        accessibilityRole="button"
        disabled={atLast}
        hitSlop={8}
        onPress={onNext}
        style={({ pressed }) => [
          styles.versionButton,
          atLast && styles.disabled,
          pressed && !atLast && styles.pressed,
        ]}
      >
        <Ionicons color={aiLightColors.muted} name="chevron-forward" size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  versionControl: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 28,
    paddingHorizontal: spacing[1],
  },
  versionButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 22,
  },
  versionText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.78,
  },
});
