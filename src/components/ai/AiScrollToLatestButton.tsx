import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiScrollToLatestButtonProps {
  visible: boolean;
  onPress: () => void;
}

export function AiScrollToLatestButton({ visible, onPress }: AiScrollToLatestButtonProps) {
  if (!visible) {
    return null;
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons color={aiLightColors.onDark} name="arrow-down" size={14} />
      <Text style={styles.text}>回到最新</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 32,
    paddingHorizontal: spacing[3],
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
