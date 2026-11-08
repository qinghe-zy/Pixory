import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readDocumentForReader } from '../ai/aiDocumentService';
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
} from '../ai/readers/readerTypes';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppScreen } from '../components/AppScreen';
import { useToast } from '../components/AppToast';
import { ReaderExportSheet } from '../components/reader/ReaderExportSheet';
import { ReaderHeader } from '../components/reader/ReaderHeader';
import { ReaderPreferencesSheet } from '../components/reader/ReaderPreferencesSheet';
import { ReaderSearchOverlay } from '../components/reader/ReaderSearchOverlay';
import { ReaderTocDrawer } from '../components/reader/ReaderTocDrawer';
import {
  resolveDocumentFormat,
  UniversalDocumentViewer,
  type UniversalDocumentViewerHandle,
} from '../components/reader/UniversalDocumentViewer';
import { createWorkingCopy } from '../components/reader/workingCopyManager';
import type { PixorySpace } from '../database';
import { layout, metrics, radius, rhythm, spacing, typography } from '../design/tokens';

export interface AiDocumentReaderScreenProps {
  space?: PixorySpace;
  documentId?: string;
  fileUri?: string;
  fileName?: string;
  mimeType?: string | null;
  source?: UniversalDocumentSource;
  locator?: AiDocumentReaderLocator;
  title?: string;
  onBack: () => void;
}

