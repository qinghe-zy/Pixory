import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Dimensions, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { AiSidebarSpatialPreset } from '../../../database';
import { AI_SIDEBAR_SPATIAL_PRESET_CONFIGS } from '../../../services/aiChatPreferences';

const SCREEN_WIDTH = Dimensions.get('window').width;
export const UNDERLAY_BG = '#E7EAF0';
export const SCALE_TARGET = 0.9;
export const TARGET_BORDER_RADIUS = 28;
export const LEFT_DRAWER_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
export const RIGHT_DRAWER_WIDTH = Math.round(SCREEN_WIDTH * 0.82);

const SPRING_OPEN = { damping: 26, stiffness: 320, mass: 0.58, overshootClamping: true };
const SPRING_CLOSE = { damping: 28, stiffness: 350, mass: 0.55, overshootClamping: true };

export interface ImPushScaleDrawerStageProps {
  children: ReactNode;
  leftDrawer?: ReactNode;
  rightDrawer?: ReactNode;
  leftDrawerVisible: boolean;
  rightDrawerVisible: boolean;
  canOpenRightDrawer?: boolean;
  onOpenLeftDrawer?: () => void;
  onOpenRightDrawer?: () => void;
  onCloseLeftDrawer: () => void;
  onCloseRightDrawer: () => void;
  sidebarMode?: 'push_scale' | 'classic';
  mainCardContentStyle?: StyleProp<ViewStyle>;
  spatialPreset?: AiSidebarSpatialPreset;
}

