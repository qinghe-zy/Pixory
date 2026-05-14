import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';

interface AiThinkingBlockProps {
  reasoningText?: string | null;
  label?: '思考过程' | '思考摘要';
}

export function AiThinkingBlock({ reasoningText, label = '思考摘要' }: AiThinkingBlockProps) {
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
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
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
