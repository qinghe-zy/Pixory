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
  damping = 10,
  stiffness = 200,
  externalForceX,
  externalForceY,
}: MagneticLiquidContainerProps) {
  const isPressed = useSharedValue(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX * magneticStrength;
      translateY.value = e.translationY * magneticStrength;
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

  const totalX = useDerivedValue(() => translateX.value + (externalForceX?.value ?? 0));
  const totalY = useDerivedValue(() => translateY.value + (externalForceY?.value ?? 0));
  
  const derivedAngle = useDerivedValue(() => Math.atan2(totalY.value, totalX.value));

  const derivedStretchX = useDerivedValue(() => {
    const distance = Math.sqrt(totalX.value * totalX.value + totalY.value * totalY.value);
    return 1 + distance * stretchFactor;
  });

  const derivedStretchY = useDerivedValue(() => Math.max(0.5, 1 / derivedStretchX.value));

  const animatedOuterStyle = useAnimatedStyle(() => {
    return {
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
      <Animated.View style={[styles.container, animatedOuterStyle]} collapsable={false}>
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
