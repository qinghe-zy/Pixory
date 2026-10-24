import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { aiLightColors } from './aiLightTheme';
import type { AiSidebarSpatialPreset } from '../../database';
import { AI_SIDEBAR_SPATIAL_PRESET_CONFIGS } from '../../services/aiChatPreferences';

const SCREEN_WIDTH = Dimensions.get('window').width;

// 1. 几何常量定义
export const SCALE_TARGET = 0.9;
export const PUSH_SCALE_TARGET_SCALE = 0.9;
export const PUSH_SCALE_TARGET_BORDER_RADIUS = 28;
export const PUSH_SCALE_WHITE_MASK_MAX_OPACITY = 0.54;
export const PUSH_SCALE_OPTICAL_LIFT_Y = -4;
export const PUSH_SCALE_PERSPECTIVE = 1300;
export const PUSH_SCALE_TILT_DEG = 2.6;
export const PUSH_SCALE_SHADOW_MAX_OPACITY = 0.18;
export const PUSH_SCALE_SHADOW_RADIUS = 24;
export const PUSH_SCALE_SHADOW_OFFSET_X = -8;
export const PUSH_SCALE_CARD_BREATHING_GAP = 0;

export const LEFT_DRAWER_WIDTH_RATIO = 0.82;
export const RIGHT_DRAWER_WIDTH_RATIO = 0.82;

export const SCALE_INSET_COMPENSATION = SCREEN_WIDTH * ((1 - SCALE_TARGET) / 2); // 0.05 * W
export const LEFT_DRAWER_WIDTH = Math.round(SCREEN_WIDTH * LEFT_DRAWER_WIDTH_RATIO);
export const RIGHT_DRAWER_WIDTH = Math.round(SCREEN_WIDTH * RIGHT_DRAWER_WIDTH_RATIO);
export const LEFT_PUSH_TRANSLATE_X = LEFT_DRAWER_WIDTH - SCALE_INSET_COMPENSATION;
export const RIGHT_PUSH_TRANSLATE_X = RIGHT_DRAWER_WIDTH - SCALE_INSET_COMPENSATION;

const SWIPE_OPEN_ACTIVATION_DX = 6;
const SWIPE_OPEN_HORIZONTAL_RATIO = 1.15;
const SWIPE_CLOSE_ACTIVATION_DX = 6;
const SWIPE_CLOSE_HORIZONTAL_RATIO = 1.1;
const SNAP_OPEN_DISTANCE_RATIO = 0.15;
const SNAP_CLOSE_DISTANCE_RATIO = 0.15;
const SNAP_OPEN_VELOCITY = 0.14;
const SNAP_CLOSE_VELOCITY = 0.16;

const OPEN_SPRING_CONFIG = {
  damping: 26,
  stiffness: 320,
  mass: 0.58,
  overshootClamping: true,
};

const CLOSE_SPRING_CONFIG = {
  damping: 28,
  stiffness: 350,
  mass: 0.55,
  overshootClamping: true, // 严格阻断回弹穿透 0，杜绝“变尖再变圆”震荡
};

const SPRING_CONFIG = OPEN_SPRING_CONFIG;

interface AiPushScaleDrawerStageProps {
  /** 主界面内部组件（保持原有结构与布局不变） */
  children: ReactNode;
  /** 底层画布中的左侧边栏（综合记录） */
  leftDrawer?: ReactNode;
  /** 底层画布中的右侧边栏（会话设置） */
  rightDrawer?: ReactNode;
  /** 兼容合并传入的底层侧边栏节点 */
  underlayDrawers?: ReactNode;
  /** 左侧边栏是否展开 */
  leftDrawerVisible: boolean;
  /** 右侧边栏是否展开 */
  rightDrawerVisible: boolean;
  /** 是否允许手势拉开右侧边栏 */
  canOpenRightDrawer?: boolean;
  /** 手势拉开左侧边栏回调 */
  onOpenLeftDrawer?: () => void;
  /** 手势拉开右侧边栏回调 */
  onOpenRightDrawer?: () => void;
  /** 关闭左侧边栏回调 */
  onCloseLeftDrawer: () => void;
  /** 关闭右侧边栏回调 */
  onCloseRightDrawer: () => void;
  /** 主界面卡片内部底部安全边距样式 */
  mainCardContentStyle?: StyleProp<ViewStyle>;
  /** 空间透视角度五档预设（默认 level_2 推荐档） */
  spatialPreset?: AiSidebarSpatialPreset;
}

