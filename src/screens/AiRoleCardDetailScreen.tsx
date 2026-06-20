import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { listRoleCards } from '../ai/aiRoleCardService';
import { exportRoleContinuityPackage } from '../ai/aiRoleCardContinuityExportService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiRoleDetailSection } from '../components/ai/AiRoleDetailSection';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
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

const MORE_GREETING_PREVIEW_COUNT = 3;

// Hero art-board constants preserve the poster composition; they are not reusable spacing/rhythm tokens.
const ROLE_HERO_HEIGHT = 560;
const ROLE_HERO_FADE_BOTTOM_HEIGHT = 118;
const ROLE_HERO_COPY_OFFSET = '45%';
const ROLE_HERO_FALLBACK_MARK_SIZE = 220;
const ROLE_HERO_IMAGE_WIDTH = '68%';
const ROLE_HERO_MARK_SIZE = 260;
const ROLE_HERO_RIGHT_FADE_WIDTH = '58%';
const ROLE_HERO_TITLE_LINE_HEIGHT = 56;
const ROLE_HERO_TITLE_SIZE = 48;

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
  const [exporting, setExporting] = useState(false);

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

  async function exportRoleCard() {
    if (!card || exporting) {
      return;
    }
    const runExport = async () => {
      setExporting(true);
      setStatus(null);
      try {
        const result = await exportRoleContinuityPackage({
          includeMarkdown: true,
          roleCardId: card.id,
          space,
        });
        setStatus(`已导出 ${result.pngFileName}${result.markdownFileName ? ` 和 ${result.markdownFileName}` : ''}`);
      } catch (error) {
        setStatus(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
      } finally {
        setExporting(false);
      }
    };
    if (space === 'personal') {
      Alert.alert('导出私密角色', '导出的 PNG/Markdown 会保存到你选择的系统目录，请确认该目录安全。', [
        { text: '取消', style: 'cancel' },
        { text: '继续导出', onPress: () => void runExport() },
      ]);
      return;
    }
    await runExport();
  }

  function renderCardDetail(card: AiRoleCardRecord) {
    const hasHiddenAlternateGreetings = card.alternateGreetings.length > MORE_GREETING_PREVIEW_COUNT;
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
            <Pressable accessibilityLabel="导出角色卡和连续性文本" accessibilityRole="button" disabled={exporting} onPress={() => void exportRoleCard()} style={({ pressed }) => [styles.exportButton, exporting && styles.roundButtonDisabled, pressed && styles.pressed]}>
              <Ionicons color={aiLightColors.ink} name="download-outline" size={16} />
              <Text style={styles.exportButtonText}>{exporting ? '正在导出' : '导出角色包'}</Text>
            </Pressable>
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
          <AiRoleDetailSection title="更多开场白" footer={hasHiddenAlternateGreetings ? moreGreetingsFooter : undefined} iconName="chatbubbles-outline" previewLines={6} variant="list">
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
    width: ROLE_HERO_IMAGE_WIDTH,
  },
  heroWarmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: aiLightColors.posterWarmOverlay,
  },
  heroFadeRight: {
    backgroundColor: aiLightColors.posterRightFade,
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: ROLE_HERO_RIGHT_FADE_WIDTH,
  },
  heroFadeBottom: {
    backgroundColor: aiLightColors.posterBottomFade,
    bottom: 0,
    height: ROLE_HERO_FADE_BOTTOM_HEIGHT,
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
    height: ROLE_HERO_FALLBACK_MARK_SIZE,
    position: 'absolute',
    width: ROLE_HERO_FALLBACK_MARK_SIZE,
  },
  heroPaperMark: {
    backgroundColor: aiLightColors.paperMark,
    borderRadius: radius.pill,
    height: ROLE_HERO_MARK_SIZE,
    left: -spacing[8],
    position: 'absolute',
    top: spacing[6],
    width: ROLE_HERO_MARK_SIZE,
  },
  heroCopy: {
    alignItems: 'flex-start',
    gap: rhythm.cardContentGap,
    marginLeft: ROLE_HERO_COPY_OFFSET,
    paddingBottom: spacing[12] + spacing[10],
    paddingHorizontal: spacing[5],
    zIndex: 2,
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: ROLE_HERO_TITLE_SIZE,
    fontWeight: '400',
    lineHeight: ROLE_HERO_TITLE_LINE_HEIGHT,
  },
  heroDescription: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 27,
  },
  heroActionWrap: {
    bottom: spacing[5],
    gap: rhythm.microGap,
    left: spacing[5],
    position: 'absolute',
    right: spacing[5],
    zIndex: 3,
  },
  exportButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: spacing[10],
    paddingHorizontal: spacing[4],
  },
  exportButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
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
    backgroundColor: aiLightColors.coralSoft,
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
    backgroundColor: aiLightColors.cardWash,
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
  roundButtonDisabled: {
    opacity: 0.44,
  },
});
