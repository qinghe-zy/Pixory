import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { marked } from 'marked';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type {
  AiDocumentReaderLocator,
  DocumentBlockInfo,
  DocumentFontFamily,
  DocumentFormat,
  DocumentLayoutMode,
  DocumentReaderTheme,
  DocumentTocItem,
  HtmlViewMode,
  InDocSearchState,
  UniversalDocumentSource,
} from '../../ai/readers/readerTypes';
import { parseDocxToHtml } from '../../ai/documentParsers/docxParser';
import { parsePptx, renderPptxSlidesHtml } from '../../ai/documentParsers/pptxParser';
import { radius, spacing, typography } from '../../design/tokens';
import { AiPdfReader, type AiPdfReaderHandle } from '../ai/AiPdfReader';
import { safeShareFileAsync } from '../../services/export/exportDocumentService';
import { aiLightColors } from '../ai/aiLightTheme';
import { getUniversalReaderHtml } from './kernel/universalReaderHtml';

export interface UniversalDocumentViewerHandle {
  search: (query: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  clearSearch: () => void;
  scrollToHeading: (targetId: string) => void;
  scrollToPage: (pageIndex: number) => void;
  setTheme: (theme: DocumentReaderTheme) => void;
  setFontSize: (fontSize: number) => void;
  setLayoutMode: (mode: DocumentLayoutMode) => void;
  setFontFamily: (font: DocumentFontFamily) => void;
  setHtmlViewMode: (mode: HtmlViewMode) => void;
  togglePresentation: () => void;
}

export interface UniversalDocumentViewerProps {
  source: UniversalDocumentSource;
  theme?: DocumentReaderTheme;
  fontSize?: number;
  layoutMode?: DocumentLayoutMode;
  fontFamily?: DocumentFontFamily;
  htmlViewMode?: HtmlViewMode;
  overrideFormat?: DocumentFormat;
  locator?: AiDocumentReaderLocator;
  enableBlockIds?: boolean;
  onBlockPress?: (block: DocumentBlockInfo) => void;
  onTocExtracted?: (toc: DocumentTocItem[]) => void;
  onSearchStateChange?: (state: InDocSearchState) => void;
  onProgressChange?: (percent: number) => void;
  onPresentationStateChange?: (active: boolean) => void;
  onLinkPress?: (url: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function resolveDocumentFormat(
  fileName: string,
  mimeType?: string | null,
  explicitType?: string | null,
  overrideFormat?: DocumentFormat | null
): DocumentFormat {
  if (overrideFormat) {
    return overrideFormat;
  }
  if (
    explicitType === 'docx' ||
    explicitType === 'pdf' ||
    explicitType === 'markdown' ||
    explicitType === 'html' ||
    explicitType === 'pptx' ||
    explicitType === 'txt'
  ) {
    return explicitType;
  }
  const name = fileName.toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml.document')) return 'docx';
  if (name.endsWith('.pptx') || mime.includes('presentationml.presentation')) return 'pptx';
  if (name.endsWith('.md') || name.endsWith('.markdown') || mime.includes('markdown')) return 'markdown';
  if (name.endsWith('.html') || name.endsWith('.htm') || mime.includes('html')) return 'html';
  return 'txt';
}

export const UniversalDocumentViewer = forwardRef<
  UniversalDocumentViewerHandle,
  UniversalDocumentViewerProps
>(({
  source,
  theme = 'paper',
  fontSize = 16,
  layoutMode = 'flow',
  fontFamily = 'sans',
  htmlViewMode = 'preview',
  overrideFormat,
  locator,
  enableBlockIds = true,
  onBlockPress,
  onTocExtracted,
  onSearchStateChange,
  onProgressChange,
  onPresentationStateChange,
  onLinkPress,
  style,
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const pdfReaderRef = useRef<AiPdfReaderHandle>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const onTocExtractedRef = useRef(onTocExtracted);
  useEffect(() => {
    onTocExtractedRef.current = onTocExtracted;
  }, [onTocExtracted]);

  // Determine metadata from source
  const { fileUri, fileName, mimeType, explicitFormat, rawText, sourceOverrideFormat } = useMemo(() => {
    if (source.type === 'record') {
      const doc = source.readable.document;
      return {
        fileUri: doc.localUri,
        fileName: doc.originalFilename || doc.title,
        mimeType: doc.mimeType,
        explicitFormat: doc.sourceType,
        rawText: source.readable.text,
        sourceOverrideFormat: undefined,
      };
    }
    return {
      fileUri: source.uri,
      fileName: source.fileName,
      mimeType: source.mimeType,
      explicitFormat: source.sourceType,
      rawText: source.rawText,
      sourceOverrideFormat: source.overrideFormat,
    };
  }, [source]);

  const effectiveOverride = overrideFormat || sourceOverrideFormat;

  const format = useMemo(() => {
    return resolveDocumentFormat(fileName, mimeType, explicitFormat, effectiveOverride);
  }, [fileName, mimeType, explicitFormat, effectiveOverride]);

  // Load content according to format
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    async function loadContent() {
      try {
        if (format === 'pdf') {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        let contentPayload = '';
        let fallbackSemanticDocx = '';

        if (format === 'docx') {
          if (!fileUri) throw new Error('DOCX 本地文件不存在');
          let usableUri = fileUri;
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists && typeof info.size === 'number' && info.size === 0) {
              const alt = source.type === 'record' ? source.readable.document.localUri : undefined;
              if (alt && alt !== fileUri) usableUri = alt;
            }
          } catch {}
          try {
            // 同时读取 Base64 与执行轻量纯 TS 语义解析（耗时仅 10ms 级），提供绝对双引擎兜底
            const [b64, parsed] = await Promise.all([
              FileSystem.readAsStringAsync(usableUri, {
                encoding: FileSystem.EncodingType.Base64,
              }),
              parseDocxToHtml({ fileUri: usableUri, space: 'normal' }).catch(() => null),
            ]);
            contentPayload = b64;
            if (parsed) {
              fallbackSemanticDocx = parsed.html || '';
              if (isMounted && parsed.headings.length > 0) {
                onTocExtractedRef.current?.(
                  parsed.headings.map((h, idx) => ({
                    id: `heading-${idx}`,
                    title: h.text,
                    level: h.level,
                    targetId: `heading-${idx}`,
                  }))
                );
              }
            }
          } catch (docxErr) {
            const msg = docxErr instanceof Error ? docxErr.message : 'DOCX 解析异常';
            contentPayload = `<div style="padding: 40px 16px; text-align: center; color: var(--body);">
              <p style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: var(--ink);">文档内容排版解析受阻</p>
              <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">${msg}</p>
              <p style="color: var(--muted); font-size: 12px;">建议在右上角菜单中选择使用外部办公应用打开原文件</p>
            </div>`;
          }
        } else if (format === 'pptx') {
          if (!fileUri) throw new Error('PPTX 本地文件不存在');
          let usableUri = fileUri;
          try {
            const info = await FileSystem.getInfoAsync(fileUri);
            if (info.exists && typeof info.size === 'number' && info.size === 0) {
              const alt = source.type === 'record' ? source.readable.document.localUri : undefined;
              if (alt && alt !== fileUri) usableUri = alt;
            }
          } catch {}
          try {
            // 读取 Base64 供 pptx-preview 高保真引擎直接渲染
            contentPayload = await FileSystem.readAsStringAsync(usableUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            // 异步提取幻灯片目录供抽屉使用，不阻塞主渲染
            parsePptx({ fileUri: usableUri, space: 'normal' })
              .then((parsed) => {
                if (isMounted && parsed.slides.length > 0) {
                  onTocExtractedRef.current?.(
                    parsed.slides.map((s) => ({
                      id: `slide-${s.index}`,
                      title: `第 ${s.index} 页: ${s.title}`,
                      level: 1,
                      pageIndex: s.index - 1,
                    }))
                  );
                }
              })
              .catch(() => {});
          } catch (pptxErr) {
            const msg = pptxErr instanceof Error ? pptxErr.message : 'PPTX 解析异常';
            contentPayload = `<div style="padding: 40px 16px; text-align: center; color: var(--body);">
              <p style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: var(--ink);">幻灯片排版解析受阻</p>
              <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">${msg}</p>
              <p style="color: var(--muted); font-size: 12px;">建议在右上角菜单中选择使用外部办公应用打开原文件</p>
            </div>`;
          }
        } else if (format === 'markdown') {
          const textToParse =
            rawText !== undefined
              ? rawText
              : fileUri
                ? await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 })
                : '';
          contentPayload = (await marked.parse(textToParse || '暂无内容')) as string;
        } else if (format === 'html') {
          contentPayload = fileUri
            ? await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 })
            : rawText || '';
        } else {
          // txt / code
          contentPayload =
            rawText !== undefined
              ? rawText
              : fileUri
                ? await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 })
                : '暂无文本内容';
        }

