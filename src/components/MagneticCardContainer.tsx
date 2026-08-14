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
  const smoothedPitch = useDerivedValue(() => {
    let rPitch = rotation.sensor.value?.pitch ?? 0;
    let rRoll = rotation.sensor.value?.roll ?? 0;
    let rYaw = rotation.sensor.value?.yaw ?? 0;
    
    // 如果 ROTATION 传感器有任何非 0 数据输出，说明硬件可用且未被权限拦截
    if (!hasRotationData.value && (rPitch !== 0 || rRoll !== 0 || rYaw !== 0)) {
      hasRotationData.value = true;
    }

    if (hasRotationData.value) {
      // ROTATION 的 pitch 为弧度。放大 8 倍以对齐 GRAVITY 的数值范围，确保高光扫过幅度一致。
      return withSpring(rPitch * 8, { damping: 40, stiffness: 60 });
    } else {
      // 降级使用 GRAVITY 的 y 轴重力分量
      return withSpring(gravity.sensor.value?.y ?? 0, { damping: 40, stiffness: 60 });
    }
  });

  const smoothedRoll = useDerivedValue(() => {
    if (hasRotationData.value) {
      let rRoll = rotation.sensor.value?.roll ?? 0;
      return withSpring(rRoll * 8, { damping: 40, stiffness: 60 });
    } else {
      return withSpring(gravity.sensor.value?.x ?? 0, { damping: 40, stiffness: 60 });
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

  const animatedStyle = useAnimatedStyle(() => {
    // 基础高光位置由卡片手势翻转角度决定
    let tx = -context.rotateY.value * 25; 
    let ty = -context.rotateX.value * 25;

    // 叠加设备物理旋转 (基于重力 x/y 分量)
    // 重力值在 -9.8 到 +9.8 左右。映射到像素位移，使得高光可以在卡片表面大幅度平滑扫过
    tx -= context.roll.value * context.gyroSensitivity * 15;
    ty -= context.pitch.value * context.gyroSensitivity * 15;

    return {
      transform: [
        { translateX: tx }, 
        { translateY: ty },
      ],
      opacity: intensity, // 保持恒定亮度，不随角度变暗，确保“通透度不能变”
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle, { pointerEvents: 'none' }]}>
      {/* 300% 尺寸并旋转 45度，形成大面积的对角线高级反光扫过卡片 */}
      <View style={{ position: 'absolute', width: '300%', height: '300%', top: '-100%', left: '-100%', transform: [{ rotate: '45deg' }] }}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
          locations={[0.3, 0.45, 0.5, 0.55, 0.7]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </View>
    </Animated.View>
  );
}
