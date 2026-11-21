import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { PixorySpace } from '../../database';
import { colors, metrics, radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import type { AiModelIconBrand } from '../../ai/aiModelIconService';
import { aiLightColors } from './aiLightTheme';
import { AiModelIcon } from './AiModelIcon';
import { AiMessageTextSelectionModal } from './AiMessageTextSelectionModal';
import { AiVoiceInputStatus, type AiVoiceInputState } from './AiVoiceInputStatus';
import { RhythmBars, MACARON_COLORS } from '../RhythmBars';
import { AiActiveSpectrum } from './AiActiveSpectrum';
import { AiComposerAttachmentBar } from './AiComposerAttachmentBar';

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
  space?: PixorySpace;
  clearSignal?: number;
  attachments?: AiComposerAttachment[];
  modelIconBrand?: AiModelIconBrand;
  hideModelIcon?: boolean;
  hideReplyAssist?: boolean;
  placeholder?: string;
  voiceAvailable?: boolean;
  voiceState?: AiVoiceInputState;
  voiceError?: string | null;
  voiceMode?: 'on_device' | 'system' | null;
  onAddImageAttachment: () => void;
  onAddDocumentAttachment: () => void;
  hasBoundIp?: boolean;
  onSelectIpImages?: () => void;
  onChangeText: (value: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** 当输入框处于手势触摸或文本选中时触发（用于外层按需抑制侧边栏误开） */
  onInputGestureActiveChange?: (active: boolean) => void;
  onComposerHeightChange?: () => void;
  onComposerShellHeightChange?: (height: number) => void;
  onModelIconPress?: () => void;
  onReplyAssist: () => void;
  replyAssistDisabled?: boolean;
  onVoiceInput: () => void;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  onCancelVoiceInput?: () => void;
  onSend: () => void;
  onStop: () => void;
}

export function AiChatComposer({
  value,
  generating,
  space = 'normal',
  clearSignal,
  attachments = [],
  modelIconBrand = 'default',
  hideModelIcon = false,
  hideReplyAssist = false,
  placeholder = '输入消息...',
  voiceAvailable = true,
  voiceState = 'idle',
  voiceError = null,
  voiceMode = null,
  onAddImageAttachment,
  onAddDocumentAttachment,
  hasBoundIp = false,
  onSelectIpImages,
  onChangeText,
  onFocus,
  onBlur,
  onInputGestureActiveChange,
  onComposerHeightChange,
  onComposerShellHeightChange,
  onRemoveAttachment,
  onModelIconPress,
  onReplyAssist,
  replyAssistDisabled = false,
  onVoiceInput,
  onVoiceStart,
  onVoiceStop,
  onCancelVoiceInput,
  onSend,
  onStop,
}: AiChatComposerProps) {
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !generating;
  const inputRef = useRef<TextInput>(null);
  const attachmentCountRef = useRef(attachments.length);
  const prevValueLengthRef = useRef(value.length);
  const prevClearSignalRef = useRef(clearSignal);
  const inputHeightRef = useRef(COMPOSER_INPUT_MIN_HEIGHT);
  const [inputHeight, setInputHeight] = useState<number>(COMPOSER_INPUT_MIN_HEIGHT);
  const [attachmentPopoverVisible, setAttachmentPopoverVisible] = useState(false);
  const voiceStartYRef = useRef(0);
  const voiceLongPressRef = useRef(false);
  const voiceCancelledRef = useRef(false);
  const suppressVoiceTapRef = useRef(false);
  const voiceActive = voiceState === 'listening' || voiceState === 'recognizing';
  const [fullscreenEditVisible, setFullscreenEditVisible] = useState(false);

  const isSelectingRef = useRef(false);
  const isInteractingRef = useRef(false);

  const notifyGestureActive = useCallback(() => {
    const active = isSelectingRef.current || isInteractingRef.current;
    onInputGestureActiveChange?.(active);
  }, [onInputGestureActiveChange]);

  const handleTouchStart = useCallback(() => {
    isInteractingRef.current = true;
    notifyGestureActive();
  }, [notifyGestureActive]);

  const handleTouchEnd = useCallback(() => {
    isInteractingRef.current = false;
    notifyGestureActive();
  }, [notifyGestureActive]);

  const handleSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const { start, end } = e.nativeEvent.selection;
      const selecting = start !== end;
      if (isSelectingRef.current !== selecting) {
        isSelectingRef.current = selecting;
        notifyGestureActive();
      }
    },
    [notifyGestureActive],
  );

  const handleFocus = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    isSelectingRef.current = false;
    isInteractingRef.current = false;
    notifyGestureActive();
    onBlur?.();
  }, [notifyGestureActive, onBlur]);

  useEffect(() => {
    return () => {
      if (isSelectingRef.current || isInteractingRef.current) {
        onInputGestureActiveChange?.(false);
      }
    };
  }, [onInputGestureActiveChange]);

  const updateInputHeight = useCallback((measuredHeight: number) => {
    if (!Number.isFinite(measuredHeight)) {
      return;
    }
    const nextHeight = Math.min(
      COMPOSER_INPUT_MAX_HEIGHT,
      Math.max(COMPOSER_INPUT_MIN_HEIGHT, Math.round(measuredHeight))
    );
    if (Math.abs(nextHeight - inputHeightRef.current) < 1) {
      return;
    }
    inputHeightRef.current = nextHeight;
    setInputHeight(nextHeight);
    onComposerHeightChange?.();
  }, [onComposerHeightChange]);

  const handleMeasuredTextLayout = useCallback((event: LayoutChangeEvent) => {
    updateInputHeight(event.nativeEvent.layout.height);
  }, [updateInputHeight]);

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

  useEffect(() => {
    const previousLength = prevValueLengthRef.current;
    prevValueLengthRef.current = value.length;
    const clearRequested = clearSignal !== undefined && clearSignal !== prevClearSignalRef.current;
    prevClearSignalRef.current = clearSignal;

    if (value.length !== 0) {
      return;
    }

    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      notifyGestureActive();
    }

    const shouldClearNativeInput = clearSignal !== undefined ? clearRequested : previousLength > 0;
    if (shouldClearNativeInput) {
      try {
        inputRef.current?.clear?.();
      } catch {
        // Ignore clear failures if the native TextInput was already torn down.
      }
      updateInputHeight(COMPOSER_INPUT_MIN_HEIGHT);
    } else if (clearSignal === undefined) {
      updateInputHeight(COMPOSER_INPUT_MIN_HEIGHT);
    }
  }, [clearSignal, updateInputHeight, value]);

  return (
    <View style={styles.container}>
      <AiMessageTextSelectionModal
        content={value}
        onClose={(editedText) => {
          setFullscreenEditVisible(false);
          if (editedText !== undefined && editedText !== value) {
            onChangeText(editedText);
          }
        }}
        visible={fullscreenEditVisible}
      />
      <AiVoiceInputStatus error={voiceError} mode={voiceMode} onCancel={onCancelVoiceInput} state={voiceState} />
      <View
        onLayout={(event) =>
          onComposerShellHeightChange?.(event.nativeEvent.layout.height)
        }
        style={styles.composerShell}
      >
        {/* --- Attachment rail (inside the big card) --- */}
        <AiComposerAttachmentBar
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
          space={space}
        />

        {/* --- Text input area --- */}
        <View
          onTouchCancel={handleTouchEnd}
          onTouchEnd={handleTouchEnd}
          onTouchStart={handleTouchStart}
          style={[styles.inputArea, { height: inputHeight }]}
        >
          {/* Android can skip content-size events for controlled text updates, so mirror the value for layout. */}
          <Text
            accessible={false}
            allowFontScaling={false}
            ellipsizeMode="clip"
            maxFontSizeMultiplier={1}
            numberOfLines={MAX_COMPOSER_LINES}
            onLayout={handleMeasuredTextLayout}
            pointerEvents="none"
            style={[styles.inputText, styles.inputMeasurer]}
            textBreakStrategy="simple"
          >
            {value ? `${value}\u200B` : '\u200B'}
          </Text>
          <TextInput
            allowFontScaling={false}
            maxFontSizeMultiplier={1}
            ref={inputRef}
            multiline
            numberOfLines={COMPOSER_INPUT_DEFAULT_LINES}
            onBlur={handleBlur}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onSelectionChange={handleSelectionChange}
            placeholder={placeholder}
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.primary}
            scrollEnabled={inputHeight >= COMPOSER_INPUT_MAX_HEIGHT}
            style={[styles.inputText, styles.input]}
            textAlignVertical="top"
            textBreakStrategy="simple"
            value={value}
          />
        </View>

        {/* --- Bottom toolbar: [model icon]  ...space...  [+ attach] [send/stop] --- */}
        <View style={styles.toolbar}>
          <View style={styles.leftActions}>
            {!hideModelIcon && (
              <Pressable
                accessibilityLabel="当前模型"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={onModelIconPress}
                style={({ pressed }) => [styles.modelIconButton, pressed && styles.pressed]}
              >
                <AiModelIcon brand={modelIconBrand} size={22} />
              </Pressable>
            )}
            {!hideReplyAssist && (
              <Pressable
                accessibilityLabel="AI 帮答"
                accessibilityRole="button"
                accessibilityState={{ disabled: replyAssistDisabled }}
                disabled={replyAssistDisabled}
                hitSlop={spacing[2]}
                onPress={onReplyAssist}
                style={({ pressed }) => [
                  styles.replyAssistButton,
                  replyAssistDisabled && styles.disabled,
                  pressed && !replyAssistDisabled && styles.pressed,
                ]}
              >
                <Svg fill="none" height={spacing[5]} viewBox="0 0 20 20" width={spacing[5]}>
                  <Path
                    d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.001z"
                    fill={aiLightColors.primary}
                  />
                </Svg>
              </Pressable>
            )}
            {inputHeight >= COMPOSER_INPUT_MAX_HEIGHT && (
              <Pressable
                accessibilityLabel="全屏查看与编辑"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => setFullscreenEditVisible(true)}
                style={({ pressed }) => [
                  styles.expandButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={aiLightColors.mutedReadable} name="expand-outline" size={spacing[5]} />
              </Pressable>
            )}
            {generating && (
              <AiActiveSpectrum
                alignItems="center"
                barColors={MACARON_COLORS.slice(0, 4)}
                maxHeightScale={1.4}
                mini
              />
            )}
          </View>

          {/* Spacer */}
          <View style={styles.toolbarSpacer} />

          {/* Right: attachment popover anchor + add button + send/stop */}
          <View style={styles.rightActions}>
            {voiceAvailable ? (
              <Pressable
                accessibilityHint="点按切换；按住说话，松开结束，上滑取消"
                accessibilityLabel={voiceActive ? '结束语音输入' : '语音输入'}
                accessibilityRole="button"
                accessibilityState={{ disabled: generating, selected: voiceActive }}
                disabled={generating}
                hitSlop={spacing[2]}
                onLongPress={() => {
                  voiceLongPressRef.current = true;
                  voiceCancelledRef.current = false;
                  onVoiceStart?.();
                }}
                onPress={() => {
                  if (suppressVoiceTapRef.current) {
                    suppressVoiceTapRef.current = false;
                    return;
                  }
                  onVoiceInput();
                }}
                onPressIn={(event) => {
                  voiceStartYRef.current = event.nativeEvent.pageY;
                  voiceLongPressRef.current = false;
                  voiceCancelledRef.current = false;
                }}
                onPressOut={() => {
                  if (!voiceLongPressRef.current) return;
                  suppressVoiceTapRef.current = true;
                  if (!voiceCancelledRef.current) onVoiceStop?.();
                  voiceLongPressRef.current = false;
                }}
                onTouchMove={(event) => {
                  if (!voiceLongPressRef.current || voiceCancelledRef.current) return;
                  if (event.nativeEvent.pageY <= voiceStartYRef.current - spacing[12]) {
                    voiceCancelledRef.current = true;
                    onCancelVoiceInput?.();
                  }
                }}
                style={({ pressed }) => [
                  styles.voiceButton,
                  voiceActive && styles.voiceButtonActive,
                  generating && styles.disabled,
                  pressed && !generating && styles.pressed,
                ]}
              >
                <Ionicons color={voiceActive ? aiLightColors.primaryActive : aiLightColors.muted} name={voiceActive ? 'mic' : 'mic-outline'} size={spacing[5]} />
              </Pressable>
            ) : null}
            <View style={styles.addButtonWrap}>
              {attachmentPopoverVisible ? (
                <View style={styles.attachmentPopover}>
                  {hasBoundIp && onSelectIpImages ? (
                    <Pressable
                      accessibilityLabel="从IP选择图片"
                      accessibilityRole="menuitem"
                      disabled={generating}
                      onPress={() => {
                        setAttachmentPopoverVisible(false);
                        onSelectIpImages();
                      }}
                      style={({ pressed }) => [
                        styles.attachmentOptionRow,
                        pressed && !generating && styles.attachmentOptionRowPressed,
                      ]}
                    >
                      <Ionicons color={colors.text.primary} name="albums-outline" size={18} />
                      <Text numberOfLines={1} style={styles.attachmentOptionLabel}>从IP选择图片</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel="上传图片"
                    accessibilityRole="menuitem"
                    disabled={generating}
                    onPress={() => {
                      setAttachmentPopoverVisible(false);
                      onAddImageAttachment();
                    }}
                    style={({ pressed }) => [
                      styles.attachmentOptionRow,
                      hasBoundIp && onSelectIpImages && styles.attachmentOptionDivider,
                      pressed && !generating && styles.attachmentOptionRowPressed,
                    ]}
                  >
                    <Ionicons color={colors.text.primary} name="image-outline" size={18} />
                    <Text numberOfLines={1} style={styles.attachmentOptionLabel}>上传图片</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="上传文档"
                    accessibilityRole="menuitem"
                    disabled={generating}
                    onPress={() => {
                      setAttachmentPopoverVisible(false);
                      onAddDocumentAttachment();
                    }}
                    style={({ pressed }) => [
                      styles.attachmentOptionRow,
                      styles.attachmentOptionDivider,
                      pressed && !generating && styles.attachmentOptionRowPressed,
                    ]}
                  >
                    <Ionicons color={colors.text.primary} name="document-text-outline" size={18} />
                    <Text numberOfLines={1} style={styles.attachmentOptionLabel}>上传文档</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                accessibilityLabel="添加附件"
                accessibilityRole="button"
                accessibilityState={{ disabled: generating, expanded: attachmentPopoverVisible }}
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
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                hitSlop={spacing[2]}
                onPress={onSend}
                style={({ pressed }) => [styles.sendButton, !canSend && styles.disabledSendButton, pressed && canSend && styles.pressed]}
              >
                <Ionicons color={!canSend ? aiLightColors.primary : aiLightColors.onDark} name="paper-plane-outline" size={spacing[5]} />
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
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: spacing[10],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    ...shadows.sm,
  },
  /* --- Text input --- */
  inputArea: {
    position: 'relative',
  },
  inputText: {
    color: aiLightColors.ink,
    fontFamily: typography.family.base,
    fontSize: typography.size.body,
    fontWeight: typography.weight.regular,
    includeFontPadding: false,
    lineHeight: COMPOSER_INPUT_LINE_HEIGHT,
    maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
    minHeight: COMPOSER_INPUT_MIN_HEIGHT,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  inputMeasurer: {
    opacity: 0,
    position: 'absolute',
    width: '100%',
  },
  input: {
    height: '100%',
  },
  /* --- Bottom toolbar --- */
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing[2],
  },
  leftActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
  },
  modelIconButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  replyAssistButton: {
    alignItems: 'center',
    /* primarySoft fill — matches the modal accent; no border needed */
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  expandButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
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
  voiceButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  voiceButtonActive: {
    backgroundColor: aiLightColors.primarySoft,
  },

  addButtonWrap: {
    position: 'relative',
  },
  attachmentPopover: {
    backgroundColor: aiLightColors.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'absolute',
    bottom: spacing[8] + spacing[1],
    right: 0,
    width: 156, // Fixed popover menu width matching attachment label column
    zIndex: 100,
    elevation: 8,
    ...shadows.floating,
  },
  attachmentOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    height: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
  },
  attachmentOptionRowPressed: {
    backgroundColor: colors.background.soft,
  },
  attachmentOptionDivider: {
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentOptionLabel: {
    ...typography.textStyles.body,
    color: colors.text.primary,
  },
  addButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
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
