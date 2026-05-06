import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../design/tokens';

const BRAND_IMAGE = require('../../assets/splash-icon.png');
const DOT_COUNT = 7;
const DOTS = Array.from({ length: DOT_COUNT }, (_, index) => index);

interface LoadingTransitionProps {
  title: string;
  description?: string;
}

export function LoadingTransition({ title, description }: LoadingTransitionProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        duration: 1280,
        easing: Easing.inOut(Easing.cubic),
        toValue: 1,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={styles.wrap}>
      <Image accessibilityIgnoresInvertColors source={BRAND_IMAGE} style={styles.brandImage} />
      <View accessibilityLabel="加载中" accessibilityRole="progressbar" style={styles.progressDots}>
        {DOTS.map((index) => {
          const center = index / (DOT_COUNT - 1);
          const inputRange =
            index === 0
              ? [0, 0.16, 1]
              : index === DOT_COUNT - 1
                ? [0, 0.84, 1]
                : [0, Math.max(0, center - 0.18), center, Math.min(1, center + 0.18), 1];
          const outputRange =
            index === 0
              ? [1, 0.36, 0.56]
              : index === DOT_COUNT - 1
                ? [0.56, 0.36, 1]
                : [0.36, 0.36, 1, 0.36, 0.36];

          return (
            <Animated.View
              key={index}
              style={[
                styles.progressDot,
                {
                  backgroundColor: progress.interpolate({
                    inputRange,
                    outputRange: outputRange.map((value) => (value > 0.8 ? '#8FA178' : '#E5E3DF')),
                  }),
                  opacity: progress.interpolate({ inputRange, outputRange }),
                  transform: [
                    {
                      scaleY: progress.interpolate({
                        inputRange,
                        outputRange: outputRange.map((value) => 0.82 + value * 0.24),
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
  },
  brandImage: {
    height: 168,
    marginBottom: -4,
    resizeMode: 'contain',
    width: 168,
  },
  progressDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: 20,
    justifyContent: 'center',
    marginBottom: 2,
  },
  progressDot: {
    borderRadius: 999,
    height: 14,
    width: 8,
  },
  title: {
    ...typography.textStyles.emptyTitle,
    textAlign: 'center',
  },
  description: {
    ...typography.textStyles.emptyDescription,
    textAlign: 'center',
  },
});
