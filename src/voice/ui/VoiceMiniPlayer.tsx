import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from '../../components/ai/aiLightTheme';
import { voiceService } from '../voiceService';
import type { VoicePlaybackState } from '../voicePlayer';

interface VoiceMiniPlayerProps {
  onScrollToMessage?: (messageId: string) => void;
  bottomOffset?: number;
}

export function VoiceMiniPlayer({ onScrollToMessage, bottomOffset = 108 }: VoiceMiniPlayerProps) {
  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>(() =>
    voiceService.getPlaybackState()
  );

  const wave1Anim = useRef(new Animated.Value(0.4)).current;
  const wave2Anim = useRef(new Animated.Value(1.0)).current;
  const wave3Anim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const unsub = voiceService.subscribe((state) => {
      setPlaybackState(state);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!playbackState.isPlaying) {
      wave1Anim.setValue(0.4);
      wave2Anim.setValue(1.0);
      wave3Anim.setValue(0.6);
      return;
    }

    const createWaveLoop = (anim: Animated.Value, minVal: number, maxVal: number, duration: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: maxVal,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: minVal,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = createWaveLoop(wave1Anim, 0.3, 1.0, 320);
    const anim2 = createWaveLoop(wave2Anim, 0.4, 1.2, 260);
    const anim3 = createWaveLoop(wave3Anim, 0.35, 1.1, 380);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [playbackState.isPlaying, wave1Anim, wave2Anim, wave3Anim]);

  if (!playbackState.isPlaying || !playbackState.activeId) {
    return null;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  const currentStr = formatTime(playbackState.currentTimeSec);
  const totalStr = formatTime(playbackState.durationSec || 0);

  return (
    <View style={[styles.floatingContainer, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          if (playbackState.activeId && onScrollToMessage) {
            onScrollToMessage(playbackState.activeId);
          }
        }}
        style={styles.pill}
      >
        {/* 动态律动声波微动效 */}
        <View style={styles.waveGroup}>
          <Animated.View
            style={[
              styles.waveBar,
              { height: 12, transform: [{ scaleY: wave1Anim }] },
            ]}
          />
          <Animated.View
            style={[
              styles.waveBar,
              { height: 12, transform: [{ scaleY: wave2Anim }] },
            ]}
          />
          <Animated.View
            style={[
              styles.waveBar,
              { height: 12, transform: [{ scaleY: wave3Anim }] },
            ]}
          />
        </View>

        {/* 时间进度 */}
        <Text style={styles.timeText}>
          {currentStr} / {totalStr}
        </Text>

        {/* 极简停止按键 */}
        <Pressable
          onPress={() => void voiceService.stop()}
          hitSlop={10}
          style={styles.stopBtn}
        >
          <Ionicons name="stop" size={14} color={aiLightColors.mutedReadable} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    right: spacing[4],
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    gap: spacing[2],
  },
  waveGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 14,
  },
  waveBar: {
    width: 2.5,
    backgroundColor: '#3B82F6',
    borderRadius: 1.5,
  },
  timeText: {
    ...typography.textStyles.caption,
    fontWeight: '500',
    color: aiLightColors.ink,
    fontVariant: ['tabular-nums'],
  },
  stopBtn: {
    padding: 2,
    marginLeft: 2,
  },
});
