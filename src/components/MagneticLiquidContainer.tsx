import React from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

export interface MagneticLiquidContainerProps {
  children: React.ReactNode;
  /** 磁吸/拖拽的阻力系数，越小越难拉动 (默认 0.3) */
  magneticStrength?: number;
  /** 拉伸系数，控制拉伸时的形变程度 (默认 0.005) */
  stretchFactor?: number;
  /** 弹簧回弹时的阻尼系数，越小越Q弹 (默认 10) */
  damping?: number;
  /** 弹簧的刚度 (默认 200) */
  stiffness?: number;
  /** 外部注入的水平力（用于翻页联动拉伸） */
  externalForceX?: SharedValue<number>;
  /** 外部注入的垂直力 */
  externalForceY?: SharedValue<number>;
  /** 外部样式 (如 flex: 1) */
  style?: any;
  /** 最大形变比例限制 (默认 1.35) */
  maxScale?: number;
  /** 最大平移阻力极限 (默认 120) */
  maxTranslation?: number;
}

/**
 * 磁吸流体拉伸容器组件 (Magnetic Liquid Pull)
 * 
 * 将任何普通的 UI 组件（如按钮、头像、卡片）包裹在此组件内，
 * 即可赋予其物理级的高级弹性拖拽反馈。拖动时具有非线性阻力，
 * 且会根据拖拽方向产生保持体积守恒的“水滴/果冻”拉伸形变。
 */
export function MagneticLiquidContainer({
  children,
  magneticStrength = 0.3,
  stretchFactor = 0.005,
  damping = 12,
  stiffness = 300,
  externalForceX,
  externalForceY,
  style,
  maxScale = 1.35,
  maxTranslation = 120,
}: MagneticLiquidContainerProps) {
  const isPressed = useSharedValue(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const fallbackForce = useSharedValue(0);
  const forceX = externalForceX ?? fallbackForce;
  const forceY = externalForceY ?? fallbackForce;

  const panGesture = Gesture.Pan()
    // 将激活死区从 5 像素大幅压缩到 1 像素，几乎实现“零延迟”跟手，
    // 同时保留这 1 像素是为了防止普通点击（Tap）的手指微颤被误判为拖拽而导致点击失效。
    .activeOffsetX([-1, 1])
    .activeOffsetY([-1, 1])
    .onBegin(() => {
      isPressed.value = true;
    })
    .onUpdate((e) => {
      const rawTx = e.translationX * magneticStrength;
      const rawTy = e.translationY * magneticStrength;
      // 渐进式非线性阻力：越拉越费力，且不会超过 maxTranslation
      translateX.value = maxTranslation * Math.tanh(rawTx / maxTranslation);
      translateY.value = maxTranslation * Math.tanh(rawTy / maxTranslation);
    })
    .onFinalize(() => {
      isPressed.value = false;
      const springConfig = {
        damping,
        stiffness,
        mass: 1,
        overshootClamping: false,
        restDisplacementThreshold: 0.01,
        restSpeedThreshold: 2,
      };
      translateX.value = withSpring(0, springConfig);
      translateY.value = withSpring(0, springConfig);
    });

  const totalX = useDerivedValue(() => translateX.value + forceX.value);
  const totalY = useDerivedValue(() => translateY.value + forceY.value);
  
  const derivedAngle = useDerivedValue(() => Math.atan2(totalY.value, totalX.value));

  const derivedStretchX = useDerivedValue(() => {
    const distance = Math.sqrt(totalX.value * totalX.value + totalY.value * totalY.value);
    const maxStretchAmount = maxScale - 1;
    // 使用 tanh 限制形变上限，防止无底线拉伸变形
    return 1 + maxStretchAmount * Math.tanh((distance * stretchFactor) / maxStretchAmount);
  });

  const derivedStretchY = useDerivedValue(() => Math.max(0.5, 1 / derivedStretchX.value));

  const animatedOuterStyle = useAnimatedStyle(() => {
    return {
      zIndex: isPressed.value ? 999 : 0,
      transform: [
        { translateX: totalX.value },
        { translateY: totalY.value },
        { rotateZ: `${derivedAngle.value}rad` },
        { scaleX: derivedStretchX.value },
        { scaleY: derivedStretchY.value },
      ],
    };
  });

  const animatedInnerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateZ: `${-derivedAngle.value}rad` },
      ],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      {/* 使用 collapsable={false} 确保响应手势 */}
      <Animated.View style={[styles.container, style, animatedOuterStyle]} collapsable={false}>
        <Animated.View style={[styles.inner, animatedInnerStyle]} collapsable={false}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    // 容器只负责定位与形变，不应有背景色，背景色由 children 提供
  },
  inner: {
    // 内部容器包裹真实子节点
  },
});
