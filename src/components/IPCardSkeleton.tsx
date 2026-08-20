import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors, componentTokens, radius, shadows, spacing } from '../design/tokens';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function IPCardSkeleton() {
  const shimmerProgress = useRef(new Animated.Value(0)).current;
  const [cardWidth, setCardWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    shimmerProgress.stopAnimation();
    shimmerProgress.setValue(0);
    if (reduceMotion || cardWidth <= 0) {
      return;
    }

    const animation = Animated.loop(
      Animated.timing(shimmerProgress, {
        duration: componentTokens.ipCard.shimmerDurationMs,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [cardWidth, reduceMotion, shimmerProgress]);

  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth, cardWidth],
  });

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setCardWidth((current) => (current === nextWidth ? current : nextWidth));
  }

  return (
    <View accessibilityLabel="正在加载 IP 卡片" accessibilityRole="progressbar" style={styles.shadowContainer}>
      <View onLayout={handleLayout} style={styles.card}>
        <View style={styles.captionBlock}>
          <View style={styles.titleBlock} />
          <View style={styles.metaBlock} />
        </View>
        {!reduceMotion ? (
          <AnimatedLinearGradient
            colors={['rgba(255, 253, 248, 0)', colors.overlay.softSurface, 'rgba(255, 253, 248, 0)']}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            start={{ x: 0, y: 0.5 }}
            style={[styles.shimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowContainer: {
    ...shadows.hero,
    width: '100%',
  },
  card: {
    aspectRatio: componentTokens.ipCard.aspectRatio,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: componentTokens.ipCard.radius,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: componentTokens.ipCard.contentPadding,
    width: '100%',
  },
  captionBlock: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    gap: spacing[2],
    width: componentTokens.ipCard.captionWidth,
  },
  titleBlock: {
    backgroundColor: colors.primary.light,
    borderRadius: radius.pill,
    height: spacing[4],
    width: '58%',
  },
  metaBlock: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: spacing[2],
    width: '82%',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: '42%',
  },
});
