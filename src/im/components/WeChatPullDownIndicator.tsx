import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { typography } from '../../design/tokens';

export interface WeChatPullDownIndicatorProps {
  /** 当前主轴下拉距离 */
  pullDistance: SharedValue<number>;
  /** 一楼展开基准高度 (超过此高度进入二段拉伸) */
  expandedHeight: number;
  /** 触发二楼吸附的临界增量 (默认 140px) */
  threshold?: number;
}

const TRIGGER_THRESHOLD = 140;
const HYSTERESIS_RESET = 125;

export const WeChatPullDownIndicator = memo(function WeChatPullDownIndicator({
  pullDistance,
  expandedHeight,
  threshold = TRIGGER_THRESHOLD,
}: WeChatPullDownIndicatorProps) {
  // 15px 触觉防抖回差锁：dy >= 140 触发一次并加锁，直到 dy < 125 才能重置
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerHapticFeedback = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  useAnimatedReaction(
    () => {
      const dy = Math.max(0, pullDistance.value - expandedHeight);
      return dy;
    },
    (dy) => {
      if (dy >= threshold && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHapticFeedback)();
      } else if (dy < HYSTERESIS_RESET && hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = false;
      }
    }
  );

  // 容器透明度与位移
  const containerAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    // dy 在 10~40px 间平滑渐现
    const opacity = interpolate(dy, [10, 42], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(dy, [10, 140], [0, 16], Extrapolation.CLAMP);

    return {
      opacity: dy <= 8 ? 0 : opacity,
      transform: [{ translateY }],
    };
  });

  // 中心点 (P0) 缩放与透明度
  const centerDotAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    const scale = interpolate(dy, [10, 45], [0.5, 1.0], Extrapolation.CLAMP);
    const isLocked = dy >= threshold;

    return {
      transform: [{ scale: isLocked ? 1.25 : scale }],
      backgroundColor: isLocked ? '#FFFFFF' : 'rgba(255, 255, 255, 0.90)',
    };
  });

  // 左侧点位 (PL)
  const leftDotAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    // 40px 开始分裂，80~140px 间距从 8 拉伸至 26px
    const distance = interpolate(dy, [40, 80, 140], [0, 9, 26], Extrapolation.CLAMP);
    const opacity = interpolate(dy, [38, 55], [0, 1], Extrapolation.CLAMP);
    const isLocked = dy >= threshold;

    return {
      opacity,
      transform: [{ translateX: -distance }, { scale: isLocked ? 1.25 : 1 }],
      backgroundColor: isLocked ? '#FFFFFF' : 'rgba(255, 255, 255, 0.90)',
    };
  });

  // 右侧点位 (PR)
  const rightDotAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    const distance = interpolate(dy, [40, 80, 140], [0, 9, 26], Extrapolation.CLAMP);
    const opacity = interpolate(dy, [38, 55], [0, 1], Extrapolation.CLAMP);
    const isLocked = dy >= threshold;

    return {
      opacity,
      transform: [{ translateX: distance }, { scale: isLocked ? 1.25 : 1 }],
      backgroundColor: isLocked ? '#FFFFFF' : 'rgba(255, 255, 255, 0.90)',
    };
  });

  // 微文字提示 (未到阈值展示“继续下拉”，达到阈值展示“松手直达”；112~136px 无缝交叉溶解杜绝叠字)
  const textPromptAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    const fadeIn = interpolate(dy, [50, 85], [0, 0.92], Extrapolation.CLAMP);
    const fadeOut = interpolate(dy, [112, 126], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(dy, [112, 126], [0, -4], Extrapolation.CLAMP);
    const opacity = fadeIn * fadeOut;

    return {
      opacity: dy <= 45 ? 0 : opacity,
      transform: [{ translateY }],
    };
  });

  const textThresholdAnimatedStyle = useAnimatedStyle(() => {
    const dy = Math.max(0, pullDistance.value - expandedHeight);
    const opacity = interpolate(dy, [122, 136], [0, 1.0], Extrapolation.CLAMP);
    const translateY = interpolate(dy, [122, 136], [4, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.indicatorContainer, { top: expandedHeight + 8 }, containerAnimatedStyle]}>
      {/* 3 点量子排列区 */}
      <View style={styles.dotsStage}>
        <Animated.View style={[styles.dot, centerDotAnimatedStyle]} />
        <Animated.View style={[styles.dot, leftDotAnimatedStyle]} />
        <Animated.View style={[styles.dot, rightDotAnimatedStyle]} />
      </View>

      {/* 低打扰、高质感微文字层 */}
      <View style={styles.textLayer}>
        <Animated.Text style={[styles.subtleText, textPromptAnimatedStyle]}>
          继续下拉进入二楼
        </Animated.Text>
        <Animated.Text style={[styles.subtleText, styles.highlightText, textThresholdAnimatedStyle]}>
          松手即可直达二楼
        </Animated.Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  indicatorContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    zIndex: 2,
  },
  dotsStage: {
    width: 100,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 3,
    elevation: 2,
  },
  textLayer: {
    marginTop: 4,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtleText: {
    position: 'absolute',
    ...typography.textStyles.micro,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.92)',
    letterSpacing: 0.8,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  highlightText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
});
