import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiScrollToLatestButtonProps {
  bottomOffset: number;
  visible: boolean;
  onPress: () => void;
}

export function AiScrollToLatestButton({ bottomOffset, visible, onPress }: AiScrollToLatestButtonProps) {
  if (!visible) {
    return null;
  }
  return (
    <Pressable accessibilityLabel="回到最新" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, { bottom: bottomOffset }, pressed && styles.pressed]}>
      <Ionicons color={aiLightColors.onDark} name="arrow-down" size={14} />
      <Text style={styles.text}>回到最新</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 32,
    paddingHorizontal: spacing[3],
    position: 'absolute',
    zIndex: 5,
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
