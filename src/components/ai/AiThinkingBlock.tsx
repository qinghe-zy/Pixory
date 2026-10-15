import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import type { AiMessageStatus } from '../../ai/types';

interface AiThinkingBlockProps {
  reasoningText?: string | null;
  status: AiMessageStatus;
  thinkingActive?: boolean;
  createdAt: string;
  completedAt?: string | null;
  thinkingEndedAt?: string | null;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onHeaderAnchorShift?: (offsetDelta: number) => void;
}

const THINKING_LINE_HEIGHT = 18;
const THINKING_PREVIEW_LINES = 5;
const THINKING_PREVIEW_MAX_HEIGHT = THINKING_LINE_HEIGHT * THINKING_PREVIEW_LINES;

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

export function AiThinkingBlock({
  reasoningText,
  status,
  thinkingActive,
  createdAt,
  completedAt,
  thinkingEndedAt: phaseEndedAt,
  defaultExpanded = false,
  onExpandedChange,
  onHeaderAnchorShift,
}: AiThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const requestedExpandedRef = useRef(defaultExpanded);
  const [thinkingEndedAt, setThinkingEndedAt] = useState<string | null>(null);
  const [contentLayout, setContentLayout] = useState({ createdAt, height: 0, previewHeight: THINKING_PREVIEW_MAX_HEIGHT });
  const layoutGenerationRef = useRef<string | null>(createdAt);
  const headerRef = useRef<View>(null);
  const headerAnchorRef = useRef<{ y: number; revision: number } | null>(null);
  const toggleRevisionRef = useRef(0);
  const wasThinkingRef = useRef(false);
  const terminalStatus = status === 'completed' || status === 'failed' || status === 'stopped';
  const thinking = !phaseEndedAt && !terminalStatus && (thinkingActive ?? (status === 'generating' || status === 'queued'));
  const duration = elapsedSeconds(createdAt, phaseEndedAt ?? thinkingEndedAt ?? completedAt ?? createdAt, Date.now());
  const label = `${thinking ? '正在思考中…' : '已深度思考'}`;
  const hasReasoningText = Boolean(reasoningText?.trim());
  const waitingForReasoningText = thinking && expanded && !hasReasoningText;
  const waitingForReasoningPreviewText = thinking && !hasReasoningText;
  const bodyVisible = expanded && (hasReasoningText || thinking);
  const previewVisible = thinking && !expanded;
  const bodyRenderable = bodyVisible || previewVisible;
  const contentHeight = contentLayout.createdAt === createdAt ? contentLayout.height : 0;
  const previewHeight = contentLayout.createdAt === createdAt ? contentLayout.previewHeight : THINKING_PREVIEW_MAX_HEIGHT;
  const previewOffset = previewVisible ? Math.max(0, contentHeight - previewHeight) : 0;
  const previewOverflowing = previewVisible && previewOffset > 0;

  useLayoutEffect(() => {
    layoutGenerationRef.current = createdAt;
    return () => { layoutGenerationRef.current = null; };
  }, [createdAt]);

  useLayoutEffect(() => {
    requestedExpandedRef.current = defaultExpanded;
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  useEffect(() => {
    setThinkingEndedAt(null);
  }, [createdAt]);

  useLayoutEffect(() => {
    // Finish the reasoning phase independently of the answer's terminal status.
    if (wasThinkingRef.current && !thinking) {
      toggleRevisionRef.current += 1;
      headerAnchorRef.current = null;
      requestedExpandedRef.current = false;
      setThinkingEndedAt(phaseEndedAt ?? new Date().toISOString());
      if (expanded) changeExpanded(false);
    }
    wasThinkingRef.current = thinking;
  }, [thinking, phaseEndedAt]);

  useLayoutEffect(() => {
    const anchor = headerAnchorRef.current;
    if (!anchor) return;
    // Fabric measures and corrects in the layout phase, before displaying an intermediate frame.
    headerRef.current?.measureInWindow((_x, y) => {
      if (headerAnchorRef.current !== anchor || anchor.revision !== toggleRevisionRef.current) return;
      headerAnchorRef.current = null;
      // Inverted lists grow upward; compensate only the measured shift of this header.
      const delta = anchor.y - y;
      if (Number.isFinite(delta) && Math.abs(delta) >= 1) onHeaderAnchorShift?.(delta);
    });
  }, [expanded, onHeaderAnchorShift]);

  useEffect(() => () => {
    toggleRevisionRef.current += 1;
    headerAnchorRef.current = null;
  }, [createdAt]);

  function changeExpanded(nextExpanded: boolean) {
    requestedExpandedRef.current = nextExpanded;
    const revision = ++toggleRevisionRef.current;
    const toggle = (y?: number) => {
      if (revision !== toggleRevisionRef.current) return;
      headerAnchorRef.current = y == null ? null : { y, revision };
      setExpanded(nextExpanded);
      onExpandedChange?.(nextExpanded);
    };
    if (onHeaderAnchorShift && headerRef.current) {
      headerRef.current.measureInWindow((_x, y) => toggle(y));
    } else {
      toggle();
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={expanded ? '折叠思考过程' : '展开思考过程'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        disabled={!hasReasoningText && !thinking}
        onPress={() => changeExpanded(!requestedExpandedRef.current)}
        ref={headerRef}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Text style={styles.label}>{label}</Text>
        {!thinking ? <Text style={styles.duration}>（用时 {duration.toFixed(1)} 秒）</Text> : null}
        <Ionicons color={aiLightColors.mutedReadable} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      <View
        accessibilityElementsHidden={!bodyRenderable}
        importantForAccessibility={bodyRenderable ? 'auto' : 'no-hide-descendants'}
        pointerEvents={bodyRenderable ? 'auto' : 'none'}
        style={[
          styles.thinkingAnimatedBody,
          !bodyRenderable && styles.hiddenBody,
          previewVisible && [styles.previewBody, { maxHeight: previewHeight }],
          bodyRenderable && styles.bodySpacing,
        ]}
      >
        <View
          collapsable={false}
          style={[
            styles.bodyContent,
            previewVisible && contentHeight > 0 && { height: contentHeight },
            { transform: [{ translateY: -previewOffset }] },
          ]}
        >
          {expanded && bodyRenderable ? <View pointerEvents="none" style={styles.expandedGuide} /> : null}
          <Text
            onTextLayout={({ nativeEvent: { lines } }) => {
              if (layoutGenerationRef.current !== createdAt || !lines.length) return;
              // Android can clamp the container to five lines; native line metrics still describe all text.
              const lastLine = lines[lines.length - 1];
              const firstVisibleLine = lines[Math.max(0, lines.length - THINKING_PREVIEW_LINES)];
              const height = lastLine.y + lastLine.height;
              const nextPreviewHeight = height - firstVisibleLine.y;
              if (!Number.isFinite(height) || !Number.isFinite(nextPreviewHeight)
                || height <= 0 || nextPreviewHeight <= 0 || nextPreviewHeight > height) return;
              setContentLayout(previous => previous.createdAt === createdAt && previous.height === height
                && previous.previewHeight === nextPreviewHeight
                ? previous
                : { createdAt, height, previewHeight: nextPreviewHeight });
            }}
            style={styles.text}
          >
            {waitingForReasoningText || waitingForReasoningPreviewText ? '正在等待思考内容…' : reasoningText}
          </Text>
        </View>
        {previewOverflowing ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[aiLightColors.canvas, `${aiLightColors.canvas}00`]}
              style={[styles.previewFade, styles.previewFadeTop]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[`${aiLightColors.canvas}00`, aiLightColors.canvas]}
              style={[styles.previewFade, styles.previewFadeBottom]}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 36,
    paddingVertical: spacing[1],
  },
  label: {
    ...typography.textStyles.body,
    // Match the chat body's 15/24 typography rather than the smaller global body token.
    fontSize: 15,
    lineHeight: 24,
    color: aiLightColors.mutedReadable,
    fontWeight: '500',
  },
  duration: {
    ...typography.textStyles.body,
    fontSize: 15,
    lineHeight: 24,
    color: aiLightColors.muted,
    marginLeft: rhythm.microGap,
  },
  thinkingAnimatedBody: {
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  previewBody: {
    maxHeight: THINKING_PREVIEW_MAX_HEIGHT,
  },
  hiddenBody: {
    height: 0,
  },
  bodySpacing: {
    marginBottom: spacing[3],
  },
  bodyContent: {
    // Preserve the native text subtree and move its full measured height inside the compact viewport.
    flexShrink: 0,
    paddingLeft: spacing[3],
  },
  expandedGuide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: spacing[1],
    borderLeftColor: 'rgba(0, 0, 0, 0.18)',
    // A narrow reading guide, independent of text width when switching presentation.
    borderLeftWidth: 2,
  },
  previewFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: spacing[1.5],
  },
  previewFadeTop: {
    top: 0,
  },
  previewFadeBottom: {
    bottom: 0,
  },
  text: {
    ...typography.textStyles.caption,
    flexShrink: 0,
    color: aiLightColors.mutedReadable,
    includeFontPadding: false,
    lineHeight: THINKING_LINE_HEIGHT,
  },
  pressed: {
    opacity: 0.72,
  },
});
