import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

import type { AiMessageStatus } from '../../ai/types';
import type { AiStreamingMessageIdentity } from '../../ai/aiStreamingMessageStore';
import { useStreamingMessageReasoningSnapshot, useStreamingMessageTextSnapshot } from '../../ai/aiStreamingMessageStore';
import { typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { AiThinkingBlock } from './AiThinkingBlock';

interface AiStreamingMessageTextProps {
  identity: AiStreamingMessageIdentity;
  initialContent: string;
}

interface AiStreamingReasoningTextProps {
  completedAt?: string | null;
  createdAt: string;
  defaultExpanded?: boolean;
  identity: AiStreamingMessageIdentity;
  initialReasoningText?: string | null;
  onExpandedChange?: (expanded: boolean) => void;
  status: AiMessageStatus;
}

function InlineStreamingCursor() {
  return <Text style={styles.inlineStreamingCursor}>▍</Text>;
}

function AiStreamingMessageTextComponent({ identity, initialContent }: AiStreamingMessageTextProps) {
  const snapshot = useStreamingMessageTextSnapshot(identity);
  const content = snapshot.hasSnapshot ? snapshot.content : initialContent;
  return (
    <Text selectable={false} style={[styles.body, styles.assistantText]}>
      {content}
      {content.trim() ? <InlineStreamingCursor /> : null}
    </Text>
  );
}

export const AiStreamingMessageText = memo(AiStreamingMessageTextComponent);

function AiStreamingReasoningTextComponent({
  completedAt,
  createdAt,
  defaultExpanded = false,
  identity,
  initialReasoningText = null,
  onExpandedChange,
  status,
}: AiStreamingReasoningTextProps) {
  const snapshot = useStreamingMessageReasoningSnapshot(identity);
  const reasoningText = snapshot.hasSnapshot ? snapshot.reasoningText : initialReasoningText;
  const streamingStatus = snapshot.hasSnapshot ? snapshot.status : status;
  return (
    <AiThinkingBlock
      completedAt={completedAt}
      createdAt={createdAt}
      defaultExpanded={defaultExpanded}
      onExpandedChange={onExpandedChange}
      reasoningText={reasoningText}
      status={streamingStatus}
    />
  );
}

export const AiStreamingReasoningText = memo(AiStreamingReasoningTextComponent);

const styles = StyleSheet.create({
  assistantText: {
    color: aiLightColors.ink,
  },
  body: {
    ...typography.textStyles.body,
    lineHeight: 22,
  },
  inlineStreamingCursor: {
    color: aiLightColors.coralActive,
    fontSize: typography.size.body,
    lineHeight: 22,
  },
});
