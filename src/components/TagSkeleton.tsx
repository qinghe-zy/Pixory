import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, rhythm, spacing } from '../design/tokens';

export function TagSkeleton() {
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

  const pillWidths = [80, 120, 90, 60, 150, 100, 70, 110, 85, 130, 90, 75, 105, 95];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Animated.View style={[styles.titleSkeleton, { opacity }]} />
      </View>
      <View style={styles.allTags}>
        {pillWidths.map((w, i) => (
          <Animated.View key={i} style={[styles.tagPill, { width: w, opacity }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing[4],
  },
  header: {
    flexDirection: 'row',
    marginBottom: rhythm.compactGridGap,
  },
  titleSkeleton: {
    width: 140,
    height: 24,
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
  },
  allTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.compactGridGap,
    rowGap: rhythm.compactGridGap,
  },
  tagPill: {
    height: 30,
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
  },
});
