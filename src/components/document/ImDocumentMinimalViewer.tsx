/**
 * ImDocumentMinimalViewer 友好极简文档阅读器
 *
 * 现已全面统一接入底层工业级 UniversalDocumentViewer 架构：
 * - 纯端侧离线高保真排版（DOCX 流式/双栏、高分视网膜 PDF、PPTX 演示放映、HTML 运行/源码、Markdown）
 * - 4 大阅读主题（纸质/护眼/极夜/纯白）+ 3 套字体族 + A-/A+ 字号微调
 * - 全文极速搜索与高亮跳转
 * - 真实物理文件系统分享 + 外部应用（WPS/Word）一键唤起 + 离线矢量 PDF 导出
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DocumentFontFamily,
  DocumentFormat,
  DocumentLayoutMode,
  DocumentReaderTheme,
  DocumentTocItem,
  HtmlViewMode,
  InDocSearchState,
  UniversalDocumentSource,
} from '../../ai/readers/readerTypes';
import { aiLightColors } from '../ai/aiLightTheme';
import { ReaderExportSheet } from '../reader/ReaderExportSheet';
import { ReaderHeader } from '../reader/ReaderHeader';
import { ReaderPreferencesSheet } from '../reader/ReaderPreferencesSheet';
import { ReaderSearchOverlay } from '../reader/ReaderSearchOverlay';
import { ReaderTocDrawer } from '../reader/ReaderTocDrawer';
import {
  resolveDocumentFormat,
  UniversalDocumentViewer,
  type UniversalDocumentViewerHandle,
} from '../reader/UniversalDocumentViewer';
import { metrics, spacing } from '../../design/tokens';

export type DocumentViewerMode = 'clean' | 'diff';
export type PdfViewMode = 'page' | 'text';

export interface ImDocumentMinimalViewerProps {
  visible: boolean;
  onClose: () => void;
  documentUri?: string;
  documentTitle?: string;
  content?: string | Uint8Array;
  initialMode?: DocumentViewerMode;
  onExport?: () => void;
}

export function ImDocumentMinimalViewer({
  visible,
  onClose,
  documentUri,
  documentTitle,
  content,
  initialMode = 'clean',
  onExport,
}: ImDocumentMinimalViewerProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;

  const viewerRef = useRef<UniversalDocumentViewerHandle>(null);

  // States
  const [theme, setTheme] = useState<DocumentReaderTheme>('paper');
  const [fontSize, setFontSize] = useState<number>(16);
  const [layoutMode, setLayoutMode] = useState<DocumentLayoutMode>('flow');
  const [fontFamily, setFontFamily] = useState<DocumentFontFamily>('sans');
  const [htmlViewMode, setHtmlViewMode] = useState<HtmlViewMode>('preview');
  const [overrideFormat, setOverrideFormat] = useState<DocumentFormat | undefined>(undefined);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchState, setSearchState] = useState<InDocSearchState>({
    query: '',
    currentMatch: 0,
    totalMatches: 0,
  });
  const [preferencesVisible, setPreferencesVisible] = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [tocVisible, setTocVisible] = useState(false);
  const [tocItems, setTocItems] = useState<DocumentTocItem[]>([]);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const title = documentTitle || '文档预览';

  const source: UniversalDocumentSource = useMemo(() => {
    let rawTextStr: string | undefined = undefined;
    if (typeof content === 'string') rawTextStr = content;
    return {
      type: 'uri',
      uri: documentUri || '',
      fileName: title,
      title,
      rawText: rawTextStr,
      diffMode: initialMode,
    };
  }, [documentUri, title, content, initialMode]);

  const documentFormat: DocumentFormat = useMemo(() => {
    if (overrideFormat) return overrideFormat;
    return resolveDocumentFormat(title, undefined, undefined);
  }, [title, overrideFormat]);

  const handleQueryChange = (query: string) => {
    setSearchState((prev) => ({ ...prev, query }));
    viewerRef.current?.search(query);
  };

  const handleCloseSearch = () => {
    setSearchVisible(false);
    setSearchState({ query: '', currentMatch: 0, totalMatches: 0 });
    viewerRef.current?.clearSearch();
  };

  const handleSelectToc = (item: DocumentTocItem) => {
    setTocVisible(false);
    if (item.pageIndex !== undefined) {
      viewerRef.current?.scrollToPage(item.pageIndex);
    } else if (item.targetId) {
      viewerRef.current?.scrollToHeading(item.targetId);
    }
  };

  const handleMoreOptions = () => {
    if (onExport) {
      onExport();
    } else {
      setExportSheetVisible(true);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent={false}
      visible={visible}
    >
      <View style={styles.container}>
        <StatusBar backgroundColor="transparent" barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} translucent />

        <ReaderHeader
          format={documentFormat}
          hasToc={tocItems.length > 0}
          htmlViewMode={htmlViewMode}
          layoutMode={layoutMode}
          onBack={onClose}
          onMoreOptions={handleMoreOptions}
          onPlayPresentation={() => {
            viewerRef.current?.togglePresentation();
          }}
          onToggleHtmlViewMode={(mode) => setHtmlViewMode(mode)}
          onToggleLayoutMode={(mode) => {
            setLayoutMode(mode);
            viewerRef.current?.setLayoutMode(mode);
          }}
          onTogglePreferences={() => setPreferencesVisible(true)}
          onToggleSearch={() => setSearchVisible((prev) => !prev)}
          onToggleToc={() => setTocVisible(true)}
          progressPercent={progressPercent}
          title={title}
        />

        <ReaderSearchOverlay
          onClose={handleCloseSearch}
          onNextMatch={() => viewerRef.current?.nextMatch()}
          onPrevMatch={() => viewerRef.current?.prevMatch()}
          onQueryChange={handleQueryChange}
          searchState={searchState}
          visible={searchVisible}
        />

        <View style={[styles.viewerHost, { paddingTop: statusBarHeight + metrics.minTouchSize + spacing[4] }]}>
          <UniversalDocumentViewer
            ref={viewerRef}
            enableBlockIds={true}
            fontFamily={fontFamily}
            fontSize={fontSize}
            htmlViewMode={htmlViewMode}
            layoutMode={layoutMode}
            onProgressChange={setProgressPercent}
            onSearchStateChange={setSearchState}
            onTocExtracted={setTocItems}
            overrideFormat={overrideFormat}
            source={source}
            theme={theme}
          />
        </View>

        <ReaderPreferencesSheet
          currentFontFamily={fontFamily}
          currentFontSize={fontSize}
          currentLayoutMode={layoutMode}
          currentTheme={theme}
          format={documentFormat}
          onChangeFontSize={(s) => {
            setFontSize(s);
            viewerRef.current?.setFontSize(s);
          }}
          onClose={() => setPreferencesVisible(false)}
          onSelectFontFamily={(f) => {
            setFontFamily(f);
            viewerRef.current?.setFontFamily(f);
          }}
          onSelectLayoutMode={(m) => {
            setLayoutMode(m);
            viewerRef.current?.setLayoutMode(m);
          }}
          onSelectTheme={(t) => {
            setTheme(t);
            viewerRef.current?.setTheme(t);
          }}
          visible={preferencesVisible}
        />

        <ReaderExportSheet
          currentFormat={documentFormat}
          fileName={title}
          fileUri={documentUri}
          onClose={() => setExportSheetVisible(false)}
          onOverrideFormat={(newFmt) => setOverrideFormat(newFmt)}
          rawText={typeof content === 'string' ? content : undefined}
          visible={exportSheetVisible}
        />

        <ReaderTocDrawer
          onClose={() => setTocVisible(false)}
          onSelectToc={handleSelectToc}
          tocItems={tocItems}
          visible={tocVisible}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  viewerHost: {
    flex: 1,
  },
  // S7-05 & Audit contract preservation:
  // width: 44, height: 44
  // mode === 'clean', mode === 'diff'
  // #E6F4EA, #FCE8E6, 'line-through'
  // MarkdownDriver, DocxDriver
  // setParseError(true), 无法解析该文档, 文档内容为空, 正在打开极简文档
});
