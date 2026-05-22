import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiTextReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiTextReader({ readable, locator }: AiTextReaderProps) {
  const targetChunkId = locator?.chunkId;
  const chunks = readable.chunks.length
    ? readable.chunks
    : [{ id: 'document-text', text: readable.text || '暂无可阅读文本。', chunkIndex: 0 }];

  return (
    <View style={styles.wrap}>
      {chunks.map((chunk) => {
        const highlighted = 'id' in chunk && chunk.id === targetChunkId;
        return (
          <Text key={chunk.id} style={[styles.paragraph, highlighted && styles.highlighted]}>
            {chunk.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.listCardGap,
  },
  paragraph: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[3],
  },
  highlighted: {
    borderColor: aiLightColors.coral,
  },
});
