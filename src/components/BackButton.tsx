import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../design/tokens';

interface BackButtonProps {
  onPress: () => void;
  color?: string;
  size?: number;
  compact?: boolean;
}

export function BackButton({ 
  onPress, 
  color = colors.text.title, 
  size = 26,
  compact = false 
}: BackButtonProps) {
  return (
    <Pressable
      accessibilityLabel="返回"
      accessibilityRole="button"
      hitSlop={15}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton, 
        compact && styles.compact,
        pressed && styles.iconButtonPressed
      ]}
    >
      <Ionicons color={color} name="chevron-back" size={compact ? 22 : size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: 44,
    justifyContent: 'center',
    width: 44,
    marginLeft: -8, // 抵消图标自带的物理留白，贴边对齐
  },
  compact: {
    height: 32,
    marginLeft: 0,
    width: 32,
  },
  iconButtonPressed: {
    opacity: 0.4, // iOS 原生透明度反馈
  },
});
