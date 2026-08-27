import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, rhythm, spacing } from '../design/tokens';

export function ListSkeleton() {
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
      <View style={styles.list}>
        {Array.from({ length: 10 }).map((_, i) => (
          <View key={i} style={styles.card}>
            <Animated.View style={[styles.coverSkeleton, { opacity }]} />
            <View style={styles.body}>
              <Animated.View style={[styles.textLine1, { opacity }]} />
              <Animated.View style={[styles.textLine2, { opacity }]} />
            </View>
          </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rhythm.compactGridGap,
  },
  titleSkeleton: {
    width: 140,
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
  list: {
    gap: rhythm.microGap,
  },
  card: {
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.listCardGap,
    minHeight: 80,
    marginBottom: rhythm.microGap,
  },
  coverSkeleton: {
    height: 74,
    width: 92,
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
  },
  body: {
    flex: 1,
    gap: spacing[3],
  },
  textLine1: {
    height: 20,
    width: '60%',
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
  },
  textLine2: {
    height: 16,
    width: '40%',
    backgroundColor: colors.background.input,
    borderRadius: radius.sm,
  },
});
