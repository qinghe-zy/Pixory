import React, { useState, useRef, useCallback } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing as REasing,
} from 'react-native-reanimated';
import {
  useReanimatedKeyboardAnimation,
  useKeyboardHandler,
} from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../theme/ImThemeProvider';
import { EmojiPickerPanel } from '../../components/emoji/EmojiPickerPanel';
import { WeChatKeyboardIcon } from './WeChatKeyboardIcon';
import { WeChatVoiceIcon } from './WeChatVoiceIcon';
import { AppDialog } from '../../components/AppDialog';
import { WeChatVoiceRecordHud, type VoiceRecordHudState } from '../../voice/ui/WeChatVoiceRecordHud';
import { useWeChatVoiceRecorder } from '../../voice/ui/useWeChatVoiceRecorder';
import { useSpeechToText } from '../../voice/ui/useSpeechToText';
import { AiVoiceInputStatus } from '../../components/ai/AiVoiceInputStatus';

// ---------------------------------------------------------------------------
// 模块级键盘高度缓存：App 生命周期内跨实例共享，首次弹键盘后即精确校准
// ---------------------------------------------------------------------------
let _cachedKbHeight = 320;
type InputMode = 'IDLE' | 'KB_OPEN' | 'PANEL_OPEN' | 'EMOJI_TO_KB' | 'PANEL_TO_EMOJI';
const clampPanelH = (kbH: number) => Math.min(Math.max(kbH, 240), 420);

export interface ImInputBarRef {
  collapse: () => void;
  closeEmoticons: () => void;
  isEmoticonOpen: () => boolean;
}

export interface ImInputBarProps {
  onSend: (text: string) => void;
  onSendSticker?: (sticker: any) => void;
  onSendVoice?: (voice: { audioUri: string; durationMs: number; transcription?: string }) => void;
  onTextChange?: (text: string) => void;
  onCameraPress?: () => void;
  onSelectImage?: () => void;
  onSelectFile?: () => void;
  onSelectIp?: () => void;
  disabled?: boolean;
  fillDraftText?: string | null;
  space?: 'normal' | 'personal';
  onVoiceRecordStateChange?: (state: VoiceRecordHudState) => void;
}

/**
 * 微信级原生动态输入条与扩展面板 (Authentic WeChat Composer)
 *
 * 优化调整：
 * 1. 左侧不显示麦克风键，输入框向左自然铺满，最大化打字视野。
 * 2. 微信扩展面板 4 等分横纵铺满：
 *    - 1. 拍摄 (Camera) -> 在前
 *    - 2. 照片 (Photo)  -> 在后
 *    - 3. 文件 (File)
 *    - 4. 关联IP (Bind IP)
 */
