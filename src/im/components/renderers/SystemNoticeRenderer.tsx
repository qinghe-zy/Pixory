import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';

/**
 * 微信经典居中灰色系统提示胶囊 (Authentic WeChat System Notice)
 *
 * 用于显示：
 * - 聊天时间戳 (如 "上午 10:45")
 * - 状态提示 (如 "你撤回了一条消息", "聊天记录已清空")
 * - 尺寸、边距与颜色完全由 ImThemeTokens 驱动。
 */
export function SystemNoticeRenderer({ message }: BubbleRendererProps) {
  const theme = useImTheme();

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
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  noticeText: {
    fontWeight: '400',
  },
});
