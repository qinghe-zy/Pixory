import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { PrimaryButton } from '../PrimaryButton';
import { getPdfPageCount, renderPdfPageToFile } from '../../native/pixoryMediaModule';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiTextReader } from './AiTextReader';

interface AiPdfReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiPdfReader({ readable, locator }: AiPdfReaderProps) {
  const hasParsedText = readable.text.trim().length > 0;
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(Math.max(0, (locator?.page ?? 1) - 1));
  const [zoom, setZoom] = useState(1);
  const [renderedUri, setRenderedUri] = useState<string | null>(null);
  const [status, setStatus] = useState('正在准备 PDF...');
  const sourceUri = readable.document.localUri;

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
          setPageIndex((current) => Math.min(current, Math.max(0, count - 1)));
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

  useEffect(() => {
    let canceled = false;
    async function renderPage() {
      if (!sourceUri || !pageCount || !FileSystem.cacheDirectory) {
        return;
      }
      const width = Math.round(960 * zoom);
      const destinationUri = `${FileSystem.cacheDirectory}pixory-pdf-${readable.document.id}-${pageIndex}-${width}.png`;
      setStatus('正在渲染页面...');
      try {
        const result = await renderPdfPageToFile(sourceUri, pageIndex, destinationUri, width);
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
  }, [pageCount, pageIndex, readable.document.id, sourceUri, zoom]);

  return (
    <View style={styles.wrap}>
      {hasParsedText ? <AiTextReader locator={locator} readable={readable} /> : null}
      <View style={styles.pdfShell}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarButton}>
            <PrimaryButton disabled={pageIndex <= 0} label="上一页" onPress={() => setPageIndex((current) => Math.max(0, current - 1))} variant="outline" />
          </View>
          <Text style={styles.pageLabel}>{pageCount ? `${pageIndex + 1} / ${pageCount}` : 'PDF'}</Text>
          <View style={styles.toolbarButton}>
            <PrimaryButton disabled={!pageCount || pageIndex >= pageCount - 1} label="下一页" onPress={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))} variant="outline" />
          </View>
        </View>
        <View style={styles.toolbar}>
          <View style={styles.toolbarButton}>
            <PrimaryButton disabled={zoom <= 0.75} label="缩小" onPress={() => setZoom((current) => Math.max(0.75, Number((current - 0.25).toFixed(2))))} variant="ghost" />
          </View>
          <Text style={styles.pageLabel}>{Math.round(zoom * 100)}%</Text>
          <View style={styles.toolbarButton}>
            <PrimaryButton disabled={zoom >= 2} label="放大" onPress={() => setZoom((current) => Math.min(2, Number((current + 0.25).toFixed(2))))} variant="ghost" />
          </View>
        </View>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        {renderedUri ? <Image resizeMode="contain" source={{ uri: renderedUri }} style={styles.pageImage} /> : null}
        {!hasParsedText && readable.document.parserError ? <Text style={styles.error}>{readable.document.parserError}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.listCardGap,
    paddingTop: spacing[1],
  },
  pdfShell: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  pageLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    minWidth: 58,
    textAlign: 'center',
  },
  toolbarButton: {
    flex: 1,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  pageImage: {
    alignSelf: 'stretch',
    aspectRatio: 0.707,
    backgroundColor: colors.background.sunken,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  error: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
});
