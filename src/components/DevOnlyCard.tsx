import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { isDevToolsEnabled } from '../utils/dev';
import { ContentCard } from './ContentCard';

interface DevOnlyCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function DevOnlyCard({ title, description, children }: DevOnlyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isDevToolsEnabled) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={isExpanded ? '隐藏开发回归工具' : '显示开发回归工具'}
        hitSlop={8}
        onPress={() => setIsExpanded((current) => !current)}
        style={({ pressed }) => [styles.toggleButton, pressed && styles.pressed]}
      >
        <Text style={styles.toggleLabel}>{isExpanded ? '隐藏开发回归工具' : '显示开发回归工具'}</Text>
      </Pressable>

      {isExpanded ? (
        <ContentCard style={styles.card}>
          {/* 仅用于开发回归，正式提测前移除。 */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>{children}</View>
        </ContentCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[2],
  },
  toggleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: componentTokens.common.minTouchSize,
    paddingHorizontal: spacing[4],
  },
  toggleLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  card: {
    gap: spacing[3],
  },
  title: {
    ...typography.textStyles.sectionTitle,
  },
  description: {
    ...typography.textStyles.caption,
  },
  actions: {
    gap: spacing[3],
  },
  pressed: {
    opacity: 0.82,
  },
});
