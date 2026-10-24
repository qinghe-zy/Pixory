import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const THINKING_LINE_HEIGHT = 23;
const THINKING_PREVIEW_LINES = 7;
const THINKING_PREVIEW_MAX_HEIGHT = THINKING_LINE_HEIGHT * THINKING_PREVIEW_LINES;
const THINKING_FADE_HEIGHT = 24;
const PREVIEW_WINDOW_CHAR_THRESHOLD = 800;
const PREVIEW_WINDOW_TAIL_CHARS = 500;
const PREVIEW_WINDOW_STEP_CHARS = 300;

function getPreviewTailText(fullText: string): { text: string; hasPrecedingText: boolean } {
  if (!fullText || fullText.length <= PREVIEW_WINDOW_CHAR_THRESHOLD) {
    return { text: fullText ?? '', hasPrecedingText: false };
  }
  const rawStart = fullText.length - PREVIEW_WINDOW_TAIL_CHARS;
  const sliceStart = Math.max(
    1,
    Math.floor(rawStart / PREVIEW_WINDOW_STEP_CHARS) * PREVIEW_WINDOW_STEP_CHARS,
  );
  const newlineIndex = fullText.indexOf('\n', sliceStart);
  let safeStart = newlineIndex !== -1 && newlineIndex < sliceStart + 80
    ? newlineIndex + 1
    : sliceStart;
  if (safeStart > 0 && safeStart < fullText.length) {
    const code = fullText.charCodeAt(safeStart);
    if (code >= 0xdc00 && code <= 0xdfff) {
      safeStart += 1;
    }
  }
  return {
    text: fullText.slice(safeStart),
    hasPrecedingText: true,
  };
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
  const [contentLayout, setContentLayout] = useState({
    createdAt,
    height: 0,
    isTailSlice: false,
    lineCount: 0,
    previewHeight: THINKING_PREVIEW_MAX_HEIGHT,
  });
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
  const previewTail = useMemo(
    () => (previewVisible && reasoningText ? getPreviewTailText(reasoningText) : null),
    [previewVisible, reasoningText]
  );
  const isTailSlice = previewVisible && Boolean(previewTail?.hasPrecedingText);
  const displayText = previewVisible && previewTail ? previewTail.text : reasoningText;

  // Single-stage expansion lock: when user expands while streaming a long tail slice,
  // hold container locked at previewHeight until onTextLayout measures the full reasoningText.
  const waitingForFullTextLayout =
    expanded &&
    Boolean(reasoningText && reasoningText.length > PREVIEW_WINDOW_CHAR_THRESHOLD) &&
    contentLayout.createdAt === createdAt &&
    contentLayout.isTailSlice;

  const clampToPreviewViewport = previewVisible || waitingForFullTextLayout;
  const contentHeight = contentLayout.createdAt === createdAt ? contentLayout.height : 0;
  const previewHeight = contentLayout.createdAt === createdAt ? contentLayout.previewHeight : THINKING_PREVIEW_MAX_HEIGHT;
  const previewOffset = clampToPreviewViewport ? Math.max(0, contentHeight - previewHeight) : 0;
  const topFadeVisible = previewVisible && (previewOffset > 0 || Boolean(previewTail?.hasPrecedingText));
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
    const layoutSettled = !waitingForFullTextLayout && contentLayout.height > 0;
    // Fabric measures and corrects in the layout phase, before displaying an intermediate frame.
    headerRef.current?.measureInWindow((_x, y) => {
      if (!headerAnchorRef.current || anchor.revision !== toggleRevisionRef.current) return;
      // Inverted lists grow upward; compensate only the measured shift of this header.
      const delta = anchor.y - y;
      if (Number.isFinite(delta) && Math.abs(delta) >= 1) {
        onHeaderAnchorShift?.(delta);
        anchor.y = y;
        if (!expanded || layoutSettled) {
          headerAnchorRef.current = null;
        }
      } else if (!expanded) {
        headerAnchorRef.current = null;
      }
    });
  }, [expanded, contentLayout.height, waitingForFullTextLayout, onHeaderAnchorShift]);

  const handleBodyContentLayout = () => {
    const anchor = headerAnchorRef.current;
    if (!anchor || !expanded || waitingForFullTextLayout || contentLayout.height <= 0) return;
    headerRef.current?.measureInWindow((_x, y) => {
      if (!headerAnchorRef.current || anchor.revision !== toggleRevisionRef.current) return;
      const delta = anchor.y - y;
      if (Number.isFinite(delta) && Math.abs(delta) >= 1) {
        onHeaderAnchorShift?.(delta);
        anchor.y = y;
      }
      headerAnchorRef.current = null;
    });
  };

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
        <Ionicons color={aiLightColors.mutedReadable} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      <View
        accessibilityElementsHidden={!bodyRenderable}
        importantForAccessibility={bodyRenderable ? 'auto' : 'no-hide-descendants'}
        pointerEvents={bodyRenderable ? 'auto' : 'none'}
        style={[
          styles.thinkingAnimatedBody,
          !bodyRenderable && styles.hiddenBody,
          clampToPreviewViewport && [styles.previewBody, { maxHeight: previewHeight }],
          bodyRenderable && styles.bodySpacing,
        ]}
      >
        <View
          collapsable={false}
          onLayout={handleBodyContentLayout}
          style={[
            styles.bodyContent,
            clampToPreviewViewport && contentHeight > 0 && { height: contentHeight },
            { transform: [{ translateY: -previewOffset }] },
          ]}
        >
          {bodyRenderable ? <View pointerEvents="none" style={styles.verticalGuide} /> : null}
          <Text
            onTextLayout={({ nativeEvent: { lines } }) => {
              if (layoutGenerationRef.current !== createdAt || !lines.length) return;
              // Android can clamp the container to seven lines; native line metrics still describe all text.
              const lastLine = lines[lines.length - 1];
              const firstVisibleLine = lines[Math.max(0, lines.length - THINKING_PREVIEW_LINES)];
              const height = Math.round(lastLine.y + lastLine.height);
              const lineCount = lines.length;
              let nextPreviewHeight = Math.round(height - firstVisibleLine.y);
              if (!Number.isFinite(height) || !Number.isFinite(nextPreviewHeight)
                || height <= 0 || nextPreviewHeight <= 0 || nextPreviewHeight > height) return;
              setContentLayout(previous => {
                let resolvedPreviewHeight = nextPreviewHeight;
                if (
                  previous.createdAt === createdAt &&
                  previous.lineCount >= THINKING_PREVIEW_LINES &&
                  lineCount >= THINKING_PREVIEW_LINES &&
                  Math.abs(previous.previewHeight - nextPreviewHeight) <= 4
                ) {
                  resolvedPreviewHeight = previous.previewHeight;
                }
                if (
                  previous.createdAt === createdAt &&
                  Math.abs(previous.height - height) < 1 &&
                  previous.previewHeight === resolvedPreviewHeight &&
                  previous.isTailSlice === isTailSlice
                ) {
                  return previous;
                }
                return {
                  createdAt,
                  height,
                  isTailSlice,
                  lineCount,
                  previewHeight: resolvedPreviewHeight,
                };
              });
            }}
            style={styles.text}
          >
            {waitingForReasoningText || waitingForReasoningPreviewText ? '正在等待思考内容…' : displayText}
          </Text>
        </View>
        {topFadeVisible ? (
          <LinearGradient
            pointerEvents="none"
            colors={['#FFFFFF', 'rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0)']}
            style={styles.previewFadeTop}
          />
        ) : null}
        {previewOverflowing ? (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']}
            style={styles.previewFadeBottom}
          />
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
    paddingLeft: 14,
  },
  verticalGuide: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderLeftColor: 'rgba(0, 0, 0, 0.12)',
    // A narrow reading guide, independent of text width when switching presentation.
    borderLeftWidth: 2,
  },
  previewFadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: THINKING_FADE_HEIGHT,
    zIndex: 2,
  },
  previewFadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: THINKING_FADE_HEIGHT,
    zIndex: 2,
  },
  text: {
    ...typography.textStyles.body,
    fontSize: 14,
    lineHeight: THINKING_LINE_HEIGHT,
    color: aiLightColors.mutedReadable,
    includeFontPadding: false,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
