import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

export interface ImMarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  speed?: number; // 像素/秒，默认 30px/s 舒适平缓
  spacing?: number; // 循环副本间距
}

/**
 * 伴侣状态栏平滑无缝循环跑马灯 (Infinite Loop Marquee)
 * 当文本超出宽度时，以匀速向左循环平移，杜绝截断与眩晕感；
 * 遵循无障碍规范：尊重系统“减弱动态效果”(Reduce Motion)，并屏蔽隐藏测量层与循环副本的重复朗读。
 */
export function ImMarqueeText({
  text,
  style,
  speed = 30,
  spacing = 40,
}: ImMarqueeTextProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useSharedValue(0);
  const reducedMotion = typeof useReducedMotion === 'function' ? useReducedMotion() : false;

  const shouldScroll = !reducedMotion && containerWidth > 0 && textWidth > containerWidth + 1;

  useEffect(() => {
    setTextWidth(0);
  }, [text]);

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.value = 0;

    if (shouldScroll) {
      const distance = textWidth + spacing;
      const duration = (distance / Math.max(15, speed)) * 1000;

      translateX.value = withDelay(
        1000,
        withRepeat(
          withTiming(-distance, {
            duration,
            easing: Easing.linear,
          }),
          -1,
          false
        )
      );
    }

    return () => {
      cancelAnimation(translateX);
    };
  }, [shouldScroll, textWidth, containerWidth, spacing, speed, text, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      accessibilityLabel={text}
      accessible
      onLayout={(e) => {
        const measured = e.nativeEvent.layout.width;
        if (measured > 0) setContainerWidth(measured);
      }}
      style={styles.container}
    >
      {/* 隐藏测量层：给定 10000px 无约束横向画布 + numberOfLines={1}，杜绝 Android Yoga 继承父宽折行 */}
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measureContainer}
      >
        <View style={styles.measureRow}>
          <Text
            key={text}
            numberOfLines={1}
            onLayout={(e) => {
              const measured = Math.ceil(e.nativeEvent.layout.width);
              if (measured > 0) setTextWidth(measured);
            }}
            style={[style, styles.noWrap]}
          >
            {text}
          </Text>
        </View>
      </View>

      {/* 渲染层：显式赋予双倍轨道宽度与单行防截断宽度，确保平滑无缝循环平移 */}
      {shouldScroll ? (
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.marqueeRow,
            { width: textWidth * 2 + spacing + 16 },
            animatedStyle,
          ]}
        >
          <Text
            ellipsizeMode="clip"
            numberOfLines={1}
            style={[style, styles.noWrap, { width: textWidth + 2 }]}
          >
            {text}
          </Text>
          <Text
            accessible={false}
            ellipsizeMode="clip"
            numberOfLines={1}
            style={[style, styles.noWrap, { width: textWidth + 2, marginLeft: spacing }]}
          >
            {text}
          </Text>
        </Animated.View>
      ) : (
        <Text importantForAccessibility="no" numberOfLines={1} style={style}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  marqueeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  measureContainer: {
    position: 'absolute',
    opacity: 0,
    top: 0,
    left: 0,
    width: 10000,
    flexDirection: 'row',
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noWrap: {
    flexShrink: 0,
  },
});
