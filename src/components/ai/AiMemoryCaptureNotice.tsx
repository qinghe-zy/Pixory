import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiMemoryCaptureNoticeProps {
  count: number;
  onManage: () => void;
  onUndo: () => void;
}

export function AiMemoryCaptureNotice({ count, onManage, onUndo }: AiMemoryCaptureNoticeProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>已记住 {count} 条内容</Text>
      <Pressable accessibilityRole="button" onPress={onUndo} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>撤销</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onManage} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>管理</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  action: {
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  actionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
