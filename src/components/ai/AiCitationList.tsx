import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AiCitationRecord } from '../../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';

interface AiCitationListProps {
  citations: AiCitationRecord[];
  onOpenCitation: (citation: AiCitationRecord) => void;
}

export function AiCitationList({ citations, onOpenCitation }: AiCitationListProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons color={colors.primary.active} name="document-text-outline" size={16} />
        <Text style={styles.title}>来源</Text>
      </View>
      {citations.map((citation) => (
        <Pressable
          accessibilityRole="button"
          key={citation.id}
          onPress={() => onOpenCitation(citation)}
          style={({ pressed }) => [styles.citation, pressed && styles.pressed]}
        >
          <Text numberOfLines={2} style={styles.label}>{citation.label}</Text>
          <Ionicons color={colors.text.tertiary} name="chevron-forward" size={16} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.microGap,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  citation: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    paddingVertical: spacing[1],
  },
  pressed: {
    opacity: 0.78,
  },
  label: {
    ...typography.textStyles.caption,
    flex: 1,
  },
});
