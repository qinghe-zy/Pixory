import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export interface ParallaxLightSweepProps {
  /** 整体动画的不透明度，默认 0.3，不要设置太高以免喧宾夺主 */
  opacity?: number;
  /** 光带 1 的颜色，默认为非常淡的冷色 */
  color1?: string;
  /** 光带 2 的颜色，默认为非常淡的暖色 */
  color2?: string;
  /** 动画速度乘数，默认 1 */
  speedMultiplier?: number;
  /** 控制显隐，自带淡入淡出动画 */
  visible?: boolean;
  /** 淡入淡出的动画时长，默认 1200ms */
  fadeDuration?: number;
  /** 单独指定淡入时长，覆盖 fadeDuration */
  fadeInDuration?: number;
  /** 单独指定淡出时长，覆盖 fadeDuration */
  fadeOutDuration?: number;
}

/**
 * 视差极光 / 光带扫弦组件 (Parallax Light Sweep)
 * 高内聚、低耦合的背景挂件组件。
 * 建议用法：直接放置在任何页面的背景层，会自动填满父容器。
 * 它通过数学公式驱动巨大的渐变背景进行无规则的扫动，营造边缘发光、深邃的空间感。
 */
export function ParallaxLightSweep({
  opacity = 0.8,
  color1 = '#00f2fe', // 极光青蓝
  color2 = '#fe5196', // 极光紫粉
  speedMultiplier = 1,
  visible = true,
  fadeDuration = 1200,
  fadeInDuration,
  fadeOutDuration,
}: ParallaxLightSweepProps) {
  const { width, height } = useWindowDimensions();
  
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const opacityVal = useSharedValue(visible ? opacity : 0);

  useEffect(() => {
    const duration = visible
      ? (fadeInDuration ?? fadeDuration)
      : (fadeOutDuration ?? fadeDuration);
    opacityVal.value = withTiming(visible ? opacity : 0, { duration, easing: Easing.inOut(Easing.ease) });
  }, [visible, opacity, opacityVal, fadeDuration, fadeInDuration, fadeOutDuration]);

  useEffect(() => {
    p1.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 16000 / speedMultiplier, easing: Easing.linear }),
      -1,
      false
    );
    p2.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 22000 / speedMultiplier, easing: Easing.linear }),
      -1,
      false
    );
  }, [p1, p2, speedMultiplier]);

  const layer1Style = useAnimatedStyle(() => {
    // 顶部极光左右轻微扫动并带有倾斜
    const tx = (width * 0.3) * Math.sin(p1.value);
    const rot = Math.sin(p1.value * 0.5) * 10; 
    
    return {
      transform: [
        { translateX: tx },
        { rotateZ: `${rot}deg` },
      ],
    };
  });

  const layer2Style = useAnimatedStyle(() => {
    // 底部极光左右扫动，相位不同
    const tx = (width * 0.3) * Math.sin(p2.value);
    const rot = Math.cos(p2.value * 0.6) * -12;
    
    return {
      transform: [
        { translateX: tx },
        { rotateZ: `${rot}deg` },
      ],
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacityVal.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      {/* 顶部边缘发光区 */}
      <Animated.View style={[styles.topAurora, layer1Style]}>
        <LinearGradient
          colors={[color1, 'transparent']}
          start={{ x: 0.5, y: 0.1 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradientFill}
        />
      </Animated.View>
      
      {/* 底部边缘发光区 */}
      <Animated.View style={[styles.bottomAurora, layer2Style]}>
        <LinearGradient
          colors={[color2, 'transparent']}
          start={{ x: 0.5, y: 0.9 }}
          end={{ x: 0.5, y: 0 }}
          style={styles.gradientFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topAurora: {
    position: 'absolute',
    top: '-30%',
    left: '-50%',
    width: '200%',
    height: '80%',
  },
  bottomAurora: {
    position: 'absolute',
    bottom: '-30%',
    left: '-50%',
    width: '200%',
    height: '80%',
  },
  gradientFill: {
    flex: 1,
  },
});
