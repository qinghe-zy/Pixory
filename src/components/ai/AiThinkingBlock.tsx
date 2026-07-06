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
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
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

export function AiThinkingBlock({ reasoningText, status, createdAt, completedAt, defaultExpanded = false, onExpandedChange }: AiThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [now, setNow] = useState(Date.now());
  const thinking = status === 'generating' || status === 'queued';
  const expandedProgress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const duration = useMemo(() => elapsedSeconds(createdAt, thinking ? null : completedAt, now), [completedAt, createdAt, now, thinking]);
  const label = `${thinking ? '正在思考中…' : '思考完成'} ${duration.toFixed(1)}秒`;
  const hasReasoningText = Boolean(reasoningText?.trim());
  const waitingForReasoningText = thinking && expanded && !hasReasoningText;
  const bodyVisible = expanded && (hasReasoningText || thinking);

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

  function toggleExpanded() {
    setExpanded((current) => {
      const nextExpanded = !current;
      onExpandedChange?.(nextExpanded);
      return nextExpanded;
    });
  }

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" disabled={!hasReasoningText && !thinking} onPress={toggleExpanded} style={styles.header}>
        {thinking ? <ActivityIndicator color={aiLightColors.primaryActive} size="small" /> : null}
        <Ionicons color={aiLightColors.primaryActive} name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} />
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
        {bodyVisible ? <Text style={styles.text}>{waitingForReasoningText ? '正在等待思考内容…' : reasoningText}</Text> : null}
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
    color: aiLightColors.primaryActive,
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  thinkingAnimatedBody: {
    overflow: 'hidden',
  },
});
