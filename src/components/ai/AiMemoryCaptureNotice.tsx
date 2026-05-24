import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiMemoryCaptureNoticeProps {
  count: number;
  onManage: () => void;
  onUndo: () => void;
  summary?: string | null;
}

function formatSummary(summary?: string | null): string {
  const normalized = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

export function AiMemoryCaptureNotice({ count, onManage, onUndo, summary }: AiMemoryCaptureNoticeProps) {
  const summaryText = formatSummary(summary);
  return (
    <View style={styles.wrap}>
      <Text numberOfLines={1} style={styles.text}>
        {summaryText ? `已记住：${summaryText}${count > 1 ? ` +${count - 1}` : ''}` : `已记住 ${count} 条内容`}
      </Text>
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
    maxWidth: 220,
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
