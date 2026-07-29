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
import { LinearGradient } from 'expo-linear-gradient';
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
  const opacity = useRef(new Animated.Value(visible ? 0.85 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  const phase = useSharedValue(0);
  const rotation = useSharedValue(0);
  const arrowBounce = useSharedValue(0);
  const modeProgress = useSharedValue(generating ? 1 : 0);
  const reducedMotion = useReducedMotion();

  const arrowStyle = useAnimatedStyle(() => ({
    opacity: 1 - modeProgress.value,
    transform: [{ translateY: arrowBounce.value * 2.5 }],
  }));
  const dotsStyle = useAnimatedStyle(() => ({
    opacity: modeProgress.value,
  }));
  const haloStyle = useAnimatedStyle(() => {
    return {
      opacity: modeProgress.value * 0.7,
      transform: [{ rotateZ: `${rotation.value}deg` }],
    };
  });

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    const animation = Animated.timing(opacity, {
      toValue: visible ? 0.85 : 0,
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
    cancelAnimation(rotation);
    cancelAnimation(arrowBounce);
    phase.value = 0;
    rotation.value = 0;
    
    if (visible && !reducedMotion) {
      if (generating) {
        // generating animations
        arrowBounce.value = withTiming(0, { duration: 150 });
        phase.value = withRepeat(
          withTiming(FULL_DOT_CYCLE, {
            duration: 960,
            easing: ReanimatedEasing.linear,
          }),
          -1,
          false,
        );
        rotation.value = withRepeat(
          withTiming(360, {
            duration: 3000,
            easing: ReanimatedEasing.linear,
          }),
          -1,
          false,
        );
      } else {
        // idle arrow bounce
        arrowBounce.value = withRepeat(
          withTiming(1, {
            duration: 1000,
            easing: ReanimatedEasing.inOut(ReanimatedEasing.sin),
          }),
          -1,
          true,
        );
      }
    } else {
      arrowBounce.value = withTiming(0, { duration: 150 });
    }
    
    return () => {
      cancelAnimation(phase);
      cancelAnimation(rotation);
      cancelAnimation(arrowBounce);
    };
  }, [generating, phase, rotation, arrowBounce, reducedMotion, visible]);

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
        <Reanimated.View pointerEvents="none" style={[styles.haloContainer, haloStyle]}>
          <LinearGradient
            colors={['#FF57B9', '#A704FD', '#33D0FF', '#FF57B9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
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
    right: spacing[1.5],
    zIndex: 5,
    opacity: 0.85,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  haloContainer: {
    borderRadius: radius.pill,
    height: metrics.scrollToLatestVisualSize + 4,
    left: (metrics.minTouchSize - metrics.scrollToLatestVisualSize) / 2 - 2,
    overflow: 'hidden',
    position: 'absolute',
    top: (metrics.minTouchSize - metrics.scrollToLatestVisualSize) / 2 - 2,
    width: metrics.scrollToLatestVisualSize + 4,
  },
  surface: {
    ...shadows.floating,
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
