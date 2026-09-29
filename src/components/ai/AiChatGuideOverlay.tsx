/**
 * AiChatGuideOverlay
 *
 * 聊天页面新手引导遮罩层组件（完全独立）。
 * 三步引导：左侧栏介绍 → 精准高亮设置按钮 → 右侧栏介绍
 *
 * 技术说明：
 * - 步骤 2 高亮：用四个绝对定位 View 拼成带镂空的蒙层，精准贴合目标按钮
 * - 高亮边框的 borderRadius 与按钮一致（radius.md = 18），加 padding 后同步放大
 * - 整个蒙层均可点击推进（任意点击下一步）
 * - 气泡根据步骤和高亮区域自动定位
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { aiLightColors } from './aiLightTheme';

// ─── 公开类型 ────────────────────────────────────────────────────

export interface GuideHighlightRect {
  /** 按钮左上角 x（相对屏幕） */
  x: number;
  /** 按钮左上角 y（相对屏幕） */
  y: number;
  width: number;
  height: number;
  /** 按钮自身的 borderRadius，用于同步镂空形状 */
  borderRadius?: number;
}

export type AiChatGuideStep = 1 | 2 | 3;

export interface AiChatGuideOverlayProps {
  /** 当前引导步骤，null 代表不显示 */
  step: AiChatGuideStep | null;
  /** 步骤 2 目标按钮在屏幕上的精确坐标（由父级 ref.measure 传入） */
  settingsButtonRect: GuideHighlightRect | null;
  /** 推进到下一步 */
  onNext: () => void;
  /** 引导全部完成 */
  onDone: () => void;
}

// ─── 常量 ────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

const HIGHLIGHT_PADDING = 5; // 高亮区域比按钮每边多出 5px，视觉略有呼吸感

// 每步气泡内容
const STEP_CONTENT: Record<
  AiChatGuideStep,
  { title: string; body: string; icon: string; buttonLabel: string }
> = {
  1: {
    title: '全局记录区',
    body: '这里保存所有历史对话，还可以切换角色、管理全局材料。随时从左侧边缘右滑打开。',
    icon: 'albums-outline',
    buttonLabel: '下一步',
  },
  2: {
    title: '全局模型配置',
    body: '点此按钮可配置 AI 接口和 API Key。首次使用请先在这里完成配置。',
    icon: 'settings-outline',
    buttonLabel: '下一步',
  },
  3: {
    title: '当前会话控制台',
    body: '从右侧边缘左滑可随时打开。在这里切换本次对话的模型、记忆和材料。',
    icon: 'options-outline',
    buttonLabel: '我知道了',
  },
};

// ─── 主组件 ──────────────────────────────────────────────────────

