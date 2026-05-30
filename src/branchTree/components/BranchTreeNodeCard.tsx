import { Pressable, StyleSheet, Text, View } from 'react-native';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import type { BranchTreeLayoutNode } from '../engine/types';

interface BranchTreeNodeCardProps {
  node: BranchTreeLayoutNode;
  selected: boolean;
  onPress: (nodeId: string) => void;
  onDoublePress: (nodeId: string) => void;
}

export function BranchTreeNodeCard({ node, onDoublePress, onPress, selected }: BranchTreeNodeCardProps) {
  return (
    <Pressable
      accessibilityLabel={`查看${node.summary}分支快照`}
      accessibilityRole="button"
      delayLongPress={220}
      hitSlop={6}
      onLongPress={() => onDoublePress(node.id)}
      onPress={() => onPress(node.id)}
      style={({ pressed }) => [
        styles.card,
        node.isActivePath && styles.activePathCard,
        selected && styles.selectedCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.metaRow}>
        <View style={[styles.statusDot, node.isActivePath && styles.activeDot]} />
        <Text numberOfLines={1} style={styles.versionLabel}>
          v{node.versionIndex}/{node.versionTotal}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.summary}>
        {node.summary}
      </Text>
      {node.collapsedChildCount > 0 ? (
        <Text numberOfLines={1} style={styles.branchCounter}>
          +{node.collapsedChildCount}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: '#D07C60',
    borderColor: '#D07C60',
  },
  activePathCard: {
    borderColor: '#D07C60',
  },
  branchCounter: {
    ...typography.textStyles.micro,
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.coralSoft,
    borderRadius: radius.pill,
    color: '#D07C60',
    marginTop: spacing[1],
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  card: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 70,
    padding: spacing[2],
    position: 'absolute',
    width: 120,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.76,
  },
  selectedCard: {
    borderColor: '#D07C60',
    borderWidth: 2,
  },
  statusDot: {
    backgroundColor: aiLightColors.surface,
    borderColor: '#D1C9BE',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: spacing[3],
    width: spacing[3],
  },
  summary: {
    color: aiLightColors.ink,
    fontFamily: typography.family.base,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: spacing[1],
  },
  versionLabel: {
    color: aiLightColors.muted,
    fontFamily: typography.family.mono,
    fontSize: 9,
  },
});
