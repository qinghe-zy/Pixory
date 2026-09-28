/**
 * RhythmBars – A self-contained multi-waveform decorative animation.
 *
 * 7 vertical bars with macaron pastel colors that randomly cycle through
 * 12 highly designed waveform patterns (Cascade, Ripple, Double Helix, Heartbeat, etc.)
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
import { StyleSheet, View, AppState, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
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
  readonly sharpness: number;
}

// ─── Waveform definitions ────────────────────────────────
// 12 highly designed waveforms, combining symmetric, asymmetric, and chaotic patterns.
// When 2 RhythmBars are placed side-by-side (14 bars total), the symmetric ones
// create a stunning mirrored impact.

const WAVEFORMS: readonly WaveformConfig[] = [
  { // 0 · Cascade (Flow right, smooth sweep)
    phi1: [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6],
    phi2: [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4],
    shape: [1, 1, 1, 1, 1, 1, 1],
    ampScale: 1, sharpness: 1,
  },
  { // 1 · Ripple (Center radiating out, symmetric)
    phi1: [2.4, 1.6, 0.8, 0, 0.8, 1.6, 2.4],
    phi2: [1.2, 0.8, 0.4, 0, 0.4, 0.8, 1.2],
    shape: [0.8, 0.9, 1.0, 1.0, 1.0, 0.9, 0.8],
    ampScale: 1, sharpness: 1.5,
  },
  { // 2 · Double Helix (Opposite traveling waves, DNA effect)
    phi1: [0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8], // Left to right
    phi2: [4.8, 4.0, 3.2, 2.4, 1.6, 0.8, 0], // Right to left
    shape: [1, 0.95, 0.9, 0.9, 0.9, 0.95, 1],
    ampScale: 1, sharpness: 1.5,
  },
  { // 3 · Heartbeat (Pulsing, sharp peaks, long quiet)
    phi1: [0.2, 0.1, 0, 0, 0, 0.1, 0.2],
    phi2: [0.4, 0.2, 0, 0, 0, 0.2, 0.4],
    shape: [0.8, 0.9, 1.0, 1.0, 1.0, 0.9, 0.8],
    ampScale: 1, sharpness: 8, // High sharpness creates the heartbeat pulse
  },
  { // 4 · Breathe (Unison, full height, peaceful)
    phi1: [0.2, 0.1, 0, 0, 0, 0.1, 0.2],
    phi2: [0.1, 0.05, 0, 0, 0, 0.05, 0.1],
    shape: [0.9, 0.95, 1.0, 1.0, 1.0, 0.95, 0.9],
    ampScale: 1, sharpness: 1,
  },
  { // 5 · Canyon (Edges high, center suppressed)
    phi1: [0, 0.5, 1.0, 1.5, 1.0, 0.5, 0],
    phi2: [0, 0.3, 0.6, 0.9, 0.6, 0.3, 0],
    shape: [1.0, 0.8, 0.5, 0.3, 0.5, 0.8, 1.0],
    ampScale: 1, sharpness: 1.2,
  },
  { // 6 · Wind Chimes (Chaos, irregular phases, organic feel)
    phi1: [0, 1.7, 3.5, 0.8, 4.2, 2.1, 5.1],
    phi2: [1.2, 3.1, 0.5, 2.9, 1.4, 4.6, 0.3],
    shape: [0.9, 1.0, 0.85, 1.0, 0.9, 0.95, 0.85],
    ampScale: 0.9, sharpness: 1,
  },
  { // 7 · Twin Peaks (M-shape, peaks at indices 1 and 5)
    phi1: [1.0, 0, 1.0, 2.0, 1.0, 0, 1.0],
    phi2: [1.5, 0, 1.5, 3.0, 1.5, 0, 1.5],
    shape: [0.6, 1.0, 0.6, 0.4, 0.6, 1.0, 0.6],
    ampScale: 1, sharpness: 2,
  },
  { // 8 · Mexican Wave (Single sharp peak sweeping across)
    phi1: [0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
    phi2: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0],
    shape: [1, 1, 1, 1, 1, 1, 1],
    ampScale: 1, sharpness: 4,
  },
  { // 9 · Bloom (Alternating odd/even, high energy)
    phi1: [0, 3.14, 0, 3.14, 0, 3.14, 0],
    phi2: [0, 2.5, 0, 2.5, 0, 2.5, 0],
    shape: [1, 0.9, 1, 0.9, 1, 0.9, 1],
    ampScale: 1, sharpness: 1.2,
  },
  { // 10 · Syncopation (2-3-2 grouping, rhythmic offset)
    phi1: [0, 0, 1.57, 1.57, 1.57, 3.14, 3.14],
    phi2: [0, 0, 0.8, 0.8, 0.8, 1.6, 1.6],
    shape: [1, 1, 0.9, 0.9, 0.9, 1, 1],
    ampScale: 1, sharpness: 1,
  },
  { // 11 · Seesaw (Left vs Right imbalance)
    phi1: [0, 0.5, 1.0, 1.57, 3.14, 2.64, 2.14],
    phi2: [0, 0.2, 0.4, 1.57, 3.14, 2.94, 2.74],
    shape: [1, 1, 1, 0.7, 1, 1, 1],
    ampScale: 1, sharpness: 1,
  },
];

// ─── Physics ─────────────────────────────────────────────

const BAR_COUNT = 7;
const W1 = (2 * Math.PI) / 4.5; // main breathing freq
const W2 = (2 * Math.PI) / 2.78; // ripple freq
const A1 = 0.7; // main wave weight
const A2 = 0.3; // ripple weight

// ─── Timing ──────────────────────────────────────────────

const BLEND_MS = 2500; // Smooth 2.5s crossfade between states
const HOLD_MIN = 12000; // 12s minimum active duration
const HOLD_MAX = 18000; // 18s maximum active duration
const TICK = 500;
// 1000s continuous cycle clock
const T_LOOP = 1000;

// Resonance Sync Timing
const SYNC_INTERVAL_MS = 75000; // Trigger global sync every 75 seconds (approx 4-5 cycles)
const SYNC_HOLD_MS = 18000; // Hold the synchronized wave for 18 seconds
// Symmetric/Gorgeous waves suitable for global resonance:
// 2: Double Helix, 3: Heartbeat, 5: Canyon, 7: Twin Peaks, 9: Bloom, 10: Syncopation
const SYNC_WAVES = [2, 3, 5, 7, 9, 10]; 

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

// ─── Pre-allocated index array ───────────────────────────

const INDICES = Array.from({ length: BAR_COUNT }, (_, i) => i);

// ─── Props ───────────────────────────────────────────────

export interface RhythmBarsProps {
  /** Whether the decorative loop should run. Hidden root tabs pass false. */
  active?: boolean;
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
  /** Animation speed multiplier. @default 1 */
  speedMultiplier?: number;
  /** Container style override. */
  style?: StyleProp<ViewStyle>;
}

