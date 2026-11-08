/**
 * RadialOrbitHeroTransition — 项目级通用【3D卡牌立体长廊 / Cover Flow】无缝转场引擎 v4.0
 *
 * 核心升级：
 * 1. 持久化 3D Deck / Cover Flow 交互浏览态 (deck 态)：
 *    - 详情页返回时仅收缩回 3D Deck (p2 -> 0) 并停留驻足
 *    - 左右水平拖拽换卡 (1:1 跟手，动量吸附，棘轮微震触觉)
 *    - 点击伴星卡 (k != 0)：平滑弹簧滚动将该卡滑至中心成为主卡
 *    - 点击主卡 (k == 0)：绽放展开全屏角色详情 (p2 -> 1)
 *    - 严格防斜划误触：仅当纵向绝对主导且向上时才触发上滑收起 (absY > absX * 2.2 且 dy < -22)
 *    - 纵向上滑 (dy < -20) 或点击顶部收起：飞回瀑布流网格 (p1 -> 0)
 * 2. 根治详情页左侧白边：彻底移除全屏容器固定白色倒角边框，伴星卡倒角降至微光 (0.20)
 * 3. 瀑布流网格坐标 0 延迟保真交接 (0 跳变)
 * 4. 真实 4 层物理卡牌结构：衬底、同构盒子、纯黑近亮远暗遮罩、高光倒角
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SecureImage } from '../SecureImage';
import { imDarkFloorColors } from '../../im/theme/imDarkFloorColors';
import { radius, spacing, typography } from '../../design/tokens';
import {
  type RadialOrbitItem,
  type GridAnchor,
  DECK_CARD_WIDTH,
  DECK_CARD_HEIGHT,
  getDeckCardDimensions,
  cleanPromptSnippet,
  computeCard3DStyle,
} from './deck3DMath';

export * from './deck3DMath';

// ─── 接口与类型定义 ──────────────────────────────────────────────────────────

export interface RadialOrbitHeroTransitionProps<T extends RadialOrbitItem> {
  /** 是否激活转场 */
  visible: boolean;
  /** 当前选中的中心卡片 */
  selectedItem: T | null;
  /** 视口内及周边可见的伴星卡片 */
  surroundingItems: T[];
  /** 所有卡片的视口绝对测量锚点字典 */
  cardAnchors: Record<string, GridAnchor>;
  /** 逆向折叠返回二楼完成 */
  onCloseToLibrary: () => void;
  /** 瀑布流显隐状态通知 (用于防死锁双重保障) */
  onWaterfallVisibilityChange?: (hidden: boolean) => void;
  /** 开聊回调 */
  onStartChat?: (item: T) => void;
  /** 详情内胆内容渲染器 */
  renderDetailContent: (item: T, close: () => void) => React.ReactNode;
}

// ─── 物理与时序常量 ──────────────────────────────────────────────────────────

const SPRING_STAGE1 = { damping: 20, stiffness: 180, mass: 0.62 };
const SPRING_STAGE2 = { damping: 18, stiffness: 150, mass: 0.70 };
const SPRING_RESTORE = { damping: 26, stiffness: 280, mass: 0.48 };
const SPRING_SWAP = { damping: 22, stiffness: 240, mass: 0.50 };

// ─── 4 层实体卡牌渲染单元 (每张卡片严格挂载 4 个物理节点) ──────────────────────────

interface PhysicalDeckCardProps<T extends RadialOrbitItem> {
  item: T;
  itemIndex: number;
  baseCardIndex: SharedValue<number>;
  panX: SharedValue<number>;
  slotWidth: number;
  p1: SharedValue<number>;
  p2: SharedValue<number>;
  W: number;
  anchor: GridAnchor;
  centerX: number;
  centerY: number;
  cardWidth: number;
  cardHeight: number;
  onPressCard: (item: RadialOrbitItem, continuousK: number, index: number) => void;
  isDetailActive?: boolean;
}