export function AiDocumentReaderScreen({
  space,
  documentId,
  fileUri,
  fileName,
  mimeType,
  source: explicitSource,
  locator,
  title,
  onBack,
}: AiDocumentReaderScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;

  const viewerRef = useRef<UniversalDocumentViewerHandle>(null);

  const [documentSource, setDocumentSource] = useState<UniversalDocumentSource | null>(
    explicitSource ?? null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Reader state
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
  const [isPresentation, setIsPresentation] = useState(false);

  // Android hardware back button listener
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isPresentation) {
        viewerRef.current?.togglePresentation();
        return true;
      }
      if (searchVisible) {
        setSearchVisible(false);
        return true;
      }
      if (preferencesVisible) {
        setPreferencesVisible(false);
        return true;
      }
      if (exportSheetVisible) {
        setExportSheetVisible(false);
        return true;
      }
      if (tocVisible) {
        setTocVisible(false);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [searchVisible, preferencesVisible, exportSheetVisible, tocVisible]);

  // Load document if specified by documentId or fileUri
  useEffect(() => {
    if (explicitSource) {
      setDocumentSource(explicitSource);
      return;
    }

    if (documentId && space) {
      let isMounted = true;
      setLoading(true);
      setErrorMessage(null);
      void readDocumentForReader({ documentId, space })
        .then((readable) => {
          if (isMounted) {
            setDocumentSource({ type: 'record', readable });
            // Initialize working copy hook
            createWorkingCopy(documentId, readable.document.localUri || '');
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
    }

    if (fileUri) {
      const candidateName = fileName || 'document';
      const createdSource: UniversalDocumentSource = {
        type: 'uri',
        uri: fileUri,
        fileName: candidateName,
        mimeType: mimeType || null,
        title: title || candidateName,
      };
      setDocumentSource(createdSource);
      createWorkingCopy(candidateName, fileUri);
    }
  }, [documentId, space, fileUri, fileName, mimeType, explicitSource, title, reloadCounter]);

  // Derived display attributes
  const displayTitle = useMemo(() => {
    if (title) return title;
    if (documentSource?.type === 'record') {
      return documentSource.readable.document.title;
    }
    if (documentSource?.type === 'uri') {
      return documentSource.title || documentSource.fileName;
    }
    return '文档预览';
  }, [title, documentSource]);

  const documentFormat: DocumentFormat = useMemo(() => {
    if (overrideFormat) return overrideFormat;
    if (documentSource?.type === 'record') {
      return resolveDocumentFormat(
        documentSource.readable.document.originalFilename || '',
        documentSource.readable.document.mimeType,
        documentSource.readable.document.sourceType
      );
    }
    if (documentSource?.type === 'uri') {
      return resolveDocumentFormat(
        documentSource.fileName,
        documentSource.mimeType,
        documentSource.sourceType,
        documentSource.overrideFormat
      );
    }
    return 'txt';
  }, [documentSource, overrideFormat]);

  // Theme change
  const handleSelectTheme = (newTheme: DocumentReaderTheme) => {
    setTheme(newTheme);
    viewerRef.current?.setTheme(newTheme);
  };

  // Font size change
  const handleChangeFontSize = (newSize: number) => {
    setFontSize(newSize);
    viewerRef.current?.setFontSize(newSize);
  };

  // Search actions
  const handleQueryChange = (query: string) => {
    setSearchState((prev) => ({ ...prev, query }));
    viewerRef.current?.search(query);
  };

  const handleNextMatch = () => {
    viewerRef.current?.nextMatch();
  };

  const handlePrevMatch = () => {
    viewerRef.current?.prevMatch();
  };

  const handleCloseSearch = () => {
    setSearchVisible(false);
    setSearchState({ query: '', currentMatch: 0, totalMatches: 0 });
    viewerRef.current?.clearSearch();
  };

  // TOC Navigation
  const handleSelectToc = (item: DocumentTocItem) => {
    setTocVisible(false);
    if (item.pageIndex !== undefined) {
      viewerRef.current?.scrollToPage(item.pageIndex);
    } else if (item.targetId) {
      viewerRef.current?.scrollToHeading(item.targetId);
    }
  };

  // Block Click Hook (pre-wired for surgical block patch)
  const handleBlockPress = useCallback((block: DocumentBlockInfo) => {
    console.log('[Pixory Reader] Block clicked:', block.blockId, block.blockType, block.text);
  }, []);

  // More options menu (Sharing, Copy, Export, Override Format)
  const handleMoreOptions = () => {
    setExportSheetVisible(true);
  };

  return (
    <AppScreen backgroundColor={isPresentation ? '#0b0c0e' : aiLightColors.canvas} contentStyle={styles.screen}>
      {!isPresentation ? (
        <ReaderHeader
          format={documentFormat}
          hasToc={tocItems.length > 0}
          htmlViewMode={htmlViewMode}
          layoutMode={layoutMode}
          onBack={onBack}
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
          title={displayTitle}
        />
      ) : null}

      <ReaderSearchOverlay
        onClose={handleCloseSearch}
        onNextMatch={handleNextMatch}
        onPrevMatch={handlePrevMatch}
        onQueryChange={handleQueryChange}
        searchState={searchState}
        visible={searchVisible}
      />

      <View
        style={[
          styles.readerHost,
          {
            paddingTop: isPresentation
              ? 0
              : statusBarHeight + metrics.minTouchSize + spacing[4],
          },
        ]}
      >
        {loading ? (
          <View style={styles.stateBlock}>
            <Text style={styles.stateText}>正在打开文档...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateBlock}>
            <Ionicons color={aiLightColors.muted} name="alert-circle-outline" size={32} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <View style={styles.errorButtonRow}>
              <Pressable
                accessibilityLabel="重新加载"
                accessibilityRole="button"
                onPress={() => setReloadCounter((c) => c + 1)}
                style={({ pressed }) => [styles.stateButton, styles.primaryStateButton, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.primaryStateButtonText}>重新加载</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="返回上一页"
                accessibilityRole="button"
                onPress={onBack}
                style={({ pressed }) => [styles.stateButton, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.stateButtonText}>返回上一页</Text>
              </Pressable>
            </View>
          </View>
        ) : documentSource ? (
          <UniversalDocumentViewer
            ref={viewerRef}
            enableBlockIds={true}
            fontFamily={fontFamily}
            fontSize={fontSize}
            htmlViewMode={htmlViewMode}
            layoutMode={layoutMode}
            locator={locator}
            onBlockPress={handleBlockPress}
            onPresentationStateChange={(active) => setIsPresentation(active)}
            onProgressChange={setProgressPercent}
            onSearchStateChange={setSearchState}
            onTocExtracted={setTocItems}
            overrideFormat={overrideFormat}
            source={documentSource}
            theme={theme}
          />
        ) : (
          <View style={styles.stateBlock}>
            <Ionicons color={aiLightColors.muted} name="document-text-outline" size={32} />
            <Text style={styles.stateText}>没有可打开的文档</Text>
            <Pressable
              accessibilityLabel="返回上一页"
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.stateButton, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.stateButtonText}>返回上一页</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ReaderPreferencesSheet
        currentFontFamily={fontFamily}
        currentFontSize={fontSize}
        currentLayoutMode={layoutMode}
        currentTheme={theme}
        format={documentFormat}
        onChangeFontSize={handleChangeFontSize}
        onClose={() => setPreferencesVisible(false)}
        onSelectFontFamily={(f) => {
          setFontFamily(f);
          viewerRef.current?.setFontFamily(f);
        }}
        onSelectLayoutMode={(m) => {
          setLayoutMode(m);
          viewerRef.current?.setLayoutMode(m);
        }}
        onSelectTheme={handleSelectTheme}
        visible={preferencesVisible}
      />

      <ReaderExportSheet
        currentFormat={documentFormat}
        fileName={displayTitle}
        fileUri={
          documentSource?.type === 'record'
            ? (documentSource.readable.document.localUri ?? undefined)
            : documentSource?.type === 'uri'
              ? documentSource.uri
              : undefined
        }
        onClose={() => setExportSheetVisible(false)}
        onOverrideFormat={(newFmt) => {
          setOverrideFormat(newFmt);
          showToast(`已切换为 ${newFmt.toUpperCase()} 格式解析`);
        }}
        rawText={
          documentSource?.type === 'record'
            ? documentSource.readable.text
            : documentSource?.type === 'uri'
              ? (documentSource.rawText ?? undefined)
              : undefined
        }
        visible={exportSheetVisible}
      />

      <ReaderTocDrawer
        onClose={() => setTocVisible(false)}
        onSelectToc={handleSelectToc}
        tocItems={tocItems}
        visible={tocVisible}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 0,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  readerHost: {
    flex: 1,
  },
  stateBlock: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.cardContentGap,
    justifyContent: 'center',
    padding: spacing[4],
  },
  stateText: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  errorText: {
    ...typography.textStyles.body,
    color: aiLightColors.primaryActive,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: aiLightColors.userBubble,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stateButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  primaryStateButton: {
    backgroundColor: aiLightColors.primary,
    borderColor: aiLightColors.primary,
  },
  primaryStateButtonText: {
    ...typography.textStyles.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorButtonRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
});
