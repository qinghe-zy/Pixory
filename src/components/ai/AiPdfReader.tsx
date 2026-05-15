import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { getPdfPageCount, renderPdfPageToFile } from '../../native/pixoryMediaModule';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';

interface AiPdfReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

interface PdfPageImageProps {
  documentId: string;
  pageIndex: number;
  sourceUri: string;
  width: number;
}

export function AiPdfReader({ readable }: AiPdfReaderProps) {
  const { width } = useWindowDimensions();
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState('正在准备 PDF...');
  const sourceUri = readable.document.localUri;
  const pageWidth = Math.max(260, Math.min(width - spacing[4] * 2, 980));
  const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index), [pageCount]);
  useEffect(() => {
    let canceled = false;
    async function loadPageCount() {
      if (!sourceUri) {
        setStatus('PDF 本地文件不可用。');
        return;
      }
      try {
        const count = await getPdfPageCount(sourceUri);
        if (!canceled) {
          setPageCount(count);
          setStatus('');
        }
      } catch (error) {
        if (!canceled) {
          setStatus(error instanceof Error ? error.message : 'PDF 页面读取失败');
        }
      }
    }
    void loadPageCount();
    return () => {
      canceled = true;
    };
  }, [sourceUri]);

  return (
    <FlatList
      contentContainerStyle={styles.pageList}
      data={pages}
      keyExtractor={(pageIndex) => `${readable.document.id}-${pageIndex}`}
      ListEmptyComponent={status ? <Text style={styles.status}>{status}</Text> : null}
      renderItem={({ item }) => (
        <PdfPageImage
          documentId={readable.document.id}
          pageIndex={item}
          sourceUri={sourceUri ?? ''}
          width={pageWidth}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.wrap}
    />
  );
}

function PdfPageImage({ documentId, pageIndex, sourceUri, width }: PdfPageImageProps) {
  const [renderedUri, setRenderedUri] = useState<string | null>(null);
  const [status, setStatus] = useState('正在渲染...');

  useEffect(() => {
    let canceled = false;
    async function renderPage() {
      if (!sourceUri || !FileSystem.cacheDirectory) {
        setStatus('页面不可用');
        return;
      }
      const renderWidth = Math.round(width * 1.5);
      const destinationUri = `${FileSystem.cacheDirectory}pixory-pdf-${documentId}-${pageIndex}-${renderWidth}.png`;
      try {
        const result = await renderPdfPageToFile(sourceUri, pageIndex, destinationUri, renderWidth);
        if (!canceled) {
          setRenderedUri(result.uri);
          setStatus('');
        }
      } catch (error) {
        if (!canceled) {
          setRenderedUri(null);
          setStatus(error instanceof Error ? error.message : 'PDF 页面渲染失败');
        }
      }
    }
    void renderPage();
    return () => {
      canceled = true;
    };
  }, [documentId, pageIndex, sourceUri, width]);

  return (
    <View style={[styles.pageFrame, { width }]}>
      {renderedUri ? (
        <Image resizeMode="contain" source={{ uri: renderedUri }} style={styles.pageImage} />
      ) : (
        <View style={styles.pagePlaceholder}>
          <Text style={styles.status}>{status}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  pageList: {
    alignItems: 'center',
    gap: rhythm.listCardGap,
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  pageFrame: {
    alignItems: 'center',
    gap: rhythm.microGap,
  },
  pageImage: {
    aspectRatio: 0.707,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  pagePlaceholder: {
    alignItems: 'center',
    aspectRatio: 0.707,
    backgroundColor: colors.background.sunken,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    width: '100%',
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    padding: spacing[4],
    textAlign: 'center',
  },
});
