import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export type AiMaterialSourceKind = 'ip' | 'file' | 'manual_text';

interface AiMaterialSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectSource: (source: AiMaterialSourceKind) => void;
}

const SOURCE_OPTIONS: Array<{
  key: AiMaterialSourceKind;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}> = [
  {
    key: 'ip',
    icon: 'albums-outline',
    title: '从 IP 导入',
    description: '生成当前 IP 信息快照，作为本会话资料使用。',
  },
  {
    key: 'file',
    icon: 'document-attach-outline',
    title: '从系统文件导入',
    description: '选择 txt、Markdown、PDF 或 Word 文件，可多选。',
  },
  {
    key: 'manual_text',
    icon: 'create-outline',
    title: '手动文本',
    description: '粘贴设定、备忘或补充资料。',
  },
];

export function AiMaterialSourceSheet({ visible, onClose, onSelectSource }: AiMaterialSourceSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭资料来源面板" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>添加会话资料</Text>
              <Text style={styles.message}>选择资料来源后再进入对应导入步骤。</Text>
            </View>
            <Pressable accessibilityLabel="关闭资料来源面板" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons color={aiLightColors.muted} name="close" size={20} />
            </Pressable>
          </View>
          <View style={styles.optionList}>
            {SOURCE_OPTIONS.map((option) => (
              <Pressable
                accessibilityRole="button"
                key={option.key}
                onPress={() => onSelectSource(option.key)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
              >
                <View style={styles.optionIcon}>
                  <Ionicons color={aiLightColors.coralActive} name={option.icon} size={20} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.description}>{option.description}</Text>
                </View>
                <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={18} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(20, 20, 19, 0.38)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: aiLightColors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: rhythm.screenSectionGap,
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
  },
  message: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  optionList: {
    gap: rhythm.inlineGap,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: metrics.minTouchSize + spacing[7],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.card,
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    width: metrics.iconButtonSize,
  },
  optionCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  optionTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
  description: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
});
