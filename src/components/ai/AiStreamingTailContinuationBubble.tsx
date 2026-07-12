import { StyleSheet, View } from 'react-native';

import type { AiStreamingTailContinuationGroup } from '../../ai/aiStreamingTailContinuation';
import { colors, radius, rhythm, spacing } from '../../design/tokens';
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
  if (group.lane === 'reasoning') {
    return (
      <View style={styles.reasoningRow}>
        {group.blocks.map((block) => (
          <AiMeasuredStreamBlock
            block={block}
            bubbleWidth={bubbleWidth}
            insetMode="thinking"
            key={block.blockId}
            onMeasured={onMeasured}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantStack}>
        <View style={styles.assistantBubble}>
          {group.blocks.map((block, index) => (
            <AiMeasuredStreamBlock
              block={block}
              bubbleWidth={bubbleWidth}
              key={block.blockId}
              onMeasured={onMeasured}
              verticalInset={
                group.blocks.length === 1
                  ? 'both'
                  : index === 0
                    ? 'top'
                    : index === group.blocks.length - 1
                      ? 'bottom'
                      : 'none'
              }
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: 'stretch',
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
    width: '100%',
  },
  assistantStack: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '94%',
    width: '94%',
  },
  reasoningRow: {
    alignSelf: 'flex-start',
    marginTop: -rhythm.listCardGap,
    paddingHorizontal: spacing[1],
    width: '94%',
  },
});
