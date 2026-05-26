import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import type { AiMessageStatus } from '../../ai/types';

interface AiThinkingBlockProps {
  reasoningText?: string | null;
  status: AiMessageStatus;
  createdAt: string;
  completedAt?: string | null;
}

function elapsedSeconds(createdAt: string, completedAt: string | null | undefined, now: number): number {
  const startedAt = Date.parse(createdAt);
  if (!Number.isFinite(startedAt)) {
    return 0;
  }
  const endedAt = completedAt ? Date.parse(completedAt) : now;
  if (!Number.isFinite(endedAt)) {
    return 0;
  }
  return Math.max(0, (endedAt - startedAt) / 1000);
}

export function AiThinkingBlock({ reasoningText, status, createdAt, completedAt }: AiThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const thinking = status === 'generating' || status === 'queued';
  const expandedProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const duration = useMemo(() => elapsedSeconds(createdAt, thinking ? null : completedAt, now), [completedAt, createdAt, now, thinking]);
  const label = `${thinking ? '正在思考中…' : '思考完成'} ${duration.toFixed(1)}秒`;
  const bodyVisible = expanded && Boolean(reasoningText);

  useEffect(() => {
    if (!thinking) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [thinking]);

  useEffect(() => {
    Animated.timing(expandedProgress, {
      duration: 180,
      toValue: bodyVisible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [bodyVisible, expandedProgress]);

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" disabled={!reasoningText && !thinking} onPress={() => setExpanded((current) => !current)} style={styles.header}>
        {thinking ? <ActivityIndicator color={aiLightColors.coralActive} size="small" /> : null}
        <Ionicons color={aiLightColors.coralActive} name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      <Animated.View
        style={[
          styles.thinkingAnimatedBody,
          {
            opacity: expandedProgress,
          },
        ]}
      >
        {bodyVisible ? <Text style={styles.text}>{reasoningText}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  label: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  thinkingAnimatedBody: {
    overflow: 'hidden',
  },
});
