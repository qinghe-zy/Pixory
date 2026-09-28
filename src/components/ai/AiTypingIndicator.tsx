import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { radius, rhythm, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export function AiTypingIndicator() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { duration: 420, toValue: 1, useNativeDriver: true }),
        Animated.timing(progress, { duration: 420, toValue: 0, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View accessibilityLabel="AI 正在准备回复" style={styles.wrap}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: index === 1 ? [0.35, 1, 0.35] : index === 2 ? [0.25, 0.45, 1] : [1, 0.45, 0.25],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  typingDot: {
    backgroundColor: aiLightColors.primaryActive,
    borderRadius: radius.pill,
    height: 5,
    width: 5,
  },
});
