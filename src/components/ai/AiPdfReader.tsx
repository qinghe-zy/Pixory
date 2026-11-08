import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  PixelRatio,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import type { AiDocumentReaderLocator, AiReadableDocument } from '../../ai/readers/readerTypes';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { getPdfPageCount, renderPdfPageToFile } from '../../native/pixoryMediaModule';
import { safeShareFileAsync } from '../../services/export/exportDocumentService';
import { aiLightColors } from './aiLightTheme';

export interface AiPdfReaderHandle {
  scrollToPage: (pageIndex: number) => void;
}

export interface AiPdfReaderProps {
  readable?: AiReadableDocument;
  sourceUri?: string;
  documentId?: string;
  locator?: AiDocumentReaderLocator;
  onPageCountLoaded?: (count: number) => void;
  onProgressChange?: (percent: number) => void;
  style?: StyleProp<ViewStyle>;
}

export const AiPdfReader = React.forwardRef<AiPdfReaderHandle, AiPdfReaderProps>(
  (
    {
      readable,
      sourceUri: explicitUri,
      documentId: explicitDocId,
      locator,
      onPageCountLoaded,
      onProgressChange,
      style,
    },
    ref
  ) => {
    const flatListRef = useRef<FlatList>(null);
    const { width } = useWindowDimensions();
    const [pageCount, setPageCount] = useState(0);
    const [status, setStatus] = useState('正在准备 PDF...');

    const resolvedUri = explicitUri ?? readable?.document.localUri ?? '';
    const resolvedDocId = explicitDocId ?? readable?.document.id ?? 'pdf-doc';
    const [activeUri, setActiveUri] = useState<string>(resolvedUri);
    const [reloadCounter, setReloadCounter] = useState(0);

    const pageWidth = Math.min(width, 1080);
    const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index), [pageCount]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToPage: (pageIndex: number) => {
          if (flatListRef.current && pageIndex >= 0 && pageIndex < pageCount) {
            flatListRef.current.scrollToIndex({ index: pageIndex, animated: true });
          }
        },
      }),
      [pageCount]
    );

    useEffect(() => {
      let canceled = false;
      async function loadPageCount() {
        if (!resolvedUri) {
          setStatus('PDF 本地文件不可用。');
          return;
        }
        let targetUri = activeUri || resolvedUri;
        try {
          const info = await FileSystem.getInfoAsync(targetUri);
          if (!info.exists || (typeof info.size === 'number' && info.size === 0)) {
            if (readable?.document.localUri && readable.document.localUri !== targetUri) {
              const fallbackInfo = await FileSystem.getInfoAsync(readable.document.localUri);
              if (fallbackInfo.exists && typeof fallbackInfo.size === 'number' && fallbackInfo.size > 0) {
                targetUri = readable.document.localUri;
                setActiveUri(targetUri);
              } else {
                throw new Error('PDF 文件损坏或大小为 0 字节');
              }
            } else {
              throw new Error('PDF 文件损坏或大小为 0 字节');
            }
          }
        } catch (e: any) {
          if (e.message?.includes('0 字节') || e.message?.includes('损坏')) {
            if (!canceled) setStatus(e.message);
            return;
          }
        }
        try {
          const count = await getPdfPageCount(targetUri);
          if (!canceled) {
            setActiveUri(targetUri);
            setPageCount(count);
            setStatus('');
            onPageCountLoaded?.(count);
          }
        } catch (error) {
          // If initial targetUri threw (e.g. corrupted file header), attempt fallback if available
          if (readable?.document.localUri && readable.document.localUri !== targetUri) {
            try {
              const fallbackCount = await getPdfPageCount(readable.document.localUri);
              if (!canceled) {
                setActiveUri(readable.document.localUri);
                setPageCount(fallbackCount);
                setStatus('');
                onPageCountLoaded?.(fallbackCount);
                return;
              }
            } catch {}
          }
          if (!canceled) {
            const rawMsg = error instanceof Error ? error.message : '';
            const friendly =
              rawMsg.includes('format') || rawMsg.includes('corrupted')
                ? 'PDF 文件格式不规范或受保护'
                : rawMsg || 'PDF 页面读取失败';
            setStatus(friendly);
          }
        }
      }
      void loadPageCount();
      return () => {
        canceled = true;
      };
    }, [resolvedUri, readable?.document.localUri, onPageCountLoaded, reloadCounter]);

    // Scroll to page locator if present
    useEffect(() => {
      if (locator?.page && pageCount > 0 && flatListRef.current) {
        const target = Math.max(0, Math.min(pageCount - 1, locator.page - 1));
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: target, animated: true });
        }, 300);
      }
    }, [locator, pageCount]);

    const isError = Boolean(
      status &&
        (status.includes('损坏') ||
          status.includes('失败') ||
          status.includes('不可用') ||
          status.includes('corrupted') ||
          status.includes('format'))
    );

    return (
      <FlatList
        ref={flatListRef}
        contentContainerStyle={styles.pageList}
        data={pages}
        keyExtractor={(pageIndex) => `${resolvedDocId}-${pageIndex}`}
        ListEmptyComponent={
          status ? (
            <View style={styles.emptyContainer}>
              {isError ? (
                <View style={styles.errorBox}>
                  <Ionicons color="#E53E3E" name="alert-circle-outline" size={36} />
                  <Text style={styles.errorTitle}>PDF 页面解析受阻</Text>
                  <Text style={styles.errorDesc}>{status}</Text>
                  <View style={styles.errorBtnRow}>
                    <Pressable
                      onPress={() => setReloadCounter((c) => c + 1)}
                      style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.75 }]}
                    >
                      <Ionicons color={aiLightColors.primaryText} name="refresh-outline" size={16} />
                      <Text style={styles.retryBtnText}>重新尝试</Text>
                    </Pressable>
                    {activeUri || resolvedUri ? (
                      <Pressable
                        onPress={() => {
                          void safeShareFileAsync(activeUri || resolvedUri, {
                            dialogTitle: '选择外部 PDF 阅读器打开',
                          });
                        }}
                        style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.75 }]}
                      >
                        <Ionicons color="#FFFFFF" name="open-outline" size={16} />
                        <Text style={styles.openBtnText}>其他应用打开</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={aiLightColors.primary} size="small" />
                  <Text style={styles.status}>{status}</Text>
                </View>
              )}
            </View>
          ) : null
        }
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const maxScroll = contentSize.height - layoutMeasurement.height;
          if (maxScroll > 0) {
            onProgressChange?.(Math.min(1, Math.max(0, contentOffset.y / maxScroll)));
          }
        }}
        renderItem={({ item }) => (
          <PdfPageImage
            documentId={resolvedDocId}
            pageIndex={item}
            sourceUri={activeUri || resolvedUri}
            width={pageWidth}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={[styles.wrap, style]}
      />
    );
  }
);

