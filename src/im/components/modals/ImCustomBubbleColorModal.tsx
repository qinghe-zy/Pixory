import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateContrastingTextColor } from '../../theme/imTheme';

export interface ImCustomBubbleColorModalProps {
  visible: boolean;
  onClose: () => void;
  currentColor?: string | null;
  onConfirm: (hexColor: string) => void;
}

const PALETTE_PRESETS = [
  { label: '草绿', color: '#95EC69' },
  { label: '晴蓝', color: '#3B82F6' },
  { label: '靛紫', color: '#6366F1' },
  { label: '蔷薇', color: '#EC4899' },
  { label: '琥珀', color: '#F59E0B' },
  { label: '薄荷', color: '#10B981' },
  { label: '浅紫', color: '#8B5CF6' },
  { label: '珊瑚', color: '#F43F5E' },
  { label: '青空', color: '#14B8A6' },
  { label: '奶酪', color: '#FDE047' },
  { label: '玄黑', color: '#26282B' },
  { label: '冷灰', color: '#64748B' },
];

export function ImCustomBubbleColorModal({
  visible,
  onClose,
  currentColor,
  onConfirm,
}: ImCustomBubbleColorModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedColor, setSelectedColor] = useState<string>(currentColor || '#6366F1');
  const [hexInput, setHexInput] = useState<string>(currentColor || '#6366F1');

  useEffect(() => {
    if (visible) {
      const init = currentColor?.startsWith('#') ? currentColor : '#6366F1';
      setSelectedColor(init);
      setHexInput(init);
    }
  }, [visible, currentColor]);

  const handleSelectPalette = (color: string) => {
    setSelectedColor(color);
    setHexInput(color);
  };

  const handleHexChange = (text: string) => {
    let clean = text.trim();
    if (!clean.startsWith('#')) {
      clean = '#' + clean;
    }
    setHexInput(clean);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(clean)) {
      setSelectedColor(clean);
    }
  };

  const handleApply = () => {
    const valid = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hexInput.trim());
    if (!valid) {
      Alert.alert('色号格式有误', '请输入标准的十六进制色号，如 #3B82F6 或 #95EC69');
      return;
    }
    onConfirm(hexInput.trim().toUpperCase());
    onClose();
  };

  const previewTextColor = useMemo(
    () => calculateContrastingTextColor(selectedColor),
    [selectedColor]
  );

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="点击遮罩关闭"
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>自定义气泡配色</Text>
              <Text style={styles.subTitle}>选择精选色卡或直接输入 Hex 颜色代码</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭自定义配色"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons color="#6B7280" name="close" size={20} />
            </Pressable>
          </View>

          {/* 实时气泡预览 */}
          <View style={styles.previewBox}>
            <Text style={styles.previewCaption}>实时视觉预览</Text>
            <View style={[styles.bubblePreview, { backgroundColor: selectedColor }]}>
              <Text style={[styles.bubbleText, { color: previewTextColor }]}>
                这是一条专属气泡配色预览效果 ✨
              </Text>
            </View>
          </View>

          {/* 色号输入框 */}
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>色号 (HEX):</Text>
            <View style={styles.inputRow}>
              <View style={[styles.colorBadge, { backgroundColor: selectedColor }]} />
              <TextInput
                accessibilityLabel="十六进制色号"
                autoCapitalize="characters"
                maxLength={9}
                onChangeText={handleHexChange}
                placeholder="#3B82F6"
                placeholderTextColor="#9CA3AF"
                style={styles.textInput}
                value={hexInput}
              />
            </View>
          </View>

          {/* 精选色卡矩阵 */}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>精选灵感色卡</Text>
          <View style={styles.paletteGrid}>
            {PALETTE_PRESETS.map((item) => {
              const isSelected = selectedColor.toLowerCase() === item.color.toLowerCase();
              return (
                <Pressable
                  accessibilityLabel={`选择颜色：${item.label}`}
                  accessibilityRole="button"
                  key={item.color}
                  onPress={() => handleSelectPalette(item.color)}
                  style={[styles.paletteItem, isSelected && styles.paletteItemSelected]}
                >
                  <View style={[styles.paletteCircle, { backgroundColor: item.color }]} />
                  <Text
                    numberOfLines={1}
                    style={[styles.paletteText, isSelected && styles.paletteTextSelected]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 底部确认操作 */}
          <View style={styles.footer}>
            <Pressable
              accessibilityLabel="取消"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="应用此配色"
              accessibilityRole="button"
              onPress={handleApply}
              style={styles.confirmBtn}
            >
              <Text style={styles.confirmBtnText}>应用此配色</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  subTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    alignItems: 'flex-end',
  },
  previewCaption: {
    alignSelf: 'flex-start',
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  bubblePreview: {
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  inputSection: {
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  textInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
    fontWeight: '600',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 18,
  },
  paletteItem: {
    width: '23%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  paletteItemSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  paletteCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  paletteText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
  paletteTextSelected: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  confirmBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
