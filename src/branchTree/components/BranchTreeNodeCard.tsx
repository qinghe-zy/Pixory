import { StyleSheet, Text, View } from 'react-native';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
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

export function BranchTreeNodeCard({ node, selected }: BranchTreeNodeCardProps) {
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
        <Text numberOfLines={1} style={styles.roleLabel}>
          {roleText} · v{node.versionIndex}/{node.versionTotal}
        </Text>
        <Text numberOfLines={1} style={styles.timeLabel}>
          {timeText}
        </Text>
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
        <Text style={styles.hintText}>双击展开</Text>
      ) : null}
    </View>
  );
}

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
    marginTop: spacing[1.5],
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
  },
  divider: {
    backgroundColor: aiLightColors.hairline,
    height: 1,
    marginVertical: spacing[1],
    width: '100%',
  },
  headBadge: {
    backgroundColor: '#D07C60',
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: 'absolute',
    right: -1,
    top: -1,
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
  },
  hintText: {
    ...typography.textStyles.micro,
    alignSelf: 'center',
    bottom: -18,
    color: '#D07C60',
    position: 'absolute',
  },
  inactivePathCard: {
    backgroundColor: aiLightColors.canvas,
    borderColor: '#D1C9BE',
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'space-between',
  },
  roleLabel: {
    color: aiLightColors.muted,
    fontFamily: typography.family.base,
    fontSize: 10,
  },
  selectedCard: {
    shadowColor: '#D07C60',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4, // Android shadow
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
    fontSize: 9,
  },
});
