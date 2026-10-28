import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ImContextSliderProps {
  value: number; // 当前轮数，范围 5~50
  onCommit: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function ImContextSlider({
  value,
  onCommit,
  min = 5,
  max = 50,
  step = 5,
}: ImContextSliderProps) {
  const [currentVal, setCurrentVal] = useState(value);
  const currentValRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const [trackWidth, setTrackWidth] = useState(200);
  const trackWidthRef = useRef(200);
  const dragStartRatioRef = useRef(0);

  useEffect(() => {
    setCurrentVal(value);
    currentValRef.current = value;
  }, [value]);

  const clampAndSnap = (ratio: number): number => {
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, snapped));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX } = evt.nativeEvent;
        const ratio = Math.max(0, Math.min(1, locationX / trackWidthRef.current));
        dragStartRatioRef.current = ratio;
        const next = clampAndSnap(ratio);
        currentValRef.current = next;
        setCurrentVal(next);
      },
      onPanResponderMove: (_evt, gs) => {
        const w = trackWidthRef.current;
        const nextRatio = Math.max(0, Math.min(1, dragStartRatioRef.current + gs.dx / w));
        const next = clampAndSnap(nextRatio);
        if (next !== currentValRef.current) {
          currentValRef.current = next;
          setCurrentVal(next);
        }
      },
      onPanResponderRelease: () => {
        onCommitRef.current(currentValRef.current);
      },
      onPanResponderTerminate: () => {
        onCommitRef.current(currentValRef.current);
      },
    })
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setTrackWidth(w);
      trackWidthRef.current = w;
    }
  };

  const progress = Math.max(0, Math.min(1, (currentVal - min) / (max - min)));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons color="#374151" name="layers-outline" size={18} style={styles.icon} />
          <Text style={styles.title}>历史记忆轮数</Text>
        </View>
        <View style={styles.valueBadge}>
          <Text style={styles.valueText}>{currentVal} 轮 (最多 {max})</Text>
        </View>
      </View>

      <View
        accessibilityLabel="调整历史记忆轮数"
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, now: currentVal }}
        onLayout={handleLayout}
        style={styles.trackContainer}
        {...panResponder.panHandlers}
      >
        <View style={styles.trackBase}>
          <View style={[styles.trackActive, { width: `${progress * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            { left: Math.max(0, progress * trackWidth - 12) },
          ]}
        />
      </View>

      <View style={styles.ticksRow}>
        <Text style={styles.tickLabel}>{min} 轮</Text>
        <Text style={styles.tickLabel}>25 轮</Text>
        <Text style={styles.tickLabel}>{max} 轮</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 10 },
  title: { fontSize: 14, fontWeight: '500', color: '#1A1C1C' },
  valueBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  valueText: { fontSize: 12, fontWeight: '600', color: '#1A1C1C' },
  trackContainer: { height: 32, justifyContent: 'center', position: 'relative' },
  trackBase: { height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  trackActive: { height: '100%', backgroundColor: '#1A1C1C' },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#1A1C1C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  ticksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tickLabel: { fontSize: 11, color: '#9CA3AF' },
});
