/**
 * AiChatMessageSkeleton
 *
 * Shown while initial chat messages are loading.
 * Renders a handful of fake "bubble" placeholder rows with a breathing
 * shimmer animation so the wait feels alive instead of blank.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { radius, rhythm, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

// Static layout for a handful of convincing fake bubbles.
// Each row: { assistant: bool, widthFraction: 0..1, lines: number }
const FAKE_ROWS: { assistant: boolean; widthFraction: number; lines: number }[] = [
  { assistant: true,  widthFraction: 0.62, lines: 2 },
  { assistant: false, widthFraction: 0.42, lines: 1 },
  { assistant: true,  widthFraction: 0.78, lines: 3 },
  { assistant: false, widthFraction: 0.50, lines: 1 },
  { assistant: true,  widthFraction: 0.55, lines: 2 },
];

export function AiChatMessageSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.65],
  });

  return (
    <View style={styles.wrap}>
      {/* Render fake bubbles from bottom (newest) to top, matching inverted list */}
      {[...FAKE_ROWS].reverse().map((row, i) => (
        <View
          key={i}
          style={[
            styles.rowWrap,
            row.assistant ? styles.rowLeft : styles.rowRight,
          ]}
        >
          {row.assistant && <Animated.View style={[styles.avatar, { opacity }]} />}
          <View style={styles.bubble}>
            {Array.from({ length: row.lines }).map((_, li) => {
              // Last line of multi-line bubbles is shorter for realism.
              const isLastLine = li === row.lines - 1 && row.lines > 1;
              const frac = isLastLine ? row.widthFraction * 0.55 : row.widthFraction;
              return (
                <Animated.View
                  key={li}
                  style={[
                    styles.line,
                    { opacity },
                    li > 0 && styles.lineGap,
                    row.assistant ? styles.lineAssistant : styles.lineUser,
                    { width: `${Math.round(frac * 100)}%` },
                  ]}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: rhythm.listCardGap,
  },
  rowWrap: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing[2],
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: aiLightColors.hairline,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '80%',
    gap: 0,
  },
  line: {
    height: 10,
    borderRadius: radius.sm,
  },
  lineGap: {
    marginTop: 6,
  },
  lineAssistant: {
    backgroundColor: aiLightColors.hairline,
    alignSelf: 'flex-start',
  },
  lineUser: {
    backgroundColor: aiLightColors.primary,
    alignSelf: 'flex-end',
    opacity: 0.25,
  },
});
