/**
 * RhythmBars – A self-contained multi-waveform decorative animation.
 *
 * 7 vertical bars with macaron pastel colors that cycle through
 * 6 waveform patterns (cascade → ripple → breathe → drift → bloom → seesaw)
 * with seamless parameter-interpolation transitions.
 *
 * Fully independent – no project-specific tokens required.
 * Colors, dimensions, and bar count are configurable via props.
 *
 * @example
 *   <RhythmBars />
 *   <RhythmBars maxBarHeight={24} minBarHeight={7} barWidth={3} barGap={5} />
 */

import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// ─── Types ───────────────────────────────────────────────

interface WaveformConfig {
  readonly phi1: readonly number[];
  readonly phi2: readonly number[];
  readonly shape: readonly number[];
  readonly ampScale: number;
}

// ─── Waveform definitions ────────────────────────────────
// Transition route: each waveform naturally evolves into the next.
//   cascade → ripple → breathe → drift → bloom → seesaw → (cycle)

const WAVEFORMS: readonly WaveformConfig[] = [
  {
    // 0 · Cascade – wave flows left to right
    phi1: [0, 0.62, 1.24, 1.86, 2.48, 3.1, 3.72],
    phi2: [0, 0.45, 0.9, 1.35, 1.8, 2.25, 2.7],
    shape: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    ampScale: 1,
  },
  {
    // 1 · Ripple – center radiates outward
    phi1: [2.1, 1.4, 0.7, 0, 0.7, 1.4, 2.1],
    phi2: [1.5, 1.0, 0.5, 0, 0.5, 1.0, 1.5],
    shape: [0.65, 0.78, 0.92, 1.0, 0.92, 0.78, 0.65],
    ampScale: 1,
  },
  {
    // 2 · Breathe – near-unison rise and fall
    phi1: [0.15, 0.08, 0.03, 0, 0.03, 0.08, 0.15],
    phi2: [0.3, 0.15, 0.05, 0, 0.05, 0.15, 0.3],
    shape: [0.7, 0.82, 0.95, 1.0, 0.95, 0.82, 0.7],
    ampScale: 1,
  },
  {
    // 3 · Drift – near-still resting state
    phi1: [0, 1.9, 3.5, 0.8, 4.2, 2.6, 5.1],
    phi2: [1.2, 3.8, 0.6, 5.0, 2.4, 4.6, 0.3],
    shape: [0.85, 0.9, 0.88, 0.92, 0.87, 0.91, 0.86],
    ampScale: 0.5,
  },
  {
    // 4 · Bloom – odd/even alternating
    phi1: [0, 3.14, 0, 3.14, 0, 3.14, 0],
    phi2: [0.4, 2.74, 0.4, 2.74, 0.4, 2.74, 0.4],
    shape: [0.8, 0.9, 0.95, 1.0, 0.95, 0.9, 0.8],
    ampScale: 1,
  },
  {
    // 5 · Seesaw – left/right alternating
    phi1: [0, 0.25, 0.5, 1.57, 3.14, 2.89, 2.64],
    phi2: [0.2, 0.1, 0, 0.8, 1.6, 1.7, 1.8],
    shape: [0.9, 0.95, 1.0, 0.6, 1.0, 0.95, 0.9],
    ampScale: 1,
  },
];

const WAVEFORM_SEQUENCE = [0, 1, 2, 3, 4, 5] as const;

// ─── Physics ─────────────────────────────────────────────

const BAR_COUNT = 7;
const W1 = (2 * Math.PI) / 4.5; // main breathing freq
const W2 = (2 * Math.PI) / 2.78; // ripple freq (≈ W1 / φ)
const ENVELOPE_W = (2 * Math.PI) / 10; // envelope period: 10 s
const A1 = 0.7; // main wave weight
const A2 = 0.3; // ripple weight

// ─── Timing ──────────────────────────────────────────────

const BLEND_MS = 3000;
const HOLD_MIN = 8000;
const HOLD_MAX = 15000;
const TICK = 500;
const ENV_LOW = 0.15;
const WAIT_CAP = 5000;
// 1 000 s cycle – wraps once every ~16 min, imperceptible
const T_LOOP = 1000;

// ─── Default palette ─────────────────────────────────────

/** Macaron pastel: S 38-50 %, L 84-85 % for uniform perceived brightness. */
export const MACARON_COLORS = [
  'hsl(340, 50%, 84%)', // 草莓粉
  'hsl(15, 50%, 84%)', // 蜜桃橙
  'hsl(50, 48%, 85%)', // 柠檬黄
  'hsl(100, 38%, 84%)', // 开心果
  'hsl(160, 40%, 84%)', // 薄荷绿
  'hsl(210, 45%, 84%)', // 天空蓝
  'hsl(265, 42%, 84%)', // 香芋紫
] as const;

// ─── Pre-allocated index array (avoids new array each render) ─

const INDICES = Array.from({ length: BAR_COUNT }, (_, i) => i);

// ─── Props ───────────────────────────────────────────────

