import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { ImBubbleBeak } from '../common/ImBubbleBeak';
import { SecureImage } from '../../../components/SecureImage';

/**
 * 微信经典原生文字气泡渲染器 (Authentic WeChat Text Bubble)
 */
export function TextBubbleRenderer({
  message,
  companionAvatarUri,
  companionName = '伴侣',
  userAvatarUri,
  onLongPressMessage,
  onPressMessage,
  onNudge,
}: BubbleRendererProps) {
  const theme = useImTheme();
  const isUser = message.role === 'user';
  const lastAvatarTapRef = React.useRef(0);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const handleAvatarPress = () => {
    if (isUser) return;
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
      triggerShake();
      onNudge?.();
      lastAvatarTapRef.current = 0;
    } else {
      lastAvatarTapRef.current = now;
    }
  };

  const formattedContent = (message.content || '').replace(/\[BR\]/g, '\n').trim();

  // 识别正文与括号心理/动作描写，分层赋予淡雅灰字阶（不设字数上限）
  const contentSegments = React.useMemo(() => {
    if (!formattedContent) return [];
    const parts = formattedContent.split(/([（\(][^）\)]+[）\)])/g);
    return parts.filter(Boolean).map((part, index) => {
      const isThought = /^([（\(].+[）\)])$/.test(part);
      return { id: index, text: part, isThought };
    });
  }, [formattedContent]);

  const handleLongPress = (event: any) => {
    if (onLongPressMessage) {
      const { pageX, pageY } = event.nativeEvent;
      onLongPressMessage(message, pageX, pageY);
    }
  };

  const handlePress = () => onPressMessage?.(message);

  return (
    <View style={[styles.rowWrap, { flexDirection: isUser ? 'row-reverse' : 'row', marginHorizontal: 12 }]}>
      {/* 头像区 */}
      <View style={[styles.avatarContainer, { width: theme.metrics.avatarSize, height: theme.metrics.avatarSize, borderRadius: theme.radii.avatarRadius }]}>
        {isUser ? (
          userAvatarUri ? (
            <SecureImage space="normal" style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={userAvatarUri} />
          ) : (
            <View style={[styles.userDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
              <Text style={styles.userDefaultAvatarText}>我</Text>
            </View>
          )
        ) : (
          <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
              {companionAvatarUri ? (
                <SecureImage space="normal" style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={companionAvatarUri} />
              ) : (
                <View style={[styles.companionDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                  <Text style={styles.companionDefaultAvatarText}>{companionName.slice(0, 1)}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* 气泡与尖角包裹区 */}
      <View style={[styles.bubbleWrap, { maxWidth: theme.metrics.bubbleMaxWidthPercent, marginLeft: isUser ? 0 : theme.metrics.avatarToBubbleGap, marginRight: isUser ? theme.metrics.avatarToBubbleGap : 0 }]}>
        <ImBubbleBeak direction={isUser ? 'right' : 'left'} />
        <Pressable
          delayLongPress={260}
          onLongPress={handleLongPress}
          onPress={handlePress}
          style={({ pressed }) => [
            styles.bubbleBox,
            {
              backgroundColor: isUser ? theme.colors.bubbleRightBackground : theme.colors.bubbleLeftBackground,
              borderRadius: theme.radii.bubbleRadius,
              paddingHorizontal: theme.metrics.bubblePaddingHorizontal,
              paddingVertical: theme.metrics.bubblePaddingVertical,
              borderColor: isUser ? theme.colors.bubbleRightBorder : theme.colors.bubbleLeftBorder,
              borderWidth: (isUser ? theme.colors.bubbleRightBorder : theme.colors.bubbleLeftBorder) !== 'transparent' ? StyleSheet.hairlineWidth : 0,
            },
            pressed && styles.bubblePressed,
          ]}
        >
          <Text
            selectable
            style={[
              styles.bubbleText,
              {
                color: isUser ? theme.colors.bubbleRightText : theme.colors.bubbleLeftText,
                fontSize: theme.typography.bubbleFontSize,
                lineHeight: theme.typography.bubbleLineHeight,
                letterSpacing: theme.typography.bubbleLetterSpacing,
              },
            ]}
          >
            {contentSegments.map((segment) =>
              segment.isThought ? (
                <Text
                  key={segment.id}
                  style={[
                    styles.thoughtText,
                    {
                      color: isUser ? 'rgba(0, 0, 0, 0.55)' : '#7A8699',
                      fontSize: Math.max(12, theme.typography.bubbleFontSize - 2),
                    },
                  ]}
                >
                  {segment.text}
                </Text>
              ) : (
                <Text key={segment.id}>{segment.text}</Text>
              )
            )}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: { alignItems: 'flex-start' },
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  avatarPressable: { width: '100%', height: '100%' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  userDefaultAvatar: { width: '100%', height: '100%', backgroundColor: '#4B6B94', justifyContent: 'center', alignItems: 'center' },
  userDefaultAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  companionDefaultAvatar: { width: '100%', height: '100%', backgroundColor: '#006948', justifyContent: 'center', alignItems: 'center' },
  companionDefaultAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  bubbleWrap: { position: 'relative', justifyContent: 'flex-start' },
  bubbleBox: { elevation: 0 },
  bubblePressed: { opacity: 0.88 },
  bubbleText: { textAlign: 'left' },
  thoughtText: { fontStyle: 'italic', opacity: 0.9 },
});
