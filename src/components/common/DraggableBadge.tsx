import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export interface DraggableBadgeProps {
  /** 未读数，<= 0 时不显示 */
  count?: number;
  /** 拖拽拉断并松手消除后的回调 */
  onDismiss?: () => void | Promise<void>;
  /** 是否用于底部导航栏（微调尺寸与定位契约） */
  isBottomTab?: boolean;
  /** 最大展示数值，超出展示 99+，默认 99 */
  maxCount?: number;
  /** 背景红底颜色，默认 #FA5151 */
  badgeColor?: string;
  /** 文字颜色，默认 #FFFFFF */
  textColor?: string;
  /** 自定义外层容器样式 */
  style?: StyleProp<ViewStyle>;
  /** 无障碍描述 */
  accessibilityLabel?: string;
}

const SNAP_DISTANCE = 50; // 拉断水滴的距离阈值 (dp)
const BADGE_HEIGHT = 16;
const BADGE_RADIUS = BADGE_HEIGHT / 2;

const PARTICLE_OFFSETS: Array<{ dx: number; dy: number }> = [
  { dx: 16, dy: -16 },
  { dx: -16, dy: -16 },
  { dx: 16, dy: 16 },
  { dx: -16, dy: 16 },
];

interface ExplosionParticleProps {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  progress: SharedValue<number>;
  isExploding: SharedValue<boolean>;
  dx: number;
  dy: number;
  color: string;
}

/**
 * 炸裂散开的微粒动效组件 (单微粒独立驱动)
 */
function ExplosionParticle({
  tx,
  ty,
  progress,
  isExploding,
  dx,
  dy,
  color,
}: ExplosionParticleProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (!isExploding.value) {
      return { opacity: 0 };
    }
    const p = progress.value;
    return {
      opacity: 1 - p,
      transform: [
        { translateX: tx.value + p * dx },
        { translateY: ty.value + p * dy },
        { scale: Math.max(0, 1 - p * 0.8) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { backgroundColor: color }, animatedStyle]}
    />
  );
}

/**
 * 粘性拖拽消除小红点 (Draggable Viscous Badge)
 *
 * 核心交互：
 * 1. 正常轻触点击：位移 < 6px 时不拦截手势，平滑透传给父级 Pressable 进行路由导航或 Tab 切换；
 * 2. 拖拽拉伸水滴：手指位移 > 6px 激活手势，中心红点跟随手指，原位红点缩小，中间通过贝塞尔果冻连线拉伸；
 * 3. 破裂提醒：拖拽距离达到 50dp 时连线断开，原位消失，触发 Haptic 轻触震动反馈；拉回重新粘连再次轻触震动；
 * 4. 破裂松手：触发微粒破裂动画与成功级震动反馈，调用 onDismiss 彻底清空未读；
 * 5. 未破裂松手：以阻尼物理弹簧曲线优雅吸回原位，未读数完好保持。
 */
