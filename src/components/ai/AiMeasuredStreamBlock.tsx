import { memo, useEffect, useRef } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';

import type { AiStreamBlock } from '../../ai/aiStreamingBlockSplitter';
import { streamBlockHeightCache } from '../../ai/aiStreamingBlockSplitter';
import { AI_STREAMING_HEIGHT_RENDERER_VERSION, bucketFontScale, bucketStreamWidth, createStreamBlockHeightCacheKey, fastStringHash } from '../../ai/aiStreamingHeightCache';
import { streamingTailPerfDebug } from '../../ai/aiStreamingPerfDebug';
import { spacing, typography } from '../../design/tokens';
import { AiMessageContent } from './AiMessageContent';
import { aiLightColors } from './aiLightTheme';

const MEASUREMENT_EPSILON_DP = 1;
const SUPPRESSED_MEASUREMENT_RECONCILE_DP = 4;

type AiMeasuredStreamBlockProps = {
  block: AiStreamBlock;
  bubbleWidth: number;
  onMeasured: (blockId: string, height: number) => void;
};

function AiMeasuredStreamBlockComponent({ block, bubbleWidth, onMeasured }: AiMeasuredStreamBlockProps) {
  const lastMeasuredHeightRef = useRef<number | null>(null);
  const suppressedMeasurementDeltaRef = useRef(0);

  useEffect(() => {
    streamingTailPerfDebug.recordTailReplayBlockMounted({
      blockId: block.blockId,
      finalized: block.finalized,
    });
    streamingTailPerfDebug.recordTailReplayFirstTextVisible({
      blockId: block.blockId,
    });
  }, [block.blockId]);

  return (
    <View style={styles.reservedBlock}>
      <View
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          const previousHeight = lastMeasuredHeightRef.current;
          if (previousHeight !== null) {
            const delta = height - previousHeight;
            if (Math.abs(delta) <= MEASUREMENT_EPSILON_DP) {
              suppressedMeasurementDeltaRef.current += delta;
              if (
                Math.abs(suppressedMeasurementDeltaRef.current) <
                SUPPRESSED_MEASUREMENT_RECONCILE_DP
              ) {
                return;
              }
            }
          }
          if (previousHeight === height) {
            return;
          }
          suppressedMeasurementDeltaRef.current = 0;
          lastMeasuredHeightRef.current = height;
          onMeasured(block.blockId, height);
          streamingTailPerfDebug.recordTailReplayBlockMeasured({
            blockId: block.blockId,
            height,
          });
          streamingTailPerfDebug.recordTailReplayMeasurementDiff({
            blockId: block.blockId,
            diff: height - block.reservedHeight,
          });

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
          // Detached replay intentionally keeps the lightweight streaming renderer path.
          <AiMessageContent content={block.raw} streaming={true} />
        )}
      </View>
    </View>
  );
}

export const AiMeasuredStreamBlock = memo(AiMeasuredStreamBlockComponent);

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
  reservedBlock: {
    width: '100%',
  },
  thinkingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});
