import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { SecureImage } from '../../../components/SecureImage';

/**
 * 微信级原生图片消息渲染器 (Authentic WeChat Image Bubble)
 */
export function ImageBubbleRenderer({
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
  const imageUri = message.imageUri;
  const lastAvatarTapRef = React.useRef(0);

  const handleAvatarPress = () => {
    if (isUser) return;
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
      onNudge?.();
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
    <View style={[styles.rowWrap, { flexDirection: isUser ? 'row-reverse' : 'row', marginHorizontal: 12 }]}>
      {/* 头像 */}
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
          <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
            {companionAvatarUri ? (
              <SecureImage space="normal" style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={companionAvatarUri} />
            ) : (
              <View style={[styles.companionDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                <Text style={styles.companionDefaultAvatarText}>{companionName.slice(0, 1)}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* 图片实体包裹区 */}
      <View style={[styles.imageWrap, { marginLeft: isUser ? 0 : theme.metrics.avatarToBubbleGap, marginRight: isUser ? theme.metrics.avatarToBubbleGap : 0 }]}>
        <Pressable
          delayLongPress={260}
          onLongPress={handleLongPress}
          onPress={() => onPressMessage?.(message)}
          style={({ pressed }) => [styles.imageCard, { borderRadius: theme.radii.bubbleRadius }, pressed && styles.pressed]}
        >
          {imageUri ? (
            <SecureImage space="normal" style={[styles.contentImage, { borderRadius: theme.radii.bubbleRadius }]} uri={imageUri} />
          ) : (
            <View style={styles.fallbackBox}>
              <Text style={styles.fallbackText}>[图片已失效]</Text>
            </View>
          )}

          {Boolean(message.boundIpName) && (
            <View style={styles.ipBadge}>
              <Text numberOfLines={1} style={styles.ipBadgeText}>
                {message.boundIpName}
              </Text>
            </View>
          )}
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
  imageWrap: { position: 'relative', overflow: 'hidden' },
  imageCard: {
    width: 175,
    height: 175,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  contentImage: { width: '100%', height: '100%' },
  pressed: { opacity: 0.88 },
  fallbackBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB' },
  fallbackText: { color: '#9CA3AF', fontSize: 12 },
  ipBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ipBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
});
