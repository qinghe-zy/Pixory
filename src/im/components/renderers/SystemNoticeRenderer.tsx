import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';

/**
 * 微信经典居中灰色系统提示胶囊 (Authentic WeChat System Notice)
 *
 * 用于显示：
 * - 聊天时间戳 (如 "上午 10:45")
 * - 状态提示 (如 "你撤回了一条消息", "聊天记录已清空")
 * - 连接失败等提示时提供一键重试动作
 */
export function SystemNoticeRenderer({ message, onRetryMessage }: BubbleRendererProps) {
  const theme = useImTheme();
  const isErrorNotice = Boolean(
    message.content?.includes('未收到回复') ||
    message.content?.includes('连接暂时不稳定') ||
    message.content?.includes('生成中断') ||
    message.content?.includes('网络异常') ||
    message.content?.includes('重试')
  );

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.systemNoticeBackground,
            borderRadius: theme.radii.systemNoticeRadius,
          },
        ]}
      >
        <Text
          style={[
            styles.noticeText,
            {
              color: theme.colors.systemNoticeText,
              fontSize: theme.typography.systemNoticeFontSize,
            },
          ]}
        >
          {message.content}
        </Text>
        {isErrorNotice && onRetryMessage && (
          <Pressable
            accessibilityLabel="重试接收回复"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onRetryMessage(message)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Ionicons color="#5B9CF6" name="refresh-outline" size={13} style={{ marginRight: 2 }} />
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '88%',
  },
  noticeText: {
    fontWeight: '400',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  retryText: {
    fontSize: 12,
    color: '#5B9CF6',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
