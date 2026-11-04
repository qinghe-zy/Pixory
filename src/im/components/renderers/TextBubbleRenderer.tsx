import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { ImBubbleBeak } from '../common/ImBubbleBeak';
import { SecureImage } from '../../../components/SecureImage';
import { extractSandboxExecutableCode } from '../../../services/sandbox/sandboxDetector';
import { parseStreamingArtifactSegments } from '../../../services/sandbox/streamingArtifactSplitter';
import { AiSandboxArtifactViewfinder } from '../../../components/ai/AiSandboxArtifactViewfinder';
import { AiSandboxArtifactCard } from '../../../components/ai/AiSandboxArtifactCard';
import { stripMetaTags } from '../../engine/tagAwareStreamParser';

// 辅助纯函数：识别正文与括号心理/动作描写，分层赋予淡雅灰字阶
function parseThoughtSegments(raw: string) {
  if (!raw) return [];
  const parts = raw.split(/([（\(][^）\)]+[）\)])/g);
  return parts.filter(Boolean).map((part, index) => {
    const isThought = /^([（\(].+[）\)])$/.test(part);
    return { id: index, text: part, isThought };
  });
}

/**
 * 微信经典原生文字气泡渲染器 (Authentic WeChat Text Bubble)
 */
export const TextBubbleRenderer = React.memo(function TextBubbleRenderer({
  message,
  companionAvatarUri,
  companionName = '角色',
  userAvatarUri,
  onLongPressMessage,
  onPressMessage,
  onRetryMessage,
  onNudge,
  onNudgeSelf,
  onOpenSandbox,
  onOpenDocument,
  space = 'normal',
  isLatestMessage = false,
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
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
      triggerShake();
      if (isUser) {
        onNudgeSelf?.();
      } else {
        onNudge?.();
      }
      lastAvatarTapRef.current = 0;
    } else {
      lastAvatarTapRef.current = now;
    }
  };

  const normalizedContent = (message.content || '')
    .replace(/\[BR\]/g, '\n')
    .replace(/\[br\s*\/?\]|<\/?br\s*\/?>/gi, '\n');
  const formattedContent = (!isUser ? stripMetaTags(normalizedContent) : normalizedContent).trim();

  // 1. 尝试探测是否包含独立可运行的 HTML / SVG 制品
  const artifactSegments = React.useMemo(() => {
    return parseStreamingArtifactSegments(formattedContent, false);
  }, [formattedContent]);

  const hasArtifact = artifactSegments.hasArtifact && Boolean(artifactSegments.artifact);
  const artifact = artifactSegments.artifact;
  const preText = (artifactSegments.preText || '').trim();
  const postText = (artifactSegments.postText || '').trim();

  // 惰性嗅探微型代码块 (仅在未命中沙箱制品时才需要计算，降低 GC 压力)
  const sandboxTarget = React.useMemo(() => {
    if (hasArtifact) return null;
    return extractSandboxExecutableCode(message.content || '');
  }, [hasArtifact, message.content]);

  const preTextSegments = React.useMemo(() => parseThoughtSegments(preText), [preText]);
  const postTextSegments = React.useMemo(() => parseThoughtSegments(postText), [postText]);
  const contentSegments = React.useMemo(() => parseThoughtSegments(formattedContent), [formattedContent]);

  const handleLongPress = (event: any) => {
    if (onLongPressMessage) {
      const { pageX, pageY } = event.nativeEvent;
      onLongPressMessage(message, pageX, pageY);
    }
  };

  const docMeta = message.metadata?.document || message.metadata?.docInfo;

  const handlePress = () => {
    if (docMeta && onOpenDocument) {
      onOpenDocument({
        uri: docMeta.uri || docMeta.documentUri,
        title: docMeta.title || docMeta.name,
        content: docMeta.content || message.content,
      });
      return;
    }
    const docMatch = (message.content || '').match(/\[(文档|DOC):\s*([^\]]+)\]/i);
    if (docMatch && onOpenDocument) {
      onOpenDocument({
        uri: docMatch[2].trim(),
        title: docMatch[2].trim(),
        content: message.content,
      });
      return;
    }
    onPressMessage?.(message);
  };

  return (
    <View style={[styles.rowWrap, { flexDirection: isUser ? 'row-reverse' : 'row', marginHorizontal: 12 }]}>
      {/* 头像区 */}
      <View style={[styles.avatarContainer, { width: theme.metrics.avatarSize, height: theme.metrics.avatarSize, borderRadius: theme.radii.avatarRadius }]}>
        {isUser ? (
          <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
              {userAvatarUri ? (
                <SecureImage space={space} style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={userAvatarUri} />
              ) : (
                <View style={[styles.userDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                  <Text style={styles.userDefaultAvatarText}>我</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
              {companionAvatarUri ? (
                <SecureImage space={space} style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={companionAvatarUri} />
              ) : (
                <View style={[styles.companionDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                  <Text style={styles.companionDefaultAvatarText}>{companionName.slice(0, 1)}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* 气泡与工件包裹区 */}
      <View
        style={[
          styles.bubbleWrap,
          {
            maxWidth: hasArtifact ? 292 : theme.metrics.bubbleMaxWidthPercent,
            marginLeft: isUser ? 0 : theme.metrics.avatarToBubbleGap,
            marginRight: isUser ? theme.metrics.avatarToBubbleGap : 0,
          },
        ]}
      >
        {hasArtifact && artifact ? (
          <View style={styles.artifactBubbleColumn}>
            {/* 1. 前置引导语文本气泡（若有） */}
            {preText ? (
              <View style={[styles.segmentedBubbleWrap, { alignSelf: isUser ? 'flex-end' : 'flex-start' }]}>
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
                    {preTextSegments.map((segment) =>
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
            ) : null}

            {/* 2. 核心工件：沙箱取景框 / 优雅小白卡 (彻底阻断源码刷屏！) */}
            <Pressable
              delayLongPress={260}
              onLongPress={handleLongPress}
              style={[
                styles.sandboxCardWrap,
                { alignSelf: isUser ? 'flex-end' : 'flex-start' },
                preText ? styles.sandboxCardWithGap : null,
              ]}
            >
              {!preText ? <ImBubbleBeak customColor="#FFFFFF" direction={isUser ? 'right' : 'left'} /> : null}
              {isLatestMessage ? (
                <AiSandboxArtifactViewfinder
                  code={artifact.code}
                  id={`im-vf-${message.id}`}
                  language={artifact.language}
                  lineCount={artifact.lineCount}
                  messageId={message.id}
                  onOpenSandbox={onOpenSandbox}
                  title={artifact.title}
                />
              ) : (
                <AiSandboxArtifactCard
                  code={artifact.code}
                  id={`im-card-${message.id}`}
                  language={artifact.language}
                  lineCount={artifact.lineCount}
                  messageId={message.id}
                  onOpenSandbox={onOpenSandbox}
                  title={artifact.title}
                />
              )}
            </Pressable>

            {/* 3. 后置交待语文本气泡（若有） */}
            {postText ? (
              <View style={[styles.segmentedBubbleWrap, { alignSelf: isUser ? 'flex-end' : 'flex-start', marginTop: 6 }]}>
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
                    {postTextSegments.map((segment) =>
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
            ) : null}
          </View>
        ) : (
          <>
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
          </>
        )}
      </View>

      {/* 兜底微型沙箱运行按钮 (仅在未渲染沙箱大卡片但存在代码时保留) */}
      {!hasArtifact && sandboxTarget ? (
        <Pressable
          accessibilityLabel="运行 HTML / SVG 沙箱"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onOpenSandbox?.(sandboxTarget)}
          style={({ pressed }) => [
            styles.sandboxRunBtn,
            pressed && styles.sandboxRunBtnPressed,
            {
              alignSelf: 'flex-end',
              marginBottom: 4,
              marginLeft: isUser ? 0 : 8,
              marginRight: isUser ? 8 : 0,
            },
          ]}
        >
          <Ionicons
            color="#8E8E93"
            name="play"
            size={11}
            style={styles.playIconMargin}
          />
        </Pressable>
      ) : null}

      {/* 失败重发入口 */}
      {message.status === 'failed' && (
        <Pressable
          hitSlop={8}
          onPress={() => onRetryMessage?.(message)}
          style={{ justifyContent: 'center', alignSelf: 'center', marginHorizontal: 6 }}
        >
          <Ionicons color="#EF4444" name="alert-circle" size={20} />
        </Pressable>
      )}
    </View>
  );
});

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
  artifactBubbleColumn: {
    width: '100%',
  },
  segmentedBubbleWrap: {
    position: 'relative',
    justifyContent: 'flex-start',
  },
  sandboxCardWrap: {
    width: 292,
    maxWidth: '100%',
    position: 'relative',
  },
  sandboxCardWithGap: {
    marginTop: 4,
  },
  sandboxRunBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sandboxRunBtnPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    transform: [{ scale: 0.94 }],
  },
  playIconMargin: {
    marginLeft: 1.5,
  },
});
