import React, { useState, useRef } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImTheme } from '../theme/ImThemeProvider';

export interface ImInputBarProps {
  onSend: (text: string) => void;
  onTextChange?: (text: string) => void;
  onCameraPress?: () => void;
  onSelectImage?: () => void;
  onSelectFile?: () => void;
  onSelectIp?: () => void;
  disabled?: boolean;
  fillDraftText?: string | null;
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
export function ImInputBar({
  onSend,
  onTextChange,
  onCameraPress,
  onSelectImage,
  onSelectFile,
  onSelectIp,
  disabled = false,
  fillDraftText,
}: ImInputBarProps) {
  const theme = useImTheme();
  const [text, setText] = useState('');
  const [panelVisible, setPanelVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

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

  const handleTogglePanel = () => {
    if (panelVisible) {
      setPanelVisible(false);
      inputRef.current?.focus();
    } else {
      setPanelVisible(true);
    }
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

        {/* 右一：微信表情按钮 */}
        <Pressable
          accessibilityLabel="表情"
          accessibilityRole="button"
          onPress={() => {
            if (Platform.OS === 'android') {
              ToastAndroid.show('快捷表情面板', ToastAndroid.SHORT);
            }
          }}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            color={theme.colors.actionIconColor}
            name="happy-outline"
            size={26}
          />
        </Pressable>

        {/* 右二：动态操作区 (+ 号 vs 发送键) */}
        {hasText ? (
          <Pressable
            accessibilityLabel="发送消息"
            accessibilityRole="button"
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
}

const styles = StyleSheet.create({
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
