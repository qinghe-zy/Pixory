import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../design/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface CircularProgressRef {
  setProgress: (current: number, total: number, label?: string) => void;
  reset: () => void;
}

interface CircularProgressProps {
  size?: number;
  strokeWidth?: number;
}

export const CircularProgress = forwardRef<CircularProgressRef, CircularProgressProps>(
  ({ size = 160, strokeWidth = 12 }, ref) => {
    const [state, setState] = useState<{ current: number; total: number; label?: string } | null>(null);
    const progress = useSharedValue(0);

    const radiusVal = (size - strokeWidth) / 2;
    const circumference = radiusVal * 2 * Math.PI;

    useImperativeHandle(ref, () => ({
      setProgress: (current, total, label) => {
        setState({ current, total, label });
        const target = total > 0 ? current / total : 0;
        progress.value = withTiming(target, {
          duration: 150,
          easing: Easing.out(Easing.quad),
        });
      },
      reset: () => {
        setState(null);
        progress.value = 0;
      },
    }));

    const animatedProps = useAnimatedProps(() => {
      return {
        strokeDashoffset: circumference - progress.value * circumference,
      };
    });

    if (!state) {
      return null;
    }

    const { current, total, label } = state;
    const percentageStr = total > 0 ? Math.round((current / total) * 100) : 0;

    return (
      <View style={styles.container}>
        <View style={styles.ringContainer}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radiusVal}
              stroke={colors.background.sunken}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress Ring */}
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radiusVal}
              stroke={colors.primary.default}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              animatedProps={animatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={styles.centerContent}>
            <Text style={styles.percentageText}>{percentageStr}%</Text>
            <Text style={styles.numbersText}>{current} / {total}</Text>
          </View>
        </View>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    marginVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.default,
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  numbersText: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...typography.textStyles.body2,
    color: colors.text.secondary,
    marginTop: spacing.lg,
    fontWeight: '500',
  },
});
