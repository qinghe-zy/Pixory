import { memo, useRef } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';

import type { AiStreamBlock } from '../../ai/aiStreamingBlockSplitter';
import { streamBlockHeightCache } from '../../ai/aiStreamingBlockSplitter';
import { AI_STREAMING_HEIGHT_RENDERER_VERSION, bucketFontScale, bucketStreamWidth, createStreamBlockHeightCacheKey, fastStringHash } from '../../ai/aiStreamingHeightCache';
import { spacing, typography } from '../../design/tokens';
import { AiMessageContent } from './AiMessageContent';
import { aiLightColors } from './aiLightTheme';

type AiMeasuredStreamBlockProps = {
  block: AiStreamBlock;
  bubbleWidth: number;
  onMeasured: (blockId: string, height: number) => void;
};

function AiMeasuredStreamBlockComponent({ block, bubbleWidth, onMeasured }: AiMeasuredStreamBlockProps) {
  const lastMeasuredHeightRef = useRef<number | null>(null);

  return (
    <View
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (lastMeasuredHeightRef.current === height) {
          return;
        }
        lastMeasuredHeightRef.current = height;
        onMeasured(block.blockId, height);

        const cacheKey = createStreamBlockHeightCacheKey({
          blockType: block.type,
          contentHash: fastStringHash(block.raw),
          fontScale: PixelRatio.getFontScale(),
          lane: block.lane,
          lineCount: Math.max(1, block.raw.split(/\r?\n/).length),
          rawLength: block.raw.length,
          width: bubbleWidth,
        });
        streamBlockHeightCache.set({
          blockType: block.type,
          fontScaleBucket: bucketFontScale(PixelRatio.getFontScale()),
          key: cacheKey,
          lineCount: Math.max(1, block.raw.split(/\r?\n/).length),
          measuredHeight: height,
          rawLength: block.raw.length,
          rendererVersion: AI_STREAMING_HEIGHT_RENDERER_VERSION,
          updatedAt: Date.now(),
          widthBucket: bucketStreamWidth(bubbleWidth),
        });
      }}
      style={styles.block}
    >
      {block.lane === 'reasoning' ? (
        <Text style={styles.thinkingText}>{block.raw}</Text>
      ) : (
        <AiMessageContent content={block.raw} streaming={true} />
      )}
    </View>
  );
}

export const AiMeasuredStreamBlock = memo(AiMeasuredStreamBlockComponent);

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
  thinkingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});