export const ImInputBar = React.forwardRef<ImInputBarRef, ImInputBarProps>(function ImInputBar(
  {
    onSend,
    onSendSticker,
    onSendVoice,
    onTextChange,
    onCameraPress,
    onSelectImage,
    onSelectFile,
    onSelectIp,
    disabled = false,
    fillDraftText,
    space = 'normal',
    onVoiceRecordStateChange,
  }: ImInputBarProps,
  ref
) {
  const theme = useImTheme();
  const [text, setText] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  const stt = useSpeechToText({
    space,
    onTextChange: (next) => {
      setText((current) => {
        const nextVal = typeof next === 'function' ? next(current) : next;
        onTextChange?.(nextVal);
        return nextVal;
      });
    },
  });

  const voiceRecorder = useWeChatVoiceRecorder({
    onSendVoice,
    onSendText: (txt) => {
      onSend(txt);
      setIsVoiceMode(false);
    },
    space,
    bubbleColor: theme.colors.bubbleRightBackground,
    bubbleRadius: theme.radii.bubbleRadius,
  });

  React.useEffect(() => {
    onVoiceRecordStateChange?.(voiceRecorder.state);
  }, [onVoiceRecordStateChange, voiceRecorder.state]);

  // ---------------------------------------------------------------------------
  // 状态机核心：Reanimated SharedValue 驱动，全程 UI 线程，零跨线程竞争
  // ---------------------------------------------------------------------------

  // 实时键盘高度 SharedValue（keyboard-controller 提供，逐帧更新，负值表示键盘高度）
  const { height: kbHeightSV } = useReanimatedKeyboardAnimation();

  // 虚拟支撑高度：表情面板/过渡期间的托底高度
  const virtualHeight = useSharedValue(0);

  // 状态机模式：运行在 UI 线程，可在 worklet 中安全读写
  const modeSV = useSharedValue<InputMode>('IDLE');

  const [panelVisible, setPanelVisible] = useState(false);
  const [emoticonBarVisible, setEmoticonBarVisible] = useState(false);
  const [isEmojiMounted, setIsEmojiMounted] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const inputRef = useRef<TextInput>(null);
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current);
        switchTimeoutRef.current = null;
      }
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 终极单节点包络线样式（Zero-Jitter Unified Tray）
  // 外层无需任何 KAV，整屏底部高度由 emojiContainerWrapper 单节点独家承载
  // 核心公式：height = max(virtual, kb)
  // 无论键盘与表情面板如何交替互切，max(336, kb) 在整个收起/弹起运动过程中
  // 每一帧在数学上都恒等于常数 336.00px，输入框物理位移 0px，彻底消灭所有抖动！
  // ---------------------------------------------------------------------------
  const animatedPanelStyle = useAnimatedStyle(() => {
    const kb = Math.abs(kbHeightSV.value);
    const virtual = virtualHeight.value;

    return {
      height: Math.max(virtual, kb),
    };
  });

  // ---------------------------------------------------------------------------
  // 键盘精确帧生命周期（useKeyboardHandler 完美兼容 Android & iOS）
  // 替代原生 Keyboard.addListener，可在键盘动画第一帧即拿到目标高度
  // ---------------------------------------------------------------------------

  // JS 层清理函数：在 worklet 完成回调中通过 runOnJS 调用
  const finishEmojiToKbCleanup = useCallback(() => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }
    setIsEmojiMounted(false);
    setEmoticonBarVisible(false);
  }, []);

  // JS 层键盘高度更新函数（在 worklet 中通过 runOnJS 安全更新模块级缓存）
  const updateCachedKbHeight = useCallback((h: number) => {
    if (h > 100) _cachedKbHeight = h;
  }, []);

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        if (e.height > 0) {
          runOnJS(updateCachedKbHeight)(e.height);

          if (modeSV.value === 'EMOJI_TO_KB') {
            // 只有当当前面板高度与实际键盘高度有真实偏差（>2px）时才平滑补齐差值
            // 若高度一致，保持 virtualHeight 完全静止，绝不产生多余位移！
            if (Math.abs(virtualHeight.value - e.height) > 2) {
              virtualHeight.value = withTiming(e.height, {
                duration: e.duration > 0 ? e.duration : 220,
                easing: REasing.out(REasing.cubic),
              });
            } else {
              virtualHeight.value = e.height;
            }
          } else if (modeSV.value === 'IDLE') {
            modeSV.value = 'KB_OPEN';
          }
        }
      },
      onEnd: (e) => {
        'worklet';
        if (e.height > 0) {
          runOnJS(updateCachedKbHeight)(e.height);
          if (modeSV.value === 'EMOJI_TO_KB') {
            modeSV.value = 'KB_OPEN';
            virtualHeight.value = 0; // 此时 kb=e.height，height=max(0, kb)=kb，清零无跳变
            runOnJS(finishEmojiToKbCleanup)();
          } else {
            modeSV.value = 'KB_OPEN';
          }
        } else {
          if (modeSV.value === 'KB_OPEN') {
            modeSV.value = 'IDLE';
          } else if (modeSV.value === 'PANEL_TO_EMOJI') {
            modeSV.value = 'PANEL_OPEN';
          } else if (modeSV.value === 'EMOJI_TO_KB') {
            // 键盘弹出过程中被用户打断收起，立即安全退回 IDLE，无需等待看门狗超时
            modeSV.value = 'IDLE';
            virtualHeight.value = withTiming(0, { duration: 180 });
            runOnJS(finishEmojiToKbCleanup)();
          }
        }
      },
    },
    [finishEmojiToKbCleanup, updateCachedKbHeight]
  );

  // ---------------------------------------------------------------------------
  // 过渡动画函数
  // ---------------------------------------------------------------------------

  /**
   * 表情面板 → 软键盘（EMOJI_TO_KB）
   * 原地绝对锁定，坚决不下沉 20px！
   * virtualHeight 保持当前高度不变，静候软键盘升起接管
   */
  const transitionToKeyboard = useCallback(() => {
    if (modeSV.value === 'EMOJI_TO_KB') return;
    modeSV.value = 'EMOJI_TO_KB';

    // 关键修复：坚决不调用 withTiming 下沉 20px！
    // 保持 virtualHeight 当前高度，等键盘开始上浮触发 onStart 时自然包络覆盖

    inputRef.current?.focus();

    if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
    switchTimeoutRef.current = setTimeout(() => {
      if (modeSV.value === 'EMOJI_TO_KB') {
        virtualHeight.value = withTiming(0, { duration: 200 }, (finished) => {
          'worklet';
          if (finished) {
            modeSV.value = 'IDLE';
            runOnJS(finishEmojiToKbCleanup)();
          }
        });
      }
    }, 550);
  }, [finishEmojiToKbCleanup, modeSV, virtualHeight]);

  /**
   * 软键盘 → 表情面板（PANEL_TO_EMOJI）
   * 锁死当前键盘高度，坚决不调 withSpring 弹动！
   * 键盘下落过程中 height=max(virtual, kb) 恒定为常数，输入框纹丝不动
   */
  const transitionToEmojiFromKeyboard = useCallback(() => {
    const currentKb = Math.abs(kbHeightSV.value) || _cachedKbHeight;
    _cachedKbHeight = clampPanelH(currentKb);

    setIsEmojiMounted(true);
    setEmoticonBarVisible(true);
    setPanelVisible(false);

    modeSV.value = 'PANEL_TO_EMOJI';
    // 关键修复：直接将虚拟高度锁死为真实键盘高度常数，不要执行 withSpring 弹动！
    virtualHeight.value = _cachedKbHeight;

    Keyboard.dismiss();
  }, [kbHeightSV, modeSV, virtualHeight]);

  /**
   * 从 IDLE 状态弹出表情面板（临界阻尼弹簧，无过冲）
   */
  const animateOpenEmoticons = useCallback(() => {
    const panelH = clampPanelH(_cachedKbHeight);
    setIsEmojiMounted(true);
    setEmoticonBarVisible(true);
    setPanelVisible(false);
    modeSV.value = 'PANEL_OPEN';
    virtualHeight.value = 0;
    virtualHeight.value = withSpring(panelH, { damping: 38, stiffness: 380, mass: 1 });
  }, [modeSV, virtualHeight]);

  /**
   * 收起表情面板到 IDLE（180ms 轻快退场）
   */
  const animateCloseEmoticons = useCallback(
    (onFinished?: () => void) => {
      setEmoticonBarVisible(false);
      virtualHeight.value = withTiming(0, { duration: 180 }, (finished) => {
        'worklet';
        if (finished) {
          modeSV.value = 'IDLE';
          runOnJS(setIsEmojiMounted)(false);
          if (onFinished) runOnJS(onFinished)();
        }
      });
    },
    [modeSV, virtualHeight]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      collapse: () => {
        if (stt.isListening) {
          stt.cancelVoiceInput();
        }
        Keyboard.dismiss();
        if (switchTimeoutRef.current) {
          clearTimeout(switchTimeoutRef.current);
          switchTimeoutRef.current = null;
        }
        if (emoticonBarVisible || isEmojiMounted) {
          animateCloseEmoticons();
        }
        if (panelVisible) {
          setPanelVisible(false);
        }
      },
      closeEmoticons: () => {
        if (switchTimeoutRef.current) {
          clearTimeout(switchTimeoutRef.current);
          switchTimeoutRef.current = null;
        }
        if (emoticonBarVisible || isEmojiMounted) {
          animateCloseEmoticons();
        }
      },
      isEmoticonOpen: () => emoticonBarVisible || isEmojiMounted,
    }),
    [animateCloseEmoticons, emoticonBarVisible, isEmojiMounted, panelVisible, stt]
  );

  React.useEffect(() => {
    if (fillDraftText != null) {
      setText(fillDraftText);
      inputRef.current?.focus();
    }
  }, [fillDraftText]);

  const hasText = text.trim().length > 0;
  // 麦克风按钮按需展示：输入框为空时显示；只要用户打字输入内容到输入框，麦克风按钮消失；
  // 当语音识别正在进行中（stt.isListening）时保持显示以便用户随时点击结束识别
  const showInnerMicButton = text.length === 0 || stt.isListening;

  const handleSend = () => {
    if (stt.isListening) {
      stt.cancelVoiceInput();
    }
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    onTextChange?.('');
  };

  const handleTogglePanel = React.useCallback(() => {
    if (panelVisible) {
      setPanelVisible(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      if (emoticonBarVisible || isEmojiMounted) {
        animateCloseEmoticons(() => {
          setPanelVisible(true);
        });
      } else {
        setPanelVisible(true);
      }
    }
  }, [animateCloseEmoticons, emoticonBarVisible, isEmojiMounted, panelVisible]);

  const handleToggleEmoticons = React.useCallback(() => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }

    // 若当前处于语音输入模式（按住说话药丸），点击表情按钮切换到表情面板时，
    // 输入框自动切换为正常的文字输入框，同时取消潜在的语音识别
    if (isVoiceMode) {
      setIsVoiceMode(false);
      if (stt.isListening) {
        stt.cancelVoiceInput();
      }
    }

    if (emoticonBarVisible || isEmojiMounted) {
      // 处于表情面板中，点击微信键盘图标切换为文字输入 (平稳接力)
      transitionToKeyboard();
    } else if (modeSV.value === 'KB_OPEN') {
      // 处于软键盘开启输入中，点击笑脸切换至表情面板：原地承托接力，零掉落零弹起！
      transitionToEmojiFromKeyboard();
    } else {
      // 处于静止底栏零态或语音输入态，点击笑脸切换至表情面板：干脆利落弹出
      Keyboard.dismiss();
      animateOpenEmoticons();
    }
  }, [
    animateOpenEmoticons,
    emoticonBarVisible,
    isEmojiMounted,
    isVoiceMode,
    modeSV,
    stt,
    transitionToKeyboard,
    transitionToEmojiFromKeyboard,
  ]);

  const handleToggleVoiceMode = React.useCallback(() => {
    if (stt.isListening) {
      stt.cancelVoiceInput();
    }
    if (isVoiceMode) {
      setIsVoiceMode(false);
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      Keyboard.dismiss();
      if (emoticonBarVisible || isEmojiMounted) {
        animateCloseEmoticons();
      }
      if (panelVisible) {
        setPanelVisible(false);
      }
      setIsVoiceMode(true);
    }
  }, [animateCloseEmoticons, emoticonBarVisible, isEmojiMounted, isVoiceMode, panelVisible]);

  const handleInsertText = (insertStr: string) => {
    const start = selection.start ?? text.length;
    const end = selection.end ?? text.length;
    const next = text.slice(0, start) + insertStr + text.slice(end);
    const newPos = start + insertStr.length;
    setText(next);
    setSelection({ start: newPos, end: newPos });
    onTextChange?.(next);
  };

  const handleBackspace = () => {
    if (!text) return;
    const start = selection.start ?? text.length;
    const end = selection.end ?? text.length;
    if (start !== end) {
      const next = text.slice(0, start) + text.slice(end);
      setText(next);
      setSelection({ start, end: start });
      onTextChange?.(next);
      return;
    }
    if (start === 0) return;
    const chars = Array.from(text.slice(0, start));
    chars.pop();
    const nextBefore = chars.join('');
    const next = nextBefore + text.slice(start);
    const newPos = nextBefore.length;
    setText(next);
    setSelection({ start: newPos, end: newPos });
    onTextChange?.(next);
  };

  return (
    <>
      <View
        style={[
          styles.composerWrapper,
          {
            backgroundColor: theme.colors.composerBackground,
            borderTopColor: theme.colors.composerBorder,
          },
        ]}
      >
      <AiVoiceInputStatus
        error={stt.voiceError}
        onAutoDismiss={stt.clearError}
        state={stt.voiceState}
      />
      {/* 顶部主输入行 (minHeight 52px) */}
      <View
        style={[
          styles.mainBar,
          { minHeight: theme.metrics.composerMinHeight },
        ]}
      >
        {/* 左一：语音 / 键盘切换 (微信同款) */}
        <Pressable
          accessibilityLabel={isVoiceMode ? '切换到键盘输入' : '切换到语音输入'}
          accessibilityRole="button"
          hitSlop={6}
          onPress={handleToggleVoiceMode}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          {isVoiceMode ? (
            <WeChatKeyboardIcon
              color={theme.colors.actionIconColor}
              size={28}
              strokeWidth={1.9}
            />
          ) : (
            <WeChatVoiceIcon
              color={theme.colors.actionIconColor}
              size={28}
              strokeWidth={1.9}
            />
          )}
        </Pressable>

        {/* 中间：按住说话药丸按钮 或 文本输入框 */}
        {isVoiceMode ? (
          <View
            accessibilityLabel={
              voiceRecorder.isHolding
                ? voiceRecorder.state === 'canceling'
                  ? '松开手指取消发送'
                  : '松开结束录音'
                : '按住说话，松开结束，上滑取消'
            }
            accessibilityRole="button"
            style={[
              styles.voiceHoldButton,
              {
                backgroundColor: voiceRecorder.isHolding
                  ? theme.colors.sendButtonDisabled || '#E1E1E1'
                  : theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                borderRadius: theme.radii.inputRadius,
                minHeight: theme.metrics.inputMinHeight,
              },
            ]}
            {...voiceRecorder.responderProps}
          >
            <Text
              style={[
                styles.voiceHoldButtonText,
                {
                  color: theme.colors.inputText,
                },
              ]}
            >
              {voiceRecorder.isHolding
                ? voiceRecorder.state === 'canceling'
                  ? '松开手指 取消发送'
                  : '松开 结束'
                : '按住 说话'}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                borderRadius: theme.radii.inputRadius,
                minHeight: theme.metrics.inputMinHeight,
              },
            ]}
          >
            <TextInput
              editable={!disabled}
              multiline
              onChangeText={(next) => {
                setText(next);
                onTextChange?.(next);
                if (stt.isListening) {
                  stt.cancelVoiceInput();
                }
                if (panelVisible && next.length > 0) {
                  setPanelVisible(false);
                }
              }}
              onFocus={() => {
                if (emoticonBarVisible || isEmojiMounted) {
                  transitionToKeyboard();
                }
                setPanelVisible(false);
              }}
              onSelectionChange={(e) => {
                setSelection(e.nativeEvent.selection);
              }}
              placeholder=""
              placeholderTextColor={theme.colors.inputPlaceholder}
              ref={inputRef}
              style={[
                styles.textInput,
                {
                  color: theme.colors.inputText,
                  fontSize: theme.typography.inputFontSize,
                  lineHeight: theme.typography.inputLineHeight,
                  maxHeight: theme.metrics.inputMaxHeight,
                },
              ]}
              value={text}
            />
            {/* 麦克风语音转文字按钮：内嵌于伴聊输入框右侧（打字有内容时自动隐藏） */}
            {showInnerMicButton ? (
              <Pressable
                accessibilityLabel={stt.isListening ? '结束语音转文字' : '语音转文字'}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  void stt.toggleVoiceInput();
                }}
                style={({ pressed }) => [
                  styles.inputInnerMicButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  color={stt.isListening ? '#10B981' : theme.colors.actionIconColor || '#64748B'}
                  name={stt.isListening ? 'mic' : 'mic-outline'}
                  size={22}
                />
              </Pressable>
            ) : null}
          </View>
        )}

        {/* 右一：快捷表情按钮 (微信原生切换：展开表情时切换为键盘圆标) */}
        <Pressable
          accessibilityLabel={emoticonBarVisible ? '切换回键盘输入' : '快捷表情与动作'}
          accessibilityRole="button"
          hitSlop={6}
          onPress={handleToggleEmoticons}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          {emoticonBarVisible ? (
            <WeChatKeyboardIcon
              color={theme.colors.actionIconColor}
              size={28}
              strokeWidth={1.9}
            />
          ) : (
            <Ionicons
              color={theme.colors.actionIconColor}
              name="happy-outline"
              size={28}
            />
          )}
        </Pressable>

        {/* 右二：动态操作区 (+ 号 vs 发送键) */}
        {hasText ? (
          <Pressable
            accessibilityLabel="发送消息"
            accessibilityRole="button"
            hitSlop={6}
            onPress={handleSend}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: theme.colors.sendButtonBackground,
                borderRadius: theme.radii.sendButtonRadius,
              },
              pressed && styles.sendButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.sendButtonText,
                {
                  color: theme.colors.sendButtonText,
                  fontSize: theme.typography.sendButtonFontSize,
                },
              ]}
            >
              发送
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="更多选项"
            accessibilityRole="button"
            hitSlop={6}
            onPress={handleTogglePanel}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={theme.colors.actionIconColor}
              name={panelVisible ? 'close-circle-outline' : 'add-circle-outline'}
              size={28}
            />
          </Pressable>
        )}
      </View>

      {/* 表情面板容器：Reanimated.View 常驻渲染，高度由差值补偿公式驱动
          isEmojiMounted 只控制内部 EmojiPickerPanel 是否渲染（避免卸载后高度动画失效）
          外层容器必须始终挂载，才能在切换第一帧即生效 */}
      <Reanimated.View style={[styles.emojiContainerWrapper, animatedPanelStyle]}>
        {isEmojiMounted && (
          <EmojiPickerPanel
            height={clampPanelH(_cachedKbHeight)}
            onBackspace={handleBackspace}
            onSelectAnimatedEmoji={(sticker) => {
              onSendSticker?.(sticker);
            }}
            onSelectKaomoji={handleInsertText}
            onSelectStaticEmoji={handleInsertText}
            space={space}
          />
        )}
      </Reanimated.View>

      {/* 底部扩展面板 (4等分横向纵向铺满) */}
      {panelVisible && (
        <View
          style={[
            styles.attachmentPanel,
            {
              backgroundColor: theme.colors.attachmentPanelBackground,
              borderTopColor: theme.colors.composerBorder,
            },
          ]}
        >
          <View style={styles.gridRowSpread}>
            {/* 1. 拍摄 (在前) */}
            <Pressable
              accessibilityLabel="拍摄照片"
              accessibilityRole="button"
              onPress={() => {
                setPanelVisible(false);
                onCameraPress?.();
              }}
              style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: theme.colors.attachmentItemCardBackground,
                    borderRadius: theme.radii.attachmentCardRadius,
                  },
                ]}
              >
                <Ionicons color="#1D4ED8" name="camera-outline" size={28} />
              </View>
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: theme.colors.attachmentItemText,
                    fontSize: theme.typography.attachmentItemFontSize,
                  },
                ]}
              >
                拍摄
              </Text>
            </Pressable>

            {/* 2. 照片 (在后) */}
            <Pressable
              accessibilityLabel="相册照片"
              accessibilityRole="button"
              onPress={() => {
                setPanelVisible(false);
                onSelectImage?.();
              }}
              style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: theme.colors.attachmentItemCardBackground,
                    borderRadius: theme.radii.attachmentCardRadius,
                  },
                ]}
              >
                <Ionicons color="#2BA245" name="image-outline" size={28} />
              </View>
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: theme.colors.attachmentItemText,
                    fontSize: theme.typography.attachmentItemFontSize,
                  },
                ]}
              >
                照片
              </Text>
            </Pressable>

            {/* 3. 文件 */}
            <Pressable
              accessibilityLabel="发送文件"
              accessibilityRole="button"
              onPress={() => {
                setPanelVisible(false);
                onSelectFile?.();
              }}
              style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: theme.colors.attachmentItemCardBackground,
                    borderRadius: theme.radii.attachmentCardRadius,
                  },
                ]}
              >
                <Ionicons color="#FA9D3B" name="document-text-outline" size={28} />
              </View>
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: theme.colors.attachmentItemText,
                    fontSize: theme.typography.attachmentItemFontSize,
                  },
                ]}
              >
                文件
              </Text>
            </Pressable>

            {/* 4. 关联IP */}
            <Pressable
              accessibilityLabel="关联IP素材图片"
              accessibilityRole="button"
              onPress={() => {
                setPanelVisible(false);
                onSelectIp?.();
              }}
              style={({ pressed }) => [styles.gridCell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: theme.colors.attachmentItemCardBackground,
                    borderRadius: theme.radii.attachmentCardRadius,
                  },
                ]}
              >
                <Ionicons color="#006948" name="color-palette-outline" size={28} />
              </View>
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: theme.colors.attachmentItemText,
                    fontSize: theme.typography.attachmentItemFontSize,
                  },
                ]}
              >
                关联IP
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      </View>

      {/* 全屏微信同款长按录音 HUD 浮层与转文字卡片 (作为直属全视口浮层，摆脱 composerWrapper 60px 裁切) */}
      <WeChatVoiceRecordHud {...voiceRecorder.hudProps} />

      {/* 统一黑白灰小圆角极简提示弹窗 */}
      <AppDialog
        appearance="opaqueMonochrome"
        visible={!!voiceRecorder.dialogState}
        title={voiceRecorder.dialogState?.title || ''}
        message={voiceRecorder.dialogState?.message}
        primaryLabel="知道了"
        onPrimary={voiceRecorder.closeDialog}
        onClose={voiceRecorder.closeDialog}
        secondaryLabel={null}
      />
    </>
  );
});

const styles = StyleSheet.create({
  voiceHoldButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  voiceHoldButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emojiContainerWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  composerWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mainBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
  },
  inputInnerMicButton: {
    paddingLeft: 6,
    paddingRight: 2,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    height: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendButtonText: {
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
  attachmentPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 18,
    paddingBottom: 28,
  },
  gridRowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  itemCard: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  itemLabel: {
    fontWeight: '400',
  },
});
