import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../design/tokens';

export interface ImportProgressBarRef {
  setProgress: (current: number, total: number, label: string) => void;
  reset: () => void;
}

export const ImportProgressBar = forwardRef<ImportProgressBarRef, {}>((_, ref) => {
  const [state, setState] = useState<{ current: number; total: number; label: string } | null>(null);
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({
    setProgress: (current, total, label) => {
      setState({ current, total, label });
    },
    reset: () => {
      setState(null);
      animatedWidth.setValue(0);
    },
  }));

  useEffect(() => {
    if (state && state.total > 0) {
      const percentage = (state.current / state.total) * 100;
      Animated.timing(animatedWidth, {
        toValue: percentage,
        useNativeDriver: false,
        duration: 150,
      }).start();
    }
  }, [state, animatedWidth]);

  if (!state) {
    return null;
  }

  const { current, total, label } = state;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Ionicons color={colors.primary.active} name="sync-outline" size={16} style={styles.icon} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.numbers}>
          {current} / {total} ({percentage}%)
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: animatedWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: spacing.xs,
  },
  label: {
    ...typography.textStyles.body2,
    color: colors.text.primary,
    fontWeight: '500',
  },
  numbers: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary.active,
    borderRadius: radius.pill,
  },
});
