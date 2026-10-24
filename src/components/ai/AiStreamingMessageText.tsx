import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AiMessageStatus } from '../../ai/types';
import type { AiStreamingMessageIdentity } from '../../ai/aiStreamingMessageStore';
import { useStreamingMessageReasoningSnapshot, useStreamingMessageTextSnapshot } from '../../ai/aiStreamingMessageStore';
import { useSmoothStreamingText } from '../../hooks/useSmoothStreamingText';
import { useContinuousStreamPacingB } from '../../hooks/useContinuousStreamPacingB';
import { useThinkingSmoothText } from '../../hooks/useThinkingSmoothText';
import { getCachedAiStreamingPacingMode } from '../../services/aiChatPreferences';
import { aiLightColors } from './aiLightTheme';
import { AiMessageContent, prewarmMarkdownContent } from './AiMessageContent';
import { AiStreamingHeightAbsorberB } from './AiStreamingHeightAbsorberB';
import { AiThinkingBlock } from './AiThinkingBlock';
import { AiTypingIndicator } from './AiTypingIndicator';

interface AiStreamingMessageTextProps {
  identity: AiStreamingMessageIdentity;
  initialContent: string;
  isSandboxModalOpen?: boolean;
  messageId?: string;
  onOpenSandbox?: (params: {
    code: string;
    language?: string;
    title?: string;
    initialTab?: 'preview' | 'code';
    messageId?: string;
  }) => void;
}

interface AiStreamingReasoningTextProps {
  thinkingEndedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  defaultExpanded?: boolean;
  identity: AiStreamingMessageIdentity;
  initialReasoningText?: string | null;
  initialContent?: string;
  onExpandedChange?: (expanded: boolean) => void;
  onHeaderAnchorShift?: (offsetDelta: number) => void;
  status: AiMessageStatus;
  thinkingActive?: boolean;
}

function InlineStreamingCursor() {
  if (getCachedAiStreamingPacingMode() === 'typewriter') {
    return <Text style={styles.inlineStreamingCursor}>▍</Text>;
  }
  return null;
}

function AiStreamingMessageTextComponent({
  identity,
  initialContent,
  isSandboxModalOpen,
  messageId,
  onOpenSandbox,
}: AiStreamingMessageTextProps) {
  const snapshot = useStreamingMessageTextSnapshot(identity);
  const rawContent = snapshot.hasSnapshot ? snapshot.content : initialContent;
  const isStreaming = snapshot.hasSnapshot ? snapshot.status === 'generating' : false;

  const isContinuous = getCachedAiStreamingPacingMode() === 'continuous';
  // Option A: 100% original typewriter hook, idle when in continuous mode
  const typewriterContent = useSmoothStreamingText(rawContent, !isContinuous && isStreaming);
  // Option B: Dedicated continuous kinetic smoother, idle when in typewriter mode
  const continuousContent = useContinuousStreamPacingB(rawContent, isContinuous && isStreaming);

  const content = isContinuous ? continuousContent : typewriterContent;

  useEffect(() => {
    if (rawContent && rawContent.length > 20) {
      const timer = setTimeout(() => {
        prewarmMarkdownContent(rawContent);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [rawContent, isStreaming]);

  if (!content.trim()) {
    return <AiTypingIndicator />;
  }

  return (
    <AiStreamingHeightAbsorberB enabled={isContinuous} isStreaming={isStreaming}>
      <AiMessageContent content={content} streaming
        isSandboxModalOpen={isSandboxModalOpen}
        messageId={messageId}
        onOpenSandbox={onOpenSandbox}
        trailingInline={<InlineStreamingCursor />}
      />
    </AiStreamingHeightAbsorberB>
  );
}

export const AiStreamingMessageText = memo(AiStreamingMessageTextComponent);

function AiStreamingReasoningTextComponent({
  thinkingEndedAt,
  completedAt,
  createdAt,
  defaultExpanded = false,
  identity,
  initialReasoningText = null,
  initialContent = '',
  onExpandedChange,
  onHeaderAnchorShift,
  status,
  thinkingActive,
}: AiStreamingReasoningTextProps) {
  const snapshot = useStreamingMessageReasoningSnapshot(identity);
  const rawReasoningText = snapshot.hasSnapshot ? snapshot.reasoningText : initialReasoningText;
  const streamingStatus = snapshot.hasSnapshot ? snapshot.status : status;
  const hasAnswer = Boolean(snapshot.hasSnapshot ? snapshot.content : initialContent);
  const isReasoningStreaming =
    streamingStatus === 'generating' &&
    !hasAnswer &&
    !snapshot.thinkingEndedAt &&
    !thinkingEndedAt &&
    (thinkingActive ?? true);
  const reasoningText = useThinkingSmoothText(rawReasoningText ?? '', isReasoningStreaming);
  return (
    <AiThinkingBlock
      thinkingEndedAt={snapshot.thinkingEndedAt ?? thinkingEndedAt}
      completedAt={completedAt}
      createdAt={createdAt}
      defaultExpanded={defaultExpanded}
      onExpandedChange={onExpandedChange}
      onHeaderAnchorShift={onHeaderAnchorShift}
      reasoningText={reasoningText}
      status={streamingStatus}
      thinkingActive={hasAnswer ? false : thinkingActive}
    />
  );
}

export const AiStreamingReasoningText = memo(AiStreamingReasoningTextComponent);

const styles = StyleSheet.create({
  inlineStreamingCursor: {
    color: aiLightColors.primaryActive,
    fontSize: 15,
    lineHeight: 24,
  },
});