interface PdfPageImageProps {
  documentId: string;
  pageIndex: number;
  sourceUri: string;
  width: number;
}

function PdfPageImage({ documentId, pageIndex, sourceUri, width }: PdfPageImageProps) {
  const [renderedUri, setRenderedUri] = useState<string | null>(null);
  const [status, setStatus] = useState('正在渲染...');
  const [aspectRatio, setAspectRatio] = useState<number>(0.707);

  useEffect(() => {
    let canceled = false;
    async function renderPage() {
      if (!sourceUri || !FileSystem.cacheDirectory) {
        setStatus('页面不可用');
        return;
      }
      const pixelRatio = PixelRatio.get();
      const renderWidth = Math.round(width * Math.max(2.5, Math.min(pixelRatio, 3.5)));
      const safeId = documentId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const destinationUri = `${FileSystem.cacheDirectory}pixory-pdf-${safeId}-${pageIndex}-${renderWidth}.png`;
      try {
        const result = await renderPdfPageToFile(sourceUri, pageIndex, destinationUri, renderWidth);
        if (!canceled) {
          setRenderedUri(result.uri);
          setStatus('');
          Image.getSize(
            result.uri,
            (imgWidth, imgHeight) => {
              if (!canceled && imgWidth > 0 && imgHeight > 0) {
                setAspectRatio(imgWidth / imgHeight);
              }
            },
            () => {}
          );
        }
      } catch (error) {
        if (!canceled) {
          setRenderedUri(null);
          const rawMsg = error instanceof Error ? error.message : '';
          const friendly =
            rawMsg.includes('format') || rawMsg.includes('corrupted')
              ? '当前 PDF 页面排版不规范或受保护'
              : rawMsg || 'PDF 页面渲染失败';
          setStatus(friendly);
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
        <Image
          resizeMode="contain"
          source={{ uri: renderedUri }}
          style={[styles.pageImage, { aspectRatio }]}
        />
      ) : (
        <View style={[styles.pagePlaceholder, { aspectRatio }]}>
          {status && (status.includes('排版') || status.includes('失败') || status.includes('受阻') || status.includes('不规范') || status.includes('受保护') || status.includes('不可用')) ? (
            <View style={styles.pageErrorContent}>
              <Ionicons color="#E53E3E" name="alert-circle-outline" size={28} />
              <Text style={styles.pageErrorText}>{status}</Text>
              <Pressable
                onPress={() => {
                  void safeShareFileAsync(sourceUri, { dialogTitle: '选择外部 PDF 阅读器打开' });
                }}
                style={({ pressed }) => [styles.pageFallbackBtn, pressed && { opacity: 0.75 }]}
              >
                <Ionicons color={aiLightColors.primaryText} name="open-outline" size={14} />
                <Text style={styles.pageFallbackBtnText}>其他应用打开原文件</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ActivityIndicator color={aiLightColors.primary} size="small" />
              <Text style={styles.status}>{status}</Text>
            </>
          )}
        </View>
      )}
      <View style={styles.pageBadge}>
        <Text style={styles.pageBadgeText}>{pageIndex + 1}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: aiLightColors.canvas,
  },
  pageList: {
    alignItems: 'center',
    gap: spacing[2],
    paddingBottom: spacing[12],
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  pageFrame: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pageImage: {
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  pagePlaceholder: {
    alignItems: 'center',
    backgroundColor: aiLightColors.card,
    justifyContent: 'center',
    width: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    padding: spacing[6],
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 340,
    padding: spacing[5],
    width: '100%',
  },
  errorTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    marginTop: spacing[2],
  },
  errorDesc: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginVertical: spacing[2],
    textAlign: 'center',
  },
  errorBtnRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  retryBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  retryBtnText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryText,
    fontWeight: '600',
  },
  openBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  openBtnText: {
    ...typography.textStyles.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    padding: spacing[4],
    textAlign: 'center',
  },
  pageBadge: {
    position: 'absolute',
    bottom: spacing[2],
    right: spacing[3],
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  pageBadgeText: {
    ...typography.textStyles.caption,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
  },
  pageErrorContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[5],
  },
  pageErrorText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginVertical: spacing[2],
    textAlign: 'center',
  },
  pageFallbackBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  pageFallbackBtnText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryText,
    fontWeight: '600',
  },
});
