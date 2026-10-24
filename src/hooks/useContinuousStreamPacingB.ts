import { useEffect, useRef, useState } from 'react';
import {
  calculateAdaptiveElasticVelocity,
  calculateBurstAwareElasticVelocity,
  updateThroughputEstimate,
} from '../ai/aiStreamingSmoother';
import { fastSafeSlice } from './useThinkingSmoothText';

export interface ContinuousStreamPacingResult {
  /** Text that is smoothly advanced and displayed on screen */
  displayedText: string;
  /** Whether kinetic smoothing is actively moving */
  isCruising: boolean;
  /** Total characters currently visible */
  visibleCount: number;
}

/**
 * Dedicated Option B Streaming Smoother:
 * - Completely decoupled from Option A (zero interference).
 * - Adaptive Dual-Phase Elastic Flow: cruise floor absorbs network jitter, lossless full-speed following.
 * - Time Complexity: Strictly O(1) per frame (scalar operations, no loops, zero regex).
 * - Asymmetric EMA velocity damping: gentle acceleration (0.22), extended soft release (0.06).
 * - Extended Jitter Buffer: 30-frame window (~500ms) smoothly bridges SSE network gaps.
 * - 0ms instant settlement on completion/stop/phase change.
 * - Micro-step batching: skips React re-render when integer boundary is unchanged.
 */
export function useContinuousStreamPacingB(rawText: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(() => (isStreaming ? '' : rawText));
  const visibleLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const floatLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const velocityRef = useRef(0);
  const idleFramesRef = useRef(0);
  const idleElapsedMsRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  // Network and throughput tracker (O(1) scalar bookkeeping)
  const lastChunkTimeRef = useRef(0);
  const lastRawLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const modelThroughputRef = useRef(0);

  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    // When a new stream starts afresh, cleanly reset internal cursor
    if (!wasStreamingRef.current && isStreaming) {
      visibleLengthRef.current = 0;
      floatLengthRef.current = 0;
      velocityRef.current = 0;
      idleFramesRef.current = 0;
      idleElapsedMsRef.current = 0;
      lastTickTimeRef.current = 0;
      lastChunkTimeRef.current = 0;
      lastRawLengthRef.current = 0;
      modelThroughputRef.current = 0;
      setDisplayedText('');
    }
    wasStreamingRef.current = isStreaming;

    // Instant catch up when completed, stopped, or failed (0ms delay)
    if (!isStreaming) {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      visibleLengthRef.current = rawText.length;
      floatLengthRef.current = rawText.length;
      velocityRef.current = 0;
      idleFramesRef.current = 0;
      idleElapsedMsRef.current = 0;
      lastTickTimeRef.current = 0;
      lastChunkTimeRef.current = 0;
      lastRawLengthRef.current = rawText.length;
      modelThroughputRef.current = 0;
      setDisplayedText(rawText);
      return;
    }

    // Measure chunk arrival delta to track model production throughput (O(1))
    const now = Date.now();
    if (lastChunkTimeRef.current > 0) {
      const deltaMs = now - lastChunkTimeRef.current;
      const deltaChars = rawText.length - lastRawLengthRef.current;
      if (deltaChars > 0 && deltaMs > 0) {
        modelThroughputRef.current = updateThroughputEstimate(
          modelThroughputRef.current,
          deltaChars,
          deltaMs
        );
      }
    }
    lastChunkTimeRef.current = now;
    lastRawLengthRef.current = rawText.length;

    // External reset / truncation
    if (rawText.length < visibleLengthRef.current) {
      visibleLengthRef.current = rawText.length;
      floatLengthRef.current = rawText.length;
      velocityRef.current = 0;
      idleFramesRef.current = 0;
      idleElapsedMsRef.current = 0;
      lastTickTimeRef.current = 0;
      setDisplayedText(rawText);
    }

    // When new text arrives from the initial chunk, inject First-Burst initial impulse
    if (visibleLengthRef.current === 0 && rawText.length > 0 && velocityRef.current < 4.5) {
      velocityRef.current = 4.5;
    }

    // Run kinetic animation loop if there is backlog or cruising velocity
    if ((floatLengthRef.current < rawText.length || velocityRef.current > 0.05) && rafIdRef.current == null) {
      const tick = () => {
        const target = rawTextRef.current;
        const streaming = isStreamingRef.current;

        if (!streaming) {
          visibleLengthRef.current = target.length;
          floatLengthRef.current = target.length;
          velocityRef.current = 0;
          idleFramesRef.current = 0;
          idleElapsedMsRef.current = 0;
          lastTickTimeRef.current = 0;
          setDisplayedText(target);
          rafIdRef.current = null;
          return;
        }

        const nowTick = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const lastTick = lastTickTimeRef.current > 0 ? lastTickTimeRef.current : nowTick - 16.667;
        lastTickTimeRef.current = nowTick;
        const deltaMs = Math.max(1, nowTick - lastTick);
        // Normalize to nominal 60 FPS (16.667ms per frame).
        // Clamped to [0.15, 2.5] to safely support 120Hz/240Hz and smooth out transient OS stalls.
        const dt = Math.min(2.5, Math.max(0.15, deltaMs / 16.667));

        const targetLen = target.length;
        const backlog = targetLen - floatLengthRef.current;

        if (backlog > 0) {
          const idealVelocity = calculateBurstAwareElasticVelocity(
            backlog,
            modelThroughputRef.current,
            visibleLengthRef.current
          );
          // Asymmetric damping: responsive acceleration (0.38 in burst, 0.24 steady), soft release (0.06) preserves cruise
          const accelAlpha = visibleLengthRef.current < 180 ? 0.38 : 0.24;
          const baseAlpha = idealVelocity > velocityRef.current ? accelAlpha : 0.06;
          // Exact time-normalized alpha: 1 - (1 - alpha)^dt
          const alpha = 1 - Math.pow(1 - baseAlpha, dt);
          velocityRef.current = velocityRef.current + (idealVelocity - velocityRef.current) * alpha;
          idleFramesRef.current = 0;
          idleElapsedMsRef.current = 0;
        } else {
          // Extended Jitter Buffer: smooth decay during transient chunk gaps (~30 frames / ~500ms)
          idleFramesRef.current += 1;
          idleElapsedMsRef.current += deltaMs;
          const decay = Math.pow(0.95, dt);
          velocityRef.current = Math.max(0, velocityRef.current * decay);
          if (idleFramesRef.current > 30 || idleElapsedMsRef.current > 500 || velocityRef.current < 0.05) {
            velocityRef.current = 0;
            rafIdRef.current = null;
            lastTickTimeRef.current = 0;
            return;
          }
        }

        floatLengthRef.current = Math.min(targetLen, floatLengthRef.current + velocityRef.current * dt);
        const nextLen = Math.min(targetLen, Math.floor(floatLengthRef.current));

        // Micro-step batching: only trigger React re-render when integer boundary has advanced
        if (nextLen !== visibleLengthRef.current) {
          visibleLengthRef.current = nextLen;
          setDisplayedText(fastSafeSlice(target, nextLen));
        }

        if (floatLengthRef.current < targetLen || idleFramesRef.current <= 30) {
          rafIdRef.current = requestAnimationFrame(tick);
        } else {
          rafIdRef.current = null;
          lastTickTimeRef.current = 0;
        }
      };

      rafIdRef.current = requestAnimationFrame(tick);
    }
  }, [rawText, isStreaming]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return isStreaming ? displayedText : rawText;
}
