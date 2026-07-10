import { StyleSheet, View } from 'react-native';

import type { AiStreamingTailContinuationGroup } from '../../ai/aiStreamingTailContinuation';
import { colors, radius } from '../../design/tokens';
import { AiMeasuredStreamBlock } from './AiMeasuredStreamBlock';

type AiStreamingTailContinuationBubbleProps = {
  bubbleWidth: number;
  group: AiStreamingTailContinuationGroup;
  onMeasured: (blockId: string, height: number) => void;
};

export function AiStreamingTailContinuationBubble({
  bubbleWidth,
  group,
  onMeasured,
}: AiStreamingTailContinuationBubbleProps) {
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantStack}>
        <View style={[styles.assistantBubble, group.lane === 'reasoning' && styles.reasoningBubble]}>
          {group.blocks.map((block) => (
            <AiMeasuredStreamBlock
              block={block}
              bubbleWidth={bubbleWidth}
              key={block.blockId}
              onMeasured={onMeasured}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  assistantRow: {
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  assistantStack: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '94%',
  },
  reasoningBubble: {
    backgroundColor: colors.background.soft,
  },
});
