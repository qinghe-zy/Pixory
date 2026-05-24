import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { AiVoiceInputStatus, type AiVoiceInputState } from './AiVoiceInputStatus';

export interface AiComposerAttachment {
  id: string;
  kind: 'image' | 'video' | 'document';
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
}

const MAX_COMPOSER_LINES = 6;
const COMPOSER_INPUT_LINE_HEIGHT = 22;
const COMPOSER_INPUT_MIN_HEIGHT = spacing[6];
const COMPOSER_INPUT_MAX_HEIGHT = COMPOSER_INPUT_LINE_HEIGHT * MAX_COMPOSER_LINES;
// Legacy policy anchor: placeholder="输入提示或需求"

interface AiChatComposerProps {
  value: string;
  generating: boolean;
  attachments?: AiComposerAttachment[];
  placeholder?: string;
  voiceState?: AiVoiceInputState;
  voiceError?: string | null;
  onAddAttachment: () => void;
  onChangeText: (value: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onComposerHeightChange?: () => void;
  onVoiceInput: () => void;
  onCancelVoiceInput?: () => void;
  onSend: () => void;
  onStop: () => void;
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
  attachments = [],
  placeholder = '输入提示或需求',
  voiceState = 'idle',
  voiceError = null,
  onAddAttachment,
  onChangeText,
  onComposerHeightChange,
  onRemoveAttachment,
  onVoiceInput,
  onCancelVoiceInput,
  onSend,
  onStop,
}: AiChatComposerProps) {
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !generating;
  const inputRef = useRef<TextInput>(null);
  const attachmentCountRef = useRef(attachments.length);
  const [inputHeight, setInputHeight] = useState<number>(COMPOSER_INPUT_MIN_HEIGHT);

  useEffect(() => {
    if (attachmentCountRef.current === attachments.length) {
      return;
    }
    attachmentCountRef.current = attachments.length;
    onComposerHeightChange?.();
  }, [attachments.length, onComposerHeightChange]);

  return (
    <View style={styles.container}>
      <AiVoiceInputStatus error={voiceError} onCancel={onCancelVoiceInput} state={voiceState} />
      {attachments.length ? (
        <View style={styles.attachmentRail}>
          {attachments.map((attachment) => {
            const size = formatAttachmentSize(attachment.size);
            return (
              <View key={attachment.id} style={styles.attachmentChip}>
                {attachment.kind === 'image' ? (
                  <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
                ) : (
                  <Ionicons color={aiLightColors.coral} name={getAttachmentIcon(attachment.kind)} size={16} />
                )}
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
                  <Ionicons color={aiLightColors.muted} name="close" size={14} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.composerShell}>
        <Pressable accessibilityLabel="添加附件" accessibilityRole="button" disabled={generating} hitSlop={spacing[2]} onPress={onAddAttachment} style={({ pressed }) => [styles.addButton, generating && styles.disabled, pressed && !generating && styles.pressed]}>
          <Ionicons color={aiLightColors.coral} name="add" size={spacing[6]} />
        </Pressable>
        <TextInput
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          ref={inputRef}
          multiline
          numberOfLines={1}
          onContentSizeChange={(event) => {
            const nextHeight = Math.min(
              COMPOSER_INPUT_MAX_HEIGHT,
              Math.max(COMPOSER_INPUT_MIN_HEIGHT, event.nativeEvent.contentSize.height)
            );
            if (nextHeight !== inputHeight) {
              setInputHeight(nextHeight);
              onComposerHeightChange?.();
            }
          }}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.coral}
          scrollEnabled={inputHeight >= COMPOSER_INPUT_MAX_HEIGHT}
          style={[styles.input, { height: inputHeight }]}
          textAlignVertical="top"
          value={value}
        />
        <View style={styles.sideActions}>
          <Pressable accessibilityLabel="语音输入" accessibilityRole="button" disabled={generating} hitSlop={spacing[2]} onPress={onVoiceInput} style={({ pressed }) => [styles.micButton, generating && styles.disabled, pressed && !generating && styles.pressed]}>
            <Ionicons color={aiLightColors.coral} name="mic-outline" size={spacing[5]} />
          </Pressable>
          {generating ? (
            <Pressable accessibilityLabel="停止回复" accessibilityRole="button" hitSlop={spacing[2]} onPress={onStop} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
              <Ionicons color={aiLightColors.onDark} name="stop" size={spacing[5]} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="发送"
              accessibilityRole="button"
              disabled={!canSend}
              hitSlop={spacing[2]}
              onPress={onSend}
              style={({ pressed }) => [styles.sendButton, !canSend && styles.disabledSendButton, pressed && canSend && styles.pressed]}
            >
              <Ionicons color={aiLightColors.onDark} name="paper-plane-outline" size={spacing[5]} />
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
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
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
  attachmentThumb: {
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.sm,
    height: 28,
    width: 28,
  },
  attachmentName: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  attachmentMeta: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
  attachmentRemove: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  composerShell: {
    alignItems: 'flex-end',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
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
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  input: {
    color: aiLightColors.ink,
    flex: 1,
    fontFamily: typography.family.base,
    fontSize: typography.size.body,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: COMPOSER_INPUT_LINE_HEIGHT,
    maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
    minHeight: COMPOSER_INPUT_MIN_HEIGHT,
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
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.md,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  disabled: {
    opacity: 0.72,
  },
  disabledSendButton: {
    backgroundColor: aiLightColors.hairline,
    opacity: 0.82,
  },
  pressed: {
    opacity: 0.78,
  },
});