export function ImPushScaleDrawerStage({
  children,
  leftDrawer,
  rightDrawer,
  leftDrawerVisible,
  rightDrawerVisible,
  canOpenRightDrawer = true,
  onOpenLeftDrawer,
  onOpenRightDrawer,
  onCloseLeftDrawer,
  onCloseRightDrawer,
  sidebarMode = 'push_scale',
  mainCardContentStyle,
  spatialPreset = 'level_2',
}: ImPushScaleDrawerStageProps) {
  const progress = useSharedValue(0);
  const isDrawerOpen = leftDrawerVisible || rightDrawerVisible;
  // 伴聊侧边栏恒定推拉态，确保抽屉交互与 3D 景深体验始终可用
  const isPushScale = true;

  const presetConfig = AI_SIDEBAR_SPATIAL_PRESET_CONFIGS[spatialPreset] ?? AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_2;
  const targetScale = presetConfig.scale;
  const targetPerspective = presetConfig.perspective;
  const targetTiltDeg = presetConfig.tiltDeg;
  const targetLiftY = presetConfig.liftY;
  const scaleInsetCompensation = SCREEN_WIDTH * ((1 - targetScale) / 2);
  const leftPushX = LEFT_DRAWER_WIDTH - scaleInsetCompensation;
  const rightPushX = RIGHT_DRAWER_WIDTH - scaleInsetCompensation;

  const stateRef = useRef({ leftDrawerVisible, rightDrawerVisible, canOpenRightDrawer, onOpenLeftDrawer, onOpenRightDrawer, onCloseLeftDrawer, onCloseRightDrawer });
  stateRef.current = { leftDrawerVisible, rightDrawerVisible, canOpenRightDrawer, onOpenLeftDrawer, onOpenRightDrawer, onCloseLeftDrawer, onCloseRightDrawer };

  useEffect(() => {
    if (leftDrawerVisible) progress.value = withSpring(1, SPRING_OPEN);
    else if (rightDrawerVisible) progress.value = withSpring(-1, SPRING_OPEN);
    else progress.value = withSpring(0, SPRING_CLOSE);
  }, [leftDrawerVisible, rightDrawerVisible, progress]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => {
        if (!(Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.15)) return false;
        const { leftDrawerVisible: leftOpen, rightDrawerVisible: rightOpen, canOpenRightDrawer: canRight } = stateRef.current;
        if (!leftOpen && !rightOpen) return gs.dx > 8 || (gs.dx < -8 && canRight);
        return (leftOpen && gs.dx < -8) || (rightOpen && gs.dx > 8);
      },
      onPanResponderRelease: (_evt, gs) => {
        const { leftDrawerVisible: leftOpen, rightDrawerVisible: rightOpen, onOpenLeftDrawer: openLeft, onOpenRightDrawer: openRight, onCloseLeftDrawer: closeLeft, onCloseRightDrawer: closeRight } = stateRef.current;
        if (!leftOpen && !rightOpen) {
          if (gs.dx > 40 || (gs.dx > 15 && gs.vx > 0.2)) openLeft?.();
          else if (gs.dx < -40 || (gs.dx < -15 && gs.vx < -0.2)) openRight?.();
        } else if (leftOpen && (gs.dx < -40 || gs.vx < -0.2)) closeLeft();
        else if (rightOpen && (gs.dx > 40 || gs.vx > 0.2)) closeRight();
      },
    })
  ).current;

  const underlayLeftAnim = useAnimatedStyle(() => {
    const p = progress.value;
    if (p <= 0.005) return { opacity: 0, transform: [{ translateX: -24 }] };
    const leftP = interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1, transform: [{ translateX: interpolate(leftP, [0, 1], [-24, 0], Extrapolation.CLAMP) }] };
  });

  const underlayRightAnim = useAnimatedStyle(() => {
    const p = progress.value;
    if (p >= -0.005) return { opacity: 0, transform: [{ translateX: 24 }] };
    const rightP = interpolate(-p, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: 1, transform: [{ translateX: interpolate(rightP, [0, 1], [24, 0], Extrapolation.CLAMP) }] };
  });

  const mainCardAnim = useAnimatedStyle(() => {
    const p = progress.value;
    if (!isPushScale) return { transform: [{ translateX: 0 }], borderRadius: 0 };
    const absP = Math.abs(p);
    const scale = interpolate(absP, [0, 1], [1, targetScale], Extrapolation.CLAMP);
    const tx = p > 0 ? interpolate(p, [0, 1], [0, leftPushX], Extrapolation.CLAMP) : interpolate(p, [-1, 0], [-rightPushX, 0], Extrapolation.CLAMP);
    const ty = interpolate(absP, [0, 1], [0, targetLiftY], Extrapolation.CLAMP);
    const rotY = interpolate(p, [-1, 0, 1], [targetTiltDeg, 0, -targetTiltDeg], Extrapolation.CLAMP);
    const radius = interpolate(absP, [0, 0.05, 1], [0, TARGET_BORDER_RADIUS, TARGET_BORDER_RADIUS], Extrapolation.CLAMP);
    if (targetPerspective <= 0) {
      return { borderRadius: radius, transform: [{ translateX: tx }, { translateY: ty }, { scale }] };
    }
    return {
      borderRadius: radius,
      transform: [
        { perspective: targetPerspective },
        { translateX: tx },
        { translateY: ty },
        { scale },
        { rotateY: `${rotY}deg` },
      ],
    };
  }, [isPushScale, leftPushX, rightPushX, targetLiftY, targetPerspective, targetScale, targetTiltDeg]);

  const mainCardClipAnim = useAnimatedStyle(() => {
    const p = progress.value;
    if (!isPushScale) return { borderRadius: 0 };
    const radius = interpolate(Math.abs(p), [0, 0.05, 1], [0, TARGET_BORDER_RADIUS, TARGET_BORDER_RADIUS], Extrapolation.CLAMP);
    return { borderRadius: radius };
  });

  const leftEdgeShadowAnim = useAnimatedStyle(() => {
    const p = progress.value;
    return { opacity: p <= 0.01 ? 0 : interpolate(p, [0.01, 0.12, 1], [0, 0.6, 1], Extrapolation.CLAMP) };
  });

  const rightEdgeShadowAnim = useAnimatedStyle(() => {
    const p = progress.value;
    return { opacity: p >= -0.01 ? 0 : interpolate(-p, [0.01, 0.12, 1], [0, 0.6, 1], Extrapolation.CLAMP) };
  });

  const whiteMaskAnim = useAnimatedStyle(() => {
    const absP = Math.min(Math.abs(progress.value), 1);
    return { opacity: interpolate(absP, [0, 1], [0, 0.54], Extrapolation.CLAMP) };
  });

  const handleClose = () => {
    if (leftDrawerVisible) onCloseLeftDrawer();
    if (rightDrawerVisible) onCloseRightDrawer();
  };

  return (
    <View style={styles.stageHost} {...panResponder.panHandlers}>
      <View pointerEvents="box-none" style={styles.underlayCanvas}>
        {leftDrawer ? (
          <Animated.View pointerEvents={leftDrawerVisible ? 'box-none' : 'none'} style={[styles.drawerLayer, styles.leftDrawerBox, underlayLeftAnim]}>
            {leftDrawer}
          </Animated.View>
        ) : null}
        {rightDrawer ? (
          <Animated.View pointerEvents={rightDrawerVisible ? 'box-none' : 'none'} style={[styles.drawerLayer, styles.rightDrawerBox, underlayRightAnim]}>
            {rightDrawer}
          </Animated.View>
        ) : null}
      </View>

      <Animated.View style={[styles.mainCardShadow, mainCardAnim]}>
        <Animated.View pointerEvents="none" style={[styles.leftEdgeShadow, leftEdgeShadowAnim]}>
          <LinearGradient colors={['transparent', 'rgba(15, 23, 42, 0.012)', 'rgba(15, 23, 42, 0.05)', 'rgba(15, 23, 42, 0.16)']} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.rightEdgeShadow, rightEdgeShadowAnim]}>
          <LinearGradient colors={['rgba(15, 23, 42, 0.16)', 'rgba(15, 23, 42, 0.05)', 'rgba(15, 23, 42, 0.012)', 'transparent']} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>

        <Animated.View style={[styles.mainCardClip, mainCardClipAnim, mainCardContentStyle]}>
          {children}
          <Animated.View pointerEvents={isDrawerOpen ? 'auto' : 'none'} style={[styles.whiteDimMask, whiteMaskAnim]}>
            <Pressable accessibilityLabel="关闭侧边栏" accessibilityRole="button" onPress={handleClose} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageHost: { flex: 1, backgroundColor: UNDERLAY_BG, overflow: 'hidden' },
  underlayCanvas: { ...StyleSheet.absoluteFillObject, zIndex: 1, backgroundColor: UNDERLAY_BG },
  drawerLayer: { position: 'absolute', top: 0, bottom: 0 },
  leftDrawerBox: { left: 0, width: LEFT_DRAWER_WIDTH, backgroundColor: 'transparent' },
  rightDrawerBox: { right: 0, width: RIGHT_DRAWER_WIDTH, backgroundColor: UNDERLAY_BG },
  mainCardShadow: { flex: 1, zIndex: 2, backgroundColor: '#FFFFFF', shadowColor: '#0F172A', shadowOffset: { width: -12, height: 8 }, shadowOpacity: 0.16, shadowRadius: 36, elevation: 20 },
  mainCardClip: { flex: 1, overflow: 'hidden', backgroundColor: '#EDEDED' },
  whiteDimMask: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', zIndex: 50 },
  leftEdgeShadow: { position: 'absolute', left: -36, top: 22, bottom: 22, width: 36, zIndex: 3 },
  rightEdgeShadow: { position: 'absolute', right: -36, top: 22, bottom: 22, width: 36, zIndex: 3 },
});
