import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { metrics, radius, shadows, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiScrollToLatestButtonProps {
  bottomOffset: number;
  generating: boolean;
  visible: boolean;
  onPress: () => void;
}

const FULL_DOT_CYCLE = Math.PI * 2;
const DOT_PHASE_OFFSET = FULL_DOT_CYCLE / 3;

function JumpingDot({
  index,
  phase,
  reducedMotion,
}: {
  index: number;
  phase: SharedValue<number>;
  reducedMotion: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: 0.72, transform: [{ translateY: 0 }] };
    }
    const wave = (Math.sin(phase.value - index * DOT_PHASE_OFFSET) + 1) / 2;
    return {
      opacity: 0.48 + wave * 0.42,
      transform: [{ translateY: -wave * metrics.scrollToLatestDotSize }],
    };
  }, [index, reducedMotion]);

  return <Reanimated.View style={[styles.dot, animatedStyle]} />;
}

export function AiScrollToLatestButton({
  bottomOffset,
  generating,
  visible,
  onPress,
}: AiScrollToLatestButtonProps) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  const phase = useSharedValue(0);
  const modeProgress = useSharedValue(generating ? 1 : 0);
  const reducedMotion = useReducedMotion();

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: 1 - modeProgress.value,
  }));
  const dotsStyle = useAnimatedStyle(() => ({
    opacity: modeProgress.value,
  }));

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 150,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
    return () => {
      animation.stop();
    };
  }, [opacity, visible]);

  useEffect(() => {
    modeProgress.value = withTiming(generating ? 1 : 0, {
      duration: reducedMotion ? 0 : 140,
      easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
    });
  }, [generating, modeProgress, reducedMotion]);

  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (generating && visible && !reducedMotion) {
      phase.value = withRepeat(
        withTiming(FULL_DOT_CYCLE, {
          duration: 960,
          easing: ReanimatedEasing.linear,
        }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(phase);
  }, [generating, phase, reducedMotion, visible]);

  if (!mounted) {
    return null;
  }
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.fadeWrap, { bottom: bottomOffset, opacity }]}>
      <Pressable
        accessibilityLabel={generating ? 'AI 正在生成，回到最新' : '回到最新'}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <View style={styles.surface}>
          <Reanimated.View pointerEvents="none" style={[styles.iconLayer, arrowStyle]}>
            <Ionicons
              color={aiLightColors.ink}
              name="arrow-down"
              size={metrics.scrollToLatestGlyphSize}
            />
          </Reanimated.View>
          <Reanimated.View pointerEvents="none" style={[styles.dots, dotsStyle]}>
            {[0, 1, 2].map((index) => (
              <JumpingDot
                index={index}
                key={index}
                phase={phase}
                reducedMotion={reducedMotion}
              />
            ))}
          </Reanimated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fadeWrap: {
    position: 'absolute',
    right: spacing[4],
    zIndex: 5,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  surface: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.scrollToLatestVisualSize,
    justifyContent: 'center',
    width: metrics.scrollToLatestVisualSize,
  },
  iconLayer: {
    alignItems: 'center',
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  dots: {
    alignItems: 'center',
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    gap: metrics.scrollToLatestDotSize,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: aiLightColors.ink,
    borderRadius: radius.pill,
    height: metrics.scrollToLatestDotSize,
    width: metrics.scrollToLatestDotSize,
  },
  pressed: {
    opacity: 0.78,
  },
});
