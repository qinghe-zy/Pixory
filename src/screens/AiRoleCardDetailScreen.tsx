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

  return (
    <AiLightScaffold
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
        <View style={styles.content}>
          <View style={styles.hero}>
            <View style={styles.cover}>
              {card.avatarEnabled && card.avatarUri ? (
                <SecureImage contentFit="cover" space={space} style={styles.coverImage} uri={card.avatarUri} />
              ) : (
                <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize} />
              )}
            </View>
            <View style={styles.heroCopy}>
              <View style={styles.titleRow}>
                <Text numberOfLines={2} style={styles.title}>{card.name}</Text>
                <Text style={styles.sourceBadge}>{getRoleCardSourceLabel(card)}</Text>
              </View>
              {card.description ? <Text style={styles.description}>{card.description}</Text> : null}
              <Text style={styles.meta}>
                {card.avatarEnabled && card.avatarUri ? '头像开启' : '无头像'} · {card.firstMessage || card.alternateGreetings.length ? '有开场白' : '无开场白'}
              </Text>
            </View>
          </View>

          <AiLightButton disabled={starting} label={starting ? (mode === 'apply_to_thread' ? '正在应用' : '正在开聊') : (mode === 'apply_to_thread' ? '应用到当前会话' : '开始新对话')} loading={starting} onPress={() => void startChat()} />
          {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}

          <AiRoleDetailSection title="角色指令" previewLines={8}>
            {card.prompt || '暂无角色指令。'}
          </AiRoleDetailSection>
          {card.firstMessage ? (
            <AiRoleDetailSection title="默认开场白" previewLines={3}>
              {card.firstMessage}
            </AiRoleDetailSection>
          ) : null}
          {card.alternateGreetings.length ? (
            <AiRoleDetailSection title="更多开场白" previewLines={5}>
              {card.alternateGreetings.map((greeting, index) => `${index + 1}. ${greeting}`).join('\n\n')}
            </AiRoleDetailSection>
          ) : null}
          {card.tags.length ? (
            <View style={styles.tagRow}>
              {card.tags.map((tag) => (
                <Text key={tag} style={styles.tag}>{tag}</Text>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.screenSectionGap,
  },
  hero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  cover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.lg,
    height: 128,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 112,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  heroCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.ink,
    flexShrink: 1,
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
  description: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tag: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.pill,
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
