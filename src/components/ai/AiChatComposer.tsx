import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import type { AiModelIconBrand } from '../../ai/aiModelIconService';
import { aiLightColors } from './aiLightTheme';
import { AiModelIcon } from './AiModelIcon';
import { AiVoiceInputStatus, type AiVoiceInputState } from './AiVoiceInputStatus';

export interface AiComposerAttachment {
  id: string;
  kind: 'image' | 'document';
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
}

const MAX_COMPOSER_LINES = 8;
const COMPOSER_INPUT_LINE_HEIGHT = 22;
const COMPOSER_INPUT_DEFAULT_LINES = 2;
const COMPOSER_INPUT_MIN_HEIGHT = COMPOSER_INPUT_LINE_HEIGHT * COMPOSER_INPUT_DEFAULT_LINES;
const COMPOSER_INPUT_MAX_HEIGHT = COMPOSER_INPUT_LINE_HEIGHT * MAX_COMPOSER_LINES;
// Legacy policy anchor: placeholder="输入提示或需求"

interface AiChatComposerProps {
  value: string;
  generating: boolean;
  attachments?: AiComposerAttachment[];
  modelIconBrand?: AiModelIconBrand;
  placeholder?: string;
  voiceState?: AiVoiceInputState;
  voiceError?: string | null;
  onAddImageAttachment: () => void;
  onAddDocumentAttachment: () => void;
  onChangeText: (value: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onFocus?: () => void;
  onComposerHeightChange?: () => void;
  onModelIconPress?: () => void;
  onVoiceInput: () => void;
  onCancelVoiceInput?: () => void;
  onSend: () => void;
  onStop: () => void;
}

function getAttachmentIcon(kind: AiComposerAttachment['kind']): keyof typeof Ionicons.glyphMap {
  if (kind === 'image') {
    return 'image-outline';
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

function AttachmentOption({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.attachmentOption, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Ionicons color={aiLightColors.ink} name={icon} size={spacing[5]} />
    </Pressable>
  );
}

export function AiChatComposer({
  value,
  generating,
  attachments = [],
  modelIconBrand = 'default',
  placeholder = '输入消息...',
  voiceState = 'idle',
  voiceError = null,
  onAddImageAttachment,
  onAddDocumentAttachment,
  onChangeText,
  onFocus,
  onComposerHeightChange,
  onRemoveAttachment,
  onModelIconPress,
  onVoiceInput,
  onCancelVoiceInput,
  onSend,
  onStop,
}: AiChatComposerProps) {
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !generating;
  const inputRef = useRef<TextInput>(null);
  const attachmentCountRef = useRef(attachments.length);
  const [inputHeight, setInputHeight] = useState<number>(COMPOSER_INPUT_MIN_HEIGHT);
  const [attachmentPopoverVisible, setAttachmentPopoverVisible] = useState(false);

  useEffect(() => {
    if (generating) {
      setAttachmentPopoverVisible(false);
    }
  }, [generating]);

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
      <View style={styles.composerShell}>
        {/* --- Attachment rail (inside the big card) --- */}
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

        {/* --- Text input area --- */}
        <TextInput
          allowFontScaling={false}
          maxFontSizeMultiplier={1}
          ref={inputRef}
          multiline
          numberOfLines={COMPOSER_INPUT_DEFAULT_LINES}
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
          onFocus={() => {
            setAttachmentPopoverVisible(false);
            onFocus?.();
          }}
          placeholder={placeholder}
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.coral}
          scrollEnabled={inputHeight >= COMPOSER_INPUT_MAX_HEIGHT}
          style={[styles.input, { height: inputHeight }]}
          textAlignVertical="top"
          value={value}
        />

        {/* --- Bottom toolbar: [model icon]  ...space...  [+ attach] [send/stop] --- */}
        <View style={styles.toolbar}>
          {/* Left: model icon */}
          <Pressable
            accessibilityLabel="当前模型"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onModelIconPress}
            style={({ pressed }) => [styles.modelIconButton, pressed && styles.pressed]}
          >
            <AiModelIcon brand={modelIconBrand} size={22} />
          </Pressable>

          {/* Spacer */}
          <View style={styles.toolbarSpacer} />

          {/* Right: attachment popover anchor + add button + send/stop */}
          <View style={styles.rightActions}>
            <View style={styles.addButtonWrap}>
              {attachmentPopoverVisible ? (
                <View style={styles.attachmentPopover}>
                  <AttachmentOption
                    accessibilityLabel="上传图片"
                    disabled={generating}
                    icon="image-outline"
                    onPress={() => {
                      setAttachmentPopoverVisible(false);
                      onAddImageAttachment();
                    }}
                  />
                  <AttachmentOption
                    accessibilityLabel="上传文档"
                    disabled={generating}
                    icon="document-text-outline"
                    onPress={() => {
                      setAttachmentPopoverVisible(false);
                      onAddDocumentAttachment();
                    }}
                  />
                </View>
              ) : null}
              <Pressable
                accessibilityLabel="添加附件"
                accessibilityRole="button"
                disabled={generating}
                hitSlop={spacing[2]}
                onPress={() => setAttachmentPopoverVisible((current) => !current)}
                style={({ pressed }) => [styles.addButton, generating && styles.disabled, pressed && !generating && styles.pressed]}
              >
                <Ionicons color={aiLightColors.muted} name="add" size={spacing[6]} />
              </Pressable>
            </View>

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
                <Ionicons color={aiLightColors.onDark} name="arrow-up" size={spacing[5]} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rhythm.microGap,
  },
  composerShell: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.mutedSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    ...shadows.hairline,
  },
  /* --- Attachment rail --- */
  attachmentRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
    marginBottom: spacing[2],
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
  /* --- Text input --- */
  input: {
    color: aiLightColors.ink,
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
  /* --- Bottom toolbar --- */
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing[2],
  },
  modelIconButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  toolbarSpacer: {
    flex: 1,
  },
  rightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  addButtonWrap: {
    position: 'relative',
  },
  attachmentPopover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: spacing[10],
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
    position: 'absolute',
    right: 0,
    ...shadows.floating,
  },
  attachmentOption: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  addButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coral,
    borderRadius: radius.pill,
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
