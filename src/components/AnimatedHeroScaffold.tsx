import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { AppScreen } from './AppScreen';
import { colors, spacing } from '../design/tokens';
import type { PageBackgroundVariant } from '../design/backgrounds';

interface AnimatedHeroScaffoldProps {
  children: ReactNode;
  heroContent?: ReactNode;
  stickyContent?: ReactNode;
  backgroundVariant?: PageBackgroundVariant;
  backgroundDimmed?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  heroScaleRange?: [number, number];
  stickyFadeRange?: [number, number];
  footer?: ReactNode;
}

export function AnimatedHeroScaffold({
  children,
  heroContent,
  stickyContent,
  backgroundVariant,
  backgroundDimmed,
  contentContainerStyle,
  heroScaleRange = [32, 96],
  stickyFadeRange = [60, 100],
  footer,
}: AnimatedHeroScaffoldProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
    },
  });

  const heroStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, heroScaleRange, [1, 0], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(scrollY.value, heroScaleRange, [1, 0.95], Extrapolation.CLAMP) },
        { translateY: interpolate(scrollY.value, heroScaleRange, [0, -10], Extrapolation.CLAMP) },
      ],
    };
  });

  const stickyStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, stickyFadeRange, [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(scrollY.value, stickyFadeRange, [10, 0], Extrapolation.CLAMP) },
      ],
    };
  });

  const stickyBgStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [10, 30], [0, 1], Extrapolation.CLAMP),
    };
  });

  return (
    <View style={styles.container}>
      <AppScreen
        backgroundDimmed={backgroundDimmed}
        backgroundVariant={backgroundVariant}
        footer={footer}
        scrollable={false}
        contentStyle={{ padding: 0, gap: 0, flex: 1 }}
      >
        <Animated.ScrollView
          bounces={true}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + spacing[4], paddingBottom: insets.bottom + spacing[12] },
            contentContainerStyle,
          ]}
        >
          <Animated.View style={[styles.heroArea, heroStyle]}>
            {heroContent}
          </Animated.View>
          {children}
        </Animated.ScrollView>
      </AppScreen>

      <View style={[styles.stickyBar, { paddingTop: insets.top, height: insets.top + 48 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, stickyBgStyle]} pointerEvents="none">
          <BlurView intensity={80} style={StyleSheet.absoluteFill} tint="light" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background.page, opacity: 0.85 }]} />
        </Animated.View>

        <Animated.View style={[styles.stickyBarContent, stickyStyle]} pointerEvents="box-none">
          {stickyContent}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroArea: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    zIndex: 1,
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
  },
  stickyBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
});
