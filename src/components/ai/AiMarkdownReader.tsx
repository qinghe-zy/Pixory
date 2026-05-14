import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';

interface AiMarkdownReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiMarkdownReader({ readable, locator }: AiMarkdownReaderProps) {
  const lines = (readable.text || '暂无可阅读文本。').split('\n');
  const targetParagraph = locator?.paragraph;
  let paragraphIndex = 0;

  return (
    <View style={styles.wrap}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return null;
        }
        paragraphIndex += 1;
        const highlighted = paragraphIndex === targetParagraph;
        if (trimmed.startsWith('#')) {
          return <Text key={`${index}-${trimmed}`} style={[styles.heading, highlighted && styles.highlighted]}>{trimmed.replace(/^#+\s*/, '')}</Text>;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return <Text key={`${index}-${trimmed}`} style={[styles.body, highlighted && styles.highlighted]}>• {trimmed.slice(2)}</Text>;
        }
        if (trimmed.startsWith('```')) {
          return <Text key={`${index}-${trimmed}`} style={[styles.code, highlighted && styles.highlighted]}>{trimmed}</Text>;
        }
        return <Text key={`${index}-${trimmed}`} style={[styles.body, highlighted && styles.highlighted]}>{trimmed}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  heading: {
    ...typography.textStyles.sectionTitle,
  },
  body: {
    ...typography.textStyles.body,
  },
  code: {
    ...typography.textStyles.caption,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    fontFamily: typography.family.mono,
    padding: spacing[2],
  },
  highlighted: {
    backgroundColor: colors.background.tag,
  },
});
