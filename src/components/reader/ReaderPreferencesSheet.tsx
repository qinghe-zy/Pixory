import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DocumentFontFamily,
  DocumentFormat,
  DocumentLayoutMode,
  DocumentReaderTheme,
} from '../../ai/readers/readerTypes';
import { layout, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from '../ai/aiLightTheme';

interface ReaderPreferencesSheetProps {
  visible: boolean;
  currentTheme: DocumentReaderTheme;
  currentFontSize: number;
  currentFontFamily?: DocumentFontFamily;
  currentLayoutMode?: DocumentLayoutMode;
  format?: DocumentFormat;
  onSelectTheme: (theme: DocumentReaderTheme) => void;
  onChangeFontSize: (fontSize: number) => void;
  onSelectFontFamily?: (font: DocumentFontFamily) => void;
  onSelectLayoutMode?: (mode: DocumentLayoutMode) => void;
  onClose: () => void;
}

interface ThemeOption {
  key: DocumentReaderTheme;
  label: string;
  bg: string;
  text: string;
  border: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'paper', label: '纸质', bg: '#FAF9F5', text: '#141413', border: '#E6DFD8' },
  { key: 'sepia', label: '护眼', bg: '#F4ECD8', text: '#2C2216', border: '#DDD0B2' },
  { key: 'dark', label: '极夜', bg: '#141413', text: '#EDEDEA', border: '#333333' },
  { key: 'white', label: '纯白', bg: '#FFFFFF', text: '#111827', border: '#E5E7EB' },
];

const FONT_FAMILY_OPTIONS: { key: DocumentFontFamily; label: string; desc: string }[] = [
  { key: 'sans', label: '系统黑体', desc: '现代清晰' },
  { key: 'serif', label: '人文宋体', desc: '优雅书卷' },
  { key: 'mono', label: '等宽代码', desc: '整齐对齐' },
];