// ─── Main component ──────────────────────────────────────

export function RhythmBars({
  active = true,
  maxBarHeight = 40,
  minBarHeight = 12,
  barWidth = 4,
  barGap = 7,
  colors: barColors = MACARON_COLORS,
  speedMultiplier = 1,
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
    if (!active) {
      cancelAnimation(time);
      cancelAnimation(blend);
      time.value = 0;
      blend.value = 0;
      busy.current = false;
      return;
    }
    time.value = withRepeat(
      withTiming(T_LOOP, { duration: (T_LOOP * 1000) / speedMultiplier, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(time);
  }, [active, blend, time, speedMultiplier]);

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

  // Auto-scheduler: handles both independent random cycles and exact global resonance
  useEffect(() => {
    if (!active) {
      return;
    }
    let alive = true;
    let syncTimeout: ReturnType<typeof setTimeout>;
    let randomInterval: ReturnType<typeof setInterval>;
    
    let elapsed = 0;
    let hold = rand(HOLD_MIN, HOLD_MAX);

    // 2. Precise global sync clock (converges exactly at SYNC_INTERVAL_MS boundaries)
    function scheduleNextSync() {
      if (!alive) return;
      const now = Date.now();
      const timeToNextSync = SYNC_INTERVAL_MS - (now % SYNC_INTERVAL_MS);
      
      syncTimeout = setTimeout(() => {
        if (!alive) return;
        
        // Calculate a deterministic index based on the current global cycle epoch
        const currentCycle = Math.round(Date.now() / SYNC_INTERVAL_MS);
        const syncIdx = SYNC_WAVES[currentCycle % SYNC_WAVES.length];
        
        seqIdx.current = syncIdx;
        goNext(syncIdx);
        
        // Reset the random loop's timers so it stays locked on the sync wave for SYNC_HOLD_MS
        elapsed = 0;
        hold = SYNC_HOLD_MS;
        
        scheduleNextSync();
      }, timeToNextSync);
    }

    function startTimers() {
      if (!alive) return;
      stopTimers();
      
      // 1. Independent random loop (diverges over time)
      randomInterval = setInterval(() => {
        if (busy.current) return;
        elapsed += TICK;
        if (elapsed < hold) return;

        // Pick a random next waveform, avoiding repeats and avoiding the static sync waves if possible
        let next = Math.floor(rand(0, WAVEFORMS.length));
        if (next === seqIdx.current) {
          next = (next + 1) % WAVEFORMS.length;
        }
        seqIdx.current = next;
        goNext(next);
        
        elapsed = 0;
        hold = rand(HOLD_MIN, HOLD_MAX);
      }, TICK);

      scheduleNextSync();
    }

    function stopTimers() {
      if (randomInterval) clearInterval(randomInterval);
      if (syncTimeout) clearTimeout(syncTimeout);
    }

    // React Native timers can queue up massively when the app is in the background,
    // freezing the JS thread upon returning to the foreground.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        startTimers();
      } else {
        stopTimers();
      }
    });

    if (AppState.currentState === 'active') {
      startTimers();
    }

    return () => {
      alive = false;
      stopTimers();
      appStateSub.remove();
    };
  }, [active, goNext]);

  return (
    <View style={[s.row, { gap: barGap, height: maxBarHeight }, style]}>
      {INDICES.slice(0, Math.min(barColors.length, 7)).map((i) => (
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

    // Lerp waveform parameters seamlessly
    const inv = 1 - bl;
    const p1 = a.phi1[idx] * inv + b.phi1[idx] * bl;
    const p2 = a.phi2[idx] * inv + b.phi2[idx] * bl;
    const sh = a.shape[idx] * inv + b.shape[idx] * bl;
    const amp = a.ampScale * inv + b.ampScale * bl;
    const shp = a.sharpness * inv + b.sharpness * bl;

    // Dual-frequency wave, normalized 0 → 1
    let w1 = (Math.sin(W1 * t + p1) + 1) / 2;
    let w2 = (Math.sin(W2 * t + p2) + 1) / 2;

    // Apply sharpness (e.g. Heartbeat uses high sharpness to create sudden pulses)
    if (shp > 1.01) {
      w1 = Math.pow(w1, shp);
      w2 = Math.pow(w2, shp);
    }

    const norm = (A1 * w1 + A2 * w2) * amp;

    // A subtle 20% dip exactly at the middle of the transition (bl = 0.5).
    // This provides a tiny 0.75-1s "breathing" cue that the animation is shifting,
    // without ever completely stopping or going flat.
    const transitionDip = 1 - Math.sin(bl * Math.PI) * 0.2;

    // Final height
    const h = minH + sh * norm * transitionDip * (maxH - minH);
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
