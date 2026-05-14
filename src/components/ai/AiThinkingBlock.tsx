import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, rhythm, spacing, typography } from '../../design/tokens';

interface AiThinkingBlockProps {
  reasoningText?: string | null;
  label?: '思路' | '摘要';
}

export function AiThinkingBlock({ reasoningText, label = '摘要' }: AiThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!reasoningText) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={styles.header}>
        <Ionicons color={colors.primary.active} name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {expanded ? <Text style={styles.text}>{reasoningText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.microGap,
    paddingVertical: spacing[1],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  label: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  text: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
});
