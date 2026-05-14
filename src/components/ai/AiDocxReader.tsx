import { StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiTextReader } from './AiTextReader';

interface AiDocxReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiDocxReader({ readable, locator }: AiDocxReaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>DOCX 文本阅读</Text>
        <Text style={styles.noticeText}>复杂分页、图片和批注不会在第一版复现；这里展示解析出的正文文本并尽量定位段落。</Text>
      </View>
      <AiTextReader locator={locator} readable={readable} />
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
});