const PhysicalDeckCard = memo(function PhysicalDeckCard<T extends RadialOrbitItem>({
  item,
  itemIndex,
  baseCardIndex,
  panX,
  slotWidth,
  p1,
  p2,
  W,
  anchor,
  centerX,
  centerY,
  cardWidth,
  cardHeight,
  onPressCard,
  isDetailActive,
}: PhysicalDeckCardProps<T>) {
  const animatedCardStyle = useAnimatedStyle(() => {
    // 槽位相对位移方程：加号对齐物理方向，左滑(panX < 0)时右侧正数卡片向中心0收敛
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    const res = computeCard3DStyle(continuousK, p1.value, p2.value, W, anchor);
    // 铁律：只要处于长廊 deck 态，卡片正常显示；当进入详情页(isDetailActive)时，所有长廊卡片全部随 p2 淡出，彻底杜绝详情页底部漏出非中心卡片
    const hideOnDetail = isDetailActive ? (1 - p2.value) : 1;

    return {
      ...res.cardStyle,
      opacity: res.cardStyle.opacity * hideOnDetail,
    };
  });

  const animatedDarkOverlayStyle = useAnimatedStyle(() => {
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    const res = computeCard3DStyle(continuousK, p1.value, p2.value, W, anchor);
    return {
      opacity: res.darkOverlayOpacity,
    };
  });

  // 侧卡文字净空：C位(|k| < 0.38)完全可见，侧卡平滑淡出至0；
  // 退出至瀑布流时 (p1: 1 -> 0)，长廊大字号文本随 p1 降至 0.35 提前平滑淡隐，杜绝归位后文字与尺寸瞬时跳变
  const animatedTextContainerStyle = useAnimatedStyle(() => {
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    const absK = Math.abs(continuousK);
    const textOpacity = interpolate(absK, [0.18, 0.38], [1, 0], Extrapolation.CLAMP);
    const p1Fade = interpolate(p1.value, [0.08, 0.35], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: textOpacity * p1Fade,
    };
  });

  // C 位聚焦水面镜面倒影显隐：
  // 倒影盒整体透明度设为 p1 * (1 - p2) * interpolate(Math.abs(continuousK), [0, 0.55], [1, 0], Extrapolation.CLAMP)
  // 仅中心 C 位主卡投射清晰倒影，彻底防止侧卡与主卡的 #13121D 遮罩重叠互切
  const animatedReflectionStyle = useAnimatedStyle(() => {
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    const absK = Math.abs(continuousK);
    const deckFactor = p1.value * (1 - p2.value);
    const centerFocus = interpolate(absK, [0, 0.55], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: deckFactor * centerFocus,
    };
  });

  // 水面微光交界线 (仅中心主卡显示)
  const animatedWaterSeamStyle = useAnimatedStyle(() => {
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    const absK = Math.abs(continuousK);
    const deckFactor = p1.value * (1 - p2.value);
    const centerFactor = interpolate(absK, [0.15, 0.40], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: deckFactor * centerFactor,
    };
  });

  const cleanedSnippet = useMemo(() => {
    const raw = item.description || item.prompt || '';
    const cleaned = cleanPromptSnippet(raw);
    if (!cleaned && item.tags && item.tags.length > 0) {
      return item.tags[0];
    }
    return cleaned;
  }, [item.description, item.prompt, item.tags]);

  const handlePress = useCallback(() => {
    const continuousK = (itemIndex - baseCardIndex.value) + (panX.value / slotWidth);
    onPressCard(item, continuousK, itemIndex);
  }, [baseCardIndex, item, itemIndex, onPressCard, panX, slotWidth]);

  return (
    <Animated.View
      pointerEvents={p2.value > 0.05 && Math.abs(itemIndex - baseCardIndex.value) < 0.5 ? 'none' : 'auto'}
      style={[
        styles.deckCardPositioner,
        {
          left: centerX - cardWidth / 2,
          top: centerY - cardHeight / 2,
          width: cardWidth,
          height: cardHeight,
        },
        animatedCardStyle,
      ]}
    >
      {/* ── 子节点 A：主卡本体盒 (100% 满铺整卡，1.2px 物理折光外边压住顶边漏白) ── */}
      <View style={styles.cardBodyBox}>
        {/* 全出血立绘封面图 (100% 满铺整卡) */}
        {item.avatarEnabled && item.avatarUri ? (
          <SecureImage
            contentFit="cover"
            space="normal"
            style={StyleSheet.absoluteFill}
            uri={item.avatarUri}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cardFallbackArea]}>
            <Text style={styles.cardFallbackLetter}>{item.name.slice(0, 1)}</Text>
          </View>
        )}

        {/* 底部 48% 高度多层阶梯暮色渐变舱 */}
        <LinearGradient
          colors={['transparent', 'rgba(14, 13, 22, 0.65)', 'rgba(10, 10, 16, 0.95)']}
          pointerEvents="none"
          style={styles.cardBottomScrim}
        />

        {/* 精致内嵌微画框 (内缩 5px，0.8px 晶莹微光内边) */}
        <View pointerEvents="none" style={styles.microFrame} />

        {/* 底部角色信息区 (绑定侧卡净空动画) */}
        <Animated.View pointerEvents="none" style={[styles.cardInfoSection, animatedTextContainerStyle]}>
          {/* 微胶囊标签 */}
          <View style={styles.cardMicroPill}>
            <Text style={styles.cardMicroPillText}>✦ 沉浸伴聊</Text>
          </View>

          {/* 角色大标题 */}
          <Text numberOfLines={1} style={styles.cardHeroName}>
            {item.name}
          </Text>

          {/* 纯净两行人设简介 */}
          <Text numberOfLines={2} style={styles.cardHeroSnippet}>
            {cleanedSnippet || '轻触卡片开启深层伴聊交互'}
          </Text>
        </Animated.View>

        {/* 侧卡纯黑实心压暗近亮远暗遮罩层 (严防幽灵透底) */}
        <Animated.View pointerEvents="none" style={[styles.darkOverlay, animatedDarkOverlayStyle]} />

        {/* 点击区域 */}
        <Pressable onPress={handlePress} style={StyleSheet.absoluteFill} />
      </View>

      {/* ── 水面微光交界线 (仅中心主卡显示，0.8px 细线) ── */}
      <Animated.View pointerEvents="none" style={[styles.waterSeamLine, animatedWaterSeamStyle]} />

      {/* ── 子节点 B：C 位聚焦水面镜面倒影盒 (同级兄弟，position: 'absolute', top: cardHeight + 6, left: 0, width: cardWidth, height: cardHeight * 0.26, borderRadius: 22, overflow: 'hidden') ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.reflectionContainer,
          {
            top: cardHeight + 6,
            left: 0,
            width: cardWidth,
            height: cardHeight * 0.26,
          },
          animatedReflectionStyle,
        ]}
      >
        {item.avatarEnabled && item.avatarUri ? (
          <SecureImage
            blurRadius={Platform.OS === 'android' ? 6 : 8}
            contentFit="cover"
            space="normal"
            style={{
              position: 'absolute',
              bottom: 0,
              width: cardWidth,
              height: cardHeight,
              transform: [{ scaleY: -1 }],
              opacity: 0.32,
            }}
            uri={item.avatarUri}
          />
        ) : (
          <View
            style={[
              styles.cardFallbackArea,
              {
                position: 'absolute',
                bottom: 0,
                width: cardWidth,
                height: cardHeight,
                transform: [{ scaleY: -1 }],
                opacity: 0.32,
              },
            ]}
          >
            <Text style={styles.cardFallbackLetter}>{item.name.slice(0, 1)}</Text>
          </View>
        )}

        {/* 深水消隐遮罩：从顶部 rgba(19, 18, 29, 0.15) 平滑过渡，在倒影盒 80% 高度处达到 100% #13121D */}
        <LinearGradient
          colors={['rgba(19, 18, 29, 0.15)', '#13121D', '#13121D']}
          locations={[0, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
});

// ─── 转场引擎主入口 ────────────────────────────────────────────────────────────

export const RadialOrbitHeroTransition = memo(function RadialOrbitHeroTransition<T extends RadialOrbitItem>({
  visible,
  selectedItem,
  surroundingItems,
  cardAnchors,
  onCloseToLibrary,
  onWaterfallVisibilityChange,
  onStartChat,
  renderDetailContent,
}: RadialOrbitHeroTransitionProps<T>) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // 舞台中心坐标与槽位基准物理宽度 (适度上移 8% 配平下方倒影与 HUD)
  const centerX = screenWidth / 2;
  const centerY = screenHeight * 0.42;
  const slotWidth = screenWidth * 0.28;
  const { width: deckCardWidth, height: deckCardHeight } = useMemo(
    () => getDeckCardDimensions(screenWidth),
    [screenWidth]
  );

  // 核心驱动共享值
  const progress1 = useSharedValue(0);
  const progress2 = useSharedValue(0);
  const glintProgress = useSharedValue(0);
  const scrubY = useSharedValue(0);
  const panX = useSharedValue(0);
  const baseCardIndex = useSharedValue(0);

  // 状态机状态：idle -> opening_to_deck -> deck (持久化长廊) -> detail (全屏详情) -> closing_to_deck -> closing_to_waterfall
  const [activeStage, setActiveStage] = useState<
    'idle' | 'opening_to_deck' | 'deck' | 'detail' | 'closing_to_deck' | 'closing_to_waterfall'
  >('idle');

  // 当前居中的卡片索引
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // 看门狗定时器防泄漏管理
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleWatchdog = useCallback((fn: () => void, delayMs: number) => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
    }
    watchdogTimerRef.current = setTimeout(() => {
      watchdogTimerRef.current = null;
      fn();
    }, delayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
      }
    };
  }, []);

  // 动态引用网：彻底消除 PanResponder 内部陈旧闭包 (Stale Closure)
  const activeStageRef = useRef(activeStage);
  activeStageRef.current = activeStage;
  const activeCardIndexRef = useRef(activeCardIndex);
  activeCardIndexRef.current = activeCardIndex;
  const surroundingItemsRef = useRef(surroundingItems);
  surroundingItemsRef.current = surroundingItems;

  // 状态更新器：同步刷新 ref 与 state，杜绝手势判定微秒级时序脱节
  const updateStage = useCallback((stage: typeof activeStage) => {
    activeStageRef.current = stage;
    setActiveStage(stage);
  }, []);

  // 初始化设置聚焦卡片索引
  useEffect(() => {
    if (selectedItem && surroundingItems.length > 0) {
      const idx = surroundingItems.findIndex((c) => c.id === selectedItem.id);
      if (idx >= 0) {
        setActiveCardIndex(idx);
        baseCardIndex.value = idx;
      }
    }
  }, [baseCardIndex, selectedItem, surroundingItems]);

  const currentFocusedItem = useMemo(() => {
    return surroundingItems[activeCardIndex] || selectedItem;
  }, [activeCardIndex, selectedItem, surroundingItems]);

  // 铁律 3：瀑布流显隐安全网 (无论是 3D 长廊还是直接展开详情页，只要处于转场态立即隐藏底层瀑布流，严防底部漏底)
  useAnimatedReaction(
    () => {
      return progress1.value > 0.1 || progress2.value > 0.05;
    },
    (shouldHide) => {
      if (onWaterfallVisibilityChange) {
        runOnJS(onWaterfallVisibilityChange)(shouldHide);
      }
    }
  );

  // 组件卸载时强制复位瀑布流可见性
  useEffect(() => {
    return () => {
      onWaterfallVisibilityChange?.(false);
    };
  }, [onWaterfallVisibilityChange]);

  // 计算中心卡瀑布流测量锚点 (若未测量则赋予中心兜底值)
  const centerAnchor: GridAnchor = useMemo(() => {
    if (!currentFocusedItem) {
      return { offsetX: 0, offsetY: 0, scale: 1 };
    }
    return cardAnchors[currentFocusedItem.id] || { offsetX: 0, offsetY: 0, scale: 1 };
  }, [cardAnchors, currentFocusedItem]);

  // 过滤当前需要挂载的视口卡片群 (活跃索引周边 ±4 张)
  const visibleDeckCards = useMemo(() => {
    if (surroundingItems.length === 0) return [];
    return surroundingItems
      .map((item, index) => {
        const k = index - activeCardIndex;
        const anchor = cardAnchors[item.id] || {
          offsetX: (k > 0 ? 1 : -1) * screenWidth * 0.28,
          offsetY: screenHeight * 0.65,
          scale: 0.45,
        };
        return { item, index, k, anchor };
      })
      .filter(({ k }) => Math.abs(k) <= 4);
  }, [activeCardIndex, cardAnchors, screenHeight, screenWidth, surroundingItems]);

  // ── 交互方法：长廊卡片索引落定更新 (Worklet原子化赋值，彻底消除切卡封面闪烁) ──
  const handleCardIndexSettled = useCallback((newIndex: number) => {
    baseCardIndex.value = newIndex;
    panX.value = 0;
    activeCardIndexRef.current = newIndex;
    setActiveCardIndex(newIndex);
  }, [baseCardIndex, panX]);

  // ── 交互方法：从 3D 长廊进入详情页 (p2: 0 -> 1) ──────────────────────────
  const triggerOpenDetailFromDeck = useCallback((item?: T) => {
    if (activeStageRef.current === 'detail') return;
    if (item) {
      const idx = surroundingItemsRef.current.findIndex((c) => c.id === item.id);
      if (idx >= 0 && idx !== activeCardIndexRef.current) {
        activeCardIndexRef.current = idx;
        setActiveCardIndex(idx);
        baseCardIndex.value = idx;
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    glintProgress.value = withTiming(1, { duration: 160 });
    progress2.value = withTiming(1, { duration: 250, easing: Easing.bezier(0.16, 1, 0.3, 1) }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(updateStage)('detail');
      }
    });

    // 看门狗保护：300ms 后强制确认进入 detail 状态
    scheduleWatchdog(() => {
      if (activeStageRef.current === 'opening_to_deck' || activeStageRef.current === 'deck') {
        updateStage('detail');
      }
    }, 300);
  }, [baseCardIndex, glintProgress, progress2, scheduleWatchdog, updateStage]);

  // ── 交互方法：从详情页返回 3D 长廊并在长廊驻留 (p2: 1 -> 0, p1 平滑推向 1) ─────
  const triggerCollapseDetailToDeck = useCallback(() => {
    if (activeStageRef.current === 'idle' || activeStageRef.current === 'closing_to_waterfall') return;
    updateStage('closing_to_deck');
    void Haptics.selectionAsync().catch(() => {});
    scrubY.value = withTiming(0, { duration: 180 }); // 柔和归位搓碟位移，杜绝生硬跳变
    glintProgress.value = withTiming(0, { duration: 80 });

    // 全屏收缩回 3D 长廊，p1 与 p2 协同过渡至长廊态
    progress1.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    progress2.value = withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished) {
        progress2.value = 0;
        scrubY.value = 0;
        runOnJS(updateStage)('deck');
      }
    });

    // 看门狗保护：280ms 后强制落定在 deck 态并清零 p2 驱动值，杜绝 C 位卡片蒸发死锁
    scheduleWatchdog(() => {
      progress2.value = 0;
      scrubY.value = 0;
      updateStage('deck');
    }, 280);
  }, [glintProgress, progress1, progress2, scheduleWatchdog, scrubY, updateStage]);

  // ── 交互方法：从 3D 长廊折叠飞回瀑布流网格 (p1: 1 -> 0) ───────────────────
  const triggerCollapseDeckToWaterfall = useCallback(() => {
    if (activeStageRef.current === 'closing_to_waterfall' || activeStageRef.current === 'idle') return;
    updateStage('closing_to_waterfall');
    void Haptics.selectionAsync().catch(() => {});
    panX.value = withSpring(0, SPRING_SWAP);

    progress2.value = 0;
    // 单调平滑减速归位，彻底消除弹簧回弹震颤造成的文字与尺寸跳变
    progress1.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }, (finished) => {
      'worklet';
      runOnJS(updateStage)('idle');
      runOnJS(onCloseToLibrary)();
    });

    // 看门狗保护：300ms 后强制恢复瀑布流与关闭转场层，绝不允许卡在 p1=0 的遮罩状态
    scheduleWatchdog(() => {
      progress1.value = 0;
      progress2.value = 0;
      panX.value = 0;
      if (activeStageRef.current === 'closing_to_waterfall') {
        updateStage('idle');
        onCloseToLibrary();
      }
    }, 300);
  }, [onCloseToLibrary, panX, progress1, progress2, scheduleWatchdog, updateStage]);

  // 启动正向序列：点击角色卡直接从卡片原始物理位置自然放大生长为全屏详情，不突变、不掉帧
  const startForward = useCallback(() => {
    updateStage('opening_to_deck');
    progress1.value = 0;
    progress2.value = 0;
    glintProgress.value = 0;
    scrubY.value = 0;
    panX.value = 0;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    glintProgress.value = withTiming(1, { duration: 200 });

    // 从角色卡物理矩形自然生长放大为全屏详情页 (无过冲平滑贝塞尔)
    progress2.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.22, 1, 0.36, 1) }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(updateStage)('detail');
      }
    });

    // 看门狗保护：360ms 后若仍未就位，且未发生主动退场，强制进入 detail 态
    scheduleWatchdog(() => {
      if (activeStageRef.current === 'opening_to_deck') {
        updateStage('detail');
      }
    }, 360);
  }, [glintProgress, panX, progress1, progress2, scheduleWatchdog, scrubY, updateStage]);

  useEffect(() => {
    if (visible && selectedItem) {
      startForward();
    } else if (!visible && activeStage !== 'idle') {
      triggerCollapseDeckToWaterfall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedItem]);

  // Android 实体返回键分级响应
  useEffect(() => {
    if (!visible || activeStage === 'idle') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeStage === 'detail') {
        triggerCollapseDetailToDeck();
      } else {
        triggerCollapseDeckToWaterfall();
      }
      return true;
    });
    return () => sub.remove();
  }, [activeStage, triggerCollapseDetailToDeck, triggerCollapseDeckToWaterfall, visible]);

  // ── 3D 长廊专属手势 (水平换卡 + 严格防斜划误触的上滑收拢) ─────────────────
  const isDraggingHorizontalRef = useRef(false);
  const lastRatchetSlotRef = useRef(0);

  const deckPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // 在 Capture 阶段拦截手势，彻底阻断水平滑动冒泡到外层 Tab 切换（防止误滑到整理页）
      onMoveShouldSetPanResponderCapture: (_e, gs) => {
        if (activeStageRef.current !== 'deck') return false;
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        const isHorizontal = absX > 6 && absX > absY * 0.8;
        const isStrictVerticalUp = gs.dy < -12 && absY > absX * 1.2;
        return isHorizontal || isStrictVerticalUp;
      },
      onMoveShouldSetPanResponder: (_e, gs) => {
        if (activeStageRef.current !== 'deck') return false;
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        const isHorizontal = absX > 5 && absX > absY * 0.8;
        const isStrictVerticalUp = gs.dy < -12 && absY > absX * 1.2;
        return isHorizontal || isStrictVerticalUp;
      },
      onPanResponderGrant: (_e, gs) => {
        isDraggingHorizontalRef.current = Math.abs(gs.dx) >= Math.abs(gs.dy);
        lastRatchetSlotRef.current = 0;
      },
      onPanResponderMove: (_e, gs) => {
        if (activeStageRef.current !== 'deck') return;
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);

        if (isDraggingHorizontalRef.current || absX > absY * 1.0) {
          isDraggingHorizontalRef.current = true;
          // 1:1 跟手拖拽卡牌
          panX.value = gs.dx;

          // 棘轮触觉反馈
          const currentSlot = Math.round(gs.dx / slotWidth);
          if (currentSlot !== lastRatchetSlotRef.current) {
            lastRatchetSlotRef.current = currentSlot;
            void Haptics.selectionAsync().catch(() => {});
          }
        }
      },
      onPanResponderRelease: (_e, gs) => {
        if (activeStageRef.current !== 'deck') return;
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);

        // 纵向上滑收起判定：灵敏触发飞回瀑布流网格
        const isStrictVerticalUp = gs.dy < -25 && absY > absX * 1.2;
        const isStrongFlickUp = gs.dy < -15 && gs.vy < -0.3 && absY > absX * 1.0;

        if (isStrictVerticalUp || isStrongFlickUp) {
          triggerCollapseDeckToWaterfall();
          return;
        }

        // 横向惯性动量吸附：向左拖动 (gs.dx < 0)，切向下一张卡片 (newIndex 增大)
        const projectedDx = gs.dx + gs.vx * 140;
        const steps = -Math.round(projectedDx / slotWidth);
        const totalItems = surroundingItemsRef.current.length;
        const currentIndex = activeCardIndexRef.current;
        const newIndex = Math.min(Math.max(currentIndex + steps, 0), Math.max(0, totalItems - 1));
        const snapOffset = -(newIndex - currentIndex) * slotWidth;

        panX.value = withSpring(
          snapOffset,
          { damping: 22, stiffness: 240, mass: 0.5 },
          () => {
            'worklet';
            baseCardIndex.value = newIndex;
            panX.value = 0;
            runOnJS(setActiveCardIndex)(newIndex);
          }
        );
      },
      onPanResponderTerminate: () => {
        lastRatchetSlotRef.current = 0;
        panX.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.5 });
      },
    })
  ).current;

  // ── 点击长廊卡片 ───────────────────────────────────────────────────────────
  const handlePressCard = useCallback(
    (item: RadialOrbitItem, continuousK: number, index: number) => {
      if (activeStageRef.current !== 'deck') return;
      // 若点击的是当前处于中心的卡片 (|continuousK| < 0.25): 放大进入详情页
      if (Math.abs(continuousK) < 0.25) {
        triggerOpenDetailFromDeck(item as T);
      } else {
        // 若点击的是左右两侧伴星卡：平滑滚动切换至中心成为主卡
        // 点击右侧伴星卡 (index > activeCardIndex) -> targetOffset 为负值 -> panX 向负方向平滑入位
        const targetOffset = -(index - activeCardIndexRef.current) * slotWidth;
        void Haptics.selectionAsync().catch(() => {});
        panX.value = withSpring(
          targetOffset,
          { damping: 22, stiffness: 240, mass: 0.5 },
          () => {
            'worklet';
            baseCardIndex.value = index;
            panX.value = 0;
            runOnJS(setActiveCardIndex)(index);
          }
        );
      }
    },
    [baseCardIndex, panX, slotWidth, triggerOpenDetailFromDeck]
  );

  // ── 详情页下滑搓碟手势 ─────────────────────────────────────────────────────
  const detailPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => gs.dy > 4 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_e, gs) => {
        if (gs.dy > 0) {
          scrubY.value = Math.min(220, gs.dy);
        }
      },
      onPanResponderRelease: (_e: GestureResponderEvent, gs: PanResponderGestureState) => {
        // 门槛降至灵敏的 45px 或 0.35 速度，轻快秒关防卡死
        if (gs.dy > 45 || (gs.dy > 18 && gs.vy > 0.35)) {
          triggerCollapseDetailToDeck();
        } else {
          scrubY.value = withSpring(0, SPRING_STAGE1);
        }
      },
      onPanResponderTerminate: () => {
        scrubY.value = withSpring(0, SPRING_STAGE1);
      },
    })
  ).current;

  // ── 全屏详情容器动画 (从 C 位平滑舒展为满屏) ───────────────────────────
  const fullscreenContainerStyle = useAnimatedStyle(() => {
    const p1 = progress1.value;
    const p2 = progress2.value;
    const scrub = scrubY.value;
    const scrubFactor = 1 - Math.min(1, scrub / 240) * 0.22;
    const scrubOffset = scrub * 0.75;

    const rect = centerAnchor.rect || {
      x: centerAnchor.offsetX + centerX - deckCardWidth / 2,
      y: centerAnchor.offsetY + centerY - deckCardHeight / 2,
      width: deckCardWidth * (centerAnchor.scale || 1),
      height: deckCardHeight * (centerAnchor.scale || 1),
    };
    const targetX = centerX - deckCardWidth / 2;
    const targetY = centerY - deckCardHeight / 2;

    const curX = interpolate(p1, [0, 1], [rect.x, targetX]);
    const curY = interpolate(p1, [0, 1], [rect.y, targetY]);
    const curWidth = interpolate(p1, [0, 1], [rect.width, deckCardWidth]);
    const curHeight = interpolate(p1, [0, 1], [rect.height, deckCardHeight]);

    const posX = interpolate(p2, [0, 1], [curX, 0]);
    const posY = interpolate(p2, [0, 1], [curY, 0]) + scrubOffset;
    const width = interpolate(p2, [0, 1], [curWidth, screenWidth]);
    // 增加底部安全边距溢出补偿，保证在有系统导航栏或异形屏时绝对满屏到底，彻底根治底部镂空与边框残留
    const fullHeight = screenHeight + insets.top + insets.bottom + 48;
    const height = interpolate(p2, [0, 1], [curHeight, fullHeight]);
    const cardBorderRadius = interpolate(p2, [0, 0.70], [18, 0], Extrapolation.CLAMP);

    const baseScale = p2 === 0 ? interpolate(p1, [0, 1], [centerAnchor.scale, 1.0], Extrapolation.CLAMP) : 1.0;

    return {
      position: 'absolute',
      left: posX,
      top: posY,
      width,
      height,
      borderRadius: cardBorderRadius,
      overflow: 'hidden',
      zIndex: 1000,
      display: p2 > 0.005 ? 'flex' : 'none',
      opacity: p2 > 0.005 ? 1 : 0,
      transform: [{ scale: baseScale * scrubFactor }],
    };
  });

  // 全屏态立绘海报自适应尺寸 (收敛至 42% 约 320px)
  const heroImageContainerStyle = useAnimatedStyle(() => {
    const p2 = progress2.value;
    const targetHeight = Math.min(screenHeight * 0.42, 320);
    const startHeight = centerAnchor.rect ? centerAnchor.rect.height : deckCardHeight;
    const currentHeight = interpolate(p2, [0, 1], [startHeight, targetHeight]);

    return {
      width: '100%',
      height: currentHeight,
    };
  });

  // 45° 冰晶流光
  const foilGlintStyle = useAnimatedStyle(() => {
    const g = glintProgress.value;
    const p2 = progress2.value;
    const translateX = interpolate(g, [0, 1], [-DECK_CARD_WIDTH * 1.2, DECK_CARD_WIDTH * 1.6]);
    const opacity = interpolate(g, [0, 0.2, 0.8, 1], [0, 0.85, 0.85, 0]) * (1 - p2);

    return {
      opacity,
      transform: [{ translateX }, { rotate: '45deg' }],
    };
  });

  // 返回箭头：严格限制在全屏态 (progress2 < 0.82 瞬间消失)
  const returnArrowStyle = useAnimatedStyle(() => {
    const p2 = progress2.value;
    const opacity = interpolate(p2, [0.82, 0.96], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
    };
  });

  // 详情内胆区 (p2 > 0.55 流体涌现)
  const detailBodyStyle = useAnimatedStyle(() => {
    const p2 = progress2.value;
    const opacity = interpolate(p2, [0.55, 1], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p2, [0.55, 1], [28, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // 悬浮双段操作胶囊
  const floatingCapsuleStyle = useAnimatedStyle(() => {
    const p2 = progress2.value;
    const opacity = interpolate(p2, [0.75, 1], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p2, [0.75, 1], [16, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // 3D 长廊顶部轻提示栏 (仅在 deck 态呈现)
  const deckTopTipStyle = useAnimatedStyle(() => {
    const isDeck = activeStage === 'deck';
    const p1 = progress1.value;
    const p2 = progress2.value;
    const opacity = isDeck && p1 >= 0.95 && p2 <= 0.05 ? 1 : 0;
    return {
      opacity,
    };
  });

  // 3D 长廊底层动态氛围背光 (随 p1 * (1 - p2) 显隐)
  const ambientStageStyle = useAnimatedStyle(() => {
    const deckFactor = progress1.value * (1 - progress2.value);
    return {
      opacity: deckFactor,
    };
  });

  // 底部展台交互控制舱 (Stage HUD)
  const stageHudStyle = useAnimatedStyle(() => {
    const isDeck = activeStage === 'deck';
    const deckFactor = progress1.value * (1 - progress2.value);
    const opacity = isDeck ? deckFactor : 0;
    const translateY = interpolate(deckFactor, [0, 1], [18, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // 渐进深邃暮色背景遮罩：随 p1 或 p2 展开平滑浮现，收拢至瀑布流时彻底隐退 (0 突变)
  const rootDarkBackdropStyle = useAnimatedStyle(() => {
    const p = Math.max(progress1.value, progress2.value);
    const opacity = interpolate(p, [0, 0.45], [0, 1.0], Extrapolation.CLAMP);
    return {
      opacity,
    };
  });

  const slotText = useMemo(() => {
    const total = surroundingItems.length;
    const current = Math.min(Math.max(activeCardIndex + 1, 1), Math.max(total, 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(current)} / ${pad(total)}`;
  }, [activeCardIndex, surroundingItems.length]);

  if (!visible && activeStage === 'idle') {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* 状态栏在 3D 长廊/全屏详情期间强制反白，杜绝时间与电量黑字干扰 */}
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />

      {/* ── 深邃暮色背景遮罩 ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: imDarkFloorColors.twilightBase },
          rootDarkBackdropStyle,
        ]}
      />

      {/* ── 动态氛围背光与上半屏天光 / 下半屏 100% 纯色水面 ── */}
      <Animated.View pointerEvents="none" style={[styles.ambientStageWrap, ambientStageStyle]}>
        {currentFocusedItem?.avatarEnabled && currentFocusedItem.avatarUri ? (
          <SecureImage
            blurRadius={Platform.OS === 'android' ? 50 : 65}
            contentFit="cover"
            space="normal"
            style={[StyleSheet.absoluteFill, { opacity: 0.18 }]}
            uri={currentFocusedItem.avatarUri}
          />
        ) : null}
        {/* 全屏纵向渐变遮罩：顶部 0.25 -> 54% 水线处达到 100% #13121D -> 54%~100% 保持纯 #13121D */}
        <LinearGradient
          colors={['rgba(19, 18, 29, 0.25)', '#13121D', '#13121D']}
          locations={[0, 0.54, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* ── 3D 长廊手势交互层 (全屏铺满捕获左右滑动与纵向上滑) ── */}
      <Animated.View
        {...deckPanResponder.panHandlers}
        pointerEvents={activeStage === 'deck' ? 'auto' : 'box-none'}
        style={StyleSheet.absoluteFill}
      >
        {/* 3D 长廊顶部极简提示与收起胶囊 (瘦身精致化) */}
        <Animated.View style={[styles.deckTopHeader, { top: insets.top + 10 }, deckTopTipStyle]}>
          <Pressable
            accessibilityLabel="返回角色瀑布流"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
            onPress={triggerCollapseDeckToWaterfall}
            style={styles.deckTopPill}
          >
            <Ionicons color="rgba(255, 255, 255, 0.78)" name="chevron-up" size={13} style={{ marginRight: 4 }} />
            <Text style={styles.deckTopPillText}>上滑或点击返回角色库</Text>
          </Pressable>
        </Animated.View>

        {/* ── 3D 长廊实体卡片群 (挂载 4 层物理结构 + 水面镜面倒影) ── */}
        {visibleDeckCards.map(({ item, index, anchor }) => (
          <PhysicalDeckCard
            anchor={anchor}
            baseCardIndex={baseCardIndex}
            cardHeight={deckCardHeight}
            cardWidth={deckCardWidth}
            centerX={centerX}
            centerY={centerY}
            isDetailActive={activeStage === 'detail' || activeStage === 'closing_to_deck'}
            item={item}
            itemIndex={index}
            key={item.id}
            onPressCard={handlePressCard}
            p1={progress1}
            p2={progress2}
            panX={panX}
            slotWidth={slotWidth}
            W={screenWidth}
          />
        ))}

        {/* ── 底部展台交互控制舱 (Stage HUD) ── */}
        <Animated.View
          pointerEvents={activeStage === 'deck' ? 'box-none' : 'none'}
          style={[
            styles.stageHudContainer,
            { bottom: Math.max(insets.bottom + 8, screenHeight * 0.07) },
            stageHudStyle,
          ]}
        >
          {/* 槽位指示器 (如 03 / 12) */}
          <View style={styles.slotIndicatorRow}>
            <View style={styles.slotLine} />
            <Text style={styles.slotIndicatorText}>{slotText}</Text>
            <View style={styles.slotLine} />
          </View>

          {/* 悬浮主操作双胶囊区 */}
          <View style={styles.hudActionRow}>
            {/* 主按钮「💬 开启伴聊」 */}
            <Pressable
              accessibilityLabel={`与 ${currentFocusedItem?.name || ''} 开启伴聊`}
              accessibilityRole="button"
              onPress={() => {
                if (currentFocusedItem) {
                  onStartChat?.(currentFocusedItem);
                }
              }}
              style={({ pressed }) => [
                styles.hudPrimaryBtn,
                pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
              ]}
            >
              <Ionicons color="#13121D" name="chatbubbles" size={15} style={{ marginRight: 6 }} />
              <Text style={styles.hudPrimaryBtnText}>开启伴聊</Text>
            </Pressable>

            {/* 副按钮「人设档案」 */}
            <Pressable
              accessibilityLabel={`查看 ${currentFocusedItem?.name || ''} 人设档案`}
              accessibilityRole="button"
              onPress={() => {
                triggerOpenDetailFromDeck();
              }}
              style={({ pressed }) => [
                styles.hudSecondaryBtn,
                pressed && { opacity: 0.80, transform: [{ scale: 0.97 }] },
              ]}
            >
              <Ionicons color="#FFFFFF" name="document-text-outline" size={15} style={{ marginRight: 6 }} />
              <Text style={styles.hudSecondaryBtnText}>人设档案</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>

      {/* ── C 位核心选中卡片详情展开全屏容器 (p2->1 舒展为全屏容器) ── */}
      {currentFocusedItem ? (
        <Animated.View
          pointerEvents={activeStage === 'detail' ? 'auto' : 'box-none'}
          style={fullscreenContainerStyle}
        >
          {/* 详情页底层无边框实色衬底 */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: '#13121D' },
            ]}
          />

          {/* 详情页立绘海报区 (支持下滑搓碟) */}
          <Animated.View {...detailPanResponder.panHandlers} style={[styles.heroPosterWrap, heroImageContainerStyle]}>
            {currentFocusedItem.avatarEnabled && currentFocusedItem.avatarUri ? (
              <SecureImage
                contentFit="cover"
                space="normal"
                style={StyleSheet.absoluteFill}
                uri={currentFocusedItem.avatarUri}
              />
            ) : (
              <View style={styles.cardFallbackArea}>
                <Text style={styles.cardFallbackLetter}>{currentFocusedItem.name.slice(0, 1)}</Text>
              </View>
            )}

            {/* 45° 冰晶流光 */}
            <Animated.View pointerEvents="none" style={[styles.glintStripe, foilGlintStyle]}>
              <LinearGradient
                colors={['transparent', imDarkFloorColors.foilGlint, 'transparent']}
                end={{ x: 1, y: 0.5 }}
                start={{ x: 0, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>

            {/* 立绘下缘通透遮罩，确保悬浮按钮清晰可读 */}
            <LinearGradient
              colors={['transparent', 'rgba(15, 13, 24, 0.78)']}
              style={styles.heroBottomScrim}
            />

            {/* 返回箭头按钮 (提前隐退，点击返回 3D 长廊驻留) */}
            <Animated.View style={[styles.returnArrowWrap, { top: insets.top + 6 }, returnArrowStyle]}>
              <Pressable
                accessibilityLabel="返回3D长廊"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                onPress={triggerCollapseDetailToDeck}
                style={styles.returnArrowBtn}
              >
                <Ionicons color="#FFFFFF" name="chevron-down" size={20} />
              </Pressable>
            </Animated.View>

            {/* 浮动在立绘下缘的高级微磨砂操作胶囊群 */}
            <Animated.View style={[styles.floatingActionRow, floatingCapsuleStyle]}>
              <Pressable
                accessibilityLabel={`与 ${currentFocusedItem.name} 开启伴聊`}
                accessibilityRole="button"
                onPress={() => onStartChat?.(currentFocusedItem)}
                style={({ pressed }) => [
                  styles.primaryActionCapsule,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons color="#FFFFFF" name="chatbubbles" size={15} style={{ marginRight: 6 }} />
                <Text style={styles.primaryActionText}>开启伴聊</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>

          {/* 详情内胆区 (流体涌现) */}
          <Animated.View
            style={[styles.detailScrollWrap, detailBodyStyle]}
          >
            {renderDetailContent(currentFocusedItem, triggerCollapseDetailToDeck)}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
});

// ─── 样式表 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  deckCardPositioner: {
    position: 'absolute',
  },
  // 第 1 层：实体厚度衬底 (1px 内描边，#1E2028 真实硬卡芯)
  extrudeCore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1E2028',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  // 水面微光交界线
  waterSeamLine: {
    position: 'absolute',
    top: '100%',
    marginTop: 3,
    width: '76%',
    height: 0.8,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignSelf: 'center',
    borderRadius: 1,
  },
  // 60fps 零算力水面镜面倒影容器
  reflectionContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 8,
    borderRadius: 22,
    overflow: 'hidden',
  },
  // 第 2 层：主体层图文同构盒子 (22px 大圆角典藏卡，1.2px 物理厚度外边)
  cardBodyBox: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#13121D',
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
  },
  cardBottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
  },
  microFrame: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 5,
    right: 5,
    borderRadius: 17,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  cardInfoSection: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  cardMicroPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    marginBottom: 6,
  },
  cardMicroPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.88)',
    letterSpacing: 0.5,
  },
  cardHeroName: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardHeroSnippet: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.68)',
    lineHeight: 18,
  },
  cardCoverArea: {
    width: '100%',
    height: DECK_CARD_HEIGHT - 62,
    backgroundColor: '#12101C',
    overflow: 'hidden',
  },
  coverBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  cardFallbackArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 197, 253, 0.14)',
  },
  cardFallbackLetter: {
    fontSize: 42,
    fontWeight: '700',
    color: '#C7D2FE',
  },
  cardInfoArea: {
    height: 62,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
    backgroundColor: '#181624',
  },
  cardTitleText: {
    ...typography.textStyles.bodyStrong,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardSnippetText: {
    ...typography.textStyles.micro,
    color: 'rgba(255, 255, 255, 0.58)',
    marginTop: 2,
  },
  // 第 3 层：纯黑压暗近亮远暗遮罩 (严防幽灵透底)
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    borderRadius: 22,
  },
  // 第 4 层：高光倒角边框 (微光高光 0.20，彻底消除粗暴高亮白条)
  bevelEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1.0,
    borderTopColor: 'rgba(255, 255, 255, 0.20)',
    borderLeftColor: 'rgba(255, 255, 255, 0.20)',
    borderBottomColor: 'rgba(0, 0, 0, 0.45)',
    borderRightColor: 'rgba(0, 0, 0, 0.45)',
  },
  // 全屏态立绘与内胆样式
  heroPosterWrap: {
    backgroundColor: '#12101C',
    overflow: 'hidden',
  },
  heroBottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  glintStripe: {
    position: 'absolute',
    top: -120,
    bottom: -120,
    width: 140,
  },
  returnArrowWrap: {
    position: 'absolute',
    left: 14,
    zIndex: 20,
  },
  returnArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingActionRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  primaryActionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryActionText: {
    ...typography.textStyles.bodyStrong,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  detailScrollWrap: {
    flex: 1,
    backgroundColor: imDarkFloorColors.twilightBase,
  },
  deckTopHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  deckTopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  deckTopPillText: {
    fontSize: 12,
    letterSpacing: 0.8,
    color: 'rgba(255, 255, 255, 0.82)',
    fontWeight: '500',
  },
  // ── 动态氛围背光 ──
  ambientStageWrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  ambientPosterImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  // ── 展台交互控制舱 (Stage HUD) ──
  stageHudContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  slotIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  slotLine: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  slotIndicatorText: {
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(255, 255, 255, 0.60)',
    marginHorizontal: 10,
    fontWeight: '600',
  },
  hudActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  hudPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F8',
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 99,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  hudPrimaryBtnText: {
    color: '#13121D',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hudSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 99,
  },
  hudSecondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
