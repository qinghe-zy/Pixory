import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors, aiLightDisplayFont } from './aiLightTheme';

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
        if (trimmed.startsWith('>')) {
          return <Text key={`${index}-${trimmed}`} style={[styles.quote, highlighted && styles.highlighted]}>{trimmed.replace(/^>\s?/, '')}</Text>;
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
    gap: rhythm.cardContentGap,
  },
  heading: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontWeight: '400',
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 25,
  },
  quote: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    fontStyle: 'italic',
    lineHeight: 25,
    paddingLeft: spacing[2],
  },
  code: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.surface,
    color: aiLightColors.ink,
    fontFamily: typography.family.mono,
    lineHeight: 20,
    paddingVertical: spacing[1],
  },
  highlighted: {
    backgroundColor: aiLightColors.card,
  },
});
