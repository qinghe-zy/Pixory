import { useEffect, useRef, useState } from 'react';
import { computeSmoothedVisibleLength } from '../ai/aiStreamingSmoother';
import { fastSafeSlice } from './useThinkingSmoothText';

/**
 * React hook to smoothly interpolate streaming text across animation frames.
 * - When streaming is inactive, instantly returns the complete raw text.
 * - When streaming is active, smoothly advances displayed text using requestAnimationFrame.
 * - If streaming settles (completed/stopped), instantly catches up in the same frame.
 */
export function useSmoothStreamingText(rawText: string, isStreaming: boolean): string {
  // If streaming is not active, skip all animation overhead completely.
  const [displayedText, setDisplayedText] = useState(() => (isStreaming ? '' : rawText));
  const visibleLengthRef = useRef(isStreaming ? 0 : rawText.length);
  const rafIdRef = useRef<number | null>(null);

  // Keep latest props in refs for the RAF loop
  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    // If generation stopped, failed, or completed: instantly catch up
    if (!isStreaming) {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      visibleLengthRef.current = rawText.length;
      setDisplayedText(rawText);
      return;
    }

    // If rawText was truncated/reset externally
    if (rawText.length < visibleLengthRef.current) {
      visibleLengthRef.current = rawText.length;
      setDisplayedText(rawText);
    }

    // If there is incoming backlog to animate
    if (visibleLengthRef.current < rawText.length && rafIdRef.current == null) {
      const tick = () => {
        const target = rawTextRef.current;
        const streaming = isStreamingRef.current;

        if (!streaming) {
          visibleLengthRef.current = target.length;
          setDisplayedText(target);
          rafIdRef.current = null;
          return;
        }

        const currentLen = visibleLengthRef.current;
        const targetLen = target.length;

        if (currentLen >= targetLen) {
          rafIdRef.current = null;
          return;
        }

        const nextLen = computeSmoothedVisibleLength(currentLen, targetLen, true);
        visibleLengthRef.current = nextLen;
        setDisplayedText(fastSafeSlice(target, nextLen));

        if (nextLen < targetLen) {
          rafIdRef.current = requestAnimationFrame(tick);
        } else {
          rafIdRef.current = null;
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
