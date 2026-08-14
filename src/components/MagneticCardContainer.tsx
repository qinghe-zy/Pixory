import React, { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useAnimatedSensor,
  SensorType,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';

export const MagneticCardContext = createContext<{
  rotateX: SharedValue<number>;
  rotateY: SharedValue<number>;
  gyroX: SharedValue<number>;
  gyroY: SharedValue<number>;
  gyroSensitivity: number;
} | null>(null);

export interface MagneticCardContainerProps {
  children: React.ReactNode;
  /** 最大旋转角度 (deg) */
  maxRotation?: number;
  /** 拖动距离对旋转的响应因子 */
  rotationFactor?: number;
  /** 陀螺仪敏感度 (将旋转角速度映射为物理偏转角度) */
  gyroSensitivity?: number;
}

/**
 * 磁吸卡片容器组件 (Magnetic Card Container)
 * 
 * 专为图片、海报、封面设计。
 * 提供无失真的 3D 偏转、Z轴景深悬浮反馈。
 * 并且结合了陀螺仪 (Gyroscope) 动量，在倾斜手机时会产生微妙的物理阻尼晃动。
 */
export function MagneticCardContainer({
  children,
  maxRotation = 12,
  rotationFactor = 0.08,
  gyroSensitivity = 4,
}: MagneticCardContainerProps) {
  const isPressed = useSharedValue(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // 使用陀螺仪获取瞬时角速度 (rad/s)
  const gyro = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 16 });

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
      // Z轴悬浮：轻微压扁阴影并缩小，模拟真实按下
      scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    })
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.4;
      translateY.value = e.translationY * 0.4;

      let nextRotateY = e.translationX * rotationFactor;
      let nextRotateX = -e.translationY * rotationFactor;

      rotateX.value = Math.max(-maxRotation, Math.min(maxRotation, nextRotateX));
      rotateY.value = Math.max(-maxRotation, Math.min(maxRotation, nextRotateY));
    })
    .onFinalize(() => {
      isPressed.value = false;
      const springConfig = { damping: 12, stiffness: 150 };
      translateX.value = withSpring(0, springConfig);
      translateY.value = withSpring(0, springConfig);
      rotateX.value = withSpring(0, springConfig);
      rotateY.value = withSpring(0, springConfig);
      scale.value = withSpring(1, springConfig);
    });

  // 使得陀螺仪数据更加平滑，并将其作为附加偏移量（类似浓稠液体里的气泡，移动缓慢不突兀）
  const smoothedGyroX = useDerivedValue(() => {
    return withSpring(gyro.sensor.value?.x ?? 0, { damping: 40, stiffness: 60 });
  });

  const smoothedGyroY = useDerivedValue(() => {
    return withSpring(gyro.sensor.value?.y ?? 0, { damping: 40, stiffness: 60 });
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      zIndex: isPressed.value ? 99 : 0,
      elevation: isPressed.value ? 99 : 0,
      transform: [
        { perspective: 800 }, // 创造 3D 景深
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
        { rotateX: `${rotateX.value}deg` }, // 卡片本身只受手势翻转影响
        { rotateY: `${rotateY.value}deg` },
      ],
    };
  });

  return (
    <MagneticCardContext.Provider value={{ 
      rotateX, 
      rotateY, 
      gyroX: smoothedGyroX, 
      gyroY: smoothedGyroY,
      gyroSensitivity,
    }}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[animatedStyle]} collapsable={false}>
          {children}
        </Animated.View>
      </GestureDetector>
    </MagneticCardContext.Provider>
  );
}

export interface GyroSpecularHighlightProps {
  /** 高光的最大强度 (0~1) */
  intensity?: number;
  /** 高光类型：点光源或扫光带 */
  type?: 'point' | 'band';
}

/**
 * 陀螺仪响应式微高光 (Gyro-Reactive Specular Highlight)
 * 必须放置在 MagneticCardContainer 的子节点内 (建议包裹在设置了 overflow: hidden 的内容层中)
 */
export function GyroSpecularHighlight({ intensity = 0.5, type = 'point' }: GyroSpecularHighlightProps) {
  const context = useContext(MagneticCardContext);
  if (!context) {
    console.warn('GyroSpecularHighlight must be used inside a MagneticCardContainer');
    return null;
  }

  const animatedStyle = useAnimatedStyle(() => {
    // 基础高光位置由卡片 3D 旋转角度决定（手指拖拽）
    let tx = context.rotateY.value * 25; 
    let ty = -context.rotateX.value * 25;

    // 叠加由陀螺仪带来的高光偏移量（晃动手机时只有高光游走，且变得极其缓慢和克制）
    tx += context.gyroY.value * context.gyroSensitivity * 15;
    ty += context.gyroX.value * context.gyroSensitivity * 15;

    // 根据倾斜角度增加高光强度 (倾斜越多越亮，制造“反光闪烁”感)
    const tiltMagnitude = Math.sqrt(tx * tx + ty * ty);
    const dynamicOpacity = Math.min(1, 0.1 + tiltMagnitude / 200);

    return {
      transform: [{ translateX: tx }, { translateY: ty }],
      opacity: dynamicOpacity * intensity,
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle, { pointerEvents: 'none' }]}>
      {/* 使用 300% 尺寸保证高光移动时边缘不突兀 */}
      <View style={{ position: 'absolute', width: '300%', height: '300%', top: '-100%', left: '-100%' }}>
        <Svg height="100%" width="100%">
          <Defs>
            {type === 'point' ? (
              <RadialGradient id="highlight-point" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="white" stopOpacity="0.4" />
                <Stop offset="15%" stopColor="white" stopOpacity="0.1" />
                <Stop offset="30%" stopColor="white" stopOpacity="0" />
              </RadialGradient>
            ) : (
              <SvgLinearGradient id="highlight-band" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="45%" stopColor="white" stopOpacity="0" />
                <Stop offset="48%" stopColor="white" stopOpacity="0.1" />
                <Stop offset="50%" stopColor="white" stopOpacity="0.3" />
                <Stop offset="52%" stopColor="white" stopOpacity="0.1" />
                <Stop offset="55%" stopColor="white" stopOpacity="0" />
              </SvgLinearGradient>
            )}
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={type === 'point' ? "url(#highlight-point)" : "url(#highlight-band)"} />
        </Svg>
      </View>
    </Animated.View>
  );
}
