import { memo, useCallback, useEffect, useRef } from 'react';
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
  insetMode?: 'bubble' | 'thinking';
  onMeasured: (blockId: string, height: number) => void;
  verticalInset?: AiMeasuredStreamBlockVerticalInset;
};

type AiMeasuredStreamBlockVerticalInset =
  | 'none'
  | 'top'
  | 'bottom'
  | 'both';

function AiMeasuredStreamBlockComponent({
  block,
  bubbleWidth,
  insetMode = 'bubble',
  onMeasured,
  verticalInset = 'both',
}: AiMeasuredStreamBlockProps) {
  const lastMeasuredHeightRef = useRef<number | null>(null);
  const measuredViewRef = useRef<View>(null);
  const measurementSignatureRef = useRef<string | null>(null);
  const suppressedMeasurementDeltaRef = useRef(0);
  const measurementSignature = `${block.blockId}:${block.finalized}:${block.raw}:${insetMode}:${verticalInset}`;

  const reportMeasuredHeight = useCallback((height: number) => {
    const signatureChanged =
      measurementSignatureRef.current !== measurementSignature;
    const previousHeight = signatureChanged
      ? null
      : lastMeasuredHeightRef.current;
    if (signatureChanged) {
      measurementSignatureRef.current = measurementSignature;
      suppressedMeasurementDeltaRef.current = 0;
    }
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
  }, [block, bubbleWidth, measurementSignature, onMeasured]);

  useEffect(() => {
    streamingTailPerfDebug.recordTailReplayBlockMounted({
      blockId: block.blockId,
      finalized: block.finalized,
    });
    streamingTailPerfDebug.recordTailReplayFirstTextVisible({
      blockId: block.blockId,
    });
  }, [block.blockId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      measuredViewRef.current?.measure((_x, _y, _width, height) => {
        reportMeasuredHeight(height);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [measurementSignature, reportMeasuredHeight]);

  return (
    <View style={styles.reservedBlock}>
      <View
        onLayout={(event) => reportMeasuredHeight(event.nativeEvent.layout.height)}
        ref={measuredViewRef}
        style={[
          styles.block,
          insetMode === 'thinking' && styles.thinkingBlock,
          insetMode === 'bubble' &&
            (verticalInset === 'top' || verticalInset === 'both') &&
            styles.blockTopInset,
          insetMode === 'bubble' &&
            (verticalInset === 'bottom' || verticalInset === 'both') &&
            styles.blockBottomInset,
        ]}
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
    paddingHorizontal: spacing[3],
  },
  blockBottomInset: {
    paddingBottom: spacing[3],
  },
  blockTopInset: {
    paddingTop: spacing[3],
  },
  reservedBlock: {
    width: '100%',
  },
  thinkingBlock: {
    paddingHorizontal: 0,
    paddingVertical: spacing[1],
  },
  thinkingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});