export interface RhythmBarsProps {
  /** Maximum bar height in px. @default 40 */
  maxBarHeight?: number;
  /** Minimum bar height in px. @default 12 */
  minBarHeight?: number;
  /** Bar width in px. @default 4 */
  barWidth?: number;
  /** Gap between bars in px. @default 7 */
  barGap?: number;
  /** 7 colors, one per bar. @default MACARON_COLORS */
  colors?: readonly string[];
  /** Container style override. */
  style?: StyleProp<ViewStyle>;
}

// ─── Main component ──────────────────────────────────────

export function RhythmBars({
  maxBarHeight = 40,
  minBarHeight = 12,
  barWidth = 4,
  barGap = 7,
  colors: barColors = MACARON_COLORS,
  style,
}: RhythmBarsProps) {
  // Continuous time source (seconds)
  const time = useSharedValue(0);
  // Waveform blending: A → B over BLEND_MS
  const cfgA = useSharedValue<WaveformConfig>(WAVEFORMS[0]);
  const cfgB = useSharedValue<WaveformConfig>(WAVEFORMS[0]);
  const blend = useSharedValue(0);

  const seqIdx = useRef(0);
  const busy = useRef(false);

  // Start time loop
  useEffect(() => {
    time.value = withRepeat(
      withTiming(T_LOOP, { duration: T_LOOP * 1000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [time]);

  // Transition-complete handler: swap A = B, reset blend
  const onBlendDone = useCallback(() => {
    cfgA.value = cfgB.value;
    blend.value = 0;
    busy.current = false;
  }, [cfgA, cfgB, blend]);

  // Kick off a smooth transition to the next waveform
  const goNext = useCallback(
    (idx: number) => {
      busy.current = true;
      cfgB.value = WAVEFORMS[idx];
      blend.value = withTiming(1, { duration: BLEND_MS, easing: Easing.inOut(Easing.ease) }, (ok) => {
        if (ok) runOnJS(onBlendDone)();
      });
    },
    [cfgB, blend, onBlendDone],
  );

  // Auto-scheduler: hold → wait for quiet envelope → transition
  useEffect(() => {
    let elapsed = 0;
    let hold = rand(HOLD_MIN, HOLD_MAX);
    let waited = 0;

    const id = setInterval(() => {
      if (busy.current) return;
      elapsed += TICK;
      if (elapsed < hold) return;

      const env = 0.45 + 0.55 * Math.sin(ENVELOPE_W * time.value);
      waited += TICK;

      if (env < ENV_LOW || waited > WAIT_CAP) {
        const next = (seqIdx.current + 1) % WAVEFORM_SEQUENCE.length;
        seqIdx.current = next;
        goNext(WAVEFORM_SEQUENCE[next]);
        elapsed = 0;
        waited = 0;
        hold = rand(HOLD_MIN, HOLD_MAX);
      }
    }, TICK);

    return () => clearInterval(id);
  }, [time, goNext]);

  return (
    <View style={[s.row, { gap: barGap, height: maxBarHeight }, style]}>
      {INDICES.map((i) => (
        <Bar
          key={i}
          blend={blend}
          cfgA={cfgA}
          cfgB={cfgB}
          color={barColors[i] ?? MACARON_COLORS[i]}
          idx={i}
          maxH={maxBarHeight}
          minH={minBarHeight}
          time={time}
          w={barWidth}
        />
      ))}
    </View>
  );
}

// ─── Individual bar ──────────────────────────────────────

interface BarProps {
  idx: number;
  time: SharedValue<number>;
  cfgA: SharedValue<WaveformConfig>;
  cfgB: SharedValue<WaveformConfig>;
  blend: SharedValue<number>;
  color: string;
  maxH: number;
  minH: number;
  w: number;
}

function Bar({ idx, time, cfgA, cfgB, blend, color, maxH, minH, w }: BarProps) {
  const anim = useAnimatedStyle(() => {
    'worklet';
    const t = time.value;
    const bl = blend.value;
    const a = cfgA.value;
    const b = cfgB.value;

    // Lerp waveform parameters
    const inv = 1 - bl;
    const p1 = a.phi1[idx] * inv + b.phi1[idx] * bl;
    const p2 = a.phi2[idx] * inv + b.phi2[idx] * bl;
    const sh = a.shape[idx] * inv + b.shape[idx] * bl;
    const amp = a.ampScale * inv + b.ampScale * bl;

    // Breathing envelope (0 → 1 with quiet dips)
    const env = Math.max(0, 0.45 + 0.55 * Math.sin(ENVELOPE_W * t));

    // Dual-frequency wave, normalized 0 → 1
    const wave = A1 * amp * Math.sin(W1 * t + p1) + A2 * amp * Math.sin(W2 * t + p2);
    const norm = amp > 0.001 ? (wave + amp) / (2 * amp) : 0.5;

    // Final height
    const h = minH + env * sh * norm * (maxH - minH);
    return { height: Math.max(minH, h) };
  });

  return <Animated.View style={[{ width: w, borderRadius: w / 2, backgroundColor: color }, anim]} />;
}

// ─── Helpers ─────────────────────────────────────────────

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

const s = StyleSheet.create({
  row: {
    alignItems: 'flex-end', // bars grow upward from the bottom edge
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
