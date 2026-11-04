/**
 * 微信级大动态表情贴纸渲染器 (Authentic WeChat Animated Sticker Bubble)
 *
 * 核心设计：
 * 1. 独立解耦，可用于伴聊（IM）或长聊（AI Chat）等任意消息列表；
 * 2. 摒弃常规文字气泡的灰色/绿色底框与箭头尖角，采用纯净透明底；
 * 3. 尺寸与发送图片大小一致（约 140dp × 140dp）；
 * 4. 采用 expo-image 硬件加速渲染，支持 60 帧平滑循环动效；
 * 5. 挂接头像轻敲双击拍一拍与长按弹出操作菜单。
 */

import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SecureImage } from '../SecureImage';

export interface StickerBubbleProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    imageUri?: string | null;
    status?: string;
  };
  companionAvatarUri?: string | null;
  companionName?: string;
  userAvatarUri?: string | null;
  onLongPressMessage?: (message: any, pageX: number, pageY: number) => void;
  onPressMessage?: (message: any) => void;
  onRetryMessage?: (message: any) => void;
  onNudge?: () => void;
  onNudgeSelf?: () => void;
  space?: 'normal' | 'personal';
}

export const StickerBubbleRenderer = React.memo(function StickerBubbleRenderer({
  message,
  companionAvatarUri,
  companionName = '角色',
  userAvatarUri,
  onLongPressMessage,
  onPressMessage,
  onRetryMessage,
  onNudge,
  onNudgeSelf,
  space = 'normal',
}: StickerBubbleProps) {
  const isUser = message.role === 'user';
  const stickerUri = message.imageUri;
  const lastAvatarTapRef = useRef(0);

  const handleAvatarPress = () => {
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
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

  const handleLongPress = (event: any) => {
    if (onLongPressMessage) {
      const { pageX, pageY } = event.nativeEvent;
      onLongPressMessage(message, pageX, pageY);
    }
  };

  return (
    <View style={[styles.rowWrap, { flexDirection: isUser ? 'row-reverse' : 'row' }]}>
      {/* 头像 */}
      <View style={styles.avatarContainer}>
        {isUser ? (
          <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
            {userAvatarUri ? (
              <SecureImage space={space} style={styles.avatarImage} uri={userAvatarUri} />
            ) : (
              <View style={styles.userDefaultAvatar}>
                <Text style={styles.userDefaultAvatarText}>我</Text>
              </View>
            )}
          </Pressable>
        ) : (
          <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
            {companionAvatarUri ? (
              <SecureImage space={space} style={styles.avatarImage} uri={companionAvatarUri} />
            ) : (
              <View style={styles.companionDefaultAvatar}>
                <Text style={styles.companionDefaultAvatarText}>{companionName.slice(0, 1)}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* 纯净透明大动态贴纸主体 */}
      <View style={[styles.stickerWrap, { marginLeft: isUser ? 0 : 8, marginRight: isUser ? 8 : 0 }]}>
        <Pressable
          delayLongPress={260}
          onLongPress={handleLongPress}
          onPress={() => onPressMessage?.(message)}
          style={({ pressed }) => [styles.stickerCard, pressed && styles.pressed]}
        >
          {stickerUri ? (
            <Image
              autoplay
              cachePolicy="memory-disk"
              contentFit="contain"
              recyclingKey={stickerUri}
              source={{ uri: stickerUri }}
              style={styles.stickerImage}
            />
          ) : (
            <View style={styles.fallbackBox}>
              <Text style={styles.fallbackText}>{message.content || '[表情]'}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* 失败重发入口 */}
      {message.status === 'failed' && (
        <Pressable
          hitSlop={8}
          onPress={() => onRetryMessage?.(message)}
          style={styles.retryButton}
        >
          <Ionicons color="#EF4444" name="alert-circle" size={20} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  rowWrap: {
    alignItems: 'flex-start',
    marginHorizontal: 12,
    marginVertical: 6,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 6,
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
    backgroundColor: '#4B6B94',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDefaultAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  companionDefaultAvatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#006948',
    justifyContent: 'center',
    alignItems: 'center',
  },
  companionDefaultAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  stickerWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  stickerCard: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: 135,
    height: 135,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  fallbackBox: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  fallbackText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },
  retryButton: {
    justifyContent: 'center',
    alignSelf: 'center',
    marginHorizontal: 6,
  },
});
