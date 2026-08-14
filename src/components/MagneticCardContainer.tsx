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
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export const MagneticCardContext = createContext<{
  rotateX: SharedValue<number>;
  rotateY: SharedValue<number>;
  pitch: SharedValue<number>;
  roll: SharedValue<number>;
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
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // 优先使用 ROTATION (地磁+陀螺仪绝对旋转)，因为其物理顺滑感和体验更好。
  // 但在某些设备上如果被禁用或无传感器，会静默返回全 0。此时回退到几乎 100% 兼容的 GRAVITY (重力加速)。
  const rotation = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 16 });

  // 记录 ROTATION 是否真实产生了数据
  const hasRotationData = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      isPressed.value = true;
      // Z轴悬浮：轻微压扁阴影并缩小，模拟真实按下
      scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    })
    .onUpdate((e) => {
      let nextRotateY = e.translationX * rotationFactor;
      let nextRotateX = -e.translationY * rotationFactor;

      rotateX.value = Math.max(-maxRotation, Math.min(maxRotation, nextRotateX));
      rotateY.value = Math.max(-maxRotation, Math.min(maxRotation, nextRotateY));
    })
    .onFinalize(() => {
      isPressed.value = false;
      const springConfig = { damping: 12, stiffness: 150 };
      rotateX.value = withSpring(0, springConfig);
      rotateY.value = withSpring(0, springConfig);
      scale.value = withSpring(1, springConfig);
    });

  // 平滑物理倾斜角度。动态判断并选择传感器数据源。
  // 优化物理手感：降低阻尼 (damping) 并微调刚度 (stiffness)，使得光效跟随手腕滑动时产生极其丝滑的“流体滞后感”和微小回弹。
  const sensorSpringConfig = { damping: 28, stiffness: 55, mass: 0.8 };

  const smoothedPitch = useDerivedValue(() => {
    let rPitch = rotation.sensor.value?.pitch ?? 0;
    let rRoll = rotation.sensor.value?.roll ?? 0;
    let rYaw = rotation.sensor.value?.yaw ?? 0;
    
    if (!hasRotationData.value && (rPitch !== 0 || rRoll !== 0 || rYaw !== 0)) {
      hasRotationData.value = true;
    }

    if (hasRotationData.value) {
      return withSpring(rPitch * 8, sensorSpringConfig);
    } else {
      return withSpring(gravity.sensor.value?.y ?? 0, sensorSpringConfig);
    }
  });

  const smoothedRoll = useDerivedValue(() => {
    if (hasRotationData.value) {
      let rRoll = rotation.sensor.value?.roll ?? 0;
      return withSpring(rRoll * 8, sensorSpringConfig);
    } else {
      return withSpring(gravity.sensor.value?.x ?? 0, sensorSpringConfig);
    }
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      zIndex: isPressed.value ? 99 : 0,
      elevation: isPressed.value ? 99 : 0,
      transform: [
        { perspective: 800 }, // 创造 3D 景深
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
      pitch: smoothedPitch, 
      roll: smoothedRoll,
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
}

/**
 * 陀螺仪响应式微高光 (Gyro-Reactive Specular Highlight)
 * 必须放置在 MagneticCardContainer 的子节点内 (建议包裹在设置了 overflow: hidden 的内容层中)
 */
export function GyroSpecularHighlight({ intensity = 0.5 }: GyroSpecularHighlightProps) {
  const context = useContext(MagneticCardContext);
  if (!context) {
    console.warn('GyroSpecularHighlight must be used inside a MagneticCardContainer');
    return null;
  }

  // 前沿高光算法 1：Sheen (高光面反射) + 全向物理跟随 (Angular Tracking)
  // 带有菲涅尔效应的锐利扫光带，不仅亮度随倾斜角变大，其光带的旋转角度也 360 度完全跟随物理重力向量
  const animatedSheenStyle = useAnimatedStyle(() => {
    let tx = -context.rotateY.value * 25; 
    let ty = -context.rotateX.value * 25;
    tx -= context.roll.value * context.gyroSensitivity * 15;
    ty -= context.pitch.value * context.gyroSensitivity * 15;

    // 菲涅尔方程近似
    const tiltMagnitude = Math.sqrt(tx * tx + ty * ty);
    const fresnelOpacity = Math.min(1, 0.4 + (tiltMagnitude / 150));

    // 核心高级算法：计算重力向量的绝对角度 (弧度)
    // 使得光效带始终完美垂直于手机倾斜滑动的方向，实现真正的 3D 球面反光映射
    const angle = Math.atan2(ty, tx);

    return {
      transform: [
        { translateX: tx * 1.6 },
        { translateY: ty * 1.6 },
        { rotate: `${angle}rad` }, // 动态注入旋转
      ],
      opacity: intensity * fresnelOpacity,
    };
  });

  // 前沿高光算法 2：Ambient Glow (环境柔光光源)
  // 模拟远处的巨大柔光箱，移动速度较慢，与 Sheen 形成 3D 视差 (Parallax) 纵深感
  const animatedAmbientStyle = useAnimatedStyle(() => {
    let tx = -context.rotateY.value * 25; 
    let ty = -context.rotateX.value * 25;
    tx -= context.roll.value * context.gyroSensitivity * 15;
    ty -= context.pitch.value * context.gyroSensitivity * 15;

    return {
      transform: [
        { translateX: tx * 0.5 }, // 速度系数 0.5，视觉上位于更深的空间
        { translateY: ty * 0.5 },
      ],
      opacity: intensity * 0.7, // 保持恒定且柔和的环境照明
    };
  });

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      {/* 底层空间：Ambient Glow 环境漫反射 */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedAmbientStyle]}>
        <View style={{ position: 'absolute', width: '200%', height: '200%', top: '-50%', left: '-50%' }}>
          <Svg height="100%" width="100%">
            <Defs>
              <RadialGradient id="ambient-glow" cx="50%" cy="50%" rx="50%" ry="50%">
                {/* 极其柔和的宽广光源，绝不产生“手电筒光点”感 */}
                <Stop offset="0%" stopColor="white" stopOpacity="0.35" />
                <Stop offset="50%" stopColor="white" stopOpacity="0.1" />
                <Stop offset="100%" stopColor="white" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambient-glow)" />
          </Svg>
        </View>
      </Animated.View>

      {/* 顶层空间：Directional Sheen 镜面高光带 (融合微小色散 Chromatic Aberration) */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedSheenStyle]}>
        <View style={{ position: 'absolute', width: '300%', height: '300%', top: '-100%', left: '-100%' }}>
          {/* 红橙色散边 (稍稍向左偏移) */}
          <LinearGradient
            colors={['rgba(255,50,0,0)', 'rgba(255,100,0,0.15)', 'rgba(255,255,255,0)']}
            locations={[0.42, 0.48, 0.51]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {/* 主白光体 */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
            locations={[0.4, 0.47, 0.5, 0.53, 0.6]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          {/* 青蓝色散边 (稍稍向右偏移) */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(0,180,255,0.15)', 'rgba(0,50,255,0)']}
            locations={[0.49, 0.52, 0.58]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>
    </View>
  );
}
