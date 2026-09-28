import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, rhythm, spacing } from '../design/tokens';

export function GallerySkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Animated.View style={[styles.titleSkeleton, { opacity }]} />
        <Animated.View style={[styles.actionSkeleton, { opacity }]} />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 15 }).map((_, i) => (
          <Animated.View key={i} style={[styles.cell, { opacity }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rhythm.microGap,
  },
  titleSkeleton: {
    width: 120,
    height: 24,
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
  },
  actionSkeleton: {
    width: 60,
    height: 24,
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.listCardGap,
    justifyContent: 'space-between',
  },
  cell: {
    width: '31.8%',
    aspectRatio: 1,
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
    marginBottom: rhythm.listCardGap,
  },
});
