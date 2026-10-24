import { useEffect, useRef, useState } from 'react';

/**
 * O(1) safe string slicing that guarantees not splitting UTF-16 surrogate pairs (e.g. emoji).
 * Eliminates O(N) iteration loops across long thinking text on every animation frame.
 */
export function fastSafeSlice(text: string, count: number): string {
  if (count <= 0) return '';
  if (count >= text.length) return text;
  const lastCode = text.charCodeAt(count - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    return text.slice(0, count - 1);
  }
  return text.slice(0, count);
}

/**
 * 3-stage continuous dynamic velocity function:
 * - Low backlog (<= 8 chars): energetic cruise (1.2 ~ 2.16 chars/frame, ~72-130 chars/s)
 * - Medium backlog (8 ~ 30 chars): smooth acceleration (2.16 ~ 7.44 chars/frame)
 * - High backlog (> 30 chars): high-throughput burst catchup up to 60 chars/frame (~3600 chars/s)
 */
export function calculateTargetVelocity(backlog: number): number {
  if (backlog <= 0) return 0;
  if (backlog <= 8) {
    return 1.2 + backlog * 0.12;
  }
  if (backlog <= 30) {
    return 2.16 + (backlog - 8) * 0.24;
  }
  return Math.min(60, 7.44 + (backlog - 30) * 0.40);
}

/**
 * High-cohesion streaming smoother dedicated to reasoning/thinking text.
 * Implements a continuous velocity curve with Jitter Buffer protection:
 * - Sub-character precision float cursor avoids discrete step jumps.
 * - Dynamic kinetic physics engine: scales up to 45 chars/frame on high backlog bursts.
 * - Asymmetric EMA velocity smoothing: fast attack on bursts, smooth release on pauses.
 * - Jitter Buffer: smooth decay during transient network packet gaps (~230ms grace window).
 * - Instant settlement on completion/stop/phase change (0ms delay).
 * - O(1) safe surrogate slicing for zero-stutter long content.
 */
export function useThinkingSmoothText(rawText: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(() => (isStreaming ? '' : rawText));
  const visibleLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const floatLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const velocityRef = useRef(0);
  const idleFramesRef = useRef(0);
  const idleElapsedMsRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const wasStreamingRef = useRef(isStreaming);

  useEffect(() => {
    // If a new stream starts afresh on the same component, cleanly reset state to 0
    if (!wasStreamingRef.current && isStreaming) {
      visibleLengthRef.current = 0;
      floatLengthRef.current = 0;
      velocityRef.current = 0;
      idleFramesRef.current = 0;
      idleElapsedMsRef.current = 0;
      lastTickTimeRef.current = 0;
      setDisplayedText('');
    }
    wasStreamingRef.current = isStreaming;

    // If thinking stopped, failed, completed, or transitioned to answer: instantly catch up
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
      setDisplayedText(rawText);
      return;
    }

    // External reset / truncation (e.g., branch switch or regenerate)
    if (rawText.length < visibleLengthRef.current) {
      visibleLengthRef.current = rawText.length;
      floatLengthRef.current = rawText.length;
      velocityRef.current = 0;
      idleFramesRef.current = 0;
      idleElapsedMsRef.current = 0;
      lastTickTimeRef.current = 0;
      setDisplayedText(rawText);
    }

    // When new thinking text arrives from the initial chunk, inject First-Burst initial impulse
    if (visibleLengthRef.current === 0 && rawText.length > 0 && velocityRef.current < 4.2) {
      velocityRef.current = 4.2;
    }

    // Run smooth animation loop if there is backlog or active cruising velocity
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
        // Normalize to nominal 60 FPS (16.667ms per frame). Clamped to [0.15, 2.5]
        const dt = Math.min(2.5, Math.max(0.15, deltaMs / 16.667));

        const targetLen = target.length;
        const backlog = targetLen - floatLengthRef.current;

        if (backlog > 0) {
          const idealVelocity = calculateTargetVelocity(backlog);
          // Asymmetric smoothing: fast attack on bursts (0.38), smooth glide on decelerations (0.12)
          const baseAlpha = idealVelocity > velocityRef.current ? 0.38 : 0.12;
          // Exact time-normalized alpha: 1 - (1 - alpha)^dt
          const alpha = 1 - Math.pow(1 - baseAlpha, dt);
          velocityRef.current = velocityRef.current + (idealVelocity - velocityRef.current) * alpha;
          idleFramesRef.current = 0;
          idleElapsedMsRef.current = 0;
        } else {
          // Jitter Buffer: smooth decay during transient chunk gaps (~230ms physical time)
          idleFramesRef.current += 1;
          idleElapsedMsRef.current += deltaMs;
          const decay = Math.pow(0.85, dt);
          velocityRef.current = Math.max(0, velocityRef.current * decay);
          if (idleElapsedMsRef.current > 230 || velocityRef.current < 0.05) {
            velocityRef.current = 0;
            rafIdRef.current = null;
            lastTickTimeRef.current = 0;
            return;
          }
        }

        floatLengthRef.current = Math.min(targetLen, floatLengthRef.current + velocityRef.current * dt);
        const nextLen = Math.min(targetLen, Math.floor(floatLengthRef.current));

        if (nextLen !== visibleLengthRef.current) {
          visibleLengthRef.current = nextLen;
          setDisplayedText(fastSafeSlice(target, nextLen));
        }

        if (floatLengthRef.current < targetLen || idleElapsedMsRef.current <= 230) {
          rafIdRef.current = requestAnimationFrame(tick);
        } else {
          rafIdRef.current = null;
          lastTickTimeRef.current = 0;
        }
      };

      rafIdRef.current = requestAnimationFrame(tick);
    }
  }, [rawText, isStreaming]);

  // Clean up animation frame on unmount
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
