import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';

import { colors, radius, spacing, typography } from '../../design/tokens';
import {
  EXPORT_FORMAT_OPTIONS,
  type ExportDocumentFormat,
  type ExportDocumentResult,
} from '../../services/export/exportDocumentTypes';
import {
  buildDefaultExportFileName,
  detectSuggestedExportFormat,
  exportDocument,
  saveExportedDocumentToLocalSaf,
  shareExportedDocument,
} from '../../services/export/exportDocumentService';

export interface DocumentExportModalProps {
  visible: boolean;
  content: string;
  onClose: () => void;
  defaultTitle?: string;
  onExportSuccess?: (result: ExportDocumentResult) => void;
}

export function DocumentExportModal({
  visible,
  content,
  onClose,
  defaultTitle,
  onExportSuccess,
}: DocumentExportModalProps) {
  const [fileName, setFileName] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<ExportDocumentFormat>('md');
  const [formatMenuVisible, setFormatMenuVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<TextInput | null>(null);

  // 当弹窗打开时，初始化预填充文件名与智能格式预猜
  useEffect(() => {
    if (visible) {
      const initialName = buildDefaultExportFileName(content, defaultTitle);
      const suggested = detectSuggestedExportFormat(content);

      setFileName(initialName);
      setSelectedFormat(suggested);
      setFormatMenuVisible(false);
      setIsExporting(false);

      // 默认全选：初始设置全选选区并聚焦输入框
      setSelection({ start: 0, end: initialName.length });
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        // 聚焦后将 selection 释放为非受控状态，保证输入法顺畅
        setTimeout(() => {
          setSelection(undefined);
        }, 300);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [visible, content, defaultTitle]);

  // 处理输入变化：用户键入新字符时立即解除受控选区
  const handleTextChange = useCallback((text: string) => {
    setFileName(text);
    if (selection !== undefined) {
      setSelection(undefined);
    }
  }, [selection]);

  // 处理选区变动：用户点击文本任意位置时解除全选
  const handleSelectionChange = useCallback(
    (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
      const { start, end } = e.nativeEvent.selection;
      if (selection && (start !== 0 || end !== fileName.length)) {
        setSelection(undefined);
      }
    },
    [selection, fileName.length]
  );

  // 一键全删
  const handleClear = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFileName('');
    setSelection(undefined);
    inputRef.current?.focus();
  }, []);

  // 点击格式选择框：收起软键盘并展开下拉菜单
  const handleToggleFormatMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setFormatMenuVisible((prev) => !prev);
  }, []);

  // 点击遮罩：如果下拉菜单展开则先收起菜单，否则关闭弹窗
  const handleOverlayPress = useCallback(() => {
    if (formatMenuVisible) {
      setFormatMenuVisible(false);
      return;
    }
    Keyboard.dismiss();
    onClose();
  }, [formatMenuVisible, onClose]);

  // 保存到本地（Android SAF 目录选择器）
  const handleSaveToLocal = useCallback(async () => {
    if (isExporting) return;

    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
      const result = await exportDocument({
        content,
        fileName: fileName.trim() || '未命名文档',
        format: selectedFormat,
      });

      if (Platform.OS === 'android') {
        await saveExportedDocumentToLocalSaf(
          result.fileUri,
          result.fileName,
          result.mimeType
        );
        onExportSuccess?.(result);
        Alert.alert('保存成功', `文件已成功保存至本地：\n${result.fileName}`, [
          { text: '确定', onPress: onClose },
        ]);
      } else {
        await shareExportedDocument(result);
        onExportSuccess?.(result);
        onClose();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败，请重试';
      if (!message.includes('已取消')) {
        Alert.alert('保存提示', message);
      }
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, content, fileName, selectedFormat, onExportSuccess, onClose]);

  // 复制全文
  const handleCopyContent = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await exportDocument({
        content,
        fileName: fileName.trim() || '未命名文档',
        format: selectedFormat,
      });
      const fileContent = await FileSystem.readAsStringAsync(result.fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Clipboard.setStringAsync(fileContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await Clipboard.setStringAsync(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content, fileName, selectedFormat]);

  // 分享文档
  const handleShare = useCallback(async () => {
    if (isExporting) return;

    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
      const result = await exportDocument({
        content,
        fileName: fileName.trim() || '未命名文档',
        format: selectedFormat,
      });

      await shareExportedDocument(result);
      onExportSuccess?.(result);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '分享失败，请重试';
      Alert.alert('分享提示', message);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, content, fileName, selectedFormat, onExportSuccess, onClose]);

  const currentOption = EXPORT_FORMAT_OPTIONS.find((opt) => opt.format === selectedFormat) || EXPORT_FORMAT_OPTIONS[0];

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoiding}
      >
        <Pressable
          accessibilityLabel="关闭弹窗遮罩"
          onPress={handleOverlayPress}
          style={styles.overlay}
        >
          {/* 拦截卡片区域的点击事件，防止冒泡到遮罩 */}
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
            <Text style={styles.title}>导出文档</Text>

            {/* 核心双栏输入区：左侧文件名 + 右侧格式下拉 */}
            <View style={styles.inputRow}>
              {/* 左侧：文件名输入框（带下划线、全选高亮、一键清空） */}
              <View
                style={[
                  styles.fileNameContainer,
                  isFocused ? styles.inputUnderlineActive : styles.inputUnderlineDefault,
                ]}
              >
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={() => setIsFocused(false)}
                  onChangeText={handleTextChange}
                  onFocus={() => {
                    setIsFocused(true);
                    setFormatMenuVisible(false); // 聚焦输入框时自动收起格式菜单
                  }}
                  onSelectionChange={handleSelectionChange}
                  placeholder="文件名"
                  placeholderTextColor={colors.text.placeholder}
                  ref={inputRef}
                  selectTextOnFocus
                  selection={selection}
                  selectionColor="#3B82F6"
                  style={styles.fileNameInput}
                  value={fileName}
                />

                {fileName.length > 0 && (
                  <Pressable
                    accessibilityLabel="一键清空文件名"
                    hitSlop={8}
                    onPress={handleClear}
                    style={styles.clearButton}
                  >
                    <View style={styles.clearIconCircle}>
                      <Ionicons color="#64748B" name="close" size={12} />
                    </View>
                  </Pressable>
                )}
              </View>

              {/* 右侧：格式选择框（带下划线、下三角标） */}
              <Pressable
                accessibilityLabel="选择文档格式"
                accessibilityRole="button"
                onPress={handleToggleFormatMenu}
                style={[
                  styles.formatSelector,
                  formatMenuVisible ? styles.inputUnderlineActive : styles.inputUnderlineDefault,
                ]}
              >
                <Text style={styles.formatText}>{currentOption.extension}</Text>
                <Ionicons
                  color="#94A3B8"
                  name="caret-down"
                  size={12}
                  style={styles.formatCaret}
                />
              </Pressable>
            </View>

            {/* 格式下拉选择菜单 */}
            {formatMenuVisible && (
              <View style={styles.formatDropdown}>
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  style={styles.formatDropdownScroll}
                >
                  {EXPORT_FORMAT_OPTIONS.map((opt) => {
                    const isSelected = opt.format === selectedFormat;
                    return (
                      <Pressable
                        key={opt.format}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedFormat(opt.format);
                          setFormatMenuVisible(false);
                        }}
                        style={[
                          styles.formatOptionItem,
                          isSelected && styles.formatOptionItemSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.formatOptionLabel,
                            isSelected && styles.formatOptionLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            color={colors.primary.default}
                            name="checkmark"
                            size={16}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* 底部操作按钮 */}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityLabel="取消"
                accessibilityRole="button"
                disabled={isExporting}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>取消</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="复制全文"
                accessibilityRole="button"
                disabled={isExporting}
                onPress={() => void handleCopyContent()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons
                  color={copied ? colors.text.primary : colors.text.secondary}
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={14}
                />
                <Text style={styles.secondaryButtonText}>{copied ? '已复制' : '复制'}</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="保存到本地"
                accessibilityRole="button"
                disabled={isExporting}
                onPress={() => void handleSaveToLocal()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  isExporting && styles.buttonDisabled,
                ]}
              >
                {isExporting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons color="#FFFFFF" name="download-outline" size={15} />
                    <Text style={styles.primaryButtonText}>保存本地</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    elevation: 8,
    maxWidth: 420,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[6],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    width: '100%',
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
    marginBottom: spacing[6],
    textAlign: 'center',
  },
  inputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing[4],
    marginBottom: spacing[4],
  },
  fileNameContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    height: 44,
    paddingBottom: spacing[1],
  },
  fileNameInput: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    flex: 1,
    fontSize: 16,
    height: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  clearButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    paddingLeft: spacing[2],
    width: 32,
  },
  clearIconCircle: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: radius.pill,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  formatSelector: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
    justifyContent: 'flex-end',
    minWidth: 72,
    paddingBottom: spacing[1],
    paddingHorizontal: spacing[2],
  },
  formatText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    fontSize: 16,
  },
  formatCaret: {
    marginLeft: spacing[1],
  },
  inputUnderlineDefault: {
    borderBottomColor: '#CBD5E1',
    borderBottomWidth: 1.5,
  },
  inputUnderlineActive: {
    borderBottomColor: '#3B82F6',
    borderBottomWidth: 1.5,
  },
  formatDropdown: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 6,
    marginBottom: spacing[4],
    maxHeight: 200,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  formatDropdownScroll: {
    maxHeight: 200,
  },
  formatOptionItem: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  formatOptionItemSelected: {
    backgroundColor: '#F1F5F9',
  },
  formatOptionLabel: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    fontSize: 14,
  },
  formatOptionLabelSelected: {
    ...typography.textStyles.bodyStrong,
    color: colors.primary.default,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    height: 44,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.secondary,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    flex: 1.35,
    flexDirection: 'row',
    gap: 4,
    height: 44,
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
