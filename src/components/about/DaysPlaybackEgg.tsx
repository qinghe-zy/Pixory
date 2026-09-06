import { useCallback, useEffect, useRef, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaybackAchievement {
  day: number;
  title: string;
  requirement: string;
  occurredAt: number; // ms timestamp
}

interface DaysPlaybackEggProps {
  /** Total companion days (final value shown when not playing) */
  totalDays: number;
  /** Sorted list of achievements with their day index */
  achievements: PlaybackAchievement[];
  /** Called each frame with the current playback day (null = stopped) */
  onPlaybackDay: (day: number | null) => void;
  /** Called when a new achievement appears or clears during playback */
  onPlaybackAchievement: (achievement: PlaybackAchievement | null) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRAME_MS = 200;
const ACHIEVEMENT_DISPLAY_MS = 3000;
const ACHIEVEMENT_FADEOUT_MS = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DaysPlaybackEgg({
  totalDays,
  achievements,
  onPlaybackDay,
  onPlaybackAchievement,
}: DaysPlaybackEggProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState<PlaybackAchievement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);

  // Build lookup map when achievements change
  const achievementMapRef = useRef<Map<number, PlaybackAchievement>>(new Map());
  useEffect(() => {
    const map = new Map<number, PlaybackAchievement>();
    for (const a of achievements) map.set(a.day, a);
    achievementMapRef.current = map;
  }, [achievements]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPlayback = useCallback(() => {
    clearTimer();
    playingRef.current = false;
    setIsPlaying(false);
    setCurrentAchievement(null);
    onPlaybackDay(null);
    onPlaybackAchievement(null);
  }, [onPlaybackDay, onPlaybackAchievement]);

  const scheduleNext = useCallback(
    (day: number) => {
      if (!playingRef.current) return;
      onPlaybackDay(day);
      const achievement = achievementMapRef.current.get(day);
      if (achievement) {
        setCurrentAchievement(achievement);
        onPlaybackAchievement(achievement);
        timerRef.current = setTimeout(() => {
          if (!playingRef.current) return;
          setCurrentAchievement(null);
          onPlaybackAchievement(null);
          timerRef.current = setTimeout(() => {
            if (!playingRef.current) return;
            if (day < totalDays) {
              scheduleNext(day + 1);
            } else {
              stopPlayback();
            }
          }, ACHIEVEMENT_FADEOUT_MS);
        }, ACHIEVEMENT_DISPLAY_MS);
      } else {
        setCurrentAchievement(null);
        if (day < totalDays) {
          timerRef.current = setTimeout(() => scheduleNext(day + 1), FRAME_MS);
        } else {
          stopPlayback();
        }
      }
    },
    [totalDays, stopPlayback, onPlaybackDay, onPlaybackAchievement],
  );

  const startPlayback = useCallback(() => {
    clearTimer();
    playingRef.current = true;
    setIsPlaying(true);
    setCurrentAchievement(null);
    scheduleNext(1);
  }, [scheduleNext]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimer();
    playingRef.current = false;
  }, []);

  const handlePress = () => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={isPlaying ? '停止播放陪伴历程' : '播放陪伴历程'}
        accessibilityRole="button"
        hitSlop={12}
        onPress={handlePress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        {isPlaying ? <StopIcon /> : <PlayIcon />}
      </Pressable>

      {currentAchievement ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(500)}
          key={currentAchievement.title + currentAchievement.day}
          style={styles.displayInfo}
        >
          <Text style={styles.displayDate}>{formatDate(currentAchievement.occurredAt)}</Text>
          <Text style={styles.displayTitle}>达成成就 {currentAchievement.title}</Text>
          <Text style={styles.displayReq}>{currentAchievement.requirement}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ─── Icon Components ──────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <View style={iconStyles.circle}>
      <View style={iconStyles.triangle} />
    </View>
  );
}

function StopIcon() {
  return (
    <View style={iconStyles.circle}>
      <View style={iconStyles.square} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 15;

const iconStyles = StyleSheet.create({
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Play triangle: border trick — transparent top/bottom, colored left side = ▶
  triangle: {
    width: 0,
    height: 0,
    borderTopWidth: 3.5,
    borderBottomWidth: 3.5,
    borderLeftWidth: 5.5,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.text.tertiary,
    marginLeft: 1.5, // optical centering
  },
  // Stop square: small filled block = ■
  square: {
    width: 5,
    height: 5,
    borderRadius: 0.5,
    backgroundColor: colors.text.title,
  },
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing[2],
    marginBottom: spacing[2], // match heroUnit baseline offset
    position: 'relative',
  },
  button: {
    padding: spacing[1],
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  // Achievement info: seamless text to the right of the button
  displayInfo: {
    position: 'absolute',
    left: CIRCLE_SIZE + spacing[4],
    bottom: -spacing[1], // shift slightly down to visually balance with large number baseline
    width: 240, // plenty of space for text wrapping
    zIndex: 20,
  },
  displayDate: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  displayTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    marginBottom: 2,
  },
  displayReq: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});
