import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiRoleDetailSection } from '../components/ai/AiRoleDetailSection';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { SecureImage } from '../components/SecureImage';
import type { PixorySpace } from '../database';
import { metrics, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiRoleCardDetailScreenProps {
  roleCardId: string;
  space: PixorySpace;
  mode?: 'library' | 'apply_to_thread';
  onBack: () => void;
  onEditRole: (roleCardId: string) => void;
  onStartChatWithRole: (roleCardId: string) => Promise<void> | void;
  onApplyRoleToThread?: (roleCardId: string) => Promise<void> | void;
}

function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
  return !card.sourceType || card.sourceType === 'pixory_manual' ? '自建' : '导入';
}

const ROLE_HERO_HEIGHT = 560;

function getRoleCardMeta(card: AiRoleCardRecord): string {
  const avatarMeta = card.avatarEnabled && card.avatarUri ? '头像开启' : '无头像';
  const greetingMeta = card.firstMessage || card.alternateGreetings.length ? '有开场白' : '无开场白';
  return `${avatarMeta} · ${greetingMeta}`;
}

export function AiRoleCardDetailScreen({
  roleCardId,
  space,
  mode = 'library',
  onBack,
  onEditRole,
  onStartChatWithRole,
  onApplyRoleToThread,
}: AiRoleCardDetailScreenProps) {
  const [card, setCard] = useState<AiRoleCardRecord | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const loadCard = useCallback(async () => {
    const cards = await listRoleCards(space);
    setCard(cards.find((candidate) => candidate.id === roleCardId) ?? null);
  }, [roleCardId, space]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  async function startChat() {
    if (!card) {
      return;
    }
    setStarting(true);
    setStatus(null);
    try {
      if (mode === 'apply_to_thread' && onApplyRoleToThread) {
        await onApplyRoleToThread(card.id);
      } else {
        await onStartChatWithRole(card.id);
      }
    } catch (error) {
      const action = mode === 'apply_to_thread' ? '应用角色失败' : '开始对话失败';
      setStatus(error instanceof Error ? `${action}：${error.message}` : action);
    } finally {
      setStarting(false);
    }
  }

  function renderCardDetail(card: AiRoleCardRecord) {
    const moreGreetingsText = card.alternateGreetings.map((greeting, index) => `• ${index + 1}. ${greeting}`).join('\n\n');
    const moreGreetingsFooter = (
      <Text style={styles.sectionFooterText}>
        查看全部 {card.alternateGreetings.length} 条
      </Text>
    );

    return (
      <View style={styles.content}>
        <View style={styles.heroPoster}>
          {card.avatarEnabled && card.avatarUri ? (
            <View style={styles.heroImageLayer}>
              <SecureImage contentFit="cover" space={space} style={styles.heroImage} uri={card.avatarUri} />
              <View pointerEvents="none" style={styles.heroWarmOverlay} />
              <View pointerEvents="none" style={styles.heroFadeRight} />
              <View pointerEvents="none" style={styles.heroFadeBottom} />
            </View>
          ) : (
            <View style={styles.heroFallback}>
              <View style={styles.heroFallbackMoon} />
              <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize * 1.4} />
            </View>
          )}

          <View pointerEvents="none" style={styles.heroPaperMark} />

          <View style={styles.heroCopy}>
            <Text numberOfLines={2} style={styles.heroTitle}>{card.name}</Text>
            <Text style={styles.sourceBadge}>{getRoleCardSourceLabel(card)}</Text>
            {card.description ? <Text numberOfLines={4} style={styles.heroDescription}>{card.description}</Text> : null}
            <Text style={styles.meta}>{getRoleCardMeta(card)}</Text>
          </View>

          <View style={styles.heroActionWrap}>
            <AiLightButton disabled={starting} label={starting ? (mode === 'apply_to_thread' ? '正在应用' : '正在开聊') : (mode === 'apply_to_thread' ? '应用到当前会话' : '开始新对话')} loading={starting} onPress={() => void startChat()} />
          </View>
        </View>

        {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}

        <AiRoleDetailSection title="角色指令" iconName="book-outline" previewLines={8}>
          {card.prompt || '暂无角色指令。'}
        </AiRoleDetailSection>
        {card.firstMessage ? (
          <AiRoleDetailSection title="默认开场白" iconName="chatbubble-ellipses-outline" previewLines={4} variant="quote">
            {card.firstMessage}
          </AiRoleDetailSection>
        ) : null}
        {card.alternateGreetings.length ? (
          <AiRoleDetailSection title="更多开场白" footer={moreGreetingsFooter} iconName="chatbubbles-outline" previewLines={6} variant="list">
            {moreGreetingsText}
          </AiRoleDetailSection>
        ) : null}
        {card.tags.length ? (
          <View style={styles.tagSection}>
            <View style={styles.tagHeader}>
              <View style={styles.tagIconBubble}>
                <Ionicons color={aiLightColors.coralActive} name="pricetag-outline" size={16} />
              </View>
              <Text style={styles.tagTitle}>标签</Text>
            </View>
            <View style={styles.tagRow}>
              {card.tags.map((tag) => (
                <Text key={tag} style={styles.tagChip}>{tag}</Text>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <AiLightScaffold
      contentContainerStyle={styles.screenContent}
      headerDividerVisible={false}
      onBack={onBack}
      rightAction={card ? (
        <Pressable accessibilityLabel="编辑角色" accessibilityRole="button" onPress={() => onEditRole(card.id)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="create-outline" size={metrics.iconSizeMd} />
        </Pressable>
      ) : null}
      scrollable
      subtitle={card ? getRoleCardSourceLabel(card) : '角色详情'}
      title={card?.name ?? '角色详情'}
    >
      {!card ? (
        <View style={styles.emptyState}>
          <Ionicons color={aiLightColors.muted} name="person-circle-outline" size={metrics.iconButtonSize} />
          <Text style={styles.emptyText}>角色不存在或已删除。</Text>
        </View>
      ) : (
        renderCardDetail(card)
      )}
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 0,
  },
  content: {
    gap: rhythm.entryCardGap,
  },
  heroPoster: {
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.lg,
    height: ROLE_HERO_HEIGHT,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  heroImageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    bottom: spacing[8],
    height: ROLE_HERO_HEIGHT - spacing[6],
    left: -spacing[8],
    position: 'absolute',
    width: '68%',
  },
  heroWarmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 249, 245, 0.14)',
  },
  heroFadeRight: {
    backgroundColor: 'rgba(250, 249, 245, 0.82)',
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '58%',
  },
  heroFadeBottom: {
    backgroundColor: 'rgba(250, 249, 245, 0.92)',
    bottom: 0,
    height: 118,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    justifyContent: 'center',
  },
  heroFallbackMoon: {
    backgroundColor: aiLightColors.card,
    borderRadius: radius.pill,
    height: 220,
    position: 'absolute',
    width: 220,
  },
  heroPaperMark: {
    backgroundColor: 'rgba(204, 120, 92, 0.08)',
    borderRadius: radius.pill,
    height: 260,
    left: -spacing[8],
    position: 'absolute',
    top: spacing[6],
    width: 260,
  },
  heroCopy: {
    alignItems: 'flex-start',
    gap: rhythm.cardContentGap,
    marginLeft: '45%',
    paddingBottom: spacing[12] + spacing[10],
    paddingHorizontal: spacing[5],
    zIndex: 2,
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.ink,
    fontFamily: 'serif',
    fontSize: 48,
    fontWeight: '400',
    lineHeight: 56,
  },
  heroDescription: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 27,
  },
  heroActionWrap: {
    bottom: spacing[5],
    left: spacing[5],
    position: 'absolute',
    right: spacing[5],
    zIndex: 3,
  },
  sourceBadge: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.card,
    borderRadius: radius.pill,
    color: aiLightColors.coralActive,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  sectionFooterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  tagSection: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    paddingTop: spacing[4],
  },
  tagHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  tagIconBubble: {
    alignItems: 'center',
    backgroundColor: '#F4E2D4',
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  tagTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tagChip: {
    ...typography.textStyles.micro,
    backgroundColor: 'rgba(255, 250, 242, 0.78)',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  emptyState: {
    alignItems: 'center',
    gap: rhythm.inlineGap,
    paddingVertical: spacing[8],
  },
  emptyText: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
  },
  iconButton: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  pressed: {
    opacity: 0.78,
  },
});
