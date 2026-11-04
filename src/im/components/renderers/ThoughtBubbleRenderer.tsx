import React, { useState, useCallback, useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { SecureImage } from '../../../components/SecureImage';
import { ImBubbleBeak } from '../common/ImBubbleBeak';

/**
 * 角色独立深度思考气泡渲染器 (Role Thought Bubble Renderer)
 *
 * 核心交互特征：
 * 1. 思考中 (isThinking === true)：灰色文字实时流式打字输出，气泡高度随文字量自然撑大；
 * 2. 思考结束：气泡立马闭合，仅显示一行精致灰色状态标签「思考完成（xx秒）」；
 * 3. 支持点击已闭合的气泡展开/折叠复看完整思考链；
 * 4. 采用无抖动约束设计，外层尺寸平稳，不引发倒置列表闪烁与抖动；
 * 5. 头像支持双击轻拍互动（Nudge）。
 */
export const ThoughtBubbleRenderer = React.memo(function ThoughtBubbleRenderer({
  message,
  companionAvatarUri,
  companionName = '角色',
  onLongPressMessage,
  onNudge,
  space = 'normal',
}: BubbleRendererProps) {
  const theme = useImTheme();
  const [userExpanded, setUserExpanded] = useState<boolean>(false);
  const lastAvatarTapRef = useRef<number>(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleAvatarPress = useCallback(() => {
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
      triggerShake();
      onNudge?.();
      lastAvatarTapRef.current = 0;
    } else {
      lastAvatarTapRef.current = now;
    }
  }, [onNudge, triggerShake]);

  const isThinking = Boolean(message.metadata?.isThinking);
  const durationSeconds = Math.max(1, Math.round(Number(message.metadata?.durationSeconds || 1)));
  const thoughtContent = (message.content || '').trim();

  // 若处于正在思考流式中，强制保持展开；若思考结束，由用户手动展开状态控制（默认紧凑闭合）
  const shouldShowBody = isThinking || userExpanded;

  const handleToggleExpand = useCallback(() => {
    if (isThinking) return;
    if (!userExpanded) {
      setUserExpanded(true);
    }
  }, [isThinking, userExpanded]);

  const handleCollapse = useCallback(() => {
    setUserExpanded(false);
  }, []);

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      if (onLongPressMessage) {
        const { pageX, pageY } = event.nativeEvent;
        onLongPressMessage(message, pageX, pageY);
      }
    },
    [message, onLongPressMessage]
  );

  // 思考气泡颜色与外观 1:1 对齐普通左侧白色气泡
  const bubbleBgColor = theme.colors.bubbleLeftBackground || '#FFFFFF';
  const bubbleBorderColor = theme.colors.bubbleLeftBorder || 'transparent';
  const textColor = theme.colors.systemNoticeText || '#7A8699';

  return (
    <View style={[styles.rowWrap, { marginHorizontal: 12 }]}>
      {/* 角色头像区 */}
      <View
        style={[
          styles.avatarContainer,
          {
            width: theme.metrics.avatarSize,
            height: theme.metrics.avatarSize,
            borderRadius: theme.radii.avatarRadius,
          },
        ]}
      >
        <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
          <Pressable
            accessibilityLabel={`角色头像 ${companionName}`}
            accessibilityRole="button"
            onPress={handleAvatarPress}
            style={styles.avatarPressable}
          >
            {companionAvatarUri ? (
              <SecureImage
                space={space}
                style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]}
                uri={companionAvatarUri}
              />
            ) : (
              <View
                style={[
                  styles.roleDefaultAvatar,
                  { borderRadius: theme.radii.avatarRadius },
                ]}
              >
                <Text style={styles.roleDefaultAvatarText}>
                  {companionName.slice(0, 1)}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>

      {/* 独立思考气泡区（外观与普通气泡 1:1 一模一样） */}
      <View
        style={[
          styles.bubbleWrap,
          {
            maxWidth: theme.metrics.bubbleMaxWidthPercent,
            marginLeft: theme.metrics.avatarToBubbleGap,
          },
        ]}
      >
        <ImBubbleBeak customColor={bubbleBgColor} direction="left" />
        <Pressable
          accessibilityLabel={
            isThinking
              ? '正在深度思考中'
              : userExpanded
                ? '思考内容，点击右下角小箭头收起'
                : `思考完成，耗时${durationSeconds}秒，点击展开思考过程`
          }
          accessibilityRole="button"
          accessibilityState={{ expanded: shouldShowBody }}
          delayLongPress={260}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onLongPress={handleLongPress}
          onPress={handleToggleExpand}
          style={({ pressed }) => [
            styles.bubbleBox,
            {
              backgroundColor: bubbleBgColor,
              borderRadius: theme.radii.bubbleRadius,
              borderColor: bubbleBorderColor,
              borderWidth: bubbleBorderColor && bubbleBorderColor !== 'transparent' ? StyleSheet.hairlineWidth : 0,
              paddingHorizontal: theme.metrics.bubblePaddingHorizontal,
              paddingVertical: theme.metrics.bubblePaddingVertical,
            },
            pressed && !isThinking && !userExpanded && styles.bubblePressed,
          ]}
        >
          {/* 缩进态（思考完成闭合）：仅显示正常字号的灰色思考完成（xx秒），无任何灯泡图标 */}
          {!shouldShowBody ? (
            <Text
              style={[
                styles.bubbleText,
                {
                  color: textColor,
                  fontSize: theme.typography.bubbleFontSize,
                  lineHeight: theme.typography.bubbleLineHeight,
                  letterSpacing: theme.typography.bubbleLetterSpacing,
                },
              ]}
            >
              {`思考完成（${durationSeconds}秒）`}
            </Text>
          ) : (
            /* 展开态 / 流式思考中：彻底隐藏「思考完成」行，纯净展示 16dp 灰字思考内容 */
            <View style={styles.expandedContentWrap}>
              <Text
                selectable
                style={[
                  styles.bubbleText,
                  {
                    color: textColor,
                    fontSize: theme.typography.bubbleFontSize,
                    lineHeight: theme.typography.bubbleLineHeight,
                    letterSpacing: theme.typography.bubbleLetterSpacing,
                  },
                ]}
              >
                {thoughtContent || (isThinking ? '正在深度思考...' : '')}
              </Text>

              {/* 用户展开态右下角精致收起小箭头 */}
              {userExpanded && !isThinking ? (
                <View style={styles.collapseRow}>
                  <Pressable
                    accessibilityLabel="收起思考内容"
                    accessibilityRole="button"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={handleCollapse}
                    style={styles.collapseButton}
                  >
                    <Ionicons color={textColor} name="chevron-up" size={16} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#D1D5DB',
  },
  avatarPressable: {
    width: '100%',
    height: '100%',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  roleDefaultAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleDefaultAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bubbleWrap: {
    position: 'relative',
    justifyContent: 'flex-start',
  },
  bubbleBox: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  bubblePressed: {
    opacity: 0.85,
  },
  bubbleText: {
    color: '#7A8699',
  },
  expandedContentWrap: {
    width: '100%',
  },
  collapseRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  collapseButton: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
