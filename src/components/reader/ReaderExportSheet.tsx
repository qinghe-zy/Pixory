import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DocumentFormat } from '../../ai/readers/readerTypes';
import { layout, radius, spacing, typography } from '../../design/tokens';
import {
  exportDocument,
  safeShareFileAsync,
  saveExportedDocumentToLocalSaf,
} from '../../services/export/exportDocumentService';
import { aiLightColors } from '../ai/aiLightTheme';

export interface ReaderExportSheetProps {
  visible: boolean;
  fileName: string;
  fileUri?: string;
  rawText?: string;
  currentFormat: DocumentFormat;
  onOverrideFormat: (format: DocumentFormat) => void;
  onClose: () => void;
}

const FORMAT_OVERRIDE_OPTIONS: { key: DocumentFormat; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'docx', label: 'Word (DOCX)', icon: 'document-text-outline' },
  { key: 'pdf', label: 'PDF 文档', icon: 'document-attach-outline' },
  { key: 'pptx', label: '幻灯片 (PPTX)', icon: 'easel-outline' },
  { key: 'markdown', label: 'Markdown', icon: 'logo-markdown' },
  { key: 'html', label: '网页 (HTML)', icon: 'code-slash-outline' },
  { key: 'txt', label: '纯文本 / 代码', icon: 'reorder-four-outline' },
];