/**
 * 推挤缩放式侧边栏舞台容器（Push & Scale Drawer Stage）
 *
 * 空间层级：
 * - Z轴底层（underlayCanvas）：承载左右侧边栏，背景为统一高级灰色底板 #ECEEF1，无黑色半透明遮罩（No Scrim），与 progress 同向微视差联动且左右互斥。
 * - Z轴顶层外框（mainCardShadowWrapper）：严禁加 overflow: 'hidden'，负责执行 translateX + scale(0.90) 与原生 3D 环绕立体阴影（纯白底色）。
 * - Z轴顶层内框（mainCardClipWrapper）：设置 overflow: 'hidden'、动态发丝边框与动态 0 -> 28 大圆角，包裹主界面与 0 -> 0.4 浅白防误触遮罩。
 */
export function AiPushScaleDrawerStage({
  children,
  leftDrawer,
  rightDrawer,
  underlayDrawers,
  leftDrawerVisible,
  rightDrawerVisible,
  canOpenRightDrawer = true,
  onOpenLeftDrawer,
  onOpenRightDrawer,
  onCloseLeftDrawer,
  onCloseRightDrawer,
  mainCardContentStyle,
  spatialPreset = 'level_2',
}: AiPushScaleDrawerStageProps) {
  // progress: 0 = closed, +1 = left drawer open (push right), -1 = right drawer open (push left)
  const progress = useSharedValue(0);
  const isDrawerOpen = leftDrawerVisible || rightDrawerVisible;

  const presetConfig =
    AI_SIDEBAR_SPATIAL_PRESET_CONFIGS[spatialPreset] ?? AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_2;
  const targetScale = presetConfig.scale;
  const targetPerspective = presetConfig.perspective;
  const targetTiltDeg = presetConfig.tiltDeg;
  const targetLiftY = presetConfig.liftY;
  const dynamicScaleInsetCompensation = SCREEN_WIDTH * ((1 - targetScale) / 2);
  const dynamicLeftPushTranslateX = LEFT_DRAWER_WIDTH - dynamicScaleInsetCompensation;
  const dynamicRightPushTranslateX = RIGHT_DRAWER_WIDTH - dynamicScaleInsetCompensation;

  const stateRef = useRef({
    leftDrawerVisible,
    rightDrawerVisible,
    canOpenRightDrawer,
    onOpenLeftDrawer,
    onOpenRightDrawer,
    onCloseLeftDrawer,
    onCloseRightDrawer,
  });
  stateRef.current = {
    leftDrawerVisible,
    rightDrawerVisible,
    canOpenRightDrawer,
    onOpenLeftDrawer,
    onOpenRightDrawer,
    onCloseLeftDrawer,
    onCloseRightDrawer,
  };

  useEffect(() => {
    if (leftDrawerVisible) {
      progress.value = withSpring(1, OPEN_SPRING_CONFIG);
    } else if (rightDrawerVisible) {
      progress.value = withSpring(-1, OPEN_SPRING_CONFIG);
    } else {
      progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
    }
  }, [leftDrawerVisible, rightDrawerVisible, progress]);

  // 4. 底层左抽屉视差与互斥 (left: 0, width: LEFT_DRAWER_WIDTH)
  // 保持激活时恒定 opacity: 1，彻底避免 Android saveLayerAlpha 离屏帧缓冲掉帧与子卡片内阴影黑圈
  const underlayLeftAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p <= 0.005) {
      return { opacity: 0, transform: [{ translateX: -24 }] };
    }
    const leftP = interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: 1,
      transform: [
        { translateX: interpolate(leftP, [0, 1], [-24, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  // 5. 底层右抽屉视差与互斥 (强制 position: 'absolute', right: 0, width: RIGHT_DRAWER_WIDTH)
  const underlayRightAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p >= -0.005) {
      return { opacity: 0, transform: [{ translateX: 24 }] };
    }
    const rightP = interpolate(-p, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: 1,
      transform: [
        { translateX: interpolate(rightP, [0, 1], [24, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  // 2. 顶层主卡片外层容器 (CardShadowWrapper - 严禁加 overflow: 'hidden')
  const mainCardShadowAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value; // 范围: -1 (右抽屉开) ~ 0 (闭合) ~ +1 (左抽屉开)
    const absP = Math.min(Math.abs(p), 1);

    const translateX = interpolate(
      p,
      [-1, 0, 1],
      [-dynamicRightPushTranslateX, 0, dynamicLeftPushTranslateX],
      Extrapolation.CLAMP,
    );
    // 光学微上提，使缩放后主卡片顶边天际线与左右侧边栏标题水平对齐
    const translateY = interpolate(
      absP,
      [0, 1],
      [0, targetLiftY],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(absP, [0, 1], [1, targetScale], Extrapolation.CLAMP);
    // 前 5% 极小位移内立即锁定 28dp 大圆角，滑动全程绝不退化为直角矩形
    const borderRadius = interpolate(
      absP,
      [0, 0.05, 1],
      [0, PUSH_SCALE_TARGET_BORDER_RADIUS, PUSH_SCALE_TARGET_BORDER_RADIUS],
      Extrapolation.CLAMP,
    );

    if (targetTiltDeg <= 0 || targetPerspective <= 0) {
      return {
        borderRadius,
        transform: [
          { translateX },
          { translateY },
          { scale },
        ],
      };
    }

    const rotateYDeg = interpolate(
      p,
      [-1, 0, 1],
      [targetTiltDeg, 0, -targetTiltDeg],
      Extrapolation.CLAMP,
    );

    return {
      borderRadius,
      transform: [
        { perspective: targetPerspective },
        { translateX },
        { translateY },
        { scale },
        { rotateY: `${rotateYDeg}deg` },
      ],
    };
  }, [
    dynamicLeftPushTranslateX,
    dynamicRightPushTranslateX,
    targetLiftY,
    targetPerspective,
    targetScale,
    targetTiltDeg,
  ]);

  // 3. 顶层主卡片内层裁剪容器 (CardClipContainer - 负责 overflow: 'hidden' 裁剪恒定 28dp 大圆角)
  const mainCardClipAnimatedStyle = useAnimatedStyle(() => {
    const absP = Math.min(Math.abs(progress.value), 1);
    const borderRadius = interpolate(
      absP,
      [0, 0.05, 1],
      [0, PUSH_SCALE_TARGET_BORDER_RADIUS, PUSH_SCALE_TARGET_BORDER_RADIUS],
      Extrapolation.CLAMP,
    );
    return {
      borderRadius,
      borderWidth: 0,
    };
  });

  // 6. 左边缘柔和环境弥散光晕（当主卡片向右推开，左边缘投射向左抽屉）
  const leftEdgeShadowAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p <= 0.01) {
      return { opacity: 0 };
    }
    return {
      opacity: interpolate(p, [0.01, 0.12, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    };
  });

  // 7. 右边缘柔和环境弥散光晕（当主卡片向左推开，右边缘投射向右抽屉）
  const rightEdgeShadowAnimatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p >= -0.01) {
      return { opacity: 0 };
    }
    return {
      opacity: interpolate(-p, [0.01, 0.12, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    };
  });

  // 主界面浅白弱化与防误触遮罩：随 progress 透明度 0 -> 0.54
  const whiteMaskAnimatedStyle = useAnimatedStyle(() => {
    const absProgress = Math.min(1, Math.abs(progress.value));
    const opacity = interpolate(
      absProgress,
      [0, 1],
      [0, PUSH_SCALE_WHITE_MASK_MAX_OPACITY],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Full-stage interactive drag-to-open & drag-to-close with velocity-aware elastic snap
  const gestureModeRef = useRef<'open-left' | 'open-right' | 'close-left' | 'close-right' | null>(
    null,
  );
  const dragStartDxRef = useRef(0);

  const stagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_evt, gs) => {
          const {
            leftDrawerVisible: leftOpen,
            rightDrawerVisible: rightOpen,
            canOpenRightDrawer: allowRight,
          } = stateRef.current;

          // 1. When a drawer is open: capture horizontal swipe toward the close direction
          // anywhere on the floating card OR inside the open sidebar
          if (leftOpen) {
            if (
              gs.dx < -SWIPE_CLOSE_ACTIVATION_DX &&
              Math.abs(gs.dx) > Math.abs(gs.dy) * SWIPE_CLOSE_HORIZONTAL_RATIO
            ) {
              gestureModeRef.current = 'close-left';
              dragStartDxRef.current = gs.dx;
              return true;
            }
            return false;
          }
          if (rightOpen) {
            if (
              gs.dx > SWIPE_CLOSE_ACTIVATION_DX &&
              Math.abs(gs.dx) > Math.abs(gs.dy) * SWIPE_CLOSE_HORIZONTAL_RATIO
            ) {
              gestureModeRef.current = 'close-right';
              dragStartDxRef.current = gs.dx;
              return true;
            }
            return false;
          }

          // 2. When closed: capture horizontal swipe on the main screen to interactively pull open
          if (
            Math.abs(gs.dx) > SWIPE_OPEN_ACTIVATION_DX &&
            Math.abs(gs.dx) > Math.abs(gs.dy) * SWIPE_OPEN_HORIZONTAL_RATIO
          ) {
            if (gs.dx > 0 && stateRef.current.onOpenLeftDrawer) {
              gestureModeRef.current = 'open-left';
              dragStartDxRef.current = gs.dx;
              return true;
            }
            if (gs.dx < 0 && allowRight && stateRef.current.onOpenRightDrawer) {
              gestureModeRef.current = 'open-right';
              dragStartDxRef.current = gs.dx;
              return true;
            }
          }
          return false;
        },
        onPanResponderMove: (_evt, gs) => {
          const mode = gestureModeRef.current;
          const netDx = gs.dx - dragStartDxRef.current;
          if (mode === 'close-left') {
            const clampedDx = Math.min(0, Math.max(-LEFT_DRAWER_WIDTH, netDx));
            progress.value = Math.max(0, Math.min(1, 1 + clampedDx / LEFT_DRAWER_WIDTH));
          } else if (mode === 'close-right') {
            const clampedDx = Math.max(0, Math.min(RIGHT_DRAWER_WIDTH, netDx));
            progress.value = Math.min(0, Math.max(-1, -1 + clampedDx / RIGHT_DRAWER_WIDTH));
          } else if (mode === 'open-left') {
            const clampedDx = Math.max(0, Math.min(LEFT_DRAWER_WIDTH, netDx));
            progress.value = Math.max(0, Math.min(1, clampedDx / LEFT_DRAWER_WIDTH));
          } else if (mode === 'open-right') {
            const clampedDx = Math.min(0, Math.max(-RIGHT_DRAWER_WIDTH, netDx));
            progress.value = Math.min(0, Math.max(-1, clampedDx / RIGHT_DRAWER_WIDTH));
          }
        },
        onPanResponderRelease: (_evt, gs) => {
          const mode = gestureModeRef.current;
          gestureModeRef.current = null;

          if (mode === 'close-left') {
            const shouldClose =
              gs.dx < -LEFT_DRAWER_WIDTH * SNAP_CLOSE_DISTANCE_RATIO ||
              gs.vx < -SNAP_CLOSE_VELOCITY;
            if (shouldClose) {
              progress.value = withSpring(0, {
                ...CLOSE_SPRING_CONFIG,
                velocity: gs.vx / LEFT_DRAWER_WIDTH,
              });
              stateRef.current.onCloseLeftDrawer();
            } else {
              progress.value = withSpring(1, {
                ...OPEN_SPRING_CONFIG,
                velocity: gs.vx / LEFT_DRAWER_WIDTH,
              });
            }
          } else if (mode === 'close-right') {
            const shouldClose =
              gs.dx > RIGHT_DRAWER_WIDTH * SNAP_CLOSE_DISTANCE_RATIO ||
              gs.vx > SNAP_CLOSE_VELOCITY;
            if (shouldClose) {
              progress.value = withSpring(0, {
                ...CLOSE_SPRING_CONFIG,
                velocity: gs.vx / RIGHT_DRAWER_WIDTH,
              });
              stateRef.current.onCloseRightDrawer();
            } else {
              progress.value = withSpring(-1, {
                ...OPEN_SPRING_CONFIG,
                velocity: gs.vx / RIGHT_DRAWER_WIDTH,
              });
            }
          } else if (mode === 'open-left') {
            const shouldOpen =
              gs.dx > LEFT_DRAWER_WIDTH * SNAP_OPEN_DISTANCE_RATIO ||
              (gs.dx > SWIPE_OPEN_ACTIVATION_DX && gs.vx > SNAP_OPEN_VELOCITY);
            if (shouldOpen) {
              progress.value = withSpring(1, {
                ...OPEN_SPRING_CONFIG,
                velocity: gs.vx / LEFT_DRAWER_WIDTH,
              });
              stateRef.current.onOpenLeftDrawer?.();
            } else {
              progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
            }
          } else if (mode === 'open-right') {
            const shouldOpen =
              gs.dx < -RIGHT_DRAWER_WIDTH * SNAP_OPEN_DISTANCE_RATIO ||
              (gs.dx < -SWIPE_OPEN_ACTIVATION_DX && gs.vx < -SNAP_OPEN_VELOCITY);
            if (shouldOpen) {
              progress.value = withSpring(-1, {
                ...OPEN_SPRING_CONFIG,
                velocity: gs.vx / RIGHT_DRAWER_WIDTH,
              });
              stateRef.current.onOpenRightDrawer?.();
            } else {
              progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
            }
          }
        },
        onPanResponderTerminate: () => {
          gestureModeRef.current = null;
          if (stateRef.current.leftDrawerVisible) {
            progress.value = withSpring(1, OPEN_SPRING_CONFIG);
          } else if (stateRef.current.rightDrawerVisible) {
            progress.value = withSpring(-1, OPEN_SPRING_CONFIG);
          } else {
            progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
          }
        },
      }),
    [progress],
  );

  function handleOverlayPress() {
    if (leftDrawerVisible) {
      progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
      onCloseLeftDrawer();
    } else if (rightDrawerVisible) {
      progress.value = withSpring(0, CLOSE_SPRING_CONFIG);
      onCloseRightDrawer();
    }
  }

  return (
    <View style={styles.stageRoot} {...stagePanResponder.panHandlers}>
      {/* Z轴底层画布：承载左右侧边栏，背景色 #E7EAF0，无传统黑幕 Scrim，微视差 + 严格互斥 */}
      <View pointerEvents="box-none" style={styles.underlayCanvas}>
        {leftDrawer ? (
          <Animated.View
            pointerEvents={leftDrawerVisible ? 'box-none' : 'none'}
            style={[styles.underlayLeftSlot, underlayLeftAnimatedStyle]}
          >
            {leftDrawer}
          </Animated.View>
        ) : null}
        {rightDrawer ? (
          <Animated.View
            pointerEvents={rightDrawerVisible ? 'box-none' : 'none'}
            style={[styles.underlayRightSlot, underlayRightAnimatedStyle]}
          >
            {rightDrawer}
          </Animated.View>
        ) : null}
        {underlayDrawers}
      </View>

      {/* Z轴顶层卡片外框 (CardShadowWrapper)：纯白底色 #FFFFFF，负责缩放、推挤与 3D 环绕立体阴影（严禁加 overflow: hidden） */}
      <Animated.View
        style={[styles.mainCardShadowWrapper, mainCardShadowAnimatedStyle]}
      >
        {/* 左边缘双层非对称立体环境弥散光晕（上下内缩 22px 避开 28dp 圆角弧线，杜绝顶角/底角露出平切方块） */}
        <Animated.View
          pointerEvents="none"
          style={[styles.leftEdgeShadow, leftEdgeShadowAnimatedStyle]}
        >
          <LinearGradient
            colors={[
              'transparent',
              'rgba(0, 0, 0, 0.012)',
              'rgba(0, 0, 0, 0.048)',
              'rgba(0, 0, 0, 0.135)',
            ]}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* 右边缘双层非对称立体环境弥散光晕（上下内缩 22px 避开 28dp 圆角弧线） */}
        <Animated.View
          pointerEvents="none"
          style={[styles.rightEdgeShadow, rightEdgeShadowAnimatedStyle]}
        >
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0.135)',
              'rgba(0, 0, 0, 0.048)',
              'rgba(0, 0, 0, 0.012)',
              'transparent',
            ]}
            end={{ x: 1, y: 0 }}
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Z轴顶层卡片内框 (CardClipContainer)：设置 overflow: 'hidden' 裁剪恒定 28px 大圆角与 1px 亚克力厚度边框 */}
        <Animated.View
          style={[
            styles.mainCardClipWrapper,
            mainCardContentStyle,
            mainCardClipAnimatedStyle,
          ]}
        >
          {children}

          {/* 主界面光学哑光雾化遮罩：随 progress 透明度 0 -> 0.54，抹平主屏深色文字噪音并拦截误触 */}
          <Animated.View
            pointerEvents={isDrawerOpen ? 'auto' : 'none'}
            style={[styles.whiteDimMask, whiteMaskAnimatedStyle]}
          >
            <Pressable
              accessibilityLabel="收起侧边栏"
              accessibilityRole="button"
              onPress={handleOverlayPress}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageRoot: {
    flex: 1,
    backgroundColor: aiLightColors.underlayCanvas,
  },
  underlayCanvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: aiLightColors.underlayCanvas,
  },
  underlayLeftSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: LEFT_DRAWER_WIDTH,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  underlayRightSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: RIGHT_DRAWER_WIDTH,
    backgroundColor: aiLightColors.underlayCanvas,
    borderWidth: 0,
  },
  leftEdgeShadow: {
    position: 'absolute',
    top: 22,
    bottom: 22,
    left: -28,
    width: 28,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: -1,
  },
  rightEdgeShadow: {
    position: 'absolute',
    top: 22,
    bottom: 22,
    right: -28,
    width: 28,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: -1,
  },
  mainCardShadowWrapper: {
    flex: 1,
    zIndex: 2,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0,
    shadowRadius: 24,
    elevation: 0,
  },
  mainCardClipWrapper: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  whiteDimMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 30,
  },
});
