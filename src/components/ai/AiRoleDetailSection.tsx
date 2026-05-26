import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiRoleDetailSectionProps {
  title: string;
  previewLines?: number;
  children: ReactNode;
}

export function AiRoleDetailSection({ title, previewLines = 4, children }: AiRoleDetailSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.section}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <Text style={styles.title}>{title}</Text>
        <Ionicons color={aiLightColors.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      <View style={styles.content}>
        {typeof children === 'string' ? (
          <Text numberOfLines={expanded ? undefined : previewLines} style={styles.body}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    paddingTop: spacing[3],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
    minHeight: 36,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
  },
  content: {
    borderRadius: radius.sm,
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.78,
  },
});
