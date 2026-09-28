import { useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  AI_CONTEXT_HISTORY_ROUND_VALUES,
  historyRoundsToPosition,
  positionToHistoryRounds,
} from '../../ai/aiContextSettings';
import { colors, metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const THUMB_SIZE = 24;
const WORKLET_VALUES = [
  ...Array.from({ length: 17 }, (_, index) => index + 4),
  ...Array.from({ length: 8 }, (_, index) => 25 + index * 5),
  ...Array.from({ length: 14 }, (_, index) => 70 + index * 10),
  ...Array.from({ length: 12 }, (_, index) => 225 + index * 25),
  ...Array.from({ length: 10 }, (_, index) => 550 + index * 50),
  ...Array.from({ length: 15 }, (_, index) => 1100 + index * 100),
];
const WORKLET_ANCHORS = [[4, 0], [15, 0.25], [60, 0.5], [200, 0.68], [500, 0.82], [2500, 1]];

function clampPosition(position: number): number {
  'worklet';
  return Math.min(1, Math.max(0, Number.isFinite(position) ? position : 0));
}

function formatRoundValue(value: number): string {
  'worklet';
  return `${value}轮`;
}

function workletValuePosition(value: number): number {
  'worklet';
  if (value <= WORKLET_ANCHORS[0][0]) return WORKLET_ANCHORS[0][1];
  const last = WORKLET_ANCHORS[WORKLET_ANCHORS.length - 1];
  if (value >= last[0]) return last[1];
  for (let index = 1; index < WORKLET_ANCHORS.length; index += 1) {
    const upper = WORKLET_ANCHORS[index];
    if (value <= upper[0]) {
      const lower = WORKLET_ANCHORS[index - 1];
      const progress = (value - lower[0]) / (upper[0] - lower[0]);
      return lower[1] + progress * (upper[1] - lower[1]);
    }
  }
  return last[1];
}

function workletRoundForPosition(rawPosition: number): number {
  'worklet';
  let closest = WORKLET_VALUES[0];
  let closestDistance = Math.abs(rawPosition - workletValuePosition(closest));
  for (let index = 1; index < WORKLET_VALUES.length; index += 1) {
    const candidate = WORKLET_VALUES[index];
    const distance = Math.abs(rawPosition - workletValuePosition(candidate));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function AiContextSlider({
  disabled = false,
  label,
  onCommit,
  saveState = 'idle',
  value,
}: {
  disabled?: boolean;
  label: string;
  onCommit: (value: number) => void;
  saveState?: 'idle' | 'saving' | 'failed';
  value: number;
}) {
  const position = useSharedValue(historyRoundsToPosition(value));
  const gestureStart = useSharedValue(position.value);
  const trackWidth = useSharedValue(1);

  useEffect(() => {
    position.value = withTiming(historyRoundsToPosition(value), { duration: 120 });
  }, [position, value]);

  const commitPosition = useCallback((nextPosition: number) => {
    onCommit(positionToHistoryRounds(nextPosition));
  }, [onCommit]);

  const panGesture = useMemo(
    () => Gesture.Pan()
      .enabled(!disabled)
      .minDistance(2)
      .onBegin(() => {
        gestureStart.value = position.value;
      })
      .onUpdate((event) => {
        position.value = clampPosition(
          gestureStart.value + event.translationX / Math.max(1, trackWidth.value - THUMB_SIZE),
        );
      })
      .onEnd(() => {
        runOnJS(commitPosition)(position.value);
      }),
    [commitPosition, disabled, gestureStart, position, trackWidth],
  );

  const tapGesture = useMemo(
    () => Gesture.Tap()
      .enabled(!disabled)
      .onEnd((event) => {
        position.value = clampPosition(event.x / Math.max(1, trackWidth.value));
        runOnJS(commitPosition)(position.value);
      }),
    [commitPosition, disabled, position, trackWidth],
  );

  const gesture = useMemo(() => Gesture.Race(panGesture, tapGesture), [panGesture, tapGesture]);
  const progressStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      position.value,
      [0, 0.72, 1],
      [aiLightColors.primaryActive, colors.semantic.warning, colors.semantic.danger],
    ),
    width: `${Math.max(0, Math.min(100, position.value * 100))}%`,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      position.value,
      [0, 0.72, 1],
      [aiLightColors.primaryActive, colors.semantic.warning, colors.semantic.danger],
    ),
    transform: [{ translateX: position.value * Math.max(0, trackWidth.value - THUMB_SIZE) }],
  }));
  const valueProps = useAnimatedProps(() => ({
    defaultValue: formatRoundValue(workletRoundForPosition(position.value)),
    text: formatRoundValue(workletRoundForPosition(position.value)),
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    trackWidth.value = Math.max(1, event.nativeEvent.layout.width);
  };

  const stepValue = (direction: -1 | 1) => {
    const index = Math.max(0, AI_CONTEXT_HISTORY_ROUND_VALUES.indexOf(value));
    onCommit(
      AI_CONTEXT_HISTORY_ROUND_VALUES[
        Math.min(AI_CONTEXT_HISTORY_ROUND_VALUES.length - 1, Math.max(0, index + direction))
      ],
    );
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') stepValue(1);
    if (event.nativeEvent.actionName === 'decrement') stepValue(-1);
  };

  const valueText = formatRoundValue(value);
  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.label}>{label}</Text>
        <View style={styles.valueWrap}>
          {saveState === 'failed' ? <Text style={styles.failed}>未保存</Text> : null}
          <AnimatedTextInput
            animatedProps={valueProps}
            defaultValue={valueText}
            editable={false}
            pointerEvents="none"
            style={styles.value}
            underlineColorAndroid="transparent"
          />
        </View>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessibilityActions={[
            { name: 'increment', label: '增加' },
            { name: 'decrement', label: '减少' },
          ]}
          accessibilityLabel={label}
          accessibilityRole="adjustable"
          accessibilityValue={{ text: valueText }}
          onAccessibilityAction={handleAccessibilityAction}
          onLayout={handleLayout}
          style={styles.touchTrack}
        >
          <View style={styles.track}>
            <Animated.View style={[styles.fill, progressStyle]} />
          </View>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: aiLightColors.surface,
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: rhythm.compactGridGap,
    minHeight: metrics.minTouchSize + spacing[5],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  disabled: { opacity: 0.48 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: spacing[6],
  },
  label: { ...typography.textStyles.body, color: aiLightColors.ink, flex: 1 },
  valueWrap: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  value: { ...typography.textStyles.bodyStrong, color: aiLightColors.ink, minWidth: 64, padding: 0, textAlign: 'right' },
  failed: { ...typography.textStyles.caption, color: colors.semantic.danger },
  touchTrack: { height: metrics.minTouchSize, justifyContent: 'center', position: 'relative' },
  track: { backgroundColor: aiLightColors.hairline, borderRadius: radius.pill, height: spacing[1], overflow: 'hidden' },
  fill: { borderRadius: radius.pill, height: '100%' },
  thumb: { borderColor: aiLightColors.surface, borderRadius: radius.pill, borderWidth: spacing[1], height: THUMB_SIZE, position: 'absolute', width: THUMB_SIZE },
});
