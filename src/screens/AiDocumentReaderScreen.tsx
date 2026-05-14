import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AiDocxReader } from '../components/ai/AiDocxReader';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import { AiPdfReader } from '../components/ai/AiPdfReader';
import { AiTextReader } from '../components/ai/AiTextReader';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { readDocumentForReader } from '../ai/aiDocumentService';
import type { AiDocumentReaderLocator, AiReadableDocument } from '../ai/readers/readerTypes';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiDocumentReaderScreenProps {
  space: PixorySpace;
  documentId?: string;
  locator?: AiDocumentReaderLocator;
  title?: string;
  onBack: () => void;
}

export function AiDocumentReaderScreen({ space, documentId, locator, title, onBack }: AiDocumentReaderScreenProps) {
  const [readable, setReadable] = useState<AiReadableDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const displayTitle = readable?.document.title ?? title ?? '文档阅读';

  useEffect(() => {
    if (!documentId) {
      setReadable(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    void readDocumentForReader({ documentId, space })
      .then((nextReadable) => {
        if (isMounted) {
          setReadable(nextReadable);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取文档失败');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [documentId, space]);

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      errorMessage={errorMessage}
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle={readable ? `${readable.document.sourceType} · ${readable.document.parserStatus}` : space === 'personal' ? '私密空间' : '普通空间'}
      title={displayTitle}
    >
      {readable ? (
        <>
          <View style={styles.metaCard}>
            <Text style={styles.metaTitle}>{readable.document.originalFilename ?? readable.document.title}</Text>
            <Text style={styles.metaText}>
              {readable.document.mimeType ?? readable.document.sourceType} · {readable.document.fileSize ?? 0} bytes
            </Text>
            {locator ? <Text style={styles.metaText}>定位：{JSON.stringify(locator)}</Text> : null}
          </View>
          {renderReader(readable, locator)}
        </>
      ) : !loading && !errorMessage ? (
        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>没有可打开的文档</Text>
          <Text style={styles.metaText}>请从材料列表或引用来源进入文档阅读。</Text>
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

function renderReader(readable: AiReadableDocument, locator?: AiDocumentReaderLocator) {
  if (readable.document.sourceType === 'markdown') {
    return <AiMarkdownReader locator={locator} readable={readable} />;
  }
  if (readable.document.sourceType === 'docx') {
    return <AiDocxReader locator={locator} readable={readable} />;
  }
  if (readable.document.sourceType === 'pdf') {
    return <AiPdfReader locator={locator} readable={readable} />;
  }
  return <AiTextReader locator={locator} readable={readable} />;
}

const styles = StyleSheet.create({
  metaCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[4],
  },
  metaTitle: {
    ...typography.textStyles.bodyStrong,
  },
  metaText: {
    ...typography.textStyles.caption,
  },
});
