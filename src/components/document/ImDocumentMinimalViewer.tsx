/**
 * ImDocumentMinimalViewer 友好极简文档阅读器 (平铺沉浸阅读 - 无厚重外壳与深黑遮罩)
 *
 * 核心机制:
 * 1. 极致纯粹: 零多层嵌套卡片容器，零厚重黑灰覆盖层，文档正文全屏平铺呈现;
 * 2. 格式自适应: 原生流畅支持 Markdown 与 DOCX (虚拟文本投影与骨架结构解析);
 * 3. 干净排版 vs 修订留痕 (Clean View vs Diff Mode):
 *    - clean 模式: 展示修改后的最终干净正文 (剥除 del 划线，自然融入 ins 新增);
 *    - diff 模式: 企业级红绿高亮留痕 (<ins> 柔和绿底，<del> 柔和红底中划线);
 * 4. 触控友好: 顶部通透极简操作栏，大点击热区，支持段落快速定位与一键导出。
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../design/tokens';
import { DocumentDriverRegistry } from '../../services/sandbox/drivers/driverRegistry';
import { MarkdownDriver } from '../../services/sandbox/drivers/markdownDriver';
import { DocxDriver } from '../../services/sandbox/drivers/docxDriver';
import { PdfDriver } from '../../services/sandbox/drivers/pdfDriver';
import type { DocumentBlockSkeleton } from '../../services/sandbox/drivers/baseDriver';

export type DocumentViewerMode = 'clean' | 'diff';

export interface ImDocumentMinimalViewerProps {
  visible: boolean;
  onClose: () => void;
  documentUri?: string;
  documentTitle?: string;
  content?: string | Uint8Array;
  initialMode?: DocumentViewerMode;
  onExport?: () => void;
}

interface ParsedBlock {
  id: string;
  kind: string;
  rawText: string;
}

export function ImDocumentMinimalViewer({
  visible,
  onClose,
  documentUri = 'document.md',
  documentTitle,
  content,
  initialMode = 'clean',
  onExport,
}: ImDocumentMinimalViewerProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<DocumentViewerMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState(false);
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [rawTextContent, setRawTextContent] = useState<string>('');

  const displayTitle = documentTitle || documentUri.split(/[/\\]/).pop() || '文档阅读';
  const isDocx = (documentUri || '').toLowerCase().endsWith('.docx') || displayTitle.toLowerCase().endsWith('.docx');
  const isPdf = (documentUri || '').toLowerCase().endsWith('.pdf') || displayTitle.toLowerCase().endsWith('.pdf');
  const docTypeLabel = isDocx ? 'Word 文档' : isPdf ? 'PDF 文档' : 'Markdown';

  // 解析文档内容为段落块
  useEffect(() => {
    if (!visible) return;

    setMode(initialMode);
    let isMounted = true;
    setLoading(true);
    setParseError(false);

    const parseContent = async () => {
      try {
        const textDecoder = new TextDecoder('utf-8');
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (content instanceof Uint8Array && !isDocx && !isPdf) {
          text = textDecoder.decode(content);
        }

        const registry = new DocumentDriverRegistry([
          new MarkdownDriver(),
          new DocxDriver(),
          new PdfDriver(),
        ]);
        const lookupTarget = /\.[a-zA-Z0-9]+$/.test(documentUri) ? documentUri : displayTitle;
        const driver = registry.getDriver(lookupTarget);

        const isSuspiciousFilenameContent =
          typeof content === 'string' &&
          (content.trim() === displayTitle.trim() ||
            content.trim() === (documentUri || '').trim() ||
            content.trim().length === 0);

        let effectiveContent: string | Uint8Array | undefined = isSuspiciousFilenameContent ? undefined : content;

        if (!effectiveContent && documentUri) {
          try {
            const FileSystem = await import('expo-file-system/legacy');
            const fileInfo = await FileSystem.getInfoAsync(documentUri);
            if (fileInfo.exists) {
              if (isDocx || isPdf) {
                const b64 = await FileSystem.readAsStringAsync(documentUri, { encoding: FileSystem.EncodingType.Base64 });
                const binaryStr = atob(b64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                effectiveContent = bytes;
              } else {
                effectiveContent = await FileSystem.readAsStringAsync(documentUri, { encoding: FileSystem.EncodingType.UTF8 });
              }
            }
          } catch {}

          if (!effectiveContent) {
            try {
              const { getVfsStorageDriver } = await import('../../services/agent/vfs/vfsStorageDriver');
              const vfsDriver = getVfsStorageDriver();
              if (await vfsDriver.exists(documentUri)) {
                if (isDocx || isPdf) {
                  effectiveContent = await vfsDriver.readBytes(documentUri);
                } else {
                  effectiveContent = await vfsDriver.readText(documentUri);
                }
              }
            } catch {}
          }
        }

        // 智能自愈：若声明为 .docx 但实际内容为非 ZIP 纯文本/Markdown，平滑降级为 MarkdownDriver 容错展示
        let activeDriver = driver;
        if (isDocx && effectiveContent) {
          const isZipBinary =
            effectiveContent instanceof Uint8Array &&
            effectiveContent.length >= 4 &&
            effectiveContent[0] === 0x50 &&
            effectiveContent[1] === 0x4b;
          const isRawXmlString =
            typeof effectiveContent === 'string' &&
            (effectiveContent.startsWith('<w:') || effectiveContent.includes('<w:document'));
          if (!isZipBinary && !isRawXmlString) {
            activeDriver = new MarkdownDriver();
            if (effectiveContent instanceof Uint8Array) {
              effectiveContent = textDecoder.decode(effectiveContent);
            }
          }
        }

        // 如果是有效驱动且有内容
        if (effectiveContent) {
          let skeletons: DocumentBlockSkeleton[];
          let readResult: Record<string, string>;
          try {
            skeletons = await activeDriver.inspectSkeleton(effectiveContent);
            const blockIds = skeletons.map((s) => s.blockId);
            readResult = await activeDriver.readBlocks(effectiveContent, blockIds, { skeleton: skeletons });
          } catch (driverErr) {
            // 二次兜底：降级至 Markdown 纯文本行解析，绝不向用户呈现损坏报错
            const mdDriver = new MarkdownDriver();
            const fallbackText = typeof effectiveContent === 'string' ? effectiveContent : textDecoder.decode(effectiveContent);
            skeletons = await mdDriver.inspectSkeleton(fallbackText);
            const blockIds = skeletons.map((s) => s.blockId);
            readResult = await mdDriver.readBlocks(fallbackText, blockIds, { skeleton: skeletons });
          }

          if (isMounted) {
            const parsedList: ParsedBlock[] = skeletons.map((s) => ({
              id: s.blockId,
              kind: s.kind,
              rawText: readResult[s.blockId] || s.previewText || '',
            }));
            setBlocks(parsedList);
            setRawTextContent(text || parsedList.map((b) => b.rawText).join('\n\n'));
          }
        } else {
          // 空内容兜底
          if (isMounted) {
            setBlocks([]);
            setRawTextContent('');
          }
        }
      } catch {
        // 骨架解析失败：显示友好错误状态
        if (isMounted) {
          setParseError(true);
          setBlocks([]);
          setRawTextContent('');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void parseContent();

    return () => {
      isMounted = false;
    };
  }, [visible, content, documentUri, displayTitle, initialMode]);

  // 统计字数与块数
  const stats = useMemo(() => {
    const totalChars = rawTextContent.replace(/<[^>]+>/g, '').length;
    return {
      chars: totalChars,
      blocksCount: blocks.length,
    };
  }, [rawTextContent, blocks]);

  // 渲染单行/单段文本，包含 <del> 与 <ins> 处理
  const renderFormattedText = (text: string) => {
    if (mode === 'clean') {
      // 干净模式：去除 <del>...</del>，剥除 <ins> 标签保留内部文字
      const cleanText = text
        .replace(/<del>[\s\S]*?<\/del>/gi, '')
        .replace(/<ins>([\s\S]*?)<\/ins>/gi, '$1')
        .replace(/<w:delText>[\s\S]*?<\/w:delText>/gi, '')
        .replace(/<w:ins>([\s\S]*?)<\/w:ins>/gi, '$1');
      return <Text style={styles.bodyText}>{cleanText}</Text>;
    }

    // 修订对比模式 (Diff Mode)：拆解 <del> 与 <ins>
    const tokens: Array<{ type: 'text' | 'ins' | 'del'; content: string }> = [];
    const regex = /(<ins>[\s\S]*?<\/ins>|<del>[\s\S]*?<\/del>)/gi;
    const parts = text.split(regex);

    for (const part of parts) {
      if (!part) continue;
      if (/^<ins>([\s\S]*)<\/ins>$/i.test(part)) {
        const match = part.match(/^<ins>([\s\S]*)<\/ins>$/i);
        tokens.push({ type: 'ins', content: match ? match[1] : part });
      } else if (/^<del>([\s\S]*)<\/del>$/i.test(part)) {
        const match = part.match(/^<del>([\s\S]*)<\/del>$/i);
        tokens.push({ type: 'del', content: match ? match[1] : part });
      } else {
        tokens.push({ type: 'text', content: part });
      }
    }

    return (
      <Text style={styles.bodyText}>
        {tokens.map((tok, idx) => {
          if (tok.type === 'ins') {
            return (
              <Text key={idx} style={styles.insText}>
                {tok.content}
              </Text>
            );
          }
          if (tok.type === 'del') {
            return (
              <Text key={idx} style={styles.delText}>
                {tok.content}
              </Text>
            );
          }
          return <Text key={idx}>{tok.content}</Text>;
        })}
      </Text>
    );
  };

  const hasRevisions = useMemo(() => {
    return /<ins>|<del>|<w:ins>|<w:del>/i.test(rawTextContent);
  }, [rawTextContent]);

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent={false}
      visible={visible}
    >
      <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

        {/* 极简通透顶栏 - 零厚重阴影，通透平铺 */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="返回聊天"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
          >
            <Ionicons color={colors.text.title} name="chevron-back" size={24} />
          </Pressable>

          <View style={styles.titleContainer}>
            <Text numberOfLines={1} style={styles.titleText}>
              {displayTitle}
            </Text>
            <Text style={styles.subtitleText}>
              {docTypeLabel} · {stats.chars} 字 · {stats.blocksCount} 段
            </Text>
          </View>

          {/* 模式切换胶囊 (仅在存在修订痕迹时高亮) */}
          {hasRevisions && (
            <Pressable
              accessibilityLabel="切换修订对比"
              accessibilityRole="button"
              onPress={() => setMode((m) => (m === 'clean' ? 'diff' : 'clean'))}
              style={({ pressed }) => [
                styles.modePill,
                mode === 'diff' && styles.modePillActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <Ionicons
                color={mode === 'diff' ? '#006948' : colors.text.secondary}
                name={mode === 'diff' ? 'git-compare' : 'document-text-outline'}
                size={14}
              />
              <Text style={[styles.modePillText, mode === 'diff' && styles.modePillTextActive]}>
                {mode === 'diff' ? '留痕' : '正文'}
              </Text>
            </Pressable>
          )}

          {onExport && (
            <Pressable
              accessibilityLabel="导出文档"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onExport}
              style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}
            >
              <Ionicons color={colors.text.title} name="share-outline" size={20} />
            </Pressable>
          )}
        </View>

        {/* 文档正文平铺展示区 */}
        <View style={styles.contentArea}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#006948" size="small" />
              <Text style={styles.loadingText}>正在打开极简文档...</Text>
            </View>
          ) : parseError ? (
            <View style={styles.emptyContainer}>
              <Ionicons color={colors.text.tertiary} name="alert-circle-outline" size={48} />
              <Text style={styles.emptyText}>无法解析该文档</Text>
              <Text style={styles.emptyHintText}>文件可能已损坏或格式不受支持</Text>
              <Pressable
                accessibilityLabel="关闭"
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                style={({ pressed }) => [styles.errorCloseButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.errorCloseText}>关闭</Text>
              </Pressable>
            </View>
          ) : blocks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons color={colors.text.tertiary} name="document-outline" size={48} />
              <Text style={styles.emptyText}>文档内容为空</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator
              removeClippedSubviews={blocks.length > 20}
            >
              {blocks.map((block) => {
                if (block.kind === 'heading') {
                  return (
                    <View key={block.id} style={styles.headingBlock}>
                      <Text style={styles.headingText}>{block.rawText.replace(/^#+\s*/, '')}</Text>
                    </View>
                  );
                }

                if (block.kind === 'code') {
                  return (
                    <View key={block.id} style={styles.codeBlock}>
                      <Text style={styles.codeText}>{block.rawText}</Text>
                    </View>
                  );
                }

                if (block.kind === 'table') {
                  return (
                    <ScrollView horizontal key={block.id} nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.tableBlock}>
                      <View style={styles.tableInner}>
                        <Text style={styles.tableText}>{block.rawText}</Text>
                      </View>
                    </ScrollView>
                  );
                }

                // 默认普通段落 (Paragraph / List / Quote)
                return (
                  <View key={block.id} style={styles.paragraphBlock}>
                    {renderFormattedText(block.rawText)}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: '#FFFFFF',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1C1C',
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontSize: 11,
    color: '#747878',
    marginTop: 1,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  modePillActive: {
    backgroundColor: '#E6F4EA',
    borderColor: '#34A853',
  },
  modePillText: {
    fontSize: 12,
    color: '#747878',
    marginLeft: 4,
    fontWeight: '500',
  },
  modePillTextActive: {
    color: '#137333',
    fontWeight: '600',
  },
  contentArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#747878',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#C4C7C7',
  },
  emptyHintText: {
    marginTop: 6,
    fontSize: 12,
    color: '#C4C7C7',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  errorCloseButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  errorCloseText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  headingBlock: {
    marginTop: 16,
    marginBottom: 8,
  },
  headingText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1A1C1C',
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  paragraphBlock: {
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 25,
    color: '#2D3748',
    letterSpacing: 0.3,
  },
  codeBlock: {
    backgroundColor: '#F7FAFC',
    padding: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 20,
    color: '#2D3748',
  },
  tableBlock: {
    marginBottom: 12,
  },
  tableInner: {
    backgroundColor: '#F7FAFC',
    padding: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  tableText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    color: '#2D3748',
  },
  insText: {
    backgroundColor: '#E6F4EA',
    color: '#137333',
    fontWeight: '600',
  },
  delText: {
    backgroundColor: '#FCE8E6',
    color: '#C5221F',
    textDecorationLine: 'line-through',
  },
});
