import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { ImBubbleBeak } from '../common/ImBubbleBeak';
import { SecureImage } from '../../../components/SecureImage';
import { voiceService } from '../../../voice/voiceService';
import { runWithDatabaseSpace } from '../../../database';
import { radius } from '../../../design/tokens';

/**
 * 微信经典 3 弧阶梯声波图标
 * - 伴侣 (左侧): 声波弧面朝右
 * - 用户 (右侧): 声波弧面朝左
 * - 播放态: 1 -> 2 -> 3 弧循环跳动递增动画
 */
function WeChatSoundWave({
  isUser,
  isPlaying,
  color,
  size = 20,
}: {
  isUser: boolean;
  isPlaying: boolean;
  color: string;
  size?: number;
}) {
  const [animStep, setAnimStep] = useState(2); // 0: 1 弧, 1: 2 弧, 2: 3 弧 (全亮)

  useEffect(() => {
    if (!isPlaying) {
      setAnimStep(2);
      return;
    }
    const timer = setInterval(() => {
      setAnimStep((prev) => (prev + 1) % 3);
    }, 320);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const arc1Visible = true;
  const arc2Visible = !isPlaying || animStep >= 1;
  const arc3Visible = !isPlaying || animStep >= 2;

  if (isUser) {
    // 弧面朝左 (用户发出)
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* 点/第一弧 */}
        {arc1Visible && (
          <Path
            d="M17 10a2.5 2.5 0 0 0 0 4"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}
        {/* 第二弧 */}
        {arc2Visible && (
          <Path
            d="M13.5 7a6.5 6.5 0 0 0 0 10"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}
        {/* 第三弧 */}
        {arc3Visible && (
          <Path
            d="M10 4a10.5 10.5 0 0 0 0 16"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )}
      </Svg>
    );
  }

  // 弧面朝右 (伴侣发出)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* 点/第一弧 */}
      {arc1Visible && (
        <Path
          d="M7 10a2.5 2.5 0 0 1 0 4"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {/* 第二弧 */}
      {arc2Visible && (
        <Path
          d="M10.5 7a6.5 6.5 0 0 1 0 10"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
      {/* 第三弧 */}
      {arc3Visible && (
        <Path
          d="M14 4a10.5 10.5 0 0 1 0 16"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

/**
 * 微信原生拟真语音条渲染器 (Authentic WeChat Voice Bubble)
 *
 * 1. 100% 复刻微信物理尺寸公式：
 *    1s 为 72dp，60s 对数伸缩至 232dp
 * 2. 气泡颜色与圆角完全跟随用户个性化主题设置
 * 3. 伴侣消息外挂未读红点（点击即消）
 * 4. 支持手风琴下挂转文字面板（风格与正常气泡一致）
 */
export const VoiceBubbleRenderer = React.memo(function VoiceBubbleRenderer({
  message,
  companionAvatarUri,
  companionName = '角色',
  userAvatarUri,
  onLongPressMessage,
  onPressMessage,
  onNudge,
  onNudgeSelf,
  space = 'normal',
}: BubbleRendererProps) {
  const theme = useImTheme();
  const isUser = message.role === 'user';
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lastAvatarTapRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(() =>
    voiceService.isPlaying(message.id)
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasBeenPlayed, setHasBeenPlayed] = useState<boolean>(
    Boolean(message.voice?.isPlayed)
  );
  const [showTranscript, setShowTranscript] = useState<boolean>(() =>
    Boolean(message.metadata?.isTranscriptExpanded)
  );

  useEffect(() => {
    if (message.metadata?.isTranscriptExpanded !== undefined) {
      setShowTranscript(Boolean(message.metadata.isTranscriptExpanded));
    }
  }, [message.metadata?.isTranscriptExpanded]);

  // 监听全局音频播放状态，联动当前气泡动画
  useEffect(() => {
    const unsub = voiceService.subscribe((state) => {
      setIsPlaying(state.isPlaying && state.activeId === message.id);
    });
    return unsub;
  }, [message.id]);

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

  // 计算秒数 (1s ~ 60s)
  const durationSec = useMemo(() => {
    if (message.voice?.durationMs && message.voice.durationMs > 0) {
      return Math.max(1, Math.min(60, Math.round(message.voice.durationMs / 1000)));
    }
    // 若未预设时长，根据文本字数预估（中文常速 1 字 ~240ms）
    const len = (message.voice?.transcription || message.content || '').length;
    return Math.max(1, Math.min(60, Math.round((len * 240) / 1000)));
  }, [message.voice?.durationMs, message.voice?.transcription, message.content]);

  // 微信 100% 对数宽度增长曲线：Base 82dp，Max 232dp (内部从容容纳波浪与秒数)
  const bubbleWidth = useMemo(() => {
    const minWidth = 82;
    const maxWidth = 232;
    if (durationSec <= 1) return minWidth;
    if (durationSec >= 60) return maxWidth;
    const logRatio = Math.log(durationSec) / Math.log(60);
    return Math.round(minWidth + logRatio * (maxWidth - minWidth));
  }, [durationSec]);

  const textToRead =
    message.voice?.transcription ||
    message.content.replace(/^\[VOICE:\s*([^\]]+)\]/i, '$1').trim();

  // 点击语音气泡：播放 / 暂停切换
  const handleBubblePress = useCallback(async () => {
    if (isPlaying) {
      await voiceService.stop();
      return;
    }

    setHasBeenPlayed(true);
    setIsLoading(true);

    try {
      const audioUri = message.voice?.audioUri?.trim();
      // 若该消息自带真实物理录音文件（如用户录制的语音条），直接使用播放器播放真实音频
      if (audioUri && !audioUri.includes('mock')) {
        await voiceService.playAudio(audioUri, message.id);
        setIsLoading(false);
        return;
      }

      // 否则针对伴侣文字或无物理音频的消息进行 TTS 语音合成朗读
      if (textToRead) {
        await runWithDatabaseSpace(space, async (db) => {
          await voiceService.speak(
            textToRead,
            {
              db,
              space,
              scopeType: 'thread_im',
              threadId: message.threadId,
            },
            message.id
          );
        });
      }
    } catch (err: any) {
      if (Platform.OS === 'android') {
        const msg = err instanceof Error ? err.message : '语音播放失败';
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, space, textToRead, message.threadId, message.id]);

  const handleLongPress = (event: any) => {
    if (onLongPressMessage) {
      const { pageX, pageY } = event.nativeEvent;
      onLongPressMessage(message, pageX, pageY);
    } else {
      setShowTranscript((prev) => !prev);
    }
  };

  const bubbleColor = isUser
    ? theme.colors.bubbleRightBackground
    : theme.colors.bubbleLeftBackground;
  const bubbleTextColor = isUser
    ? theme.colors.bubbleRightText
    : theme.colors.bubbleLeftText;
  const borderColor = isUser
    ? theme.colors.bubbleRightBorder
    : theme.colors.bubbleLeftBorder;

  return (
    <View
      style={[
        styles.rowWrap,
        {
          flexDirection: isUser ? 'row-reverse' : 'row',
          marginHorizontal: 12,
        },
      ]}
    >
      {/* 1. 头像区 */}
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
        <Animated.View
          style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}
        >
          <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
            {(isUser ? userAvatarUri : companionAvatarUri) ? (
              <SecureImage
                space={space}
                style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]}
                uri={(isUser ? userAvatarUri : companionAvatarUri)!}
              />
            ) : (
              <View
                style={[
                  isUser ? styles.userDefaultAvatar : styles.companionDefaultAvatar,
                  { borderRadius: theme.radii.avatarRadius },
                ]}
              >
                <Text
                  style={
                    isUser
                      ? styles.userDefaultAvatarText
                      : styles.companionDefaultAvatarText
                  }
                >
                  {isUser ? '我' : companionName.slice(0, 1)}
                </Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>

      {/* 2. 语音气泡包裹区 */}
      <View
        style={[
          styles.bubbleOuterWrap,
          {
            marginLeft: isUser ? 0 : theme.metrics.avatarToBubbleGap,
            marginRight: isUser ? theme.metrics.avatarToBubbleGap : 0,
            alignItems: isUser ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <View style={styles.bubbleWithDotRow}>
          <View style={styles.beakWrapper}>
            <ImBubbleBeak direction={isUser ? 'right' : 'left'} />
            <Pressable
              accessibilityLabel={
                isUser
                  ? `语音消息，时长 ${durationSec} 秒`
                  : `${companionName} 发送的语音消息，时长 ${durationSec} 秒`
              }
              accessibilityRole="button"
              delayLongPress={260}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              onLongPress={handleLongPress}
              onPress={handleBubblePress}
              style={({ pressed }) => [
                styles.voiceBubble,
                {
                  width: bubbleWidth,
                  backgroundColor: bubbleColor,
                  borderRadius: theme.radii.bubbleRadius,
                  borderColor,
                  borderWidth:
                    borderColor !== 'transparent' ? StyleSheet.hairlineWidth : 0,
                  flexDirection: 'row',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  paddingHorizontal: 12,
                },
                pressed && styles.bubblePressed,
              ]}
            >
              {isUser ? (
                /* 用户端：秒数在左，波浪在右紧靠 */
                <View style={styles.voiceBubbleContent}>
                  <Text
                    style={[
                      styles.secondsTextInside,
                      { marginRight: 6, color: bubbleTextColor },
                    ]}
                  >
                    {durationSec}&quot;
                  </Text>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={bubbleTextColor} />
                  ) : (
                    <WeChatSoundWave
                      color={bubbleTextColor}
                      isPlaying={isPlaying}
                      isUser={true}
                      size={20}
                    />
                  )}
                </View>
              ) : (
                /* 伴侣端：波浪在左，秒数在右紧靠 */
                <View style={styles.voiceBubbleContent}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={bubbleTextColor} />
                  ) : (
                    <WeChatSoundWave
                      color={bubbleTextColor}
                      isPlaying={isPlaying}
                      isUser={false}
                      size={20}
                    />
                  )}
                  <Text
                    style={[
                      styles.secondsTextInside,
                      { marginLeft: 6, color: bubbleTextColor },
                    ]}
                  >
                    {durationSec}&quot;
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* 伴侣消息外挂未读红点（点击一次即消） */}
          {!isUser && !hasBeenPlayed && (
            <View style={styles.unreadDot} />
          )}
        </View>

        {/* 4. 手风琴转文字面板（完全跟随用户气泡设置） */}
        {showTranscript ? (
          <View
            style={[
              styles.transcriptCard,
              {
                backgroundColor: isUser
                  ? theme.colors.bubbleRightBackground
                  : theme.colors.bubbleLeftBackground,
                borderRadius: theme.radii.bubbleRadius,
                borderColor,
                borderWidth:
                  borderColor !== 'transparent' ? StyleSheet.hairlineWidth : 0,
              },
            ]}
          >
            {message.metadata?.isTranscribing ? (
              <View style={styles.transcribingRow}>
                <ActivityIndicator size="small" color={bubbleTextColor} />
                <Text
                  style={[
                    styles.transcriptText,
                    {
                      color: bubbleTextColor,
                      marginLeft: 8,
                      opacity: 0.8,
                      fontSize: theme.typography.bubbleFontSize,
                    },
                  ]}
                >
                  正在转文字...
                </Text>
              </View>
            ) : (
              <Text
                selectable
                style={[
                  styles.transcriptText,
                  {
                    color: bubbleTextColor,
                    fontSize: theme.typography.bubbleFontSize,
                    lineHeight: theme.typography.bubbleLineHeight,
                  },
                ]}
              >
                {textToRead || '未能识别到清晰语音'}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  rowWrap: {
    marginVertical: 4,
    alignItems: 'flex-start',
  },
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  avatarPressable: {
    width: '100%',
    height: '100%',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userDefaultAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDefaultAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  companionDefaultAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companionDefaultAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bubbleOuterWrap: {
    maxWidth: '75%',
  },
  bubbleWithDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  beakWrapper: {
    position: 'relative',
  },
  voiceBubble: {
    height: 42,
    alignItems: 'center',
    elevation: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
  },
  voiceBubbleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bubblePressed: {
    opacity: 0.85,
  },
  secondsTextInside: {
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0.2,
    alignSelf: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FA5151',
    marginLeft: 8,
  },
  transcriptCard: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: 240,
    elevation: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
  },
  transcribingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  transcriptText: {
    letterSpacing: 0.2,
  },
});
