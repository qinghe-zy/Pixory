import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiRoleCardRecord } from '../../ai/types';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../SecureImage';
import { aiLightColors } from './aiLightTheme';

interface AiRoleLibraryItemProps {
  card: AiRoleCardRecord;
  selected?: boolean;
  selectionMode?: boolean;
  actionLabel?: string;
  space: PixorySpace;
  onLongPress?: (card: AiRoleCardRecord) => void;
  onPress: (card: AiRoleCardRecord) => void;
  onStartChat: (card: AiRoleCardRecord) => void;
}

function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
  return !card.sourceType || card.sourceType === 'pixory_manual' ? '自建' : '导入';
}

function getRoleCardMeta(card: AiRoleCardRecord): string {
  const avatarMeta = card.avatarEnabled && card.avatarUri ? '头像开启' : '无头像';
  const greetingMeta = card.firstMessage || card.alternateGreetings.length ? '有开场白' : '无开场白';
  return `${avatarMeta} · ${greetingMeta}`;
}

export function AiRoleLibraryItem({ card, selected = false, selectionMode = false, actionLabel = '开聊', space, onLongPress, onPress, onStartChat }: AiRoleLibraryItemProps) {
  const sourceLabel = getRoleCardSourceLabel(card);

  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress ? () => onLongPress(card) : undefined}
      onPress={() => onPress(card)}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={styles.cover}>
        {card.avatarEnabled && card.avatarUri ? (
          <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={card.avatarUri} />
        ) : (
          <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize} />
        )}
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{card.name}</Text>
          <Text style={styles.sourceBadge}>{sourceLabel}</Text>
          {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={metrics.iconSizeSm} /> : null}
        </View>
        <Text numberOfLines={2} style={styles.description}>{card.description ?? card.prompt}</Text>
        <Text numberOfLines={1} style={styles.meta}>{getRoleCardMeta(card)}</Text>
      </View>
      {!selectionMode ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={(event) => {
            event.stopPropagation();
            onStartChat(card);
          }}
          style={({ pressed }) => [styles.startPill, pressed && styles.pressed]}
        >
          <Text style={styles.startText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 112,
    padding: spacing[3],
  },
  rowSelected: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coral,
  },
  cover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.md,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 104,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.ink,
    flexShrink: 1,
  },
  sourceBadge: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    color: aiLightColors.coralActive,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  description: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  startPill: {
    alignItems: 'center',
    borderColor: aiLightColors.coral,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  startText: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