export function AiChatGuideOverlay({
  step,
  settingsButtonRect,
  onNext,
  onDone,
}: AiChatGuideOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevStep = useRef<AiChatGuideStep | null>(null);

  useEffect(() => {
    if (step !== null) {
      // 步骤切换时先淡出再淡入，让内容更新更顺滑
      if (prevStep.current !== null && prevStep.current !== step) {
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 0.3, duration: 100, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      }
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    prevStep.current = step;
  }, [step, fadeAnim]);

  const handlePress = useCallback(() => {
    if (step === null) return;
    if (step === 3) {
      onDone();
    } else {
      onNext();
    }
  }, [step, onNext, onDone]);

  if (step === null) return null;

  const content = STEP_CONTENT[step];
  const hasHighlight = step === 2 && settingsButtonRect !== null;
  const rect = settingsButtonRect;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.overlayRoot, { opacity: fadeAnim }]}
    >
      {/* 整体可点击推进，恢复深色遮罩以保证高亮可见度 */}
      <Pressable onPress={handlePress} style={StyleSheet.absoluteFill}>
        {hasHighlight && rect ? (
          // ── 步骤 2：四矩形拼合 + 镂空高亮 ──
          <>
            {/* 上 */}
            <View
              style={[
                styles.scrim,
                { top: 0, left: 0, right: 0, height: rect.y - HIGHLIGHT_PADDING },
              ]}
            />
            {/* 下 */}
            <View
              style={[
                styles.scrim,
                {
                  top: rect.y + rect.height + HIGHLIGHT_PADDING,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            {/* 左 */}
            <View
              style={[
                styles.scrim,
                {
                  top: rect.y - HIGHLIGHT_PADDING,
                  left: 0,
                  width: Math.max(0, rect.x - HIGHLIGHT_PADDING),
                  height: rect.height + HIGHLIGHT_PADDING * 2,
                },
              ]}
            />
            {/* 右 */}
            <View
              style={[
                styles.scrim,
                {
                  top: rect.y - HIGHLIGHT_PADDING,
                  left: rect.x + rect.width + HIGHLIGHT_PADDING,
                  right: 0,
                  height: rect.height + HIGHLIGHT_PADDING * 2,
                },
              ]}
            />
            {/* 高亮边框（精准贴合按钮圆角） */}
            <View
              pointerEvents="none"
              style={[
                styles.highlightBorder,
                {
                  top: rect.y - HIGHLIGHT_PADDING,
                  left: rect.x - HIGHLIGHT_PADDING,
                  width: rect.width + HIGHLIGHT_PADDING * 2,
                  height: rect.height + HIGHLIGHT_PADDING * 2,
                  // borderRadius 与按钮同步，再加 padding 保持比例
                  borderRadius: (rect.borderRadius ?? 18) + HIGHLIGHT_PADDING,
                },
              ]}
            />
          </>
        ) : (
          // ── 步骤 1 / 3：全屏蒙层 ──
          <View style={[styles.scrim, StyleSheet.absoluteFill]} />
        )}
      </Pressable>

      {/* 气泡提示 */}
      <GuideBubble
        body={content.body}
        buttonLabel={content.buttonLabel}
        hasHighlight={hasHighlight}
        highlightRect={rect}
        icon={content.icon as React.ComponentProps<typeof Ionicons>['name']}
        onPress={handlePress}
        step={step}
        title={content.title}
      />
    </Animated.View>
  );
}

// ─── 气泡内部组件 ─────────────────────────────────────────────────

interface GuideBubbleProps {
  step: AiChatGuideStep;
  title: string;
  body: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  buttonLabel: string;
  hasHighlight: boolean;
  highlightRect: GuideHighlightRect | null;
  onPress: () => void;
}

function GuideBubble({
  step,
  title,
  body,
  icon,
  buttonLabel,
  hasHighlight,
  highlightRect,
  onPress,
}: GuideBubbleProps) {
  // 定位策略
  // 步骤 2 有高亮 → 气泡紧跟高亮按钮下方、右对齐
  // 步骤 1 → 屏幕下方中央（在侧栏内可见区域）
  // 步骤 3 → 屏幕下方中央（右侧栏可见区域）
  let positionStyle: object;

  if (hasHighlight && highlightRect) {
    const { x, y, width, height } = highlightRect;
    positionStyle = {
      position: 'absolute' as const,
      // 在按钮正下方
      top: y + height + HIGHLIGHT_PADDING + 12,
      // 直接固定右边距，避免受到容器宽度的影响
      right: 20,
      width: 220,
    };
  } else if (step === 1) {
    positionStyle = {
      position: 'absolute' as const,
      bottom: SCREEN_HEIGHT * 0.25,
      left: 20,
      right: 20,
    };
  } else {
    // step === 3
    positionStyle = {
      position: 'absolute' as const,
      bottom: SCREEN_HEIGHT * 0.25,
      left: 20,
      right: 20,
    };
  }

  return (
    // pointerEvents="box-none" 让气泡内按钮可点击，气泡外的点击穿透到蒙层推进
    <View pointerEvents="box-none" style={[styles.bubble, positionStyle]}>
      <View style={styles.bubbleHeader}>
        <View style={styles.iconWrap}>
          <Ionicons color="#2563eb" name={icon} size={14} />
        </View>
        <Text style={styles.bubbleTitle}>{title}</Text>
        <Text style={styles.stepBadge}>{step} / 3</Text>
      </View>

      <Text style={styles.bubbleBody}>{body}</Text>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.bubbleBtn, pressed && styles.bubbleBtnPressed]}
      >
        <Text style={styles.bubbleBtnText}>{buttonLabel}</Text>
        {buttonLabel !== '我知道了' && (
          <Ionicons color="#ffffff" name="arrow-forward" size={12} />
        )}
      </Pressable>
    </View>
  );
}

// ─── StyleSheet ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    // 置于所有聊天内容之上，但低于系统级 modal
    zIndex: 9000,
  },
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    position: 'absolute',
  },
  // 高亮镂空区域的白色边框
  highlightBorder: {
    borderColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    position: 'absolute',
  },

  // ── 气泡 ──
  bubble: {
    backgroundColor: aiLightColors.surface,
    borderRadius: 14,
    elevation: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  bubbleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 7,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  bubbleTitle: {
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  stepBadge: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  bubbleBody: {
    color: '#52525b',
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  bubbleBtn: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#18181b',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bubbleBtnPressed: {
    opacity: 0.7,
  },
  bubbleBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
