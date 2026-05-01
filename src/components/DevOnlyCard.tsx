import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '../design/tokens';
import { isDevToolsEnabled } from '../utils/dev';
import { ContentCard } from './ContentCard';

interface DevOnlyCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function DevOnlyCard({ title, description, children }: DevOnlyCardProps) {
  if (!isDevToolsEnabled) {
    return null;
  }

  return (
    <ContentCard style={styles.card}>
      {/* 仅用于开发回归，正式提测前可移除。 */}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.actions}>{children}</View>
    </ContentCard>
  );
}

const styles = StyleSheet.create({
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
});
