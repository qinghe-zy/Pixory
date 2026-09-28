import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AiCitationRecord } from '../../ai/types';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

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
        <Ionicons color={aiLightColors.primaryActive} name="document-text-outline" size={16} />
        <Text style={styles.title}>来源 · {citations.length}</Text>
      </View>
      {citations.map((citation) => (
        <Pressable
          accessibilityRole="button"
          key={citation.id}
          onPress={() => onOpenCitation(citation)}
          style={({ pressed }) => [styles.citation, pressed && styles.pressed]}
        >
          <Text numberOfLines={2} style={styles.label}>{citation.label}</Text>
          <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={16} />
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
    color: aiLightColors.primaryActive,
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
    color: aiLightColors.muted,
    flex: 1,
  },
});
