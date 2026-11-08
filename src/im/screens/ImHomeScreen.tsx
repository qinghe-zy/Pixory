import React, { useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  interpolateColor,
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
import { ImRoleSecondFloor } from '../components/ImRoleSecondFloor';
import { WeChatPullDownIndicator } from '../components/WeChatPullDownIndicator';
import { imDarkFloorColors } from '../theme/imDarkFloorColors';
import { colors, layout, radius, spacing } from '../../design/tokens';
import { FloatingFooterContext } from '../../components/AppScreen';
import { GlobalHeartbeatEngine } from '../heartbeat/globalHeartbeatEngine';
import { useImThreadFeed } from '../hooks/useImThreadFeed';
import { ImThreadContextMenu } from '../components/modals/ImThreadContextMenu';
import { ImFoldedThreadsModal } from '../components/modals/ImFoldedThreadsModal';

export interface ImHomeScreenProps {
  space: PixorySpace;
  isActive?: boolean;
  refreshToken?: number;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onCreateRole?: () => void;
  onImportRole?: () => void;
  onOpenRoleLibrary?: () => void;
  onOpenRoleCardDetail?: (roleCardId: string) => void;
  onSecondFloorStateChange?: (active: boolean) => void;
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
// 二楼展开/收拢物理弹簧常量（大行程阻尼振子）
const SPRING_SF_OPEN = {
  damping: 16,
  stiffness: 140,
  mass: 0.72,
  overshootClamping: false,
};
const SPRING_SF_CLOSE = {
  damping: 28,
  stiffness: 320,
  mass: 0.48,
  overshootClamping: true,
};
const SPRING_SF_SNAP = {
  damping: 32,
  stiffness: 380,
  mass: 0.42,
  overshootClamping: true,
};
const COMPACT_DOCKED_BAR_HEIGHT = 50;
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
  const breakawayPoint = targetHeight * 0.6;
  const baseFactor = 0.72;
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
  onSecondFloorStateChange,
}: ImHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const rawWindowDimensions = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = useState(0);
  // 二楼停泊/退出的所有纵向坐标必须以本容器实测高度为准（容器随底栏显隐会改变高度，
  // 使用 Window 高度会让底座与容器底边错位），测量前才回退到 Window 高度。
  const windowDimensions = useMemo(
    () => ({ height: measuredHeight > 0 ? measuredHeight : rawWindowDimensions.height }),
    [measuredHeight, rawWindowDimensions.height]
  );
  const screenHeight = windowDimensions.height;
  const floatingFooterHeight = useContext(FloatingFooterContext);
  const topInset = Math.max(insets.top, 24);
  const expandedHeight = topInset + SHELF_CONTENT_HEIGHT;
  const snapThreshold = topInset + 36;
  const sfMaxDistance = Math.max(1, windowDimensions.height - expandedHeight);
  const dockedBarHeight = useMemo(
    () => COMPACT_DOCKED_BAR_HEIGHT + insets.bottom,
    [insets.bottom]
  );

  const [localRefreshTick, setLocalRefreshTick] = useState(0);
  const [roleCards, setRoleCards] = useState<AiRoleCardRecord[]>(() => getCachedRoleCards(space));
  const [isExpanded, setIsExpanded] = useState(false);
  const [drawerStage, setDrawerStage] = useState<0 | 1 | 2>(0);

  // 长按操作菜单与折叠会话弹窗状态
  const [contextMenuState, setContextMenuState] = useState<{
    thread: ImThreadListItem;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const [foldedModalVisible, setFoldedModalVisible] = useState(false);
  const [isPullingDrawer, setIsPullingDrawer] = useState(false);

  // 顶栏亮暮灰着色共享值（0 = 首页纯白无圆角；1 = 二楼 #4A4668 亮暮灰带 18 圆角）
  const headerTone = useSharedValue(0);

  const translateY = useSharedValue(0);
  const sfTranslateY = useSharedValue(0);
  // 二楼向上一体化滑出屏幕驱动值（负向位移，与伴聊首页刚体垂直耦合）
  const sfExitTranslateY = useSharedValue(0);
  const isDirectExitingFromSF = useSharedValue(false);
  const sfProgress = useDerivedValue(() => {
    return Math.min(1, Math.max(0, sfTranslateY.value / sfMaxDistance));
  });

  const isExpandedRef = useRef(false);
  const drawerStageRef = useRef<0 | 1 | 2>(drawerStage);
  drawerStageRef.current = drawerStage;
  const listScrollYRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const hasTriggeredPreHapticRef = useRef(false);
  const hasTriggeredHapticRef = useRef(false);
  const hasTriggeredSFHapticRef = useRef(false);
  const isSnappingToSFRef = useRef(false);
  const collapseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 消息流统一数据源与乐观调度器
  const combinedRefreshTrigger = (refreshToken ?? 0) + localRefreshTick;
  const feed = useImThreadFeed(space, combinedRefreshTrigger);

  useEffect(() => {
    return () => {
      if (collapseWatchdogRef.current) {
        clearTimeout(collapseWatchdogRef.current);
      }
    };
  }, []);

  // 响应式生命周期看门狗：当阶段回到 0 时，确保 280ms 后所有驱动值归零，物理根除首页顶部残余黑洞 (Bug 1)
  useEffect(() => {
    if (drawerStage === 0) {
      const timer = setTimeout(() => {
        if (drawerStageRef.current === 0) {
          translateY.value = 0;
          sfTranslateY.value = 0;
          sfExitTranslateY.value = 0;
          isDirectExitingFromSF.value = false;
          headerTone.value = 0;
        }
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [drawerStage, headerTone, isDirectExitingFromSF, sfExitTranslateY, sfTranslateY, translateY]);

  const pullProgress = useDerivedValue(() => {
    return Math.min(1, Math.max(0, translateY.value / (expandedHeight || 1)));
  });

  // 二楼停泊后容器高度可能变化（底栏隐藏后容器被撑高）：重新把底座贴齐容器底边，避免底座悬空
  useEffect(() => {
    if (drawerStage !== 2 || isDraggingRef.current || isSnappingToSFRef.current) return;
    const dockedY = screenHeight - dockedBarHeight;
    translateY.value = withTiming(dockedY, { duration: 160, easing: Easing.out(Easing.cubic) });
    sfTranslateY.value = withTiming(sfMaxDistance, { duration: 160, easing: Easing.out(Easing.cubic) });
  }, [dockedBarHeight, drawerStage, screenHeight, sfMaxDistance, sfTranslateY, translateY]);

  const layoutParamsRef = useRef({ expandedHeight, snapThreshold, sfMaxDistance, dockedBarHeight });
  layoutParamsRef.current = { expandedHeight, snapThreshold, sfMaxDistance, dockedBarHeight };

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
    drawerStageRef.current = 1;
    setDrawerStage(1);
    isExpandedRef.current = true;
    setIsExpanded(true);
    onSecondFloorStateChange?.(false);
    translateY.value = withSpring(expandedHeight, SPRING_JELLY_OPEN);
    sfTranslateY.value = withSpring(0, SPRING_SF_CLOSE);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // 静默刷新会话与角色
    setLocalRefreshTick((prev) => prev + 1);
    void loadRoles();
  }, [expandedHeight, loadRoles, onSecondFloorStateChange, sfTranslateY, translateY]);

  const snapToSecondFloor = useCallback(() => {
    isSnappingToSFRef.current = true;
    setTimeout(() => {
      isSnappingToSFRef.current = false;
    }, 240);
    drawerStageRef.current = 2;
    setDrawerStage(2);
    isExpandedRef.current = true;
    setIsExpanded(true);
    onSecondFloorStateChange?.(true);
    sfExitTranslateY.value = 0;
    // 自动进入二楼匀速变色与圆角展布
    headerTone.value = withTiming(1, { duration: 240, easing: Easing.linear });
    // 紧凑贴底无死空间刚体底座：严丝合缝停泊于屏幕底端 (50px 紧凑高度，严格使用全屏物理高)
    const targetY = windowDimensions.height - dockedBarHeight;
    translateY.value = withTiming(targetY, { duration: 200, easing: Easing.bezier(0.12, 1, 0.22, 1) });
    sfTranslateY.value = withTiming(sfMaxDistance, { duration: 200, easing: Easing.bezier(0.12, 1, 0.22, 1) });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [dockedBarHeight, headerTone, onSecondFloorStateChange, sfExitTranslateY, sfMaxDistance, sfTranslateY, translateY, windowDimensions.height]);

  const collapseToRail = useCallback(() => {
    drawerStageRef.current = 1;
    setDrawerStage(1);
    isExpandedRef.current = true;
    setIsExpanded(true);
    onSecondFloorStateChange?.(false);
    sfExitTranslateY.value = 0;
    // 收起时快速变色回白
    headerTone.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
    translateY.value = withSpring(expandedHeight, SPRING_JELLY_OPEN);
    sfTranslateY.value = withSpring(0, SPRING_SF_CLOSE);
    void Haptics.selectionAsync().catch(() => {});
  }, [expandedHeight, headerTone, onSecondFloorStateChange, sfExitTranslateY, sfTranslateY, translateY]);

  const collapseToHome = useCallback(() => {
    if (drawerStageRef.current === 2) {
      isDirectExitingFromSF.value = true;
      sfExitTranslateY.value = withTiming(-windowDimensions.height, { duration: 240, easing: Easing.out(Easing.cubic) }, () => {
        'worklet';
        sfExitTranslateY.value = 0;
      });
    }
    drawerStageRef.current = 0;
    setDrawerStage(0);
    isExpandedRef.current = false;
    setIsExpanded(false);
    onSecondFloorStateChange?.(false);
    // 开始收起快速平滑变色回白
    headerTone.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
    translateY.value = withSpring(0, SPRING_SF_SNAP, (finished) => {
      'worklet';
      if (finished) {
        isDirectExitingFromSF.value = false;
        translateY.value = 0;
      }
    });
    sfTranslateY.value = withSpring(0, SPRING_SF_SNAP);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [headerTone, isDirectExitingFromSF, onSecondFloorStateChange, sfExitTranslateY, sfTranslateY, translateY, windowDimensions.height]);

  const collapse = useCallback(() => {
    collapseToHome();
  }, [collapseToHome]);

  const handleSecondFloorDrag = useCallback((dy: number) => {
    if (drawerStageRef.current === 2 && dy < 0 && !isSnappingToSFRef.current) {
      // 刚体垂直耦合：二楼向上平移 dy 移出屏幕顶端，伴聊首页紧随其后在二楼正下方联动升起
      const dockedY = windowDimensions.height - dockedBarHeight;
      sfExitTranslateY.value = dy;
      translateY.value = Math.max(0, dockedY + dy);
    }
  }, [dockedBarHeight, sfExitTranslateY, translateY, windowDimensions.height]);

  const handleSecondFloorRelease = useCallback((dy: number, vy: number) => {
    if (drawerStageRef.current === 2) {
      if (isSnappingToSFRef.current) return;
      if (dy < -60 || vy < -0.35) {
        isDirectExitingFromSF.value = true;
        drawerStageRef.current = 0;
        setDrawerStage(0);
        isExpandedRef.current = false;
        setIsExpanded(false);
        onSecondFloorStateChange?.(false);
        headerTone.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        // 二楼顺势向上飞出屏幕顶部，一楼同时上升归位，一气呵成
        sfExitTranslateY.value = withTiming(-windowDimensions.height, { duration: 240, easing: Easing.out(Easing.cubic) }, () => {
          'worklet';
          sfExitTranslateY.value = 0;
        });
        translateY.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) {
            isDirectExitingFromSF.value = false;
            translateY.value = 0;
          }
        });
        sfTranslateY.value = withTiming(0, { duration: 240 });
      } else {
        // 未达阈值，双向刚体弹簧回弹归位
        const dockedY = windowDimensions.height - dockedBarHeight;
        headerTone.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
        sfExitTranslateY.value = withSpring(0, SPRING_SF_OPEN);
        translateY.value = withSpring(dockedY, SPRING_SF_OPEN);
        sfTranslateY.value = withSpring(sfMaxDistance, SPRING_SF_OPEN);
      }
    }
  }, [dockedBarHeight, headerTone, isDirectExitingFromSF, onSecondFloorStateChange, sfExitTranslateY, sfMaxDistance, sfTranslateY, translateY, windowDimensions.height]);

  const callbacksRef = useRef({ snapOpen, snapToSecondFloor, collapseToRail, collapseToHome, collapse });
  callbacksRef.current = { snapOpen, snapToSecondFloor, collapseToRail, collapseToHome, collapse };

  const handleToggleDrawer = useCallback(() => {
    if (drawerStageRef.current > 0) {
      callbacksRef.current.collapseToHome();
    } else {
      callbacksRef.current.snapOpen();
    }
  }, []);

  const handleSelectRole = useCallback((roleCardId: string) => {
    onOpenRoleCardDetail?.(roleCardId);
  }, [onOpenRoleCardDetail]);

  const [isAtTop, setIsAtTop] = useState(true);
  const isAtTopRef = useRef(true);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, e.nativeEvent.contentOffset.y);
    listScrollYRef.current = y;
    scrollOffsetRef.current = y;
    const atTop = y <= 2;
    if (atTop !== isAtTopRef.current) {
      isAtTopRef.current = atTop;
      setIsAtTop(atTop);
    }
    if (y > 4 && drawerStageRef.current === 1) {
      callbacksRef.current.collapseToHome();
    }
  }, []);

  const isDraggingRef = useRef(false);

  // 1. 首页常态下拉进一楼/二楼原生手势（单向阀门：仅在顶部且向下拉时激活，上滑浏览瞬间让渡给内层列表）
  const homePanGesture = useMemo(() => {
    return Gesture.Pan()
      .runOnJS(true)
      .enabled(drawerStage === 0 && isAtTop)
      .activeOffsetY(8)
      .failOffsetY(-4)
      .onBegin(() => {
        isDraggingRef.current = true;
        setIsPullingDrawer(true);
        headerTone.value = 0;
        if (drawerStageRef.current === 0 && translateY.value < 2) {
          translateY.value = 0;
          sfTranslateY.value = 0;
          sfExitTranslateY.value = 0;
          isDirectExitingFromSF.value = false;
        }
      })
      .onUpdate((e) => {
        const { expandedHeight: curExpandedHeight, snapThreshold: curSnapThreshold, sfMaxDistance: curSfMax } = layoutParamsRef.current;
        const pullDistance = Math.max(0, e.translationY);
        const stage1Travel = Math.max(1, curExpandedHeight * 0.65);
        if (pullDistance <= stage1Travel) {
          const progress = pullDistance / stage1Travel;
          const damped = progress * curExpandedHeight;
          translateY.value = damped;
          sfTranslateY.value = 0;

          const preThreshold = curSnapThreshold * 0.55;
          if (damped >= preThreshold && !hasTriggeredPreHapticRef.current) {
            hasTriggeredPreHapticRef.current = true;
            void Haptics.selectionAsync().catch(() => {});
          } else if (damped < preThreshold && hasTriggeredPreHapticRef.current) {
            hasTriggeredPreHapticRef.current = false;
          }

          if (damped >= curSnapThreshold && !hasTriggeredHapticRef.current) {
            hasTriggeredHapticRef.current = true;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          } else if (damped < curSnapThreshold && hasTriggeredHapticRef.current) {
            hasTriggeredHapticRef.current = false;
          }
        } else {
          const extraDy = pullDistance - stage1Travel;
          const extraDamped = calculateDampedPull(extraDy, curSfMax);
          translateY.value = curExpandedHeight + extraDamped;
          sfTranslateY.value = extraDamped;

          if (extraDamped >= 36 && !hasTriggeredSFHapticRef.current) {
            hasTriggeredSFHapticRef.current = true;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          } else if (extraDamped < 36 && hasTriggeredSFHapticRef.current) {
            hasTriggeredSFHapticRef.current = false;
          }
        }
      })
      .onEnd((e) => {
        isDraggingRef.current = false;
        setIsPullingDrawer(false);
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        hasTriggeredSFHapticRef.current = false;
        const { snapThreshold: curSnapThreshold } = layoutParamsRef.current;

        if (
          sfTranslateY.value >= 36 ||
          (sfTranslateY.value > 16 && e.velocityY > 350) ||
          (e.translationY > 120 && e.velocityY > 280)
        ) {
          callbacksRef.current.snapToSecondFloor();
        } else if (translateY.value >= curSnapThreshold || (translateY.value > curSnapThreshold * 0.45 && e.velocityY > 500)) {
          callbacksRef.current.snapOpen();
        } else {
          callbacksRef.current.collapseToHome();
        }
      })
      .onFinalize(() => {
        isDraggingRef.current = false;
        setIsPullingDrawer(false);
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        hasTriggeredSFHapticRef.current = false;
      });
  }, [drawerStage, isAtTop, headerTone, translateY, sfTranslateY, sfExitTranslateY, isDirectExitingFromSF]);

  // 2. 一楼/二楼展开态管理手势（支持双向推拉或底座上推回首页）
  const drawerPanGesture = useMemo(() => {
    return Gesture.Pan()
      .runOnJS(true)
      .enabled(drawerStage > 0)
      .activeOffsetY([-8, 8])
      .onBegin(() => {
        isDraggingRef.current = true;
        setIsPullingDrawer(true);
      })
      .onUpdate((e) => {
        const { expandedHeight: curExpandedHeight, sfMaxDistance: curSfMax, dockedBarHeight: curDockedBarHeight } = layoutParamsRef.current;
        const curStage = drawerStageRef.current;

        if (curStage === 1) {
          if (e.translationY > 0) {
            const sfDamped = calculateDampedPull(e.translationY, curSfMax);
            sfTranslateY.value = sfDamped;
            translateY.value = curExpandedHeight + sfDamped;

            if (sfDamped >= 36 && !hasTriggeredSFHapticRef.current) {
              hasTriggeredSFHapticRef.current = true;
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            } else if (sfDamped < 36 && hasTriggeredSFHapticRef.current) {
              hasTriggeredSFHapticRef.current = false;
            }
          } else {
            const target = curExpandedHeight + e.translationY * 0.45;
            translateY.value = Math.max(0, target);
            sfTranslateY.value = 0;
          }
        } else if (curStage === 2) {
          if (isSnappingToSFRef.current) return;
          if (e.translationY < 0) {
            const dockedY = windowDimensions.height - curDockedBarHeight;
            translateY.value = Math.max(0, dockedY + e.translationY);
            sfExitTranslateY.value = e.translationY;
          }
        }
      })
      .onEnd((e) => {
        isDraggingRef.current = false;
        setIsPullingDrawer(false);
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        hasTriggeredSFHapticRef.current = false;
        const { snapThreshold: curSnapThreshold, dockedBarHeight: curDockedBarHeight } = layoutParamsRef.current;
        const curStage = drawerStageRef.current;

        if (curStage === 1) {
          if (e.translationY > 0) {
            if (sfTranslateY.value >= 36 || e.velocityY > 350 || e.translationY > 50) {
              callbacksRef.current.snapToSecondFloor();
            } else {
              callbacksRef.current.snapOpen();
            }
          } else {
            if (e.translationY < -18 || e.velocityY < -300 || translateY.value < curSnapThreshold) {
              callbacksRef.current.collapseToHome();
            } else {
              callbacksRef.current.snapOpen();
            }
          }
        } else if (curStage === 2) {
          if (isSnappingToSFRef.current) return;
          if (e.translationY < -60 || e.velocityY < -350) {
            callbacksRef.current.collapseToHome();
          } else {
            const dockedY = windowDimensions.height - curDockedBarHeight;
            headerTone.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) });
            translateY.value = withSpring(dockedY, SPRING_SF_OPEN);
            sfExitTranslateY.value = withSpring(0, SPRING_SF_OPEN);
          }
        }
      })
      .onFinalize(() => {
        isDraggingRef.current = false;
        setIsPullingDrawer(false);
        hasTriggeredPreHapticRef.current = false;
        hasTriggeredHapticRef.current = false;
        hasTriggeredSFHapticRef.current = false;
      });
  }, [drawerStage, windowDimensions.height, headerTone, translateY, sfTranslateY, sfExitTranslateY]);

  const panGesture = useMemo(
    () => Gesture.Race(homePanGesture, drawerPanGesture),
    [homePanGesture, drawerPanGesture]
  );

  // 动画样式：主页面（顶栏+列表）整体连贯下移，保持透明不漏出黑白边
  const mainPageAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // 动画样式：两楼抽屉整体视差进入、3D 角度展布与柔韧果冻形变，未展开时彻底 display: none
  const topShelfAnimatedStyle = useAnimatedStyle(() => {
    // 从二楼返回直达伴聊首页时，绝对隐藏一楼，一气呵成不经一楼
    if (isDirectExitingFromSF.value) {
      return {
        display: 'none',
        opacity: 0,
      };
    }

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

  // 动画样式：会话消息流向次景深微缩后退，二楼真正就绪态才物理隐藏 (display: none)，彻底消灭下拉黑白边与二楼上滑底部镂空
  const contentDepthAnimatedStyle = useAnimatedStyle(() => {
    // 只有在二楼完全停靠且无退出手势时才 display: none
    const isStationaryOnSF = sfProgress.value > 0.98 && sfExitTranslateY.value >= -0.5 && !isDirectExitingFromSF.value;
    const isExitingSF = sfExitTranslateY.value < -0.5 || isDirectExitingFromSF.value;

    if (isStationaryOnSF && !isExitingSF) {
      return {
        flex: 1,
        opacity: 0,
        display: 'none',
      };
    }

    return {
      flex: 1,
      display: 'flex',
      backgroundColor: colors.background.surface,
      opacity: 1.0,
    };
  });

  // 动画样式：二楼停泊底座衬底。铺满 mainPage 自身范围（位于顶栏之后、列表之下），
  // mainPage 本身随 translateY 下移直至容器底边，因此底座下方绝无透底；不可超出 mainPage（会被 overflow 裁掉）
  const bottomSkirtAnimatedStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#4A4668',
      opacity: headerTone.value,
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
      opacity: t <= 2 ? 0 : opacity,
    };
  });

  // 动画样式：全局背景色三次 Hermite 平滑过渡 (0 -> 一楼暮色浅晕 -> 二楼深邃暮紫灰)
  const containerAnimatedBgStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const sf = sfProgress.value;
    const stage1Progress = Math.min(1, Math.max(0, t / (expandedHeight || 1)));
    const smoothStage1 = stage1Progress * stage1Progress * (3 - 2 * stage1Progress);
    const smoothStage2 = sf * sf * (3 - 2 * sf);

    if (smoothStage2 > 0) {
      return {
        backgroundColor: interpolateColor(
          smoothStage2,
          [0, 1],
          [imDarkFloorColors.twilightBase, imDarkFloorColors.twilightDeep]
        ),
      };
    }

    return {
      backgroundColor: interpolateColor(
        smoothStage1,
        [0, 1],
        [colors.background.page, imDarkFloorColors.twilightBase]
      ),
    };
  });

  // 动画样式：二楼底座紧凑贴底、顶部曲线大圆角、亮暮灰高对比 (#4A4668 + 顶部分界线)
  // 关键规范：手指拖动时一直保持纯白不带圆角；自动进入二楼时匀速变色；收起时快速变色
  const headerContainerAnimatedStyle = useAnimatedStyle(() => {
    const t = translateY.value;
    const drawerPaddingTop = interpolate(t, [0, expandedHeight], [Math.max(insets.top, 8), 8], Extrapolation.CLAMP);

    const paddingTop = interpolate(headerTone.value, [0, 1], [drawerPaddingTop, 6]);
    const paddingBottom = interpolate(headerTone.value, [0, 1], [6, 6 + insets.bottom]);
    const borderTopRadius = interpolate(headerTone.value, [0, 1], [0, 18]);
    const bgColor = interpolateColor(headerTone.value, [0, 1], [colors.background.surface, '#4A4668']);
    const borderTopColor = interpolateColor(headerTone.value, [0, 1], ['transparent', 'rgba(255, 255, 255, 0.22)']);
    const borderTopWidth = interpolate(headerTone.value, [0, 1], [0, StyleSheet.hairlineWidth]);

    return {
      paddingTop,
      paddingBottom,
      backgroundColor: bgColor,
      borderTopLeftRadius: borderTopRadius,
      borderTopRightRadius: borderTopRadius,
      borderTopColor,
      borderTopWidth,
    };
  });

  const headerTitleAnimatedStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(headerTone.value, [0, 1], [colors.text.primary, '#FFFFFF']),
    };
  });

  const actionCapsuleAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(headerTone.value, [0, 1], [colors.background.soft, 'rgba(255, 255, 255, 0.16)']),
      borderColor: interpolateColor(headerTone.value, [0, 1], [colors.border.default, 'rgba(255, 255, 255, 0.22)']),
      borderWidth: StyleSheet.hairlineWidth,
    };
  });

  const capsuleTextAnimatedStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(headerTone.value, [0, 1], [colors.text.primary, '#FFFFFF']),
    };
  });

  const capsuleDividerAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: interpolateColor(headerTone.value, [0, 1], [colors.border.default, 'rgba(255, 255, 255, 0.20)']),
    };
  });

  const iconLightStyle = useAnimatedStyle(() => {
    return {
      opacity: headerTone.value,
    };
  });

  const iconDarkStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - headerTone.value,
    };
  });

  const renderHeader = (
    <Animated.View style={[styles.headerContainer, headerContainerAnimatedStyle]}>
      <Pressable
        onPress={() => {
          if (drawerStageRef.current === 2) {
            callbacksRef.current.collapseToHome();
          }
        }}
        style={styles.topRow}
      >
        <Pressable
          accessibilityHint={isExpanded ? '点击收起角色卡抽屉' : '点击展开角色卡抽屉'}
          accessibilityLabel="伴聊"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (drawerStageRef.current === 2) {
              callbacksRef.current.collapseToHome();
            } else {
              handleToggleDrawer();
            }
          }}
          style={styles.titleWrap}
        >
          <Animated.Text style={[styles.screenTitle, headerTitleAnimatedStyle]}>伴聊</Animated.Text>
        </Pressable>

        {/* 顶部一体化流光操作胶囊群 (Segmented Pill Capsule) */}
        <Animated.View style={[styles.actionCapsule, actionCapsuleAnimatedStyle]}>
          <Pressable
            accessibilityLabel="添加角色"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onCreateRole}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <View style={styles.capsuleIconBox}>
              <Animated.View style={[StyleSheet.absoluteFill, iconLightStyle]}>
                <Ionicons color="rgba(255, 255, 255, 0.90)" name="add" size={14} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, iconDarkStyle]}>
                <Ionicons color={colors.text.primary} name="add" size={14} />
              </Animated.View>
            </View>
            <Animated.Text style={[styles.capsuleBtnText, capsuleTextAnimatedStyle]}>添加</Animated.Text>
          </Pressable>

          <Animated.View style={[styles.capsuleDivider, capsuleDividerAnimatedStyle]} />

          <Pressable
            accessibilityLabel="导入角色"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onImportRole}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <View style={styles.capsuleIconBox}>
              <Animated.View style={[StyleSheet.absoluteFill, iconLightStyle]}>
                <Ionicons color="rgba(255, 255, 255, 0.90)" name="download-outline" size={13} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, iconDarkStyle]}>
                <Ionicons color={colors.text.primary} name="download-outline" size={13} />
              </Animated.View>
            </View>
            <Animated.Text style={[styles.capsuleBtnText, capsuleTextAnimatedStyle]}>导入</Animated.Text>
          </Pressable>

          <Animated.View style={[styles.capsuleDivider, capsuleDividerAnimatedStyle]} />

          <Pressable
            accessibilityLabel="打开角色库"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={onOpenRoleLibrary}
            style={({ pressed }) => [styles.capsuleBtn, pressed && styles.capsuleBtnPressed]}
          >
            <View style={styles.capsuleIconBox}>
              <Animated.View style={[StyleSheet.absoluteFill, iconLightStyle]}>
                <Ionicons color="rgba(255, 255, 255, 0.90)" name="grid-outline" size={12} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, iconDarkStyle]}>
                <Ionicons color={colors.text.primary} name="grid-outline" size={12} />
              </Animated.View>
            </View>
            <Animated.Text style={[styles.capsuleBtnText, capsuleTextAnimatedStyle]}>角色库</Animated.Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );

  return (
    <Animated.View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - measuredHeight) > 1) {
          setMeasuredHeight(h);
        }
      }}
      style={[styles.container, containerAnimatedBgStyle]}
    >
      {/* 顶部两楼抽屉层：在下拉时展露角色卡横向滚动轨道 (zIndex: 1, 未展开时 display: none) */}
      <Animated.View
        pointerEvents={drawerStage === 1 ? 'auto' : 'none'}
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
            emptyHintText="有头像的角色会显示在这里"
            onCreateRole={onCreateRole}
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

      {/* 1.5 微信二楼二段下拉量子指示器 (在抽屉之下，主页面之上，仅在下拉超过一楼时渐现) */}
      <WeChatPullDownIndicator
        expandedHeight={expandedHeight}
        pullDistance={translateY}
      />

      {/* 2. 二楼角色库：暮霭微光光学底膜瀑布流与 3D卡牌长廊转场 (作为背景画布置于前景主页面之下) */}
      <ImRoleSecondFloor
        active={drawerStage === 2}
        exitTranslateY={sfExitTranslateY}
        onCollapseToHome={collapseToHome}
        onCollapseToRail={collapseToRail}
        onOpenRoleDetail={(roleCardId) => onOpenRoleCardDetail?.(roleCardId)}
        onSecondFloorDrag={handleSecondFloorDrag}
        onSecondFloorRelease={handleSecondFloorRelease}
        onSelectRole={(roleCardId) => {
          const targetCard = roleCards.find((r) => r.id === roleCardId);
          if (targetCard) {
            onOpenImChat({
              id: '',
              space,
              roleCardId: targetCard.id,
              title: targetCard.name,
              avatarUri: targetCard.avatarUri,
              lastMessagePreview: null,
              lastMessageAt: null,
              updatedAt: new Date().toISOString(),
              isPinned: false,
              unreadCount: 0,
            });
          }
          // 延迟后台静默复位二楼，确保聊天页已完全覆盖屏幕，绝不走一遍首页
          setTimeout(() => {
            drawerStageRef.current = 0;
            setDrawerStage(0);
            translateY.value = 0;
            sfTranslateY.value = 0;
            sfExitTranslateY.value = 0;
            isDirectExitingFromSF.value = false;
            headerTone.value = 0;
          }, 450);
        }}
        onTransitionActiveChange={(active) => {
          onSecondFloorStateChange?.(active || drawerStageRef.current === 2);
        }}
        roleCards={roleCards}
        sfProgress={sfProgress}
        space={space}
      />

      {/* 3. 主页面（顶栏 + 消息流列表）：实色背景，作为前景幕帘一体化下移 (zIndex: 5) */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.mainPage, mainPageAnimatedStyle]}>
          {/* 二楼停靠底座衬底：铺满主页面范围，保证底座下缘绝对实色遮盖，绝不漏出底层卡片 */}
          <Animated.View pointerEvents="none" style={bottomSkirtAnimatedStyle} />
          {renderHeader}
          <Animated.View style={contentDepthAnimatedStyle}>
            <ImThreadList
              contentContainerStyle={{ paddingBottom: layout.pageBottomOffset + floatingFooterHeight }}
              feed={feed}
              onLongPressThread={(thread, coords) => {
                setContextMenuState({ thread, anchorX: coords.pageX, anchorY: coords.pageY });
              }}
              onOpenFoldedThreads={() => setFoldedModalVisible(true)}
              onOpenImChat={onOpenImChat}
              onOpenRoleLibrary={onOpenRoleLibrary}
              onScroll={handleScroll}
              refreshTrigger={combinedRefreshTrigger}
              scrollEnabled={!isPullingDrawer && drawerStage === 0}
              space={space}
            />
          </Animated.View>
          {/* 展开时遮罩响应区：点击主体列表区域平滑收起抽屉 */}
          {drawerStage === 1 ? (
            <Pressable
              accessibilityLabel="收起角色抽屉"
              accessibilityRole="button"
              onPress={collapseToHome}
              style={styles.collapseBackdrop}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>

      {/* 4. 长按会话操作菜单 (长聊同款 AnchoredContextMenu + AppDialog) */}
      <ImThreadContextMenu
        anchorX={contextMenuState?.anchorX ?? 0}
        anchorY={contextMenuState?.anchorY ?? 0}
        onClearHistory={(t) => {
          void feed.clearHistory(t);
        }}
        onClose={() => setContextMenuState(null)}
        onHideFromList={(t) => {
          void feed.hideFromList(t);
        }}
        onToggleFold={(t) => {
          void feed.toggleFold(t);
        }}
        onTogglePin={(t) => {
          void feed.togglePin(t);
        }}
        thread={contextMenuState?.thread ?? null}
        visible={Boolean(contextMenuState)}
      />

      {/* 5. 折叠会话二级列表页面 */}
      <ImFoldedThreadsModal
        foldedThreads={feed.foldedList}
        onClearHistory={(t) => {
          void feed.clearHistory(t);
        }}
        onClose={() => setFoldedModalVisible(false)}
        onHideFromList={(t) => {
          void feed.hideFromList(t);
        }}
        onOpenImChat={onOpenImChat}
        onToggleFold={(t) => {
          void feed.toggleFold(t);
        }}
        onTogglePin={(t) => {
          void feed.togglePin(t);
        }}
        visible={foldedModalVisible}
      />
    </Animated.View>
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
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
    zIndex: 5,
    overflow: 'hidden',
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
  headerContainer: {
    backgroundColor: colors.background.surface,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  screenTitle: {
    fontSize: 17,
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
    height: 28,
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
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
  },
  capsuleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 10,
    backgroundColor: colors.border.default,
  },
  capsuleIconBox: {
    width: 14,
    height: 14,
    marginRight: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: {
    marginRight: 2,
  },
});
