import { Pressable, StyleSheet, View } from 'react-native';

import type { AiStreamingTailContinuationGroup } from '../../ai/aiStreamingTailContinuation';
import { rhythm } from '../../design/tokens';
import { AiMeasuredStreamBlock } from './AiMeasuredStreamBlock';

type AiStreamingTailContinuationBubbleProps = {
  bubbleWidth: number;
  group: AiStreamingTailContinuationGroup;
  onLongPress?: (pageX: number, pageY: number) => void;
  onMeasured: (blockId: string, height: number) => void;
};

export function AiStreamingTailContinuationBubble({
  bubbleWidth,
  group,
  onLongPress,
  onMeasured,
}: AiStreamingTailContinuationBubbleProps) {
  if (group.lane === 'reasoning') {
    return (
      <Pressable
        accessibilityHint={onLongPress ? '长按打开消息操作' : undefined}
        delayLongPress={500}
        onLongPress={
          onLongPress
            ? (event) =>
                onLongPress(
                  event.nativeEvent.pageX,
                  event.nativeEvent.pageY,
                )
            : undefined
        }
        style={styles.reasoningRow}
      >
        {group.blocks.map((block) => (
          <AiMeasuredStreamBlock
            block={block}
            bubbleWidth={bubbleWidth}
            insetMode="thinking"
            key={block.blockId}
            onMeasured={onMeasured}
          />
        ))}
      </Pressable>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantStack}>
        <Pressable
          accessibilityHint={onLongPress ? '长按打开消息操作' : undefined}
          delayLongPress={500}
          onLongPress={
            onLongPress
              ? (event) =>
                  onLongPress(
                    event.nativeEvent.pageX,
                    event.nativeEvent.pageY,
                  )
              : undefined
          }
          style={styles.assistantBubble}
        >
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
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    width: '100%',
  },
  assistantRow: {
    alignItems: 'flex-start',
    maxWidth: '100%',
    width: '100%',
  },
  assistantStack: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    maxWidth: '100%',
    width: '100%',
  },
  reasoningRow: {
    alignSelf: 'flex-start',
    marginTop: -rhythm.listCardGap,
    paddingHorizontal: 0,
    width: '100%',
  },
});
