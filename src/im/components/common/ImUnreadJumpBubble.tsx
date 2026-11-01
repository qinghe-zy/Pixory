import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ImUnreadJumpBubbleProps {
  unreadCount: number;
  onPress: () => void;
}

/**
 * 微信风格右下角未读新消息回溯气泡 (Unread Jump Bubble)
 * 记录上次离开到现在积累的新消息数，点击平滑滚动至上次未读起点（上次最后一条消息对齐输入框正上方）
 */
export function ImUnreadJumpBubble({ unreadCount, onPress }: ImUnreadJumpBubbleProps) {
  if (unreadCount <= 0) return null;

  const countStr = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <View pointerEvents="box-none" style={styles.floatingContainer}>
      <Pressable
        accessibilityLabel={`${unreadCount} 条新消息，点击回看`}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
      >
        <Ionicons color="#006948" name="arrow-up" size={13} style={styles.icon} />
        <Text style={styles.pillText}>{countStr} 条新消息</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    zIndex: 99,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  pillPressed: {
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.96 }],
  },
  icon: {
    marginRight: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1C1C1E',
  },
});
