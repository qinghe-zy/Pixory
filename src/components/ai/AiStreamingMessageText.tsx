import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { AiMessageStatus } from '../../ai/types';
import type { AiStreamingMessageIdentity } from '../../ai/aiStreamingMessageStore';
import { useStreamingMessageReasoningSnapshot, useStreamingMessageTextSnapshot } from '../../ai/aiStreamingMessageStore';
import { aiLightColors } from './aiLightTheme';
import { AiMessageContent } from './AiMessageContent';
import { AiThinkingBlock } from './AiThinkingBlock';
import { AiTypingIndicator } from './AiTypingIndicator';

interface AiStreamingMessageTextProps {
  identity: AiStreamingMessageIdentity;
  initialContent: string;
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
  return <Text style={styles.inlineStreamingCursor}>▍</Text>;
}

function AiStreamingMessageTextComponent({ identity, initialContent }: AiStreamingMessageTextProps) {
  const snapshot = useStreamingMessageTextSnapshot(identity);
  const content = snapshot.hasSnapshot ? snapshot.content : initialContent;
  if (!content.trim()) {
    return <AiTypingIndicator />;
  }
  return <AiMessageContent content={content} streaming trailingInline={<InlineStreamingCursor />} />;
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
  const reasoningText = snapshot.hasSnapshot ? snapshot.reasoningText : initialReasoningText;
  const streamingStatus = snapshot.hasSnapshot ? snapshot.status : status;
  const hasAnswer = Boolean(snapshot.hasSnapshot ? snapshot.content : initialContent);
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
