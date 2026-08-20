import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing } from '../../design/tokens';

interface AiActiveSpectrumBarProps {
  active: boolean;
  delay: number;
  theta: SharedValue<number>;
  index: number;
  minHeight: number;
  maxHeight: number;
  width?: number;
  barColors?: readonly string[];
}

function AiActiveSpectrumBar({
  active,
  delay,
  theta,
  index,
  minHeight,
  maxHeight,
  width = 4,
  barColors = [colors.support.sky300, colors.support.lilac300, colors.support.coral400, colors.support.mint300],
}: AiActiveSpectrumBarProps) {
  const currentHeight = useSharedValue(minHeight);

  useEffect(() => {
    if (!active) {
      cancelAnimation(currentHeight);
      currentHeight.value = minHeight;
      return;
    }
    currentHeight.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(maxHeight, { duration: 600 + Math.random() * 200 }),
          withTiming(minHeight, { duration: 600 + Math.random() * 200 })
        ),
        -1,
        true
      )
    );
    return () => cancelAnimation(currentHeight);
  }, [active, delay, minHeight, maxHeight, currentHeight]);

  const style = useAnimatedStyle(() => {
    const phaseOffset = index * (Math.PI / 4);
    const rawSine = Math.sin(theta.value + phaseOffset); // -1 to 1
    const normalized = ((rawSine + 1) / 2) * (barColors.length - 1); // 0 to N-1

    const inputRange = barColors.map((_, i) => i);
    const bg = interpolateColor(normalized, inputRange, barColors as string[]);

    return {
      height: currentHeight.value,
      backgroundColor: bg,
    };
  });

  return <Animated.View style={[{ width, borderRadius: width / 2 }, style]} />;
}

export interface AiActiveSpectrumProps {
  active?: boolean;
  mini?: boolean;
  barColors?: readonly string[];
  maxHeightScale?: number;
  alignItems?: 'center' | 'flex-end';
}

export function AiActiveSpectrum({ active = true, mini = false, barColors, maxHeightScale = 1, alignItems }: AiActiveSpectrumProps) {
  const theta = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(theta);
      theta.value = 0;
      return;
    }
    theta.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(theta);
  }, [active, theta]);

  const w = mini ? 3 : 4;
  const alignment = alignItems ?? (mini ? 'flex-end' : 'center');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: alignment,
        gap: mini ? 3 : 4,
        paddingRight: mini ? 0 : spacing[2],
        marginLeft: mini ? 8 : 0,
        paddingBottom: mini ? 4 : 0,
      }}
    >
      <AiActiveSpectrumBar active={active} barColors={barColors} delay={0} index={0} maxHeight={(mini ? 10 : 12) * maxHeightScale} minHeight={4} theta={theta} width={w} />
      <AiActiveSpectrumBar active={active} barColors={barColors} delay={150} index={1} maxHeight={(mini ? 14 : 18) * maxHeightScale} minHeight={mini ? 6 : 8} theta={theta} width={w} />
      <AiActiveSpectrumBar active={active} barColors={barColors} delay={300} index={2} maxHeight={(mini ? 12 : 14) * maxHeightScale} minHeight={mini ? 4 : 6} theta={theta} width={w} />
      <AiActiveSpectrumBar active={active} barColors={barColors} delay={450} index={3} maxHeight={(mini ? 8 : 10) * maxHeightScale} minHeight={mini ? 3 : 4} theta={theta} width={w} />
    </View>
  );
}