export const ReaderPreferencesSheet: React.FC<ReaderPreferencesSheetProps> = ({
  visible,
  currentTheme,
  currentFontSize,
  currentFontFamily = 'sans',
  currentLayoutMode = 'flow',
  format,
  onSelectTheme,
  onChangeFontSize,
  onSelectFontFamily,
  onSelectLayoutMode,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const handleDecreaseFont = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentFontSize > 13) {
      onChangeFontSize(currentFontSize - 1);
    }
  };

  const handleIncreaseFont = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentFontSize < 24) {
      onChangeFontSize(currentFontSize + 1);
    }
  };

  const handleResetFont = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChangeFontSize(16);
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheet, { paddingBottom: insets.bottom + spacing[4] }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>阅读偏好</Text>
            <Pressable
              accessibilityLabel="关闭"
              accessibilityRole="button"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={styles.closeBtn}
            >
              <Ionicons color={aiLightColors.muted} name="close" size={20} />
            </Pressable>
          </View>

          {/* Theme Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>阅读背景</Text>
            <View style={styles.themeGrid}>
              {THEME_OPTIONS.map((opt) => {
                const isSelected = currentTheme === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onSelectTheme(opt.key);
                    }}
                    style={({ pressed }) => [
                      styles.themeCard,
                      { backgroundColor: opt.bg, borderColor: isSelected ? aiLightColors.primary : opt.border },
                      isSelected && styles.themeCardActive,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={[styles.themeCardText, { color: opt.text }]}>
                      {opt.label}
                    </Text>
                    {isSelected ? (
                      <View style={styles.activeCheck}>
                        <Ionicons color={opt.key === 'dark' ? '#FAF9F5' : aiLightColors.primary} name="checkmark" size={14} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Font Family Selector */}
          {onSelectFontFamily && format !== 'pdf' ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>字体族</Text>
              <View style={styles.fontFamilyRow}>
                {FONT_FAMILY_OPTIONS.map((item) => {
                  const isSelected = currentFontFamily === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onSelectFontFamily(item.key);
                      }}
                      style={[
                        styles.fontFamilyTab,
                        isSelected && styles.fontFamilyTabSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.fontFamilyLabel,
                          isSelected && styles.fontFamilyLabelSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={[
                          styles.fontFamilyDesc,
                          isSelected && styles.fontFamilyDescSelected,
                        ]}
                      >
                        {item.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* DOCX Layout Mode Selector */}
          {format === 'docx' && onSelectLayoutMode ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>排版版式</Text>
              <View style={styles.layoutModeRow}>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelectLayoutMode('flow');
                  }}
                  style={[
                    styles.layoutModeCard,
                    currentLayoutMode === 'flow' && styles.layoutModeCardActive,
                  ]}
                >
                  <Ionicons
                    color={currentLayoutMode === 'flow' ? aiLightColors.primary : aiLightColors.muted}
                    name="phone-portrait-outline"
                    size={18}
                  />
                  <View style={styles.layoutModeTextCol}>
                    <Text style={[styles.layoutModeTitle, currentLayoutMode === 'flow' && styles.layoutModeTitleActive]}>
                      手机流式自适应
                    </Text>
                    <Text style={styles.layoutModeSub}>解开双栏，单列沉浸滑动</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelectLayoutMode('print');
                  }}
                  style={[
                    styles.layoutModeCard,
                    currentLayoutMode === 'print' && styles.layoutModeCardActive,
                  ]}
                >
                  <Ionicons
                    color={currentLayoutMode === 'print' ? aiLightColors.primary : aiLightColors.muted}
                    name="grid-outline"
                    size={18}
                  />
                  <View style={styles.layoutModeTextCol}>
                    <Text style={[styles.layoutModeTitle, currentLayoutMode === 'print' && styles.layoutModeTitleActive]}>
                      原版打印双栏
                    </Text>
                    <Text style={styles.layoutModeSub}>保留标准 A4 多栏版面</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Font Size Adjuster */}
          <View style={styles.section}>
            <View style={styles.fontHeaderRow}>
              <Text style={styles.sectionLabel}>字号微调</Text>
              {currentFontSize !== 16 ? (
                <Pressable onPress={handleResetFont}>
                  <Text style={styles.resetFontText}>恢复默认</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.fontStepperRow}>
              <Pressable
                accessibilityLabel="缩小字号"
                disabled={currentFontSize <= 13}
                onPress={handleDecreaseFont}
                style={({ pressed }) => [
                  styles.fontStepperBtn,
                  currentFontSize <= 13 && styles.stepperDisabled,
                  pressed && styles.stepperPressed,
                ]}
              >
                <Text style={styles.stepperLabelSmall}>A-</Text>
              </Pressable>

              <View style={styles.fontSizeDisplay}>
                <Text style={styles.fontSizeValue}>{currentFontSize} px</Text>
                <Text style={styles.fontSizePercent}>{Math.round((currentFontSize / 16) * 100)}%</Text>
              </View>

              <Pressable
                accessibilityLabel="放大字号"
                disabled={currentFontSize >= 24}
                onPress={handleIncreaseFont}
                style={({ pressed }) => [
                  styles.fontStepperBtn,
                  currentFontSize >= 24 && styles.stepperDisabled,
                  pressed && styles.stepperPressed,
                ]}
              >
                <Text style={styles.stepperLabelLarge}>A+</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing[2],
    width: 36,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[1],
  },
  sheetTitle: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    padding: spacing[1],
  },
  section: {
    marginTop: spacing[4],
  },
  sectionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing[2],
  },
  themeGrid: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  themeCard: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    flex: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
  },
  themeCardActive: {
    borderWidth: 2,
  },
  themeCardText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeCheck: {
    bottom: 2,
    position: 'absolute',
    right: 4,
  },
  fontFamilyRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  fontFamilyTab: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
    backgroundColor: aiLightColors.userBubble,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  fontFamilyTabSelected: {
    borderColor: aiLightColors.primary,
    backgroundColor: 'rgba(204, 120, 92, 0.08)',
  },
  fontFamilyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: aiLightColors.ink,
  },
  fontFamilyLabelSelected: {
    color: aiLightColors.primary,
  },
  fontFamilyDesc: {
    fontSize: 10,
    color: aiLightColors.muted,
    marginTop: 2,
  },
  fontFamilyDescSelected: {
    color: aiLightColors.primary,
  },
  layoutModeRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  layoutModeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    backgroundColor: aiLightColors.userBubble,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  layoutModeCardActive: {
    borderColor: aiLightColors.primary,
    backgroundColor: 'rgba(204, 120, 92, 0.08)',
  },
  layoutModeTextCol: {
    flex: 1,
  },
  layoutModeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: aiLightColors.ink,
  },
  layoutModeTitleActive: {
    color: aiLightColors.primary,
  },
  layoutModeSub: {
    fontSize: 10,
    color: aiLightColors.muted,
    marginTop: 1,
  },
  fontHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resetFontText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryText,
    fontSize: 12,
  },
  fontStepperRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing[1],
  },
  fontStepperBtn: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.sm,
    height: 40,
    justifyContent: 'center',
    width: 56,
  },
  stepperDisabled: {
    opacity: 0.35,
  },
  stepperPressed: {
    opacity: 0.7,
  },
  stepperLabelSmall: {
    color: aiLightColors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  stepperLabelLarge: {
    color: aiLightColors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  fontSizeDisplay: {
    alignItems: 'center',
  },
  fontSizeValue: {
    color: aiLightColors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  fontSizePercent: {
    color: aiLightColors.muted,
    fontSize: 11,
  },
});
