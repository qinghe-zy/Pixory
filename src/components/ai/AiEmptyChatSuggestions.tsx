import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiContextType } from '../../ai/types';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiEmptyChatSuggestionsProps {
  contextType: AiContextType;
  onPickSuggestion: (text: string) => void;
}

const SUGGESTIONS: Record<AiContextType, string[]> = {
  ip: ['帮我总结这个 IP 的资产特点', '看看标签和分组还有哪些缺口', '给这个 IP 整理一份使用建议'],
  knowledge_base: ['总结这份资料的关键点', '提取需要执行的事项', '按问题列出资料里的结论'],
  normal: ['帮我整理一下思路', '给我几个可选方案', '把这件事拆成下一步'],
};

export function AiEmptyChatSuggestions({ contextType, onPickSuggestion }: AiEmptyChatSuggestionsProps) {
  return (
    <View style={styles.wrap}>
      {SUGGESTIONS[contextType].map((item) => (
        <Pressable accessibilityRole="button" key={item} onPress={() => onPickSuggestion(item)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
          <Text style={styles.text}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: rhythm.compactGridGap,
    paddingVertical: spacing[4],
  },
  chip: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '92%',
    minHeight: 34,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
