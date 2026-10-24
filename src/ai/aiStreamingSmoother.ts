/**
 * Pure helper for smooth stream text interpolation.
 * Decoupled from React, UI, and networking.
 */

export interface SmoothStreamStepOptions {
  /** Target frame budget in ms, defaults to ~16.6ms (60fps) */
  frameBudgetMs?: number;
}

/**
 * Computes the next visible character length based on current visible length and target length.
 * Features an adaptive step rate:
 * - If not streaming: instantly catches up to target length (0ms delay).
 * - Small backlogs (<= 8 chars): 1~2 chars per frame (smooth trickle).
 * - Medium backlogs (9~40 chars): ceil(backlog / 6) per frame (smooth acceleration).
 * - Large backlogs (> 40 chars): ceil(backlog / 3) per frame (rapid catchup).
 *
 * Time Complexity: O(1) scalar arithmetic.
 */
export function computeSmoothedVisibleLength(
  currentLength: number,
  targetLength: number,
  isStreaming: boolean
): number {
  if (!isStreaming || currentLength >= targetLength) {
    return targetLength;
  }
  if (currentLength < 0) {
    currentLength = 0;
  }
  const backlog = targetLength - currentLength;
  let step = 1;
  if (backlog <= 8) {
    step = 1;
  } else if (backlog <= 20) {
    step = 2;
  } else if (backlog <= 60) {
    step = Math.ceil(backlog / 6);
  } else {
    step = Math.ceil(backlog / 3);
  }
  return Math.min(targetLength, currentLength + step);
}

/**
 * Tracks and estimates the real-time model production rate using Exponential Moving Average (EMA).
 * Strictly O(1) time complexity (scalar operations only).
 *
 * @param currentEstimate Current estimated production rate in chars/frame (60fps baseline)
 * @param deltaChars Characters added in the latest chunk
 * @param deltaMs Elapsed time in milliseconds since the previous chunk
 * @returns Updated model throughput in chars/frame
 */
export function updateThroughputEstimate(
  currentEstimate: number,
  deltaChars: number,
  deltaMs: number
): number {
  if (deltaMs <= 0 || deltaChars <= 0) {
    return Math.max(0, currentEstimate);
  }
  // Convert incoming throughput to chars per 60Hz frame (~16.67ms per frame)
  const incomingCharsPerSec = (deltaChars / deltaMs) * 1000;
  const incomingCharsPerFrame = incomingCharsPerSec / 60;

  if (currentEstimate <= 0) {
    return Math.min(60, incomingCharsPerFrame);
  }
  // Responsive smoothing factor: 0.35 fast attack
  const alpha = 0.35;
  const updated = currentEstimate + (incomingCharsPerFrame - currentEstimate) * alpha;
  return Math.min(60, Math.max(0, updated));
}

/**
 * Adaptive Dual-Phase Elastic Velocity Engine:
 * - Strictly O(1) time complexity (scalar math, no loops, no allocations).
 * - Phase 1 (Cruise Floor, Backlog <= 12): Guarantees serene 0.6 ~ 1.0 chars/frame (~36-60 chars/s),
 *   absorbing network packet airgaps without halting abruptly.
 * - Phase 2 (Dynamic Matching, 12 < Backlog <= 45): Seamlessly matches the real-time production
 *   rate of high-speed models, ensuring zero delivery slowdown.
 * - Phase 3 (Elastic Convergence, Backlog > 45): Rapidly drains large burst backlogs within ~12 frames
 *   (~200ms) to ensure minimal lag accumulation, capping at 60 chars/frame (~3600 chars/s).
 */
export function calculateAdaptiveElasticVelocity(
  backlog: number,
  modelThroughputCharsPerFrame: number = 0
): number {
  if (backlog <= 0) return 0;

  // Phase 1: Serene anti-jitter cruise floor with lossless model rate following
  if (backlog <= 12) {
    const cruiseFloor = 0.85 + backlog * 0.04;
    return Math.max(cruiseFloor, modelThroughputCharsPerFrame);
  }

  // Phase 2: Dynamic matching of model production rate
  if (backlog <= 45) {
    const baseVelocity = 1.0 + (backlog - 12) * 0.12;
    return Math.max(baseVelocity, modelThroughputCharsPerFrame);
  }

  // Phase 3: High-throughput elastic convergence (< 200ms latency ceiling)
  const burstVelocity = 4.96 + (backlog - 45) * 0.10;
  return Math.min(60, Math.max(burstVelocity, modelThroughputCharsPerFrame));
}

/**
 * Burst-Aware Adaptive Elastic Velocity Engine:
 * Strictly O(1) time complexity (scalar math only, zero allocations).
 *
 * Principles:
 * 1. First-Burst Ejection (visibleCount < 120 chars):
 *    Injects high initial kinetic impulse (3.5 ~ 5.5 chars/frame) to achieve instant 0ms unfreezing
 *    and rapidly fills the initial reading viewport (~80-150 chars).
 * 2. Adaptive Model Rate Following:
 *    Seamless 1:1 dynamic matching with real-time model throughput ("prefer fast over slow").
 * 3. Serene Cruise Floor:
 *    Post-burst phase smoothly absorbs 300-500ms network jitter gaps without abrupt halts.
 */
