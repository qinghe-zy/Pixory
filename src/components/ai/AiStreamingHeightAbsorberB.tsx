import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { calculateAbsorberStep } from '../../ai/aiStreamingSmoother';

export interface AiStreamingHeightAbsorberBProps {
  children: React.ReactNode;
  /** Whether Option B absorber is enabled (false for Option A pure passthrough) */
  enabled: boolean;
  /** Whether the message is actively in generating state */
  isStreaming: boolean;
}

function AiStreamingHeightAbsorberBComponent({
  children,
  enabled,
  isStreaming,
}: AiStreamingHeightAbsorberBProps) {
  // Option A: 100% pure short-circuit passthrough, zero wrappers, zero overhead
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <ActiveHeightAbsorber isStreaming={isStreaming}>
      {children}
    </ActiveHeightAbsorber>
  );
}

function ActiveHeightAbsorber({
  children,
  isStreaming,
}: {
  children: React.ReactNode;
  isStreaming: boolean;
}) {
  const [renderedHeight, setRenderedHeight] = useState<number | null>(null);
  const smoothHeightRef = useRef<number | null>(null);
  const targetHeightRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number | null>(null);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const stopAnimation = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastTickTimeRef.current = null;
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (rafIdRef.current != null) return;

    const tick = (now: number) => {
      if (!isStreamingRef.current) {
        stopAnimation();
        setRenderedHeight(null);
        smoothHeightRef.current = null;
        return;
      }

      const lastTime = lastTickTimeRef.current ?? now;
      lastTickTimeRef.current = now;
      const elapsedMs = Math.max(0, now - lastTime);
      const dtFactor = elapsedMs > 0 ? Math.min(2.5, Math.max(0.3, elapsedMs / 16.67)) : 1;

      const target = targetHeightRef.current;
      const current = smoothHeightRef.current ?? target;
      const delta = target - current;

      if (delta > 0.25) {
        const step = calculateAbsorberStep(delta, dtFactor);
        const next = Math.min(target, current + step);
        smoothHeightRef.current = next;
        setRenderedHeight(Math.round(next * 10) / 10);
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        // Fully absorbed
        smoothHeightRef.current = target;
        setRenderedHeight(target);
        rafIdRef.current = null;
        lastTickTimeRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [stopAnimation]);

  const handleInnerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measuredHeight = Math.round(event.nativeEvent.layout.height);
      if (measuredHeight <= 0) return;

      targetHeightRef.current = measuredHeight;

      if (!isStreamingRef.current) {
        return;
      }

      // First layout initialization: anchor smoothly at initial height without stretching from zero
      if (smoothHeightRef.current == null) {
        smoothHeightRef.current = measuredHeight;
        setRenderedHeight(measuredHeight);
        return;
      }

      // If text shrunk / reset externally, snap immediately
      if (measuredHeight < smoothHeightRef.current) {
        smoothHeightRef.current = measuredHeight;
        setRenderedHeight(measuredHeight);
        stopAnimation();
        return;
      }

      // If height expanded (line wrap / paragraph), start smooth absorption
      if (measuredHeight > smoothHeightRef.current) {
        startAnimationLoop();
      }
    },
    [startAnimationLoop, stopAnimation],
  );

  useEffect(() => {
    // Instant 0ms settlement upon completion / stop
    if (!isStreaming) {
      stopAnimation();
      setRenderedHeight(null);
      smoothHeightRef.current = null;
    }
  }, [isStreaming, stopAnimation]);

  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, [stopAnimation]);

  const isRestrictingHeight = isStreaming && renderedHeight != null;

  return (
    <View
      style={
        isRestrictingHeight
          ? [styles.absorberOuter, { height: renderedHeight }]
          : undefined
      }
    >
      <View onLayout={handleInnerLayout} style={styles.measureInner}>
        {children}
      </View>
    </View>
  );
}

export const AiStreamingHeightAbsorberB = memo(AiStreamingHeightAbsorberBComponent);

const styles = StyleSheet.create({
  absorberOuter: {
    overflow: 'hidden',
    width: '100%',
  },
  measureInner: {
    width: '100%',
  },
});