export function DraggableBadge({
  count = 0,
  onDismiss,
  isBottomTab = false,
  maxCount = 99,
  badgeColor = '#FA5151',
  textColor = '#FFFFFF',
  style,
  accessibilityLabel,
}: DraggableBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const displayText = count > maxCount ? `${maxCount}+` : String(count);

  // 保持回调引用稳定，避免父组件 re-render 导致手势实例重建抖动
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Reanimated 共享驱动值
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const hasSnapped = useSharedValue(false);
  const isExploding = useSharedValue(false);
  const explodeProgress = useSharedValue(0);

  const triggerSnapHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const triggerSuccessHaptic = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const handleDismissComplete = useCallback(() => {
    onDismissRef.current?.();
  }, []);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-6, 6])
      .activeOffsetY([-6, 6])
      .onStart(() => {
        isDragging.value = true;
        hasSnapped.value = false;
        isExploding.value = false;
        explodeProgress.value = 0;
      })
      .onUpdate((event) => {
        tx.value = event.translationX;
        ty.value = event.translationY;
        const dist = Math.sqrt(
          event.translationX * event.translationX + event.translationY * event.translationY
        );
        if (dist >= SNAP_DISTANCE) {
          if (!hasSnapped.value) {
            hasSnapped.value = true;
            runOnJS(triggerSnapHaptic)();
          }
        } else {
          if (hasSnapped.value) {
            hasSnapped.value = false;
            runOnJS(triggerSnapHaptic)();
          }
        }
      })
      .onEnd(() => {
        if (hasSnapped.value) {
          // 破裂松手：触发炸裂粒子动画与震动
          isExploding.value = true;
          runOnJS(triggerSuccessHaptic)();
          explodeProgress.value = withTiming(
            1,
            { duration: 180, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) {
                isDragging.value = false;
                tx.value = 0;
                ty.value = 0;
                hasSnapped.value = false;
                isExploding.value = false;
                runOnJS(handleDismissComplete)();
              }
            }
          );
        } else {
          // 未破裂松手：弹性吸回原位
          tx.value = withSpring(0, { damping: 14, stiffness: 220 });
          ty.value = withSpring(0, { damping: 14, stiffness: 220 }, (finished) => {
            if (finished) {
              isDragging.value = false;
            }
          });
        }
      })
      .onFinalize(() => {
        if (!hasSnapped.value && !isExploding.value) {
          isDragging.value = false;
        }
      });
  }, [explodeProgress, handleDismissComplete, hasSnapped, isDragging, isExploding, triggerSnapHaptic, triggerSuccessHaptic, tx, ty]);

  // 外层容器动态层级提升（拖拽时提升至 9999 避免被列表兄弟行或图标遮挡）
  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      zIndex: isDragging.value ? 9999 : 20,
    };
  });

  // 1. 手指跟随主体徽标样式
  const animatedHeadStyle = useAnimatedStyle(() => {
    if (isExploding.value) {
      return {
        transform: [
          { translateX: tx.value },
          { translateY: ty.value },
          { scale: 1 + explodeProgress.value * 0.4 },
        ],
        opacity: Math.max(0, 1 - explodeProgress.value * 1.5),
        zIndex: 9999,
      };
    }

    if (!isDragging.value) {
      return {
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
        opacity: 1,
        zIndex: 10,
      };
    }

    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: hasSnapped.value ? 1.08 : 1 },
      ],
      opacity: 1,
      zIndex: 9999,
    };
  });

  // 2. 原位锚点小圆点样式（随距离拉伸逐渐缩减，断开后彻底消失）
  const animatedAnchorStyle = useAnimatedStyle(() => {
    if (!isDragging.value || hasSnapped.value || isExploding.value) {
      return { opacity: 0, transform: [{ scale: 0 }] };
    }
    const dist = Math.sqrt(tx.value * tx.value + ty.value * ty.value);
    if (dist < 2) {
      return { opacity: 0, transform: [{ scale: 0 }] };
    }
    const scale = Math.max(0.2, 1 - (dist / SNAP_DISTANCE) * 0.75);
    return {
      opacity: 1,
      transform: [{ scale }],
    };
  });

  // 3. 弹性连接水滴桥梁样式（中间胶囊形拉伸）
  const animatedBridgeStyle = useAnimatedStyle(() => {
    if (!isDragging.value || hasSnapped.value || isExploding.value) {
      return { opacity: 0 };
    }
    const dist = Math.sqrt(tx.value * tx.value + ty.value * ty.value);
    if (dist < 4) {
      return { opacity: 0 };
    }

    const angle = Math.atan2(ty.value, tx.value);
    const thickness = Math.max(3, BADGE_HEIGHT * (1 - (dist / SNAP_DISTANCE) * 0.7));

    return {
      opacity: 1,
      transform: [
        { translateX: tx.value / 2 },
        { translateY: ty.value / 2 },
        { rotate: `${angle}rad` },
        { scaleX: Math.max(0.1, dist / 10) },
        { scaleY: Math.max(0.1, thickness / 10) },
      ],
    };
  });

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel || `${count} 条未读消息，按住可拖拽消除`}
      accessibilityRole="text"
      pointerEvents="box-none"
      style={[
        isBottomTab ? styles.bottomTabPosition : styles.itemPosition,
        animatedContainerStyle,
        style,
      ]}
    >
      {/* 2. 原位锚点小红点 (处于底层) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.anchorDot,
          { backgroundColor: badgeColor },
          animatedAnchorStyle,
        ]}
      />

      {/* 3. 中间弹性胶囊粘连拉扯桥 */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bridgeCapsule,
          { backgroundColor: badgeColor },
          animatedBridgeStyle,
        ]}
      />

      {/* 4. 炸裂飞散微粒 (4 个方位) */}
      {PARTICLE_OFFSETS.map(({ dx, dy }, idx) => (
        <ExplosionParticle
          color={badgeColor}
          dx={dx}
          dy={dy}
          isExploding={isExploding}
          key={`particle_${idx}`}
          progress={explodeProgress}
          tx={tx}
          ty={ty}
        />
      ))}

      {/* 1. 手指跟随的主体徽标 */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[
            styles.badgePill,
            { backgroundColor: badgeColor },
            animatedHeadStyle,
          ]}
        >
          <Text numberOfLines={1} style={[styles.badgeText, { color: textColor }]}>
            {displayText}
          </Text>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  itemPosition: {
    position: 'absolute',
    top: -3,
    right: -4,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabPosition: {
    position: 'absolute',
    top: -4,
    right: -10,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePill: {
    minWidth: BADGE_HEIGHT,
    height: BADGE_HEIGHT,
    borderRadius: BADGE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    textAlign: 'center',
  },
  anchorDot: {
    position: 'absolute',
    width: BADGE_HEIGHT,
    height: BADGE_HEIGHT,
    borderRadius: BADGE_RADIUS,
  },
  bridgeCapsule: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