export function calculateBurstAwareElasticVelocity(
  backlog: number,
  modelThroughputCharsPerFrame: number = 0,
  visibleCount: number = 0
): number {
  if (backlog <= 0) return 0;

  // Base steady-state velocity
  const steadyVelocity = calculateAdaptiveElasticVelocity(backlog, modelThroughputCharsPerFrame);

  // First-Burst impulse phase for initial reading comfort (extended to 180 chars)
  if (visibleCount < 180) {
    // Linear decay from 1.0 (at count=0) down to 0.0 (at count=180)
    const burstDecay = (180 - visibleCount) / 180;
    const burstFloor = 4.5 * burstDecay;
    const burstVelocity = Math.max(burstFloor, steadyVelocity * (1 + 0.9 * burstDecay));
    return Math.min(60, Math.max(burstVelocity, modelThroughputCharsPerFrame));
  }

  return steadyVelocity;
}

/**
 * Computes the per-frame displacement step for Guided Reading Glide.
 * Strictly O(1) time complexity (scalar arithmetic only).
 *
 * Principles:
 * - Dynamic & Adaptive: scales with remaining scroll distance and real-time model throughput.
 * - "Prefer Fast Over Slow": rapid enough to feel energetic, smooth enough to eliminate native dropped frames.
 * - Bounded: 12px ~ 28px per 60Hz frame (~720px/s ~ 1680px/s).
 * - Soft landing when near bottom (<= 40px) to prevent abrupt landing jolts.
 */
export function calculateGuidedGlideStep(
  remainingOffset: number,
  modelThroughputCharsPerFrame: number = 0
): number {
  if (remainingOffset <= 0) return 0;

  // Soft landing near bottom
  if (remainingOffset <= 16) {
    return Math.max(2, Math.ceil(remainingOffset / 2));
  }
  if (remainingOffset <= 40) {
    return 8;
  }

  // Distance scaling: smoothly expands step for larger distances to ensure energetic gliding
  const distanceStep = 10 + Math.min(14, remainingOffset / 80);

  // Throughput bonus: if model is actively generating, glide faster to keep pace
  const throughputBonus = Math.min(6, modelThroughputCharsPerFrame * 0.4);

  const targetStep = distanceStep + throughputBonus;
  return Math.min(28, Math.max(12, targetStep));
}

/**
 * Continuous velocity function tailored for natural chat body reading:
 * - Low backlog (<= 6 chars): gentle readable cruising (1.0 ~ 1.8 chars/frame, ~60-110 chars/s at 60Hz).
 * - Medium backlog (6 ~ 24 chars): smooth linear acceleration (1.8 ~ 5.4 chars/frame).
 * - High backlog (> 24 chars): rapid adaptive burst catchup up to 50 chars/frame (~3000 chars/s at 60Hz).
 * Eliminates discrete typewriter jerks while preserving maximum generation throughput.
 */
export function calculateContinuousStreamVelocity(backlog: number): number {
  if (backlog <= 0) return 0;
  if (backlog <= 6) {
    return 1.0 + backlog * 0.133;
  }
  if (backlog <= 24) {
    return 1.8 + (backlog - 6) * 0.2;
  }
  return Math.min(50, 5.4 + (backlog - 24) * 0.45);
}

/**
 * Calculates the per-frame vertical height absorption step based on height lag (delta).
 * - Delta <= 0: no lag (step = 0).
 * - Small delta (<= 32px, single-line wrap): 1.5px / frame (~90px/s at 60fps), giving a serene, steady glide.
 * - Medium delta (32px < delta <= 80px, paragraph break): 2.5px / frame.
 * - Large bursts (> 80px, codeblocks/bursts): adapts to catch up smoothly within ~15 frames (~250ms).
 */
export function calculateAbsorberStep(delta: number, dtFactor = 1): number {
  if (delta <= 0) return 0;
  const factor = Math.max(0.1, Math.min(3, dtFactor));
  let baseStep: number;
  if (delta <= 32) baseStep = 1.5;
  else if (delta <= 80) baseStep = 2.5;
  else baseStep = Math.max(3, Math.ceil(delta / 15));
  return baseStep * factor;
}


/**
 * Safely slices a string by Unicode code points rather than raw UTF-16 code units,
 * preventing split surrogate pairs (like emoji or supplemental characters).
 */
export function safeSliceCodePoints(text: string, targetCodePointCount: number): string {
  if (targetCodePointCount <= 0) return '';
  if (targetCodePointCount >= text.length) return text;

  let codePoints = 0;
  let byteIndex = 0;
  const len = text.length;

  while (byteIndex < len && codePoints < targetCodePointCount) {
    const code = text.charCodeAt(byteIndex);
    // Surrogate pair: high surrogate is 0xD800..0xDBFF, low is 0xDC00..0xDFFF
    if (code >= 0xd800 && code <= 0xdbff && byteIndex + 1 < len) {
      const nextCode = text.charCodeAt(byteIndex + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        byteIndex += 2;
        codePoints += 1;
        continue;
      }
    }
    byteIndex += 1;
    codePoints += 1;
  }

  return text.slice(0, byteIndex);
}
