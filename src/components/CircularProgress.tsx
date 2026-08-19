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
  ({ size = 60, strokeWidth = 5 }, ref) => {
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
      <View style={styles.overlayContainer}>
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
        {label ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: spacing.xxl * 2, // Floating near the top like a toast
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.90)', // semi-transparent
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 9999, // Ensure it floats above everything and doesn't scroll
    gap: spacing.md,
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary.default,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  numbersText: {
    fontSize: 9,
    color: colors.text.tertiary,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  label: {
    ...typography.textStyles.body2,
    color: colors.text.primary,
    fontWeight: '600',
    maxWidth: 160,
  },
});
