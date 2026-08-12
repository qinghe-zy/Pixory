import { useCallback, useEffect, useRef, useState } from 'react';
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
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { layout } from '../../design/tokens/layout';
import { metrics, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

type AiMessageTextSelectionModalProps = {
  content: string;
  onClose: (editedContent?: string) => void;
  visible: boolean;
};

export function AiMessageTextSelectionModal({
  content,
  onClose,
  visible,
}: AiMessageTextSelectionModalProps) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens with new content.
  useEffect(() => {
    if (visible) {
      setEditing(false);
      setEditText(content);
      setCopyFeedback(false);
    }
  }, [visible, content]);

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
        // Entering edit mode — sync the latest content.
        setEditText(content);
      }
      return !prev;
    });
  }, [content]);

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
          <Text style={styles.title}>{editing ? '编辑文本' : '选择文本'}</Text>
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
          </View>
        </View>
        <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoiding}>
          {editing ? (
            <TextInput
              multiline
              onChangeText={setEditText}
              scrollEnabled={true}
              style={[styles.content, styles.contentContainer, styles.editInput, { paddingBottom: spacing[8] + insets.bottom }]}
              textAlignVertical="top"
              value={editText}
            />
          ) : (
            <ScrollView
              contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing[8] + insets.bottom }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Text selectable selectionColor={aiLightColors.primary} style={styles.content}>
                {content}
              </Text>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
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
    minHeight: spacing[12],
    paddingHorizontal: layout.pagePaddingHorizontal,
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
  contentContainer: {
    paddingBottom: spacing[8],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[6],
  },
  content: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  editInput: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  pressed: {
    backgroundColor: aiLightColors.primarySoft,
  },
});
