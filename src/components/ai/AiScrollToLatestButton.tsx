import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { metrics, radius, shadows } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiScrollToLatestButtonProps {
  bottomOffset: number;
  visible: boolean;
  onPress: () => void;
}

export function AiScrollToLatestButton({ bottomOffset, visible, onPress }: AiScrollToLatestButtonProps) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 150,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
    return () => {
      animation.stop();
    };
  }, [opacity, visible]);

  if (!mounted) {
    return null;
  }
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.fadeWrap, { bottom: bottomOffset, opacity }]}>
      <Pressable accessibilityLabel="回到最新" accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <View style={styles.mask}>
          <BlurView intensity={42} tint="light" style={styles.surface}>
            <Ionicons color={aiLightColors.primaryActive} name="arrow-down" size={26} />
          </BlurView>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fadeWrap: {
    alignSelf: 'center',
    position: 'absolute',
    zIndex: 5,
  },
  button: {
    ...shadows.xs,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(248, 248, 250, 0.84)',
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
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
    backgroundColor: 'rgba(248, 248, 250, 0.82)',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  pressed: {
    opacity: 0.78,
  },
});
