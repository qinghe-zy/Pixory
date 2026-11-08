/**
 * ImRoleSecondFloor — 伴聊二楼角色库瀑布流与【3D卡牌立体长廊】转场集成
 *
 * 核心升级：
 * 1. 彻底移除“角色库”居中标题，空间留白，高对比毛玻璃搜索胶囊
 * 2. 56px + 底部安全区高质感底座抓手 (对齐首页顶栏体量，暮色和谐，支持轻触与上滑返回)
 * 3. 0 延迟同步布局计算 (结合 onLayout 与 scrollY 同步生成 GridAnchor，消灭异步跨桥迟滞)
 * 4. 瀑布流双重显隐保护 (转场期间严格隐藏，归零时无缝交接，杜绝永久黑屏死锁)
 * 5. 提示词深度净化 (过滤 You are now Model-0X3 等底层技术指令)
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AiRoleCardRecord } from '../../ai/types';
import { sanitizeRolePromptForDisplay, sanitizeRoleTags } from '../../ai/utils/rolePromptSanitizer';
import type { PixorySpace } from '../../database';
import { radius, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../../components/SecureImage';
import { imDarkFloorColors } from '../theme/imDarkFloorColors';
import {
  RadialOrbitHeroTransition,
  cleanPromptSnippet,
  DECK_CARD_WIDTH,
  type GridAnchor,
  type RadialOrbitItem,
} from '../../components/transitions/RadialOrbitHeroTransition';

// ─── 物理常量 ─────────────────────────────────────────────────────────────────

const SPRING_CARD = { damping: 20, stiffness: 300, mass: 0.45 };
const SPRING_HANDLE_SNAP = { damping: 28, stiffness: 320, mass: 0.48, overshootClamping: true as const };

/** 阶梯入场：灵动优雅微光升腾微绽放 (Aero-Bloom, <=160ms) */
const MAX_ANIMATED_CARDS = 20;

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface ImRoleSecondFloorProps {
  space: PixorySpace;
  roleCards: AiRoleCardRecord[];
  sfProgress: SharedValue<number>;
  exitTranslateY?: SharedValue<number>;
  active: boolean;
  onCollapseToRail: () => void;
  onCollapseToHome: () => void;
  onSelectRole: (roleCardId: string) => void;
  onOpenRoleDetail: (roleCardId: string) => void;
  onTransitionActiveChange?: (active: boolean) => void;
  onSecondFloorDrag?: (dy: number) => void;
  onSecondFloorRelease?: (dy: number, vy: number) => void;
}

// ─── 单张卡片（深色变体） ─────────────────────────────────────────────────────

interface DarkRoleCardProps {
  card: AiRoleCardRecord;
  space: PixorySpace;
  entryProgress: SharedValue<number>;
  isSelected?: boolean;
  onPress: (card: AiRoleCardRecord) => void;
  onStartChat: (card: AiRoleCardRecord) => void;
  onLayoutCapture: (id: string, colIndex: number, layout: { x: number; y: number; width: number; height: number }) => void;
  colIndex: number;
  rowIndex: number;
}

