import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { layout } from '../../design/tokens/layout';
import { metrics, radius, spacing, typography } from '../../design/tokens';
import { buildSandboxAssembly } from '../../services/sandbox/sandboxAssembler';
import {
  detectStandaloneArtifactCandidate,
  extractSandboxExecutableCode,
  hasRichFormatting,
} from '../../services/sandbox/sandboxDetector';
import { DocumentExportModal } from '../common/DocumentExportModal';
import { AiMessageContent } from './AiMessageContent';
import { aiLightColors } from './aiLightTheme';
import { WebView } from 'react-native-webview';

type AiMessageTextSelectionModalProps = {
  content: string;
  onClose: (editedContent?: string) => void;
  visible: boolean;
  onOpenSandbox?: (params: { code: string; language?: string; title?: string; messageId?: string }) => void;
};

export function AiMessageTextSelectionModal({
  content,
  onClose,
  visible,
  onOpenSandbox,
}: AiMessageTextSelectionModalProps) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const isRich = useMemo(() => hasRichFormatting(content), [content]);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>(() => (isRich ? 'preview' : 'source'));
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sandboxExecutable = useMemo(() => {
    const candidate =
      detectStandaloneArtifactCandidate(editText, 'html') ||
      detectStandaloneArtifactCandidate(editText, 'svg');
    if (candidate) {
      return { code: candidate.code, language: candidate.language, title: candidate.title };
    }
    const extracted = extractSandboxExecutableCode(editText);
    if (extracted) {
      return { code: extracted.code, language: extracted.language, title: extracted.title };
    }
    return null;
  }, [editText]);

  const { html: assembledHtml, baseUrl } = useMemo(() => {
    if (!sandboxExecutable) return { html: '', baseUrl: 'about:blank' };
    return buildSandboxAssembly({
      code: sandboxExecutable.code,
      language: sandboxExecutable.language,
      title: sandboxExecutable.title,
    });
  }, [sandboxExecutable]);

  // Reset state when modal opens with new content.
  useEffect(() => {
    if (visible) {
      setEditing(false);
      setEditText(content);
      setCopyFeedback(false);
      setExportModalVisible(false);
      setViewMode(isRich ? 'preview' : 'source');
    }
  }, [visible, content, isRich]);

  // Clean up timer on unmount.
  useEffect(() => {
    return () => {
      if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const textToCopy = editing ? editText : content;
    await Clipboard.setStringAsync(textToCopy);
    setCopyFeedback(true);
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = setTimeout(() => setCopyFeedback(false), 1600);
  }, [editing, editText, content]);

  const toggleEdit = useCallback(() => {
    setEditing((prev) => {
      if (!prev) {
        // Entering edit mode — sync the latest content and switch to source.
        setEditText(content);
        setViewMode('source');
      } else if (isRich) {
        setViewMode('preview');
      }
      return !prev;
    });
  }, [content, isRich]);

  const handleBack = useCallback(() => {
    if (editing && editText !== content) {
      Alert.alert('放弃修改', '您有未保存的修改，确定要放弃吗？', [
        { text: '取消', style: 'cancel' },
        { text: '确定', style: 'destructive', onPress: () => onClose() },
      ]);
    } else {
      onClose();
    }
  }, [editing, editText, content, onClose]);

  const handleSave = useCallback(() => {
    if (editing && editText !== content) {
      onClose(editText);
    } else {
      onClose();
    }
  }, [editing, editText, content, onClose]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={handleBack}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              accessibilityLabel="关闭"
              accessibilityRole="button"
              hitSlop={spacing[2]}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={aiLightColors.ink}
                name="chevron-back"
                size={metrics.iconSizeMd}
              />
            </Pressable>

            {isRich && !editing ? (
              <View style={styles.segmentedControl}>
                <Pressable
                  accessibilityLabel="切换到预览"
                  accessibilityRole="button"
                  onPress={() => setViewMode('preview')}
                  style={[styles.segmentTab, viewMode === 'preview' && styles.segmentTabActive]}
                >
                  <Text style={[styles.segmentTabText, viewMode === 'preview' && styles.segmentTabTextActive]}>
                    预览
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="切换到源码"
                  accessibilityRole="button"
                  onPress={() => setViewMode('source')}
                  style={[styles.segmentTab, viewMode === 'source' && styles.segmentTabActive]}
                >
                  <Text style={[styles.segmentTabText, viewMode === 'source' && styles.segmentTabTextActive]}>
                    源码
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <Text numberOfLines={1} style={styles.title}>
            {editing ? '编辑文本' : isRich ? '' : '选择文本'}
          </Text>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel={editing ? '完成编辑' : '切换到编辑'}
              accessibilityRole="button"
              hitSlop={spacing[1]}
              onPress={editing ? handleSave : toggleEdit}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={editing ? aiLightColors.primaryActive : aiLightColors.mutedReadable}
                name={editing ? 'checkmark-outline' : 'create-outline'}
                size={metrics.iconSizeMd}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="复制"
              accessibilityRole="button"
              hitSlop={spacing[1]}
              onPress={() => void handleCopy()}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={copyFeedback ? aiLightColors.primaryActive : aiLightColors.mutedReadable}
                name={copyFeedback ? 'checkmark-done' : 'copy-outline'}
                size={metrics.iconSizeMd}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="导出当前内容"
              accessibilityRole="button"
              hitSlop={spacing[1]}
              onPress={() => setExportModalVisible(true)}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={aiLightColors.mutedReadable}
                name="share-outline"
                size={metrics.iconSizeMd}
              />
            </Pressable>
          </View>
        </View>

        {visible && viewMode === 'preview' && !editing ? (
          sandboxExecutable ? (
            <View style={styles.fullscreenSandboxContainer}>
              <WebView
                allowFileAccess={false}
                allowFileAccessFromFileURLs={false}
                allowUniversalAccessFromFileURLs={false}
                bounces={false}
                domStorageEnabled
                javaScriptCanOpenWindowsAutomatically={false}
                javaScriptEnabled
                mixedContentMode="never"
                originWhitelist={['https://*.sandbox.pixory.local', 'about:blank']}
                setSupportMultipleWindows={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                source={{ html: assembledHtml, baseUrl }}
                style={styles.fullscreenWebView}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.previewContainer}
              style={styles.previewScrollView}
            >
              <AiMessageContent
                content={editText}
                defaultExpanded
                disableFolding
                isLatestMessage={false}
                onOpenSandbox={onOpenSandbox}
              />
            </ScrollView>
          )
        ) : (
          <KeyboardAwareScrollView
            bottomOffset={spacing[4]}
            contentContainerStyle={styles.keyboardAvoiding}
            keyboardShouldPersistTaps="handled"
            style={styles.keyboardAvoiding}
          >
            {editing ? (
              <TextInput
                multiline
                onChangeText={setEditText}
                scrollEnabled={false}
                style={[styles.content, styles.editInput]}
                textAlignVertical="top"
                value={editText}
              />
            ) : (
              <View style={styles.readContainer}>
                <Text selectable selectionColor={aiLightColors.primary} style={styles.content}>
                  {editText}
                </Text>
              </View>
            )}
          </KeyboardAwareScrollView>
        )}

        <DocumentExportModal
          content={editing ? editText : content}
          onClose={() => setExportModalVisible(false)}
          visible={exportModalVisible}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: spacing[12],
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  headerLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  segmentedControl: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 2,
  },
  segmentTab: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  segmentTabText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  segmentTabTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
    textAlign: 'center',
  },
  readContainer: {
    paddingBottom: spacing[8],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[6],
  },
  previewScrollView: {
    flex: 1,
  },
  fullscreenSandboxContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullscreenWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  previewContainer: {
    paddingBottom: spacing[8],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[4],
  },
  content: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  editInput: {
    flex: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingVertical: spacing[2],
  },
  keyboardAvoiding: {
    flexGrow: 1,
  },
  pressed: {
    backgroundColor: aiLightColors.primarySoft,
  },
});