export const ReaderExportSheet: React.FC<ReaderExportSheetProps> = ({
  visible,
  fileName,
  fileUri,
  rawText,
  currentFormat,
  onOverrideFormat,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  if (!visible) return null;

  // 1. 系统级真实物理文件分享
  const handleShareFile = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!fileUri) {
      Alert.alert('分享提示', '本地文件路径不可用');
      return;
    }
    let mimeType = 'text/plain';
    if (currentFormat === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (currentFormat === 'pdf') mimeType = 'application/pdf';
    else if (currentFormat === 'pptx') mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    else if (currentFormat === 'markdown') mimeType = 'text/markdown';
    else if (currentFormat === 'html') mimeType = 'text/html';

    const shared = await safeShareFileAsync(fileUri, {
      mimeType,
      dialogTitle: `分享 ${fileName}`,
    });
    if (shared) {
      onClose();
    }
  };

  // 2. 在其他应用中打开 (Android Intent.ACTION_VIEW)
  const handleOpenInOtherApp = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!fileUri) {
      Alert.alert('打开提示', '本地物理文件不可用');
      return;
    }
    let mimeType = 'text/plain';
    if (currentFormat === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (currentFormat === 'pdf') mimeType = 'application/pdf';
    else if (currentFormat === 'pptx') mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    else if (currentFormat === 'markdown') mimeType = 'text/markdown';
    else if (currentFormat === 'html') mimeType = 'text/html';

    await safeShareFileAsync(fileUri, {
      mimeType,
      dialogTitle: `使用其他应用打开 ${fileName}`,
    });
    onClose();
  };

  // 3. 导出到系统目录 (SAF / Downloads)
  const handleExportAs = async (targetFormat: 'original' | 'pdf' | 'md' | 'html' | 'txt') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExporting(true);
    setExportMessage('正在生成导出文件...');

    try {
      if (targetFormat === 'original') {
        if (!fileUri) throw new Error('原件路径不可用');
        if (Platform.OS === 'android') {
          await saveExportedDocumentToLocalSaf(fileUri, fileName, 'application/octet-stream');
          Alert.alert('导出成功', `原件已成功保存至本地：\n${fileName}`);
        } else {
          await safeShareFileAsync(fileUri, { dialogTitle: fileName });
        }
        onClose();
        return;
      }

      // 获取文档正文文本（若无 rawText 则尝试异步读取）
      let textContent = rawText || '';
      if (!textContent && fileUri && (targetFormat === 'pdf' || targetFormat === 'html' || targetFormat === 'md' || targetFormat === 'txt')) {
        try {
          textContent = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch {
          textContent = fileName;
        }
      }

      const exportResult = await exportDocument({
        content: textContent || fileName,
        fileName: fileName.replace(/\.[a-zA-Z0-9]+$/, ''),
        format: targetFormat === 'md' ? 'md' : targetFormat === 'pdf' ? 'pdf' : targetFormat === 'html' ? 'html' : 'txt',
      });

      if (Platform.OS === 'android') {
        await saveExportedDocumentToLocalSaf(
          exportResult.fileUri,
          exportResult.fileName,
          exportResult.mimeType
        );
        Alert.alert('保存成功', `文件已成功保存至本地：\n${exportResult.fileName}`, [
          { text: '确定', onPress: onClose },
        ]);
      } else {
        await safeShareFileAsync(exportResult.fileUri, { dialogTitle: exportResult.fileName });
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败，请重试';
      if (!msg.includes('已取消')) {
        Alert.alert('导出提示', msg);
      }
    } finally {
      setIsExporting(false);
      setExportMessage(null);
    }
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>文档选项与导出</Text>
            <Pressable
              accessibilityLabel="关闭"
              accessibilityRole="button"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={styles.closeBtn}
            >
              <Ionicons color={aiLightColors.muted} name="close" size={20} />
            </Pressable>
          </View>

          {isExporting ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={aiLightColors.primary} size="large" />
              <Text style={styles.loadingMessage}>{exportMessage}</Text>
            </View>
          ) : (
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scroll}>
              {/* Top Quick Actions */}
              <View style={styles.quickActionRow}>
                <Pressable
                  accessibilityLabel="分享文件"
                  accessibilityRole="button"
                  onPress={handleShareFile}
                  style={({ pressed }) => [styles.quickActionCard, pressed && styles.cardPressed]}
                >
                  <View style={[styles.quickIconCircle, { backgroundColor: aiLightColors.primarySoft }]}>
                    <Ionicons color={aiLightColors.primary} name="share-social-outline" size={20} />
                  </View>
                  <Text style={styles.quickActionLabel}>分享文件</Text>
                </Pressable>

                <Pressable
                  accessibilityLabel="在外部应用中打开"
                  accessibilityRole="button"
                  onPress={handleOpenInOtherApp}
                  style={({ pressed }) => [styles.quickActionCard, pressed && styles.cardPressed]}
                >
                  <View style={[styles.quickIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons color="#10B981" name="open-outline" size={20} />
                  </View>
                  <Text style={styles.quickActionLabel}>外部应用打开</Text>
                </Pressable>

                <Pressable
                  accessibilityLabel="复制全文文本"
                  accessibilityRole="button"
                  onPress={async () => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (rawText) {
                      await Clipboard.setStringAsync(rawText);
                      Alert.alert('提示', '正文文本已复制到剪贴板');
                    } else if (fileUri) {
                      try {
                        const txt = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
                        await Clipboard.setStringAsync(txt);
                        Alert.alert('提示', '全文文本已复制到剪贴板');
                      } catch {
                        await Clipboard.setStringAsync(fileName);
                        Alert.alert('提示', '文件名已复制到剪贴板');
                      }
                    }
                  }}
                  style={({ pressed }) => [styles.quickActionCard, pressed && styles.cardPressed]}
                >
                  <View style={[styles.quickIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                    <Ionicons color="#F59E0B" name="copy-outline" size={20} />
                  </View>
                  <Text style={styles.quickActionLabel}>复制全文</Text>
                </Pressable>
              </View>

              {/* Export Formats */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>另存 / 导出为</Text>
                <View style={styles.actionList}>
                  <Pressable
                    accessibilityLabel="保存原件到 Download 文件夹"
                    accessibilityRole="button"
                    onPress={() => handleExportAs('original')}
                    style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  >
                    <Ionicons color={aiLightColors.ink} name="download-outline" size={18} />
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionItemTitle}>保存原件到 Download</Text>
                      <Text style={styles.actionItemSub}>以原始格式与文件名完整落盘</Text>
                    </View>
                    <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
                  </Pressable>

                  <Pressable
                    accessibilityLabel="导出为矢量 PDF 文档"
                    accessibilityRole="button"
                    onPress={() => handleExportAs('pdf')}
                    style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  >
                    <Ionicons color="#EF4444" name="document-attach-outline" size={18} />
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionItemTitle}>导出为矢量 PDF 文档</Text>
                      <Text style={styles.actionItemSub}>离线打印引擎，文字可复制、矢量不失真</Text>
                    </View>
                    <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
                  </Pressable>

                  <Pressable
                    accessibilityLabel="导出为 Markdown 文档"
                    accessibilityRole="button"
                    onPress={() => handleExportAs('md')}
                    style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  >
                    <Ionicons color={aiLightColors.ink} name="logo-markdown" size={18} />
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionItemTitle}>导出为 Markdown (.md)</Text>
                      <Text style={styles.actionItemSub}>结构化纯文本排版文档</Text>
                    </View>
                    <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
                  </Pressable>

                  <Pressable
                    accessibilityLabel="导出为自包含网页"
                    accessibilityRole="button"
                    onPress={() => handleExportAs('html')}
                    style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  >
                    <Ionicons color="#3B82F6" name="code-slash-outline" size={18} />
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionItemTitle}>导出为自包含网页 (.html)</Text>
                      <Text style={styles.actionItemSub}>可在任何浏览器中双击直接浏览</Text>
                    </View>
                    <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
                  </Pressable>

                  <Pressable
                    accessibilityLabel="导出为纯文本文档"
                    accessibilityRole="button"
                    onPress={() => handleExportAs('txt')}
                    style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  >
                    <Ionicons color={aiLightColors.muted} name="reorder-four-outline" size={18} />
                    <View style={styles.actionTextCol}>
                      <Text style={styles.actionItemTitle}>导出为纯文本 (.txt)</Text>
                      <Text style={styles.actionItemSub}>去除一切标记的干净正文</Text>
                    </View>
                    <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
                  </Pressable>
                </View>
              </View>

              {/* Format Override */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>更改解析格式 (纠正扩展名或无后缀)</Text>
                <View style={styles.overrideGrid}>
                  {FORMAT_OVERRIDE_OPTIONS.map((item) => {
                    const isSelected = currentFormat === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityLabel={`以 ${item.label} 格式重新解析`}
                        accessibilityRole="button"
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onOverrideFormat(item.key);
                          onClose();
                        }}
                        style={({ pressed }) => [
                          styles.overrideCard,
                          isSelected && styles.overrideCardActive,
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <Ionicons
                          color={isSelected ? aiLightColors.primary : aiLightColors.muted}
                          name={item.icon}
                          size={16}
                        />
                        <Text
                          style={[
                            styles.overrideCardLabel,
                            isSelected && styles.overrideCardLabelActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing[2],
    width: 36,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[1],
  },
  sheetTitle: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    padding: spacing[1],
  },
  scroll: {
    paddingVertical: spacing[2],
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginVertical: spacing[2],
  },
  quickActionCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  cardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  quickIconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: aiLightColors.ink,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing[4],
  },
  sectionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing[2],
  },
  actionList: {
    backgroundColor: aiLightColors.userBubble,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
    gap: spacing[3],
  },
  actionItemPressed: {
    backgroundColor: 'rgba(204, 120, 92, 0.08)',
  },
  actionTextCol: {
    flex: 1,
  },
  actionItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: aiLightColors.ink,
  },
  actionItemSub: {
    fontSize: 11,
    color: aiLightColors.muted,
    marginTop: 2,
  },
  overrideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  overrideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: spacing[2],
  },
  overrideCardActive: {
    borderColor: aiLightColors.primary,
    backgroundColor: 'rgba(204, 120, 92, 0.08)',
  },
  overrideCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: aiLightColors.ink,
  },
  overrideCardLabelActive: {
    color: aiLightColors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: spacing[8],
    alignItems: 'center',
    gap: spacing[3],
  },
  loadingMessage: {
    fontSize: 13,
    color: aiLightColors.muted,
  },
});
