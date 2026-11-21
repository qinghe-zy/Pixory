import {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

export interface UseCompactHeaderAnimationOptions {
  threshold?: [number, number];
  translateYRange?: [number, number];
}

export function useCompactHeaderAnimation(
  scrollY: SharedValue<number>,
  options: UseCompactHeaderAnimationOptions = {}
) {
  const [start, end] = options.threshold ?? [90, 110];
  const [translateYStart, translateYEnd] = options.translateYRange ?? [5, 0];

  const compactHeaderStyle = useAnimatedStyle(() => {
    'worklet';
    const isVisible = scrollY.value > start;
    const opacity = interpolate(scrollY.value, [start, end], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [start, end], [translateYStart, translateYEnd], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }],
      display: isVisible ? 'flex' : 'none',
    };
  });

  const compactAnimatedProps = useAnimatedProps(() => {
    'worklet';
    return {
      pointerEvents: scrollY.value > start ? ('box-none' as const) : ('none' as const),
    };
  });

  const heroStyle = useAnimatedStyle(() => {
    'worklet';
    const opacity = interpolate(scrollY.value, [start, end], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  return {
    compactHeaderStyle,
    compactAnimatedProps,
    heroStyle,
  };
}
