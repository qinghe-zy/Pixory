import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, metrics, radius, rhythm, shadows, spacing, typography } from '../../design/tokens';

export interface AiComposerAttachment {
  id: string;
  kind: 'image' | 'video' | 'document';
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
}

interface AiChatComposerProps {
  value: string;
  generating: boolean;
  editing?: boolean;
  retryAvailable?: boolean;
  attachments?: AiComposerAttachment[];
  onAddAttachment: () => void;
  onChangeText: (value: string) => void;
  onCancelEdit?: () => void;
  onRemoveAttachment?: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  onRetry: () => void;
}

function getAttachmentIcon(kind: AiComposerAttachment['kind']): keyof typeof Ionicons.glyphMap {
  if (kind === 'image') {
    return 'image-outline';
  }
  if (kind === 'video') {
    return 'videocam-outline';
  }
  return 'document-text-outline';
}

function formatAttachmentSize(size?: number | null): string | null {
  if (!size || size <= 0) {
    return null;
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function AiChatComposer({
  value,
  generating,
  editing = false,
  retryAvailable = false,
  attachments = [],
  onAddAttachment,
  onCancelEdit,
  onChangeText,
  onRemoveAttachment,
  onSend,
  onStop,
  onRetry,
}: AiChatComposerProps) {
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !generating;
  const inputRef = useRef<TextInput>(null);

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
      {attachments.length ? (
        <View style={styles.attachmentRail}>
          {attachments.map((attachment) => {
            const size = formatAttachmentSize(attachment.size);
            return (
              <View key={attachment.id} style={styles.attachmentChip}>
                <Ionicons color={colors.primary.active} name={getAttachmentIcon(attachment.kind)} size={16} />
                <View style={styles.attachmentCopy}>
                  <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                  {size ? <Text numberOfLines={1} style={styles.attachmentMeta}>{size}</Text> : null}
                </View>
                <Pressable
                  accessibilityLabel={`移除附件 ${attachment.name}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onRemoveAttachment?.(attachment.id)}
                  style={({ pressed }) => [styles.attachmentRemove, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.text.secondary} name="close" size={14} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.composerShell}>
        <Pressable accessibilityLabel="添加附件" accessibilityRole="button" disabled={generating || editing} onPress={onAddAttachment} style={({ pressed }) => [styles.addButton, (generating || editing) && styles.disabled, pressed && !(generating || editing) && styles.pressed]}>
          <Ionicons color={colors.primary.active} name="add" size={32} />
        </Pressable>
        <TextInput
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          ref={inputRef}
          multiline={false}
          numberOfLines={1}
          onChangeText={onChangeText}
          placeholder="输入问题或整理需求"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          textAlignVertical="center"
          value={value}
        />
        <View style={styles.sideActions}>
          {retryAvailable ? (
            <Pressable accessibilityLabel="刷新回复" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.micButton, pressed && styles.pressed]}>
              <Ionicons color={colors.primary.active} name="refresh-outline" size={30} />
            </Pressable>
          ) : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.micButton}>
              <Ionicons color={colors.primary.active} name="mic-outline" size={30} />
            </View>
          )}
          {generating ? (
            <Pressable accessibilityLabel="停止回复" accessibilityRole="button" onPress={onStop} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
              <Ionicons color={colors.text.inverse} name="stop" size={22} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={editing ? '提交重写' : '发送'}
              accessibilityRole="button"
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => [styles.sendButton, !canSend && styles.disabled, pressed && canSend && styles.pressed]}
            >
              <Ionicons color={colors.text.inverse} name={editing ? 'checkmark' : 'paper-plane-outline'} size={28} />
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
  attachmentRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[2],
  },
  attachmentChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.92)',
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    maxWidth: '100%',
    minHeight: 40,
    paddingLeft: spacing[2],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
  },
  attachmentCopy: {
    maxWidth: 190,
    minWidth: 0,
  },
  attachmentName: {
    ...typography.textStyles.caption,
    color: colors.text.title,
  },
  attachmentMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  attachmentRemove: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
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
  composerShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.9)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 64,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    paddingVertical: spacing[2],
    ...shadows.floating,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.overlay.heroSurface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
  },
  input: {
    color: colors.text.title,
    flex: 1,
    fontFamily: typography.family.base,
    fontSize: typography.size.sectionTitle,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: 26,
    height: metrics.iconButtonSize,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sideActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
  },
  disabled: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.78,
  },
});