        if (isMounted) {
          const html = getUniversalReaderHtml({
            format,
            content: contentPayload,
            theme,
            fontSize,
            layoutMode,
            fontFamily,
            htmlViewMode,
            enableBlockIds,
            locator,
            fallbackSemanticHtml: fallbackSemanticDocx,
          });
          setRenderedHtml(html);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : '加载文档失败');
          setLoading(false);
        }
      }
    }

    void loadContent();

    return () => {
      isMounted = false;
    };
  }, [format, fileUri, rawText, htmlViewMode, enableBlockIds, locator, reloadCounter]);

  // Push theme changes to WebView without reloading document
  useEffect(() => {
    if (renderedHtml && webViewRef.current && format !== 'pdf') {
      const escaped = JSON.stringify(theme);
      webViewRef.current.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setTheme(${escaped}); true;`);
    }
  }, [theme, renderedHtml, format]);

  // Push font size changes to WebView without reloading document
  useEffect(() => {
    if (renderedHtml && webViewRef.current && format !== 'pdf') {
      webViewRef.current.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setFontSize(${fontSize}); true;`);
    }
  }, [fontSize, renderedHtml, format]);

  // Push layout mode changes to WebView without reloading document
  useEffect(() => {
    if (renderedHtml && webViewRef.current && format !== 'pdf') {
      const escaped = JSON.stringify(layoutMode);
      webViewRef.current.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setLayoutMode(${escaped}); true;`);
    }
  }, [layoutMode, renderedHtml, format]);

  // Push font family changes to WebView without reloading document
  useEffect(() => {
    if (renderedHtml && webViewRef.current && format !== 'pdf') {
      const escaped = JSON.stringify(fontFamily);
      webViewRef.current.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setFontFamily(${escaped}); true;`);
    }
  }, [fontFamily, renderedHtml, format]);

  // Handle messages from WebView
  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'blockPress' && data.block) {
          onBlockPress?.(data.block);
        } else if (data.type === 'tocExtracted' && data.toc) {
          onTocExtracted?.(data.toc);
        } else if (data.type === 'searchResult') {
          onSearchStateChange?.({
            query: '',
            currentMatch: data.current,
            totalMatches: data.total,
          });
        } else if (data.type === 'scrollProgress') {
          onProgressChange?.(data.progress);
        } else if (data.type === 'presentationPage') {
          if (typeof data.total === 'number' && data.total > 0) {
            onProgressChange?.(data.current / data.total);
          }
        } else if (data.type === 'presentationState') {
          onPresentationStateChange?.(!!data.active);
        } else if (data.type === 'linkPress' && data.url) {
          onLinkPress?.(data.url);
        } else if ((data.type === 'renderError' || data.type === 'error') && data.message) {
          setErrorMessage(data.message);
        }
      } catch (e) {
        // Ignore unparseable messages
      }
    },
    [onBlockPress, onTocExtracted, onSearchStateChange, onProgressChange, onLinkPress]
  );

  // Imperative handle
  useImperativeHandle(
    ref,
    () => ({
      search: (query: string) => {
        if (format === 'pdf') return;
        const escaped = JSON.stringify(query);
        webViewRef.current?.injectJavaScript(`window.PixorySearch && window.PixorySearch.find(${escaped}); true;`);
      },
      nextMatch: () => {
        if (format === 'pdf') return;
        webViewRef.current?.injectJavaScript(`window.PixorySearch && window.PixorySearch.next(); true;`);
      },
      prevMatch: () => {
        if (format === 'pdf') return;
        webViewRef.current?.injectJavaScript(`window.PixorySearch && window.PixorySearch.prev(); true;`);
      },
      clearSearch: () => {
        if (format === 'pdf') return;
        webViewRef.current?.injectJavaScript(`window.PixorySearch && window.PixorySearch.clear(); true;`);
      },
      scrollToHeading: (targetId: string) => {
        if (format === 'pdf') return;
        const escaped = JSON.stringify(targetId);
        webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.scrollToHeading(${escaped}); true;`);
      },
      scrollToPage: (pageIndex: number) => {
        if (format === 'pdf') {
          pdfReaderRef.current?.scrollToPage(pageIndex);
        } else if (format === 'pptx') {
          webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.goToSlide(${pageIndex}); true;`);
        }
      },
      setTheme: (newTheme: DocumentReaderTheme) => {
        if (format === 'pdf') return;
        const escaped = JSON.stringify(newTheme);
        webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setTheme(${escaped}); true;`);
      },
      setFontSize: (newSize: number) => {
        if (format === 'pdf') return;
        webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setFontSize(${newSize}); true;`);
      },
      setLayoutMode: (mode: DocumentLayoutMode) => {
        if (format === 'pdf') return;
        const escaped = JSON.stringify(mode);
        webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setLayoutMode(${escaped}); true;`);
      },
      setFontFamily: (font: DocumentFontFamily) => {
        if (format === 'pdf') return;
        const escaped = JSON.stringify(font);
        webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.setFontFamily(${escaped}); true;`);
      },
      setHtmlViewMode: (_mode: HtmlViewMode) => {
        setReloadCounter((c) => c + 1);
      },
      togglePresentation: () => {
        if (format === 'pptx') {
          webViewRef.current?.injectJavaScript(`window.PixoryTheme && window.PixoryTheme.togglePresentation(); true;`);
        }
      },
    }),
    [format]
  );

  if (loading) {
    return (
      <View style={[styles.centerState, style]}>
        <ActivityIndicator color={aiLightColors.primary} size="large" />
        <Text style={styles.loadingText}>正在排版渲染文档...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={[styles.centerState, style]}>
        <Ionicons color="#E53E3E" name="alert-circle-outline" size={36} />
        <Text style={styles.errorText}>文档预览失败：{errorMessage}</Text>
        <View style={styles.errorButtonRow}>
          <Pressable
            accessibilityLabel="重新加载"
            accessibilityRole="button"
            onPress={() => setReloadCounter((c) => c + 1)}
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.75 }]}
          >
            <Ionicons color={aiLightColors.primaryText} name="refresh-outline" size={16} />
            <Text style={styles.retryButtonText}>重新加载</Text>
          </Pressable>
          {fileUri ? (
            <Pressable
              accessibilityLabel="用其他应用打开"
              accessibilityRole="button"
              onPress={() => {
                void safeShareFileAsync(fileUri, {
                  dialogTitle: `使用其他应用打开 ${fileName}`,
                });
              }}
              style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.75 }]}
            >
              <Ionicons color={aiLightColors.ink} name="open-outline" size={16} />
              <Text style={styles.secondaryButtonText}>其他应用打开</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // PDF View via Native Rasterizer Component
  if (format === 'pdf') {
    return (
      <AiPdfReader
        ref={pdfReaderRef}
        documentId={fileName}
        locator={locator}
        onPageCountLoaded={(count) => {
          const toc: DocumentTocItem[] = Array.from({ length: count }, (_, i) => ({
            id: `pdf-page-${i}`,
            title: `第 ${i + 1} 页`,
            level: 1,
            pageIndex: i,
          }));
          onTocExtracted?.(toc);
        }}
        onProgressChange={onProgressChange}
        readable={source.type === 'record' ? source.readable : undefined}
        sourceUri={fileUri ?? ''}
        style={style}
      />
    );
  }

  // WebView for DOCX, Markdown, HTML, TXT
  return (
    <View style={[styles.container, style]}>
      {renderedHtml ? (
        <WebView
          ref={webViewRef}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          domStorageEnabled={true}
          javaScriptEnabled={true}
          onError={(e) => setErrorMessage(e.nativeEvent.description)}
          onMessage={handleWebViewMessage}
          originWhitelist={['*']}
          scalesPageToFit={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          source={{ html: renderedHtml, baseUrl: 'about:blank' }}
          style={styles.webView}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
    width: '100%',
  },
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  loadingText: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    marginTop: spacing[3],
  },
  errorText: {
    ...typography.textStyles.body,
    color: '#E53E3E',
    textAlign: 'center',
    marginTop: spacing[2],
  },
  errorButtonRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  retryButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryText,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  secondaryButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '500',
  },
});