const DarkRoleCard = memo(function DarkRoleCard({
  card,
  space,
  entryProgress,
  isSelected,
  onPress,
  onStartChat,
  onLayoutCapture,
  colIndex,
  rowIndex: _rowIndex,
}: DarkRoleCardProps) {
  const cardRef = useRef<View>(null);

  const cleanedDescription = useMemo(() => {
    const raw = card.description || card.prompt || '';
    const cleaned = cleanPromptSnippet(raw);
    return sanitizeRolePromptForDisplay(cleaned, { roleName: card.name, mode: 'cleaned' });
  }, [card.description, card.name, card.prompt]);

  const tags = sanitizeRoleTags(card.tags);
  const primaryTag = tags[0] ?? null;
  const isImported = card.sourceType !== null && card.sourceType !== 'pixory_manual';

  const cardAnimStyle = useAnimatedStyle(() => {
    // 首次展开就绪后，严格锁定为标准几何姿态，杜绝转场返回瀑布流时跳动
    const isReady = entryProgress.value >= 0.98;
    const currentScale = isReady ? 1.0 : interpolate(entryProgress.value, [0, 1], [0.94, 1.0], Extrapolation.CLAMP);
    const currentTranslateY = isReady ? 0 : interpolate(entryProgress.value, [0, 1], [16, 0], Extrapolation.CLAMP);
    const currentOpacity = isSelected
      ? 0
      : (isReady ? 1.0 : interpolate(entryProgress.value, [0, 0.45], [0, 1], Extrapolation.CLAMP));

    return {
      opacity: currentOpacity,
      transform: [
        { translateY: currentTranslateY },
        { scale: currentScale },
      ],
    };
  });

  const borderFlashAnimStyle = useAnimatedStyle(() => {
    const isReady = entryProgress.value >= 0.98;
    const borderAlpha = isReady
      ? 0.16
      : interpolate(entryProgress.value, [0, 0.6, 1], [0.08, 0.38, 0.16], Extrapolation.CLAMP);
    return {
      borderColor: `rgba(255, 255, 255, ${borderAlpha})`,
    };
  });

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      onLayoutCapture(card.id, colIndex, { x, y, width, height });
    },
    [card.id, colIndex, onLayoutCapture]
  );

  return (
    <Animated.View onLayout={handleLayout} ref={cardRef} style={cardAnimStyle}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(card)}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
        ]}
      >
        {/* 全出血立绘封面图 (与 3D 画廊卡 100% 几何同构) */}
        {card.avatarEnabled && card.avatarUri ? (
          <SecureImage
            contentFit="cover"
            space={space}
            style={styles.cardCoverImage}
            uri={card.avatarUri}
          />
        ) : (
          <View style={styles.cardFallback}>
            <Text style={styles.cardFallbackLetter}>
              {card.name.trim().slice(0, 1) || 'A'}
            </Text>
          </View>
        )}

        {/* 底部多层渐变暮色舱 (Scrim) */}
        <LinearGradient
          colors={['transparent', 'rgba(14, 13, 22, 0.65)', 'rgba(10, 10, 16, 0.95)']}
          pointerEvents="none"
          style={styles.cardBottomScrim}
        />

        {/* 精致内嵌微画框 (内缩 4px，物理卡牌切边质感) */}
        <View pointerEvents="none" style={styles.microFrame} />

        {/* 左上角来源微徽章 */}
        <View style={styles.badgeWrap}>
          <Text style={styles.badge}>{isImported ? '导入' : '自建'}</Text>
        </View>

        {/* 卡内底部图文信息区 (与 3D 画廊卡内嵌信息同构) */}
        <View pointerEvents="none" style={styles.cardInnerInfo}>
          {primaryTag ? (
            <View style={styles.cardMicroPill}>
              <Text style={styles.cardMicroPillText}>{primaryTag}</Text>
            </View>
          ) : null}
          <Text numberOfLines={1} style={styles.cardName}>{card.name}</Text>
          {cleanedDescription ? (
            <Text numberOfLines={1} style={styles.cardDesc}>{cleanedDescription}</Text>
          ) : null}
        </View>

        {/* 快捷即时伴聊圆钮 (44px 移动触控热区) */}
        <Pressable
          accessibilityLabel={`与 ${card.name} 开启即时聊天`}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onStartChat(card);
          }}
          style={styles.quickChatBtn}
        >
          <Ionicons color="#FFFFFF" name="chatbubbles" size={13} />
        </Pressable>

        {/* 落槽迎光刀锋冷光亮边 (Specular Rim Flash) */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 18, borderWidth: 1.0 }, borderFlashAnimStyle]} />
      </Pressable>
    </Animated.View>
  );
});

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export const ImRoleSecondFloor = memo(function ImRoleSecondFloor({
  space,
  roleCards,
  sfProgress,
  exitTranslateY,
  active,
  onCollapseToRail,
  onCollapseToHome,
  onSelectRole,
  onOpenRoleDetail,
  onTransitionActiveChange,
  onSecondFloorDrag,
  onSecondFloorRelease,
}: ImRoleSecondFloorProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');

  // 同步缓存瀑布流卡片真实相对坐标
  const cachedLayoutsRef = useRef<Record<string, { colIndex: number; x: number; y: number; width: number; height: number }>>({});
  const scrollYRef = useRef(0);

  // 选中的转场角色与弹层状态
  const [transitionTarget, setTransitionTarget] = useState<AiRoleCardRecord | null>(null);
  const [isTransitionVisible, setIsTransitionVisible] = useState(false);
  const [isWaterfallHidden, setIsWaterfallHidden] = useState(false);

  // 过滤后的卡片
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return roleCards;
    const q = searchQuery.trim().toLowerCase();
    return roleCards.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchDesc = (c.description || '').toLowerCase().includes(q);
      const matchTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchName || matchDesc || matchTags;
    });
  }, [roleCards, searchQuery]);

  // 双列拆分
  const { leftCards, rightCards } = useMemo(() => {
    const left: AiRoleCardRecord[] = [];
    const right: AiRoleCardRecord[] = [];
    filteredCards.forEach((c, i) => {
      if (i % 2 === 0) left.push(c);
      else right.push(c);
    });
    return { leftCards: left, rightCards: right };
  }, [filteredCards]);

  // 20 个入场 SharedValue 池
  const sv0 = useSharedValue(0); const sv1 = useSharedValue(0);
  const sv2 = useSharedValue(0); const sv3 = useSharedValue(0);
  const sv4 = useSharedValue(0); const sv5 = useSharedValue(0);
  const sv6 = useSharedValue(0); const sv7 = useSharedValue(0);
  const sv8 = useSharedValue(0); const sv9 = useSharedValue(0);
  const sv10 = useSharedValue(0); const sv11 = useSharedValue(0);
  const sv12 = useSharedValue(0); const sv13 = useSharedValue(0);
  const sv14 = useSharedValue(0); const sv15 = useSharedValue(0);
  const sv16 = useSharedValue(0); const sv17 = useSharedValue(0);
  const sv18 = useSharedValue(0); const sv19 = useSharedValue(0);

  const cardSVs: SharedValue<number>[] = useMemo(() => [
    sv0, sv1, sv2, sv3, sv4, sv5, sv6, sv7, sv8, sv9,
    sv10, sv11, sv12, sv13, sv14, sv15, sv16, sv17, sv18, sv19,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const prevActiveRef = useRef(false);
  // 顶部搜索框率先天顶滑入 SharedValue (0~160ms)
  const searchEnterProgress = useSharedValue(0);

  // 每次激活时触发阶梯入场序列 (天幕尾流 · 错峰重力砸落 Zero-G Slam <=270ms)
  useEffect(() => {
    if (!active) {
      prevActiveRef.current = false;
      searchEnterProgress.value = 0;
      cardSVs.forEach((sv) => { sv.value = 0; });
      return;
    }

    const isFirstOpening = !prevActiveRef.current;
    prevActiveRef.current = true;

    // 搜索框天顶率先滑入 (withSpring damping: 18, stiffness: 240)
    searchEnterProgress.value = withSpring(1, { damping: 18, stiffness: 240 });

    const count = Math.min(filteredCards.length, MAX_ANIMATED_CARDS);
    if (isFirstOpening) {
      for (let i = 0; i < count; i++) {
        cardSVs[i].value = 0;
        if (i < 8) {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const delay = row * 24 + col * 12;
          cardSVs[i].value = withDelay(delay, withSpring(1, SPRING_CARD));
        } else {
          cardSVs[i].value = withDelay(110 + (i - 8) * 10, withSpring(1, SPRING_CARD));
        }
      }
      for (let i = count; i < MAX_ANIMATED_CARDS; i++) {
        cardSVs[i].value = 1;
      }
    } else {
      for (let i = 0; i < MAX_ANIMATED_CARDS; i++) {
        cardSVs[i].value = 1;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filteredCards.length]);

  // BackHandler 监听
  useEffect(() => {
    if (!active || isTransitionVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCollapseToHome();
      return true;
    });
    return () => sub.remove();
  }, [active, isTransitionVisible, onCollapseToHome]);

  // 整体容器展开动画（二楼自身平移与上滑退出次景深微缩联动）
  const containerStyle = useAnimatedStyle(() => {
    const p = sfProgress.value;
    const exitY = exitTranslateY ? exitTranslateY.value : 0;
    const exitScale = interpolate(exitY, [0, -screenHeight * 0.7], [1.0, 0.93], Extrapolation.CLAMP);
    const exitParallaxY = exitY * 0.55;

    return {
      backgroundColor: interpolateColor(
        p,
        [0, 0.35, 1],
        ['rgba(244,244,246,0.0)', 'rgba(29,27,40,0.65)', imDarkFloorColors.twilightBase]
      ),
      opacity: p <= 0.005 ? 0 : interpolate(p, [0, 0.45], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [-screenHeight * 0.08, 0], Extrapolation.CLAMP) + exitParallaxY },
        { perspective: 1000 },
        { rotateX: `${interpolate(p, [0, 0.65], [-7, 0], Extrapolation.CLAMP)}deg` },
        { scale: exitScale },
      ],
    };
  });

  const obsidianStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      sfProgress.value,
      [0, 0.5, 1],
      ['rgba(29,27,40,0.0)', 'rgba(29,27,40,0.55)', imDarkFloorColors.obsidianFilter]
    ),
  }));

  // 晨曦白化面纱：向上滑动回首页时，二楼渐进模糊变白泛化退场
  const whiteVeilStyle = useAnimatedStyle(() => {
    const exitY = exitTranslateY ? exitTranslateY.value : 0;
    const opacity = interpolate(exitY, [0, -screenHeight * 0.35], [0, 0.94], Extrapolation.CLAMP);
    return {
      opacity,
      display: opacity <= 0.005 ? 'none' : 'flex',
    };
  });

  // 顶栏与搜索框：二楼激活时天顶率先滑入 (translateY: -24 -> 0)；下拉时跟随下拉进度渐现
  const topHeaderFadeStyle = useAnimatedStyle(() => {
    const sf = sfProgress.value;
    const baseOpacity = interpolate(sf, [0.3, 0.72], [0, 1], Extrapolation.CLAMP);
    const activeTranslateY = interpolate(searchEnterProgress.value, [0, 1], [-24, 0], Extrapolation.CLAMP);
    const activeOpacity = interpolate(searchEnterProgress.value, [0, 0.6], [0, 1], Extrapolation.CLAMP);

    return {
      opacity: active ? activeOpacity : baseOpacity,
      transform: [
        { translateY: active ? activeTranslateY : interpolate(sf, [0.3, 0.9], [-10, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  // 瀑布流容器透明度
  const waterfallContainerAnimatedStyle = useAnimatedStyle(() => {
    const baseOpacity = interpolate(sfProgress.value, [0.25, 0.65], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: isWaterfallHidden ? 0 : baseOpacity,
    };
  });

  // 同步记录卡片真实坐标
  const handleCardLayoutCapture = useCallback(
    (id: string, colIndex: number, layout: { x: number; y: number; width: number; height: number }) => {
      cachedLayoutsRef.current[id] = { colIndex, ...layout };
    },
    []
  );

  // 同步计算全部可见卡片的 GridAnchor (0 延迟起飞，无需异步跨桥)
  const computeAllGridAnchors = useCallback((): Record<string, GridAnchor> => {
    const anchors: Record<string, GridAnchor> = {};
    const colWidth = (screenWidth - spacing[3] * 2 - spacing[2]) / 2;
    const centerX = screenWidth / 2;
    // 3D 长廊纵向中心中轴对齐 42% 高度 (适度上移 8% 配平下方倒影与 HUD)
    const centerY = screenHeight * 0.42;
    const searchSectionOffset = insets.top + 8 + 40 + spacing[2] + spacing[1];
    const deckCardWidth = Math.round(screenWidth * 0.56);

    Object.entries(cachedLayoutsRef.current).forEach(([id, l]) => {
      // 计算卡片在屏幕窗口上的绝对物理中心点
      const cardScreenX = spacing[3] + l.colIndex * (colWidth + spacing[2]) + l.x;
      const cardScreenY = searchSectionOffset + l.y - scrollYRef.current;
      const gridCenterX = cardScreenX + l.width / 2;
      const gridCenterY = cardScreenY + l.height / 2;

      anchors[id] = {
        offsetX: gridCenterX - centerX,
        offsetY: gridCenterY - centerY,
        scale: l.width / deckCardWidth,
        rect: {
          x: cardScreenX,
          y: cardScreenY,
          width: l.width,
          height: l.height,
        },
      };
    });

    // 为尚未触发 onLayout 或滚动到视口外的卡片预置合成兜底锚点 (严格杜绝左上角 0,0 幽灵卡片)
    roleCards.forEach((card, index) => {
      if (!anchors[card.id]) {
        const isRightCol = index % 2 === 1;
        const defaultX = isRightCol ? spacing[3] + colWidth + spacing[2] : spacing[3];
        const defaultY = screenHeight * 0.55;
        anchors[card.id] = {
          offsetX: isRightCol ? screenWidth * 0.28 : -screenWidth * 0.28,
          offsetY: screenHeight * 0.65,
          scale: colWidth / deckCardWidth,
          rect: {
            x: defaultX,
            y: defaultY,
            width: colWidth,
            height: colWidth * 1.42,
          },
        };
      }
    });

    return anchors;
  }, [insets.top, roleCards, screenHeight, screenWidth]);

  // 缓存全量计算锚点字典供转场引擎即时使用
  const [computedCardAnchors, setComputedCardAnchors] = useState<Record<string, GridAnchor>>({});

  // 触发 3D 长廊转场 (0 延迟同步启动)
  const handleOpenRadialTransition = useCallback(
    (card: AiRoleCardRecord) => {
      const anchors = computeAllGridAnchors();
      setComputedCardAnchors(anchors);
      setTransitionTarget(card);
      setIsTransitionVisible(true);
      onTransitionActiveChange?.(true);
    },
    [computeAllGridAnchors, onTransitionActiveChange]
  );

  // 关闭转场返回二楼
  const handleCloseRadialTransition = useCallback(() => {
    setIsTransitionVisible(false);
    setIsWaterfallHidden(false);
    setTransitionTarget(null);
    onTransitionActiveChange?.(false);
  }, [onTransitionActiveChange]);

  // 从转场直接开聊（意图 B）
  const handleStartChatFromTransition = useCallback(
    (item: RadialOrbitItem) => {
      onSelectRole(item.id);
      setTimeout(() => {
        setIsTransitionVisible(false);
        setIsWaterfallHidden(false);
        setTransitionTarget(null);
        onTransitionActiveChange?.(false);
      }, 450);
    },
    [onSelectRole, onTransitionActiveChange]
  );

  const renderCard = useCallback((card: AiRoleCardRecord, globalIndex: number, colIndex: number) => {
    const sv = globalIndex < MAX_ANIMATED_CARDS ? cardSVs[globalIndex] : cardSVs[MAX_ANIMATED_CARDS - 1];
    const rowIndex = Math.floor(globalIndex / 2);
    return (
      <DarkRoleCard
        card={card}
        colIndex={colIndex}
        entryProgress={sv}
        isSelected={transitionTarget?.id === card.id}
        key={card.id}
        onLayoutCapture={handleCardLayoutCapture}
        onPress={handleOpenRadialTransition}
        onStartChat={(c) => onSelectRole(c.id)}
        rowIndex={rowIndex}
        space={space}
      />
    );
  }, [cardSVs, handleCardLayoutCapture, handleOpenRadialTransition, onSelectRole, space, transitionTarget?.id]);

  // 渲染转场详情内胆
  const renderDetailContent = useCallback(
    (item: RadialOrbitItem, close: () => void) => {
      const card = roleCards.find((c) => c.id === item.id);
      if (!card) return null;

      const cleanedDescription = cleanPromptSnippet(card.description || card.prompt || '');
      const tags = sanitizeRoleTags(card.tags);
      const cleanedFirstMessage = cleanPromptSnippet(card.firstMessage || '');

      return (
        <ScrollView
          contentContainerStyle={[
            styles.detailScrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 56 },
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.detailScrollView}
        >
          <View style={styles.detailHeaderSection}>
            <Text style={styles.detailTitle}>{card.name}</Text>
            <View style={styles.tagRow}>
              {tags.slice(0, 4).map((t, i) => (
                <View key={i} style={styles.detailTagPill}>
                  <Text style={styles.detailTagText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>

          {cleanedDescription ? (
            <View style={styles.detailSection}>
              <Text style={styles.sectionHeading}>角色人设</Text>
              <Text style={styles.detailDescriptionText}>{cleanedDescription}</Text>
            </View>
          ) : null}

          {cleanedFirstMessage ? (
            <View style={styles.detailSection}>
              <Text style={styles.sectionHeading}>第一句话</Text>
              <View style={styles.quoteBubble}>
                <Text style={styles.quoteText}>{cleanedFirstMessage}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.detailActionSection}>
            <Pressable
              accessibilityLabel="查看完整角色档案"
              accessibilityRole="button"
              onPress={() => {
                close();
                onOpenRoleDetail(card.id);
              }}
              style={({ pressed }) => [
                styles.secondaryDetailButton,
                pressed && { opacity: 0.82 },
              ]}
            >
              <Text style={styles.secondaryDetailButtonText}>查看完整档案</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    },
    [onOpenRoleDetail, roleCards]
  );

  return (
    <Animated.View
      pointerEvents={active || isTransitionVisible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { zIndex: isTransitionVisible ? 20 : 2 },
        containerStyle,
      ]}
    >
      {/* 二楼激活期间强制状态栏白字 */}
      {active || isTransitionVisible ? (
        <StatusBar backgroundColor="transparent" barStyle="light-content" translucent />
      ) : null}

      {/* ── 光学底膜：高斯透镜散射与暮霭色调 ── */}
      <BlurView
        intensity={Platform.select({ android: 68, ios: 72 })}
        style={StyleSheet.absoluteFill}
        tint="dark"
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, obsidianStyle]} />
      <LinearGradient
        colors={[imDarkFloorColors.sheenTop, imDarkFloorColors.sheenBottom]}
        end={{ x: 0.5, y: 0.42 }}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.bezel} />

      {/* ── 晨曦白化模糊面纱 (Frost Veil): 向上滑出二楼时，自然变白雾化退场 ── */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', zIndex: 12 }, whiteVeilStyle]} />

      {/* ── 顶部微信级高对比毛玻璃搜索胶囊（纯净留白，移除角色库多余标题） ── */}
      <Animated.View style={[styles.searchSection, { paddingTop: insets.top + 8 }, topHeaderFadeStyle]}>
        <View style={styles.searchBar}>
          <Ionicons color="rgba(255, 255, 255, 0.75)" name="search-outline" size={16} />
          <TextInput
            onChangeText={setSearchQuery}
            placeholder="搜索角色名、设定或标签…"
            placeholderTextColor={imDarkFloorColors.searchPlaceholder}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable hitSlop={spacing[2]} onPress={() => setSearchQuery('')}>
              <Ionicons color="rgba(255, 255, 255, 0.75)" name="close-circle" size={16} />
            </Pressable>
          ) : null}
        </View>
      </Animated.View>

      {/* ── 双列瀑布流（转场激活时严格隐藏，防重影） ── */}
      <Animated.View style={[{ flex: 1 }, waterfallContainerAnimatedStyle]}>
        <ScrollView
          bounces={true}
          contentContainerStyle={[
            styles.waterfallContent,
            { paddingBottom: insets.bottom + 116 },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          overScrollMode="always"
          removeClippedSubviews
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.waterfallRow}>
            {/* 左列 */}
            <View style={styles.waterfallCol}>
              {leftCards.map((card, i) => renderCard(card, i * 2, 0))}
            </View>
            {/* 右列 */}
            <View style={styles.waterfallCol}>
              {rightCards.map((card, i) => renderCard(card, i * 2 + 1, 1))}
            </View>
          </View>

          {filteredCards.length === 0 && searchQuery.trim().length > 0 ? (
            <View style={styles.emptyState}>
              <Ionicons color={imDarkFloorColors.textTertiary} name="search-outline" size={40} />
              <Text style={styles.emptyText}>未找到匹配角色</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* ── 【核心炫技】3D卡牌立体长廊 (Cover Flow) 全屏转场层 ── */}
      <RadialOrbitHeroTransition
        cardAnchors={computedCardAnchors}
        onCloseToLibrary={handleCloseRadialTransition}
        onStartChat={handleStartChatFromTransition}
        onWaterfallVisibilityChange={setIsWaterfallHidden}
        renderDetailContent={renderDetailContent}
        selectedItem={transitionTarget}
        surroundingItems={filteredCards}
        visible={isTransitionVisible}
      />

    </Animated.View>
  );
});

// ─── 样式表 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bezel: {
    ...StyleSheet.absoluteFillObject,
    borderTopColor:   imDarkFloorColors.bezelTop,
    borderTopWidth:   0.5,
    borderLeftWidth:  0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  searchSection: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: imDarkFloorColors.searchBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    height: 40,
    gap: spacing[2],
    borderWidth: 0.8,
    borderColor: imDarkFloorColors.searchBorder,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    ...typography.textStyles.body,
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  waterfallContent: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[1],
  },
  waterfallRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  waterfallCol: {
    flex: 1,
    gap: spacing[2],
  },
  card: {
    backgroundColor: '#161424',
    borderRadius: 18,
    aspectRatio: 1 / 1.42,
    overflow: 'hidden',
    borderWidth: 1.0,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  cardCoverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  cardBottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '46%',
  },
  microFrame: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 14,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  cardFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 197, 253, 0.12)',
  },
  cardFallbackLetter: {
    fontSize: 32,
    fontWeight: '700',
    color: '#93C5FD',
  },
  badgeWrap: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
  },
  badge: {
    ...typography.textStyles.micro,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    color: 'rgba(255, 255, 255, 0.90)',
    overflow: 'hidden',
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  cardInnerInfo: {
    position: 'absolute',
    left: 10,
    right: 38,
    bottom: 10,
    gap: 3,
  },
  cardMicroPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  cardMicroPillText: {
    ...typography.textStyles.micro,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 9,
    fontWeight: '600',
  },
  cardName: {
    ...typography.textStyles.bodyStrong,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardDesc: {
    ...typography.textStyles.caption,
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    lineHeight: 15,
  },
  quickChatBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingTop: spacing[12],
    paddingHorizontal: spacing[8],
  },
  emptyText: {
    ...typography.textStyles.body,
    color: imDarkFloorColors.textSecondary,
    textAlign: 'center',
  },
  detailScrollView: {
    flex: 1,
    backgroundColor: '#13121D',
  },
  detailScrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: 48,
    gap: spacing[4],
  },
  detailHeaderSection: {
    gap: spacing[1.5],
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1.5],
  },
  detailTagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  detailTagText: {
    fontSize: 12,
    color: '#BFDBFE',
    fontWeight: '500',
  },
  detailSection: {
    gap: spacing[1.5],
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailDescriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  quoteBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: radius.lg,
    padding: spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: '#93C5FD',
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.92)',
    fontStyle: 'italic',
  },
  detailActionSection: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  secondaryDetailButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  secondaryDetailButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
});
