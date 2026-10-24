import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChevronLeftIcon, ChevronRightIcon } from './AiMessageActionIcons';

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
        hitSlop={6}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.versionButton,
          atFirst && styles.disabled,
          pressed && !atFirst && styles.pressed,
        ]}
      >
        <ChevronLeftIcon color={atFirst ? '#CBD5E1' : '#64748B'} size={14} />
      </Pressable>
      <Text style={styles.versionText}>{currentIndex}/{total}</Text>
      <Pressable
        accessibilityLabel={nextAccessibilityLabel}
        accessibilityRole="button"
        disabled={atLast}
        hitSlop={6}
        onPress={onNext}
        style={({ pressed }) => [
          styles.versionButton,
          atLast && styles.disabled,
          pressed && !atLast && styles.pressed,
        ]}
      >
        <ChevronRightIcon color={atLast ? '#CBD5E1' : '#64748B'} size={14} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  versionControl: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
  },
  versionButton: {
    alignItems: 'center',
    borderRadius: 4,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  versionText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 2,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  pressed: {
    backgroundColor: '#F1F5F9',
  },
});
