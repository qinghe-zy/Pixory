import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export interface StrictPagerProps {
  children: React.ReactNode[];
  activeIndex: number;
  onChange: (index: number) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const springConfig = {
  damping: 25,
  stiffness: 250,
  mass: 0.8,
  restDisplacementThreshold: 0.1,
  restSpeedThreshold: 0.5,
};

export function StrictPager({ children, activeIndex, onChange }: StrictPagerProps) {
  const translateX = useSharedValue(-activeIndex * SCREEN_WIDTH);
  const context = useSharedValue({ startX: 0 });
  const maxIndex = children.length - 1;

  // React to external activeIndex changes
  useEffect(() => {
    translateX.value = withSpring(-activeIndex * SCREEN_WIDTH, springConfig);
  }, [activeIndex, translateX]);

  const setExternalIndex = (index: number) => {
    if (index !== activeIndex) {
      onChange(index);
    }
  };

  const panGesture = Gesture.Pan()
    // STRICT DIRECTIONAL LOCK: 
    // Must move 25px horizontally to activate.
    // If it moves 10px vertically before reaching 25px horizontally, the gesture fails, handing control back to scroll view.
    .activeOffsetX([-25, 25])
    .failOffsetY([-10, 10])
    .onStart(() => {
      context.value = { startX: translateX.value };
    })
    .onUpdate((event) => {
      let newX = context.value.startX + event.translationX;
      // Soft limits on edges (rubber band effect)
      if (newX > 0) {
        newX = newX * 0.3;
      } else if (newX < -maxIndex * SCREEN_WIDTH) {
        const overscroll = newX + maxIndex * SCREEN_WIDTH;
        newX = -maxIndex * SCREEN_WIDTH + overscroll * 0.3;
      }
      translateX.value = newX;
    })
    .onEnd((event) => {
      const snapPoints = children.map((_, i) => -i * SCREEN_WIDTH);
      const velocityX = event.velocityX;
      const currentX = translateX.value;

      // Determine target snap point based on current position and velocity
      let targetIndex = Math.round(-currentX / SCREEN_WIDTH);
      
      // If swiping fast enough, snap to next/prev
      if (Math.abs(velocityX) > 500) {
        if (velocityX < 0 && targetIndex < maxIndex) {
          targetIndex = Math.floor(-currentX / SCREEN_WIDTH) + 1;
        } else if (velocityX > 0 && targetIndex > 0) {
          targetIndex = Math.ceil(-currentX / SCREEN_WIDTH) - 1;
        }
      }

      // Clamp targetIndex
      targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));

      const targetX = -targetIndex * SCREEN_WIDTH;
      translateX.value = withSpring(targetX, springConfig);

      runOnJS(setExternalIndex)(targetIndex);
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.wrapper}>
        <Animated.View style={[styles.container, animatedStyle, { width: SCREEN_WIDTH * children.length }]}>
          {children.map((child, index) => (
            <View key={index} style={styles.page}>
              {child}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: SCREEN_WIDTH,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
