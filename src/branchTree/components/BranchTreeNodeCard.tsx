import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import type { BranchTreeLayoutNode } from '../engine/types';

interface BranchTreeNodeCardProps {
  node: BranchTreeLayoutNode;
  selected: boolean;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return '';
    }
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

export const BranchTreeNodeCard = memo(function BranchTreeNodeCard({ node, selected }: BranchTreeNodeCardProps) {
  const isUser = node.role === 'user';
  const roleText = isUser ? '👤 你' : '🤖 AI';
  const timeText = formatTime(node.createdAt);

  return (
    <View
      accessibilityLabel={`查看${node.summary}分支快照`}
      accessibilityRole="button"
      style={[
        styles.card,
        !node.isActivePath && styles.inactivePathCard,
        node.isActivePath && !node.isHead && styles.activePathCard,
        node.isHead && styles.headCard,
        selected && styles.selectedCard,
      ]}
    >
      {node.isHead ? (
        <View style={styles.headBadge}>
          <Text style={styles.headBadgeText}>HEAD ▲</Text>
        </View>
      ) : null}
      
      <View style={styles.metaRow}>
        <View style={[styles.roleBadge, isUser ? styles.roleBadgeUser : styles.roleBadgeAi]}>
          <Text numberOfLines={1} style={styles.roleLabel}>
            {roleText}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.versionChip}>
          v{node.versionIndex}/{node.versionTotal}
        </Text>
        {timeText ? (
          <Text numberOfLines={1} style={styles.timeLabel}>
            {timeText}
          </Text>
        ) : null}
      </View>
      
      <View style={styles.divider} />
      
      <Text numberOfLines={2} style={styles.summary}>
        {node.summary}
      </Text>
      
      {node.collapsedChildCount > 0 ? (
        <Text numberOfLines={1} style={styles.branchCounter}>
          ↓ {node.collapsedChildCount}
        </Text>
      ) : null}
      
      {selected ? (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>点击展开快照 ▾</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  activePathCard: {
    backgroundColor: '#FCF8F5',
    borderLeftColor: '#D07C60',
    borderLeftWidth: 3,
  },
  branchCounter: {
    ...typography.textStyles.micro,
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    marginTop: spacing[1],
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  card: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 70,
    padding: spacing[2],
    width: 120,
    ...shadows.sm,
  },
  divider: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[1],
    width: '100%',
  },
  headBadge: {
    backgroundColor: '#D07C60',
    borderBottomLeftRadius: radius.xs,
    borderTopRightRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    position: 'absolute',
    right: -1,
    top: -1,
    zIndex: 1,
  },
  headBadgeText: {
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    fontSize: 8,
    fontWeight: 'bold',
  },
  headCard: {
    borderColor: '#D07C60',
    borderWidth: 1.5,
    backgroundColor: '#FDFAF8',
  },
  hintContainer: {
    alignSelf: 'center',
    backgroundColor: '#FCF2EE',
    borderColor: 'rgba(208, 124, 96, 0.28)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -20,
    paddingHorizontal: spacing[1.5],
    paddingVertical: 2,
    position: 'absolute',
    zIndex: 10,
    ...shadows.sm,
  },
  hintText: {
    ...typography.textStyles.micro,
    color: '#D07C60',
    fontWeight: '600',
  },
  inactivePathCard: {
    backgroundColor: aiLightColors.canvas,
    borderColor: '#D1C9BE',
    borderStyle: 'dashed',
    borderWidth: 1,
    opacity: 0.9,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'space-between',
  },
  roleBadge: {
    borderRadius: radius.xs,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
  },
  roleBadgeAi: {
    backgroundColor: 'rgba(208, 124, 96, 0.08)',
  },
  roleBadgeUser: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  roleLabel: {
    color: aiLightColors.muted,
    fontFamily: typography.family.base,
    fontSize: 9.5,
  },
  versionChip: {
    color: '#8A7A70',
    fontFamily: typography.family.mono,
    fontSize: 9,
  },
  selectedCard: {
    borderColor: '#D07C60',
    borderWidth: 1.5,
    elevation: 4,
    shadowColor: '#D07C60',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 5,
  },
  summary: {
    color: aiLightColors.ink,
    fontFamily: typography.family.base,
    fontSize: 10.5,
    lineHeight: 14,
  },
  timeLabel: {
    color: aiLightColors.muted,
    fontFamily: typography.family.mono,
    fontSize: 8.5,
  },
});
