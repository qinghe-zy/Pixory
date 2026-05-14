import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiTextReader } from './AiTextReader';

interface AiPdfReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiPdfReader({ readable, locator }: AiPdfReaderProps) {
  const hasParsedText = readable.text.trim().length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>PDF 阅读</Text>
        <Text style={styles.noticeText}>
          第一版未引入原生 PDF 渲染依赖。可提取文本的 PDF 会显示解析文本；扫描件或无文本 PDF 会保留材料记录并提示不可检索。
        </Text>
        {readable.document.parserError ? <Text style={styles.error}>{readable.document.parserError}</Text> : null}
      </View>
      {hasParsedText ? <AiTextReader locator={locator} readable={readable} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.listCardGap,
  },
  notice: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  noticeTitle: {
    ...typography.textStyles.bodyStrong,
  },
  noticeText: {
    ...typography.textStyles.caption,
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
});
