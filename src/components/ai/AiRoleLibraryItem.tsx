import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiRoleCardRecord } from '../../ai/types';
import { sanitizeRolePromptForDisplay, sanitizeRoleTags } from '../../ai/utils/rolePromptSanitizer';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, shadows, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../SecureImage';
import { aiLightColors } from './aiLightTheme';

interface AiRoleLibraryItemProps {
  card: AiRoleCardRecord;
  selected?: boolean;
  selectionMode?: boolean;
  actionLabel?: string;
  space: PixorySpace;
  layoutMode?: 'waterfall' | 'list';
  onLongPress?: (card: AiRoleCardRecord) => void;
  onPress: (card: AiRoleCardRecord) => void;
  onStartChat?: (card: AiRoleCardRecord) => void;
}

function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
  return !card.sourceType || card.sourceType === 'pixory_manual' ? '自建' : '导入';
}

function getRoleCardMeta(card: AiRoleCardRecord): string {
  const avatarMeta = card.avatarEnabled && card.avatarUri ? '头像开启' : '无头像';
  const greetingMeta = card.firstMessage || card.alternateGreetings.length ? '有开场白' : '无开场白';
  return `${avatarMeta} · ${greetingMeta}`;
}

export const AiRoleLibraryItem = memo(function AiRoleLibraryItem({
  card,
  selected = false,
  selectionMode = false,
  actionLabel,
  space,
  layoutMode = 'waterfall',
  onLongPress,
  onPress,
  onStartChat,
}: AiRoleLibraryItemProps) {
  const sourceLabel = getRoleCardSourceLabel(card);
  const isWaterfall = layoutMode === 'waterfall';

  const cleanedDescription = sanitizeRolePromptForDisplay(card.description ?? card.prompt, {
    roleName: card.name,
    mode: 'cleaned',
  });
  const sanitizedTags = sanitizeRoleTags(card.tags);
  const primaryTag = sanitizedTags.length > 0 ? sanitizedTags[0] : null;

  if (isWaterfall) {
    return (
      <Pressable
        accessibilityRole="button"
        onLongPress={onLongPress ? () => onLongPress(card) : undefined}
        onPress={() => onPress(card)}
        style={({ pressed }) => [
          styles.waterfallCard,
          selected && styles.waterfallCardSelected,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.cover, styles.waterfallCover]}>
          {card.avatarEnabled && card.avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={card.avatarUri} />
          ) : (
            <View style={styles.fallbackAvatar}>
              <Text style={styles.fallbackLetter}>
                {card.name.trim().slice(0, 1) || 'A'}
              </Text>
            </View>
          )}

          <View style={styles.waterfallBadgeWrap}>
            <Text style={styles.sourceBadge}>{sourceLabel}</Text>
          </View>

          {selectionMode ? (
            <View style={styles.selectionCheckCircle}>
              <Ionicons
                color={selected ? aiLightColors.primaryActive : aiLightColors.mutedSoft}
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.waterfallInfo}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.waterfallTitle}>{card.name}</Text>
          </View>
          <Text numberOfLines={2} style={styles.description}>{cleanedDescription}</Text>
          <View style={styles.waterfallMetaRow}>
            {primaryTag ? (
              <Text numberOfLines={1} style={styles.tagChip}>{primaryTag}</Text>
            ) : (
              <Text numberOfLines={1} style={styles.meta}>{getRoleCardMeta(card)}</Text>
            )}
            {!selectionMode && actionLabel ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={(event) => {
                  event.stopPropagation();
                  onStartChat?.(card);
                }}
                style={({ pressed }) => [styles.waterfallQuickPill, pressed && styles.pressed]}
              >
                <Text style={styles.waterfallQuickPillText}>{actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  // 列表态 (List Mode): 严格不加左右边框，全宽通栏伸展，信息横向充分利用
  return (
    <Pressable
      accessibilityRole="button"
      onLongPress={onLongPress ? () => onLongPress(card) : undefined}
      onPress={() => onPress(card)}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={[styles.cover, styles.listCover]}>
        {card.avatarEnabled && card.avatarUri ? (
          <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={card.avatarUri} />
        ) : (
          <View style={styles.fallbackAvatarSmall}>
            <Text style={styles.fallbackLetterSmall}>
              {card.name.trim().slice(0, 1) || 'A'}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{card.name}</Text>
          <Text style={styles.sourceBadge}>{sourceLabel}</Text>
          {primaryTag ? <Text style={styles.tagChip}>{primaryTag}</Text> : null}
          {selected ? <Ionicons color={aiLightColors.primaryActive} name="checkmark-circle" size={metrics.iconSizeSm} /> : null}
        </View>
        <Text numberOfLines={2} style={styles.description}>{cleanedDescription}</Text>
        <Text numberOfLines={1} style={styles.meta}>{getRoleCardMeta(card)}</Text>
      </View>
      {!selectionMode && actionLabel ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={(event) => {
            event.stopPropagation();
            onStartChat?.(card);
          }}
          style={({ pressed }) => [styles.startPill, pressed && styles.pressed]}
        >
          <Text style={styles.startText}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={16} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // 列表态：无左右边框，通栏平铺
  row: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 84,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  rowSelected: {
    backgroundColor: aiLightColors.primarySoft,
  },
  cover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.underlaySurface,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  listCover: {
    borderRadius: radius.sm,
    height: 72,
    width: 56,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  fallbackAvatar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  fallbackLetter: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.primaryActive,
    fontSize: 32,
    fontWeight: '700',
  },
  fallbackAvatarSmall: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  fallbackLetterSmall: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.primaryActive,
    fontSize: 20,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  sourceBadge: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.primaryActive,
    overflow: 'hidden',
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  tagChip: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    overflow: 'hidden',
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
  },
  description: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    fontSize: 12,
    lineHeight: 17,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontSize: 11,
  },
  startPill: {
    alignItems: 'center',
    borderColor: aiLightColors.primary,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  startText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontSize: 12,
    fontWeight: '600',
  },
  // 瀑布流卡片样式
  waterfallCard: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing[2],
    overflow: 'hidden',
    ...shadows.xs,
  },
  waterfallCardSelected: {
    borderColor: aiLightColors.primary,
  },
  waterfallCover: {
    aspectRatio: 0.82,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    position: 'relative',
    width: '100%',
  },
  waterfallBadgeWrap: {
    left: spacing[2],
    position: 'absolute',
    top: spacing[2],
  },
  selectionCheckCircle: {
    position: 'absolute',
    right: spacing[2],
    top: spacing[2],
  },
  waterfallInfo: {
    gap: 4,
    padding: spacing[2],
  },
  waterfallTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  waterfallMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  waterfallQuickPill: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  waterfallQuickPillText: {
    ...typography.textStyles.micro,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
