import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedSvg = Animated.createAnimatedComponent(Svg);

export interface OrbitalSpectralRingProps {
  /** 被包裹的头像尺寸（直径） */
  avatarSize: number;
  /** 是否处于活跃状态（比如 AI 正在说话、生成中），此时动画会加速并扩大 */
  isActive?: boolean;
  /** 环的厚度，默认 3 */
  thickness?: number;
  /** 外延的间距，默认单侧外延 4px */
  padding?: number;
}

/**
 * 环形声纹星轨组件 (Google Style Segmented Ring)
 * 采用类似谷歌的单圈、四色分段设计。活跃时高亮并持续旋转。
 */
export function OrbitalSpectralRing({
  avatarSize,
  isActive = false,
  thickness = 3,
  padding = 4,
}: OrbitalSpectralRingProps) {
  const baseSize = avatarSize + padding * 2;
  const radius = baseSize / 2;
  const center = (baseSize + 12) / 2;
  
  // 持续旋转的相位
  const rotation = useSharedValue(0);
  const activeVal = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeVal.value = withTiming(isActive ? 1 : 0, { duration: 800, easing: Easing.inOut(Easing.ease) });
  }, [isActive, activeVal]);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 12000, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => {
    const scale = 1 + activeVal.value * 0.08; // 活跃时略微放大
    return {
      transform: [
        { rotateZ: `${rotation.value}deg` },
        { scale }
      ],
      opacity: 0.4 + activeVal.value * 0.6, // 安静时变暗，活跃时完全亮起
    };
  });

  const circumference = 2 * Math.PI * radius;
  // 给每一段增加一点点长度（+1.5）来防止抗锯齿导致的子像素缝隙
  const quarter = circumference / 4;
  const segmentLength = quarter + 1.5;

  return (
    <View style={styles.container} pointerEvents="none">
      <AnimatedSvg 
        width={baseSize + 12} 
        height={baseSize + 12} 
        viewBox={`0 0 ${baseSize + 12} ${baseSize + 12}`}
        style={ringStyle}
      >
        {/* Bottom-Right: Green */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#10e863" strokeWidth={thickness} fill="none"
          strokeDasharray={`${segmentLength} ${circumference}`}
          strokeDashoffset={0}
        />
        {/* Bottom-Left: Yellow */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#ffd500" strokeWidth={thickness} fill="none"
          strokeDasharray={`${segmentLength} ${circumference}`}
          strokeDashoffset={-quarter}
        />
        {/* Top-Left: Red */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#ff3838" strokeWidth={thickness} fill="none"
          strokeDasharray={`${segmentLength} ${circumference}`}
          strokeDashoffset={-quarter * 2}
        />
        {/* Top-Right: Blue */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#0a84ff" strokeWidth={thickness} fill="none"
          strokeDasharray={`${segmentLength} ${circumference}`}
          strokeDashoffset={-quarter * 3}
        />
      </AnimatedSvg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
});
