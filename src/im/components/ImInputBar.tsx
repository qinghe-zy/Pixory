import React, { useState, useRef } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../theme/ImThemeProvider';
import { EmojiPickerPanel } from '../../components/emoji/EmojiPickerPanel';
import { WeChatKeyboardIcon } from './WeChatKeyboardIcon';

export interface ImInputBarRef {
  collapse: () => void;
  closeEmoticons: () => void;
  isEmoticonOpen: () => boolean;
}

export interface ImInputBarProps {
  onSend: (text: string) => void;
  onSendSticker?: (sticker: any) => void;
  onTextChange?: (text: string) => void;
  onCameraPress?: () => void;
  onSelectImage?: () => void;
  onSelectFile?: () => void;
  onSelectIp?: () => void;
  disabled?: boolean;
  fillDraftText?: string | null;
  space?: 'normal' | 'personal';
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
    onTextChange,
    onCameraPress,
    onSelectImage,
    onSelectFile,
    onSelectIp,
    disabled = false,
    fillDraftText,
    space = 'normal',
  }: ImInputBarProps,
  ref
) {
  const EMOJI_PANEL_HEIGHT = 365; // 高度适度提升，展现更多表情行
  const theme = useImTheme();
  const [text, setText] = useState('');
  const [panelVisible, setPanelVisible] = useState(false);
  const [emoticonBarVisible, setEmoticonBarVisible] = useState(false);
  const [isEmojiMounted, setIsEmojiMounted] = useState(false);
  const panelHeightAnim = useRef(new Animated.Value(0)).current;
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const inputRef = useRef<TextInput>(null);
  const isSwitchingToKeyboardRef = useRef(false);
  const keyboardHeightRef = useRef(300);
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 极平滑慢速收起表情面板 (520ms 优雅缓动下落，彻底杜绝瞬间骤降与触底剧烈弹跳)
   */
  const animateCloseEmoticons = React.useCallback(
    (onFinished?: () => void) => {
      setEmoticonBarVisible(false);
      Animated.timing(panelHeightAnim, {
        toValue: 0,
        duration: 520, // 极慢平滑下落
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          setIsEmojiMounted(false);
          onFinished?.();
        }
      });
    },
    [panelHeightAnim]
  );

  /**
   * 平滑升起表情面板
   */
  const animateOpenEmoticons = React.useCallback(() => {
    setIsEmojiMounted(true);
    setEmoticonBarVisible(true);
    setPanelVisible(false);
    Animated.timing(panelHeightAnim, {
      toValue: EMOJI_PANEL_HEIGHT,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [panelHeightAnim]);

  /**
   * 平稳接力切换至软键盘 (表情高度极平缓降落，与键盘升起优雅重合，落到键盘位置即停)
   */
  const transitionToKeyboard = React.useCallback(() => {
    isSwitchingToKeyboardRef.current = true;
    setEmoticonBarVisible(false);
    inputRef.current?.focus();

    Animated.timing(panelHeightAnim, {
      toValue: 0,
      duration: 480, // 极平缓平稳下落，与软键盘升起完全接力
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setIsEmojiMounted(false);
      }
    });

    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
    }
    // 550ms 看门狗保护防死锁
    switchTimeoutRef.current = setTimeout(() => {
      if (isSwitchingToKeyboardRef.current) {
        panelHeightAnim.setValue(0);
        setIsEmojiMounted(false);
        isSwitchingToKeyboardRef.current = false;
      }
    }, 550);
  }, [panelHeightAnim]);

  React.useImperativeHandle(
    ref,
    () => ({
      collapse: () => {
        Keyboard.dismiss();
        if (switchTimeoutRef.current) {
          clearTimeout(switchTimeoutRef.current);
          switchTimeoutRef.current = null;
        }
        isSwitchingToKeyboardRef.current = false;
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
        isSwitchingToKeyboardRef.current = false;
        if (emoticonBarVisible || isEmojiMounted) {
          animateCloseEmoticons();
        }
      },
      isEmoticonOpen: () => emoticonBarVisible || isEmojiMounted,
    }),
    [animateCloseEmoticons, emoticonBarVisible, isEmojiMounted, panelVisible]
  );

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        if (e.endCoordinates?.height > 100) {
          keyboardHeightRef.current = e.endCoordinates.height;
        }
        if (switchTimeoutRef.current) {
          clearTimeout(switchTimeoutRef.current);
          switchTimeoutRef.current = null;
        }
        // 软键盘已完全升起就位后，平稳完成接力，重置标记与挂载状态
        if (isSwitchingToKeyboardRef.current) {
          panelHeightAnim.setValue(0);
          setIsEmojiMounted(false);
          setEmoticonBarVisible(false);
          isSwitchingToKeyboardRef.current = false;
        }
      }
    );

    return () => {
      showSub.remove();
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current);
        switchTimeoutRef.current = null;
      }
    };
  }, [panelHeightAnim]);

  React.useEffect(() => {
    if (fillDraftText != null) {
      setText(fillDraftText);
      inputRef.current?.focus();
    }
  }, [fillDraftText]);

  const hasText = text.trim().length > 0;

  const handleSend = () => {
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

    if (emoticonBarVisible || isEmojiMounted) {
      // 处于表情面板中，点击微信键盘图标切换为文字输入
      transitionToKeyboard();
    } else {
      // 处于文字输入或静止底栏，点击笑脸切换至表情面板
      isSwitchingToKeyboardRef.current = false;
      Keyboard.dismiss();
      animateOpenEmoticons();
    }
  }, [animateOpenEmoticons, emoticonBarVisible, isEmojiMounted, transitionToKeyboard]);

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
    <View
      style={[
        styles.composerWrapper,
        {
          backgroundColor: theme.colors.composerBackground,
          borderTopColor: theme.colors.composerBorder,
        },
      ]}
    >
      {/* 顶部主输入行 (minHeight 52px, 左侧输入框铺满) */}
      <View
        style={[
          styles.mainBar,
          { minHeight: theme.metrics.composerMinHeight },
        ]}
      >
        {/* 输入框 (左侧直接铺满) */}
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
        </View>

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
              size={26}
            />
          ) : (
            <Ionicons
              color={theme.colors.actionIconColor}
              name="happy-outline"
              size={26}
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

      {/* 独立解耦表情与颜文字键盘面板 (高度升至 365px，极慢平滑下落与零弹跳接力) */}
      {isEmojiMounted && (
        <Animated.View
          style={[
            styles.emojiContainerWrapper,
            {
              height: panelHeightAnim,
            },
          ]}
        >
          <EmojiPickerPanel
            height={EMOJI_PANEL_HEIGHT}
            onBackspace={handleBackspace}
            onSelectAnimatedEmoji={(sticker) => {
              onSendSticker?.(sticker);
            }}
            onSelectKaomoji={handleInsertText}
            onSelectStaticEmoji={handleInsertText}
            space={space}
          />
        </Animated.View>
      )}

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
  );
});

const styles = StyleSheet.create({
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
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    justifyContent: 'center',
  },
  textInput: {
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
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
