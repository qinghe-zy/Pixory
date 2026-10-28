import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
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
 * 当文本超出宽度时，以匀速向左循环平移，杜绝截断与眩晕感
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

  const shouldScroll = containerWidth > 0 && textWidth > containerWidth;

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.value = 0;

    if (shouldScroll) {
      const distance = textWidth + spacing;
      const duration = (distance / Math.max(15, speed)) * 1000;

      translateX.value = withDelay(
        1200,
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
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={styles.container}
    >
      {/* 隐藏测量层：测量原始文字不折行的真实物理宽度 */}
      <View pointerEvents="none" style={styles.measureContainer}>
        <Text
          numberOfLines={1}
          onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
          style={[style, styles.noWrap]}
        >
          {text}
        </Text>
      </View>

      {/* 渲染层 */}
      {shouldScroll ? (
        <Animated.View style={[styles.marqueeRow, animatedStyle]}>
          <Text numberOfLines={1} style={[style, styles.noWrap]}>
            {text}
          </Text>
          <Text
            numberOfLines={1}
            style={[style, styles.noWrap, { marginLeft: spacing }]}
          >
            {text}
          </Text>
        </Animated.View>
      ) : (
        <Text numberOfLines={1} style={style}>
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
    width: '100%',
  },
  marqueeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  measureContainer: {
    position: 'absolute',
    opacity: 0,
    top: -9999,
    left: -9999,
  },
  noWrap: {
    flexShrink: 0,
  },
});
