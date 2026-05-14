import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { colors, rhythm, spacing, typography } from '../../design/tokens';
import { AiTextReader } from './AiTextReader';

interface AiPdfReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiPdfReader({ readable, locator }: AiPdfReaderProps) {
  const hasParsedText = readable.text.trim().length > 0;

  return (
    <View style={styles.wrap}>
      {hasParsedText ? <AiTextReader locator={locator} readable={readable} /> : null}
      {!hasParsedText && readable.document.parserError ? <Text style={styles.error}>{readable.document.parserError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.listCardGap,
    paddingTop: spacing[1],
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
});
