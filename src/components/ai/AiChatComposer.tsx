import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, componentTokens, radius, rhythm, spacing, typography } from '../../design/tokens';

interface AiChatComposerProps {
  value: string;
  generating: boolean;
  editing?: boolean;
  retryAvailable?: boolean;
  onChangeText: (value: string) => void;
  onCancelEdit?: () => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
}

export function AiChatComposer({ value, generating, editing = false, retryAvailable = false, onCancelEdit, onChangeText, onSend, onStop, onRetry }: AiChatComposerProps) {
  const canSend = value.trim().length > 0 && !generating;

  return (
    <View style={styles.container}>
      {editing ? (
        <View style={styles.editBar}>
          <Text style={styles.editText}>重写</Text>
          <Pressable accessibilityLabel="取消重写" accessibilityRole="button" onPress={onCancelEdit} style={({ pressed }) => [styles.editClose, pressed && styles.pressed]}>
            <Ionicons color={colors.text.secondary} name="close" size={16} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.wrap}>
        <TextInput
          multiline
          onChangeText={onChangeText}
          placeholder="输入问题或整理需求"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          textAlignVertical="top"
          value={value}
        />
        <View style={styles.actions}>
          {retryAvailable ? (
            <Pressable accessibilityLabel="刷新回复" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons color={colors.primary.active} name="refresh-outline" size={20} />
            </Pressable>
          ) : null}
          {generating ? (
            <Pressable accessibilityLabel="停止回复" accessibilityRole="button" onPress={onStop} style={({ pressed }) => [styles.iconButton, styles.stopButton, pressed && styles.pressed]}>
              <Ionicons color={colors.semantic.danger} name="stop" size={20} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={editing ? '提交重写' : '发送'}
              accessibilityRole="button"
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => [styles.sendButton, !canSend && styles.disabled, pressed && canSend && styles.pressed]}
            >
              <Ionicons color={colors.text.inverse} name={editing ? 'checkmark' : 'send'} size={18} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rhythm.microGap,
  },
  editBar: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.tag,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
  },
  editText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  editClose: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  wrap: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    maxHeight: 112,
    minHeight: 48,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  actions: {
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  stopButton: {
    backgroundColor: colors.semantic.dangerBackground,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.78,
  },
});
