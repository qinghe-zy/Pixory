import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { aiChatLightColors } from './aiChatLightTheme';

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
            <Ionicons color={aiChatLightColors.muted} name="close" size={16} />
          </Pressable>
        </View>
      ) : null}
      {attachments.length ? (
        <View style={styles.attachmentRail}>
          {attachments.map((attachment) => {
            const size = formatAttachmentSize(attachment.size);
            return (
              <View key={attachment.id} style={styles.attachmentChip}>
                <Ionicons color={aiChatLightColors.coral} name={getAttachmentIcon(attachment.kind)} size={16} />
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
                  <Ionicons color={aiChatLightColors.muted} name="close" size={14} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.composerShell}>
        <Pressable accessibilityLabel="添加附件" accessibilityRole="button" disabled={generating || editing} hitSlop={spacing[2]} onPress={onAddAttachment} style={({ pressed }) => [styles.addButton, (generating || editing) && styles.disabled, pressed && !(generating || editing) && styles.pressed]}>
          <Ionicons color={aiChatLightColors.coral} name="add" size={spacing[6]} />
        </Pressable>
        <TextInput
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          ref={inputRef}
          multiline={false}
          numberOfLines={1}
          onChangeText={onChangeText}
          placeholder="输入提示或需求"
          placeholderTextColor={aiChatLightColors.mutedSoft}
          selectionColor={aiChatLightColors.coral}
          style={styles.input}
          textAlignVertical="center"
          value={value}
        />
        <View style={styles.sideActions}>
          {retryAvailable ? (
            <Pressable accessibilityLabel="刷新回复" accessibilityRole="button" hitSlop={spacing[2]} onPress={onRetry} style={({ pressed }) => [styles.micButton, pressed && styles.pressed]}>
              <Ionicons color={aiChatLightColors.coral} name="refresh-outline" size={spacing[5]} />
            </Pressable>
          ) : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.micButton}>
              <Ionicons color={aiChatLightColors.coral} name="mic-outline" size={spacing[5]} />
            </View>
          )}
          {generating ? (
            <Pressable accessibilityLabel="停止回复" accessibilityRole="button" hitSlop={spacing[2]} onPress={onStop} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
              <Ionicons color={aiChatLightColors.onDark} name="stop" size={spacing[5]} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={editing ? '提交重写' : '发送'}
              accessibilityRole="button"
              disabled={!canSend}
              hitSlop={spacing[2]}
              onPress={onSend}
              style={({ pressed }) => [styles.sendButton, !canSend && styles.disabled, pressed && canSend && styles.pressed]}
            >
              <Ionicons color={aiChatLightColors.onDark} name={editing ? 'checkmark' : 'paper-plane-outline'} size={spacing[5]} />
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
    backgroundColor: aiChatLightColors.surface,
    borderColor: aiChatLightColors.hairline,
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
    color: aiChatLightColors.ink,
  },
  attachmentMeta: {
    ...typography.textStyles.micro,
    color: aiChatLightColors.muted,
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
    backgroundColor: aiChatLightColors.surface,
    borderColor: aiChatLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
  },
  editText: {
    ...typography.textStyles.caption,
    color: aiChatLightColors.coralActive,
  },
  editClose: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  composerShell: {
    alignItems: 'center',
    backgroundColor: aiChatLightColors.canvas,
    borderColor: aiChatLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: spacing[10],
    paddingLeft: spacing[2],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
    ...shadows.hairline,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: aiChatLightColors.canvas,
    borderColor: aiChatLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  input: {
    color: aiChatLightColors.ink,
    flex: 1,
    fontFamily: typography.family.base,
    fontSize: typography.size.body,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: 22,
    height: spacing[6],
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
    borderRadius: radius.md,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: aiChatLightColors.coral,
    borderRadius: radius.md,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  disabled: {
    opacity: 0.72,
  },
  pressed: {
    opacity: 0.78,
  },
});
