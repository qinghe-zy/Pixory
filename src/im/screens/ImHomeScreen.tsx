import React, { useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../../database';
import { listRoleCards } from '../../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../../ai/types';
import { AiRoleCardRail, getCachedRoleCards, setCachedRoleCards } from '../../components/ai/AiRoleCardRail';
import type { ImThreadListItem } from '../types';
import { ImThreadList } from '../components/ImThreadList';
import { colors, layout, radius, spacing } from '../../design/tokens';
import { FloatingFooterContext } from '../../components/AppScreen';
import { GlobalHeartbeatEngine } from '../heartbeat/globalHeartbeatEngine';

export interface ImHomeScreenProps {
  space: PixorySpace;
  isActive?: boolean;
  refreshToken?: number;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onCreateRole?: () => void;
  onImportRole?: () => void;
  onOpenRoleLibrary?: () => void;
  onOpenRoleCardDetail?: (roleCardId: string) => void;
}

const SHELF_CONTENT_HEIGHT = 80;
// 炫技级果冻欠阻尼谐振波参数（阻尼比 zeta ≈ 0.655，带轻盈微过冲与果冻布丁般柔和落定）
const SPRING_JELLY_OPEN = {
  damping: 12.5,
  stiffness: 175,
  mass: 0.52,
  overshootClamping: false,
};
const SPRING_JELLY_CLOSE = {
  damping: 22,
  stiffness: 260,
  mass: 0.5,
  overshootClamping: false,
};
const GUIDE_STORAGE_KEY = 'im_pull_peek_guided_v1';
const SPRING_OPEN = SPRING_JELLY_OPEN;
const SPRING_CLOSE = SPRING_JELLY_CLOSE;

/**
 * 磁流体双曲势阱阻尼方程
 * - 0 ~ 70%：粘滞重流体阻抗，提供沉稳扎实的拉伸手感
 * - 70% ~ 100%：临界突变点（Breakaway Yield），磁吸势能释放，手指瞬间感知即将咬合入位
 * - 100%+：极位双曲抗拉收束，杜绝松散与过度外拉
 */
function calculateMagneticFluidPull(dy: number, targetHeight: number): number {
  if (dy <= 0) return 0;
  const breakawayPoint = targetHeight * 0.7;
  const baseFactor = 0.52;
  const raw = dy * baseFactor;

  if (raw <= breakawayPoint) {
    return raw;
  } else if (raw <= targetHeight) {
    const overBreak = raw - breakawayPoint;
    return breakawayPoint + overBreak * 0.85;
  } else {
    const extra = raw - targetHeight;
    const maxExtra = targetHeight * 0.42;
    const dampedExtra = (extra * maxExtra) / (extra + maxExtra * 1.3);
    return targetHeight + dampedExtra;
  }
}

/**
 * 阻尼计算包装函数（兼顾测试断言与磁流体动力学计算）
 */
function calculateDampedPull(dy: number, targetHeight: number): number {
  return calculateMagneticFluidPull(dy, targetHeight);
}

/**
 * 伴聊主屏幕 (ImHomeScreen - 独立底栏 Tab)
 * - 支持两楼物理弹性下拉抽屉，在顶部展示横向滚动角色卡列表并静默刷新
 * - 模糊渐变至清晰、阻力手感、阈值吸附、未到位弹性回缩、上滑自动收起
 * - 零文字纯视觉物理窥视微动（Peek & Rebound）轻引导
 * - 点击角色头像直达角色卡详情页，点击外部空白收起抽屉
 */
export function ImHomeScreen({
  space,
  refreshToken,
  onOpenImChat,
  onCreateRole,
  onImportRole,
  onOpenRoleLibrary,
  onOpenRoleCardDetail,
}: ImHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = useContext(FloatingFooterContext);
  const topInset = Math.max(insets.top, 24);
  const expandedHeight = topInset + SHELF_CONTENT_HEIGHT;
  const snapThreshold = topInset + 36;

  const [localRefreshTick, setLocalRefreshTick] = useState(0);
  const [roleCards, setRoleCards] = useState<AiRoleCardRecord[]>(() => getCachedRoleCards(space));
  const [isExpanded, setIsExpanded] = useState(false);

  const translateY = useSharedValue(0);
  const isExpandedRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const hasTriggeredPreHapticRef = useRef(false);
  const hasTriggeredHapticRef = useRef(false);

  const pullProgress = useDerivedValue(() => {
    return Math.min(1, Math.max(0, translateY.value / (expandedHeight || 1)));
  });

  const layoutParamsRef = useRef({ expandedHeight, snapThreshold });
  layoutParamsRef.current = { expandedHeight, snapThreshold };

  const loadRoles = useCallback(async () => {
    try {
      const list = await listRoleCards(space);
      setRoleCards(list);
      setCachedRoleCards(space, list);
    } catch {
      // 容错静默
    }
  }, [space]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles, refreshToken]);

  useEffect(() => {
    const unsubscribe = GlobalHeartbeatEngine.shared.subscribe((_, targetSpace) => {
      if (targetSpace === space) {
        setLocalRefreshTick((prev) => prev + 1);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [space]);

  // 首次进入无文字纯视觉轻引导：延时 450ms 下探 34px 并优雅回弹
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    void runWithDatabaseSpace(space, async (db) => {
      try {
        const val = await settingsRepository.getValue(db, GUIDE_STORAGE_KEY);
        if (!val) {
          timer = setTimeout(() => {
            translateY.value = withSequence(
              withTiming(34, { duration: 320, easing: Easing.out(Easing.cubic) }),
              withSpring(0, SPRING_JELLY_CLOSE)
            );
            void runWithDatabaseSpace(space, (d) => settingsRepository.setValue(d, GUIDE_STORAGE_KEY, 'true'));
          }, 450);
        }
      } catch {
        // 容错忽略
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [space, translateY]);

  const snapOpen = useCallback(() => {
    isExpandedRef.current = true;
    setIsExpanded(true);
    translateY.value = withSpring(expandedHeight, SPRING_JELLY_OPEN);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // 静默刷新会话与角色
    setLocalRefreshTick((prev) => prev + 1);
    void loadRoles();
  }, [expandedHeight, loadRoles, translateY]);

  const collapse = useCallback(() => {
    isExpandedRef.current = false;
    setIsExpanded(false);
    translateY.value = withSpring(0, SPRING_JELLY_CLOSE);
  }, [translateY]);

  const callbacksRef = useRef({ snapOpen, collapse });
  callbacksRef.current = { snapOpen, collapse };

  const handleToggleDrawer = useCallback(() => {
    if (isExpandedRef.current) {
      callbacksRef.current.collapse();
    } else {
      callbacksRef.current.snapOpen();
    }
  }, []);

  const handleSelectRole = useCallback((roleCardId: string) => {
    onOpenRoleCardDetail?.(roleCardId);
  }, [onOpenRoleCardDetail]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
    if (y > 4 && isExpandedRef.current) {
      callbacksRef.current.collapse();
    }
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, gs) => {
        if (Math.abs(gs.dy) < 6 || Math.abs(gs.dy) <= Math.abs(gs.dx)) {
          return false;
        }
        // 列表在最顶部时捕获下拉
        if (!isExpandedRef.current) {
          return gs.dy > 6 && scrollOffsetRef.current <= 0;
        }
        // 展开状态捕获上下滑动
        if (isExpandedRef.current && (gs.dy < -6 || gs.dy > 6)) {
          return true;
        }
        return false;
      },
      onPanResponderMove: (_evt, gs) => {
        const { expandedHeight: curExpandedHeight, snapThreshold: curSnapThreshold } = layoutParamsRef.current;
        if (!isExpandedRef.current) {
          const pullDistance = Math.max(0, gs.dy);
          const damped = calculateDampedPull(pullDistance, curExpandedHeight);
          translateY.value = damped;

          // 1段：55% 阻尼蓄力微触感（轻微棘轮微触碰）
          const preThreshold = curSnapThreshold * 0.55;
          if (damped >= preThreshold && !hasTriggeredPreHapticRef.current) {
            hasTriggeredPreHapticRef.current = true;
            void Haptics.selectionAsync().catch(() => {});
          } else if (damped < preThreshold && hasTriggeredPreHapticRef.current) {
            hasTriggeredPreHapticRef.current = false;
          }

          // 2段：100% 临界吸附点（清脆磁吸入位感）
          if (damped >= curSnapThreshold && !hasTriggeredHapticRef.current) {
            hasTriggeredHapticRef.current = true;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } else if (damped < curSnapThreshold && hasTriggeredHapticRef.current) {
            hasTriggeredHapticRef.current = false;
          }
        } else {
          const target = curExpandedHeight + gs.dy * 0.45;
          translateY.value = Math.max(0, target);
        }
      },
      onPanResponderRelease: (_evt, gs) => {
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        const { snapThreshold: curSnapThreshold } = layoutParamsRef.current;
        if (!isExpandedRef.current) {
          if (translateY.value >= curSnapThreshold || (translateY.value > curSnapThreshold * 0.45 && gs.vy > 0.5)) {
            callbacksRef.current.snapOpen();
          } else {
            callbacksRef.current.collapse();
          }
        } else {
          if (gs.dy < -18 || gs.vy < -0.3 || translateY.value < curSnapThreshold) {
            callbacksRef.current.collapse();
          } else {
            callbacksRef.current.snapOpen();
          }
        }
      },
      onPanResponderTerminate: () => {
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        if (!isExpandedRef.current) {
          callbacksRef.current.collapse();
        } else {
          callbacksRef.current.snapOpen();
        }
      },
    })
  ).current;

  const combinedRefreshTrigger = (refreshToken ?? 0) + localRefreshTick;

  // 动画样式：主页面（顶栏+列表）整体连贯下移
  const mainPageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // 动画样式：两楼抽屉整体视差进入、3D 角度展布与柔韧果冻形变，未展开时彻底 display: none
  const topShelfAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const shelfTranslateY = interpolate(t, [0, expandedHeight], [-expandedHeight * 0.32, 0], Extrapolation.CLAMP);
    const scale = interpolate(t, [0, expandedHeight], [0.94, 1], Extrapolation.CLAMP);
    const opacity = interpolate(t, [0, 16, expandedHeight], [0, 0.7, 1], Extrapolation.CLAMP);
    // 3D 透视展布倾角
    const rotateX = `${interpolate(t, [0, expandedHeight], [-14, 0], Extrapolation.CLAMP)}deg`;
    // 泊松比拉伸挤压（Jelly Squash & Stretch）
    const stretchY = interpolate(t, [expandedHeight, expandedHeight * 1.4], [1, 1.05], Extrapolation.CLAMP);
    const squashX = interpolate(t, [expandedHeight, expandedHeight * 1.4], [1, 0.985], Extrapolation.CLAMP);

    return {
      display: t > 0.5 ? 'flex' : 'none',
      opacity,
      transform: [
        { perspective: 900 },
        { translateY: shelfTranslateY },
        { rotateX },
        { scale },
        { scaleY: stretchY },
        { scaleX: squashX },
      ],
    };
  });

  // 动画样式：会话消息流向次景深微缩后退，与前景抽屉形成立体纵深联动
  const contentDepthAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const scale = interpolate(t, [0, expandedHeight], [1, 0.982], Extrapolation.CLAMP);
    const opacity = interpolate(t, [0, expandedHeight], [1, 0.92], Extrapolation.CLAMP);
    return {
      flex: 1,
      transform: [{ scale }],
      opacity,
    };
  });

  // 动画样式：角色卡横向轨道微动缩放
  const roleRailAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const scale = interpolate(t, [0, expandedHeight], [0.95, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
    };
  });

  // 动画样式：柔和微磨砂，在下拉前段 (t 从 8 到 45) 由朦胧柔和过渡到清晰，到位后完全隐藏
  const blurOverlayAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const opacity = interpolate(t, [8, 45], [1, 0], Extrapolation.CLAMP);
    return {
      opacity,
      display: t > 2 && t < 48 ? 'flex' : 'none',
    };
  });

  // 动画样式：顶栏内边距平滑补偿，展开后自然收拢为 6px
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const paddingTop = interpolate(
      t,
      [0, expandedHeight],
      [Math.max(insets.top, 8), 6],
      Extrapolation.CLAMP
    );
    return {
      paddingTop,
    };
  });

  // 动画样式：合拢态彻底隐形 (高度 0、透明度 0、display: none)，下拉时渐现微弦
  const grabHandleAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const height = interpolate(t, [0, 24], [0, 10], Extrapolation.CLAMP);
    const opacity = interpolate(t, [6, 36], [0, 1], Extrapolation.CLAMP);
    const scale = interpolate(t, [0, 36], [0.5, 1], Extrapolation.CLAMP);
    return {
      height,
      opacity,
      display: t > 0.5 ? 'flex' : 'none',
      transform: [{ scale }],
    };
  });

  const renderHeader = useMemo(() => (
    <Animated.View style={[styles.headerContainer, headerContainerAnimatedStyle]}>
      {/* 极简无文字抓手手柄线：合上时高度与透明度完全为 0 且 display: none，下拉时柔和渐现 */}
      <Animated.View style={[styles.grabHandleWrap, grabHandleAnimatedStyle]}>
        <Pressable
          accessibilityLabel={isExpanded ? '收起角色快捷抽屉' : '下拉查看角色快捷抽屉'}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 24, right: 24 }}
          onPress={handleToggleDrawer}
        >
          <View style={styles.grabHandle} />
        </Pressable>
      </Animated.View>

      <View style={styles.topRow}>
        <Pressable
          accessibilityHint={isExpanded ? '点击收起角色卡抽屉' : '点击展开角色卡抽屉'}
          accessibilityLabel="伴聊"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={handleToggleDrawer}
          style={styles.titleWrap}
        >
          <Text style={styles.screenTitle}>伴聊</Text>
        </Pressable>

        {/* 顶部一体化流光操作胶囊群 (Segmented Pill Capsule) */}
        <View style={styles.actionCapsule}>
          <Pressable
            accessibilityLabel="添加伴侣角色"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onCreateRole}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <Ionicons color={colors.text.primary} name="add" size={14} style={styles.btnIcon} />
            <Text style={styles.capsuleBtnText}>添加</Text>
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable
            accessibilityLabel="导入角色"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onImportRole}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <Ionicons color={colors.text.primary} name="download-outline" size={13} style={styles.btnIcon} />
            <Text style={styles.capsuleBtnText}>导入</Text>
          </Pressable>
          <View style={styles.capsuleDivider} />
          <Pressable
            accessibilityLabel="打开角色库"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onOpenRoleLibrary}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <Ionicons color={colors.text.primary} name="grid-outline" size={12} style={styles.btnIcon} />
            <Text style={styles.capsuleBtnText}>角色库</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  ), [isExpanded, onCreateRole, onImportRole, onOpenRoleLibrary, headerContainerAnimatedStyle, grabHandleAnimatedStyle, handleToggleDrawer]);

  return (
    <View style={styles.container}>
      {/* 顶部两楼抽屉层：在下拉时展露角色卡横向滚动轨道 (zIndex: 1, 未展开时 display: none) */}
      <Animated.View
        pointerEvents={isExpanded ? 'auto' : 'none'}
        style={[
          styles.topShelfContainer,
          {
            height: expandedHeight,
            paddingTop: topInset,
          },
          topShelfAnimatedStyle,
        ]}
      >
        <Animated.View style={[styles.roleRailInner, roleRailAnimatedStyle]}>
          <AiRoleCardRail
            emptyHintText="有头像的伴侣角色会显示在这里"
            onOpenRoleLibrary={onOpenRoleLibrary}
            onSelectRole={handleSelectRole}
            pullProgress={pullProgress}
            roleCards={roleCards}
            space={space}
          />
        </Animated.View>
        {/* 动态微磨砂蒙层：在下拉前段提供朦胧质感，过半迅速消退至通透 */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurOverlayAnimatedStyle]}>
          <BlurView
            intensity={Platform.select({ android: 12, ios: 20 })}
            style={StyleSheet.absoluteFill}
            tint={space === 'personal' ? 'dark' : 'default'}
          />
        </Animated.View>
        {/* 抽屉底部微光线 (Liquid Glow Seam)，在到位时隐隐透出晶莹高光 */}
        <LinearGradient
          colors={space === 'personal' ? ['rgba(255,255,255,0.08)', 'transparent'] : ['rgba(0,0,0,0.06)', 'transparent']}
          pointerEvents="none"
          style={styles.glowSeam}
        />
      </Animated.View>

      {/* 主页面（顶栏 + 消息流列表）：实色背景，作为前景幕帘一体化下移 (zIndex: 5) */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.mainPage, mainPageAnimatedStyle]}
      >
        <Animated.View style={contentDepthAnimatedStyle}>
          <ImThreadList
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: layout.pageBottomOffset + floatingFooterHeight }}
            onOpenImChat={onOpenImChat}
            onOpenRoleLibrary={onOpenRoleLibrary}
            onScroll={handleScroll}
            refreshTrigger={combinedRefreshTrigger}
            space={space}
          />
        </Animated.View>
        {/* 展开时遮罩响应区：点击主体列表区域平滑收起抽屉 */}
        {isExpanded ? (
          <Pressable
            accessibilityLabel="收起角色抽屉"
            accessibilityRole="button"
            onPress={collapse}
            style={styles.collapseBackdrop}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.page,
    overflow: 'hidden',
  },
  topShelfContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: colors.background.page,
    justifyContent: 'center',
  },
  roleRailInner: {
    paddingVertical: spacing[1],
  },
  glowSeam: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  mainPage: {
    flex: 1,
    backgroundColor: colors.background.surface,
    zIndex: 5,
  },
  collapseBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  grabHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grabHandle: {
    width: 36,
    height: 3.5,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  headerContainer: {
    backgroundColor: colors.background.surface,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 42,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.soft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[1],
    height: 30,
  },
  capsuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    height: '100%',
    borderRadius: radius.pill,
  },
  capsuleBtnPressed: {
    backgroundColor: colors.primary.hover,
  },
  capsuleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  capsuleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 10,
    backgroundColor: colors.border.default,
  },
  btnIcon: {
    marginRight: 2,
  },
});
