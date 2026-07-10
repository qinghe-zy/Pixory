import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { metrics, radius, shadows } from '../../design/tokens';
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
      <View style={styles.mask}>
        <BlurView intensity={42} tint="light" style={styles.surface}>
          <Ionicons color={aiLightColors.primaryActive} name="arrow-down" size={26} />
        </BlurView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    ...shadows.xs,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(248, 248, 250, 0.68)',
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    position: 'absolute',
    width: metrics.iconButtonSize,
    zIndex: 5,
  },
  mask: {
    borderColor: 'rgba(28, 28, 30, 0.14)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  surface: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 248, 250, 0.58)',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
});
