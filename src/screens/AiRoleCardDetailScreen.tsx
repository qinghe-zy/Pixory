import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { exportRoleContinuityPackage } from '../ai/aiRoleCardContinuityExportService';
import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { sanitizeRolePromptForDisplay, sanitizeRoleTags } from '../ai/utils/rolePromptSanitizer';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiRoleDetailSection } from '../components/ai/AiRoleDetailSection';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
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
  onStartImChat?: (roleCardId: string) => Promise<void> | void;
  onApplyRoleToThread?: (roleCardId: string) => Promise<void> | void;
}

function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
  return !card.sourceType || card.sourceType === 'pixory_manual' ? '自建' : '导入';
}

const MORE_GREETING_PREVIEW_COUNT = 3;

// Hero art-board constants preserve the poster composition; they are not reusable spacing/rhythm tokens.
const ROLE_HERO_HEIGHT = 390;
const ROLE_HERO_FADE_BOTTOM_HEIGHT = 88;
const ROLE_HERO_COPY_OFFSET = '44%';
const ROLE_HERO_FALLBACK_MARK_SIZE = 140;
const ROLE_HERO_IMAGE_WIDTH = '72%';
const ROLE_HERO_MARK_SIZE = 180;
const ROLE_HERO_RIGHT_FADE_WIDTH = '58%';
const ROLE_HERO_TITLE_LINE_HEIGHT = 42;
const ROLE_HERO_TITLE_SIZE = 34;

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
  onStartImChat,
  onApplyRoleToThread,
}: AiRoleCardDetailScreenProps) {
  const [card, setCard] = useState<AiRoleCardRecord | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [personalExportConfirmVisible, setPersonalExportConfirmVisible] = useState(false);
  const [promptDisplayMode, setPromptDisplayMode] = useState<'cleaned' | 'raw'>('cleaned');

  const loadCard = useCallback(async () => {
    const cards = await listRoleCards(space);
    setCard(cards.find((candidate) => candidate.id === roleCardId) ?? null);
  }, [roleCardId, space]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => {
      setStatus(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [status]);

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

  async function startImChat() {
    if (!card) {
      return;
    }
    setStarting(true);
    setStatus(null);
    try {
      if (onStartImChat) {
        await onStartImChat(card.id);
      } else {
        await onStartChatWithRole(card.id);
      }
    } catch (error) {
      setStatus(error instanceof Error ? `开始对话失败：${error.message}` : '开始对话失败');
    } finally {
      setStarting(false);
    }
  }

  const runExport = useCallback(async () => {
    if (!card) return;
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
  }, [card, space]);

  async function exportRoleCard() {
    if (!card || exporting) {
      return;
    }
    if (space === 'personal') {
      setPersonalExportConfirmVisible(true);
      return;
    }
    await runExport();
  }

  function renderCardDetail(card: AiRoleCardRecord) {
    const hasHiddenAlternateGreetings = card.alternateGreetings.length > MORE_GREETING_PREVIEW_COUNT;
    const cleanedFirstMessage = sanitizeRolePromptForDisplay(card.firstMessage, {
      roleName: card.name,
      mode: 'cleaned',
    });
    const cleanedPrompt = sanitizeRolePromptForDisplay(card.prompt, {
      roleName: card.name,
      mode: promptDisplayMode,
    });
    const sanitizedTags = sanitizeRoleTags(card.tags);

    const moreGreetingsText = card.alternateGreetings.map((greeting, index) => {
      const cleanedGreeting = sanitizeRolePromptForDisplay(greeting, {
        roleName: card.name,
        mode: 'cleaned',
      });
      return `• ${index + 1}. ${cleanedGreeting}`;
    }).join('\n\n');

    const cleanedDescription = sanitizeRolePromptForDisplay(card.description, {
      roleName: card.name,
      mode: 'cleaned',
    });

    const moreGreetingsFooter = (
      <Text style={styles.sectionFooterText}>
        查看全部 {card.alternateGreetings.length} 条
      </Text>
    );

    const promptHeaderActions = (
      <View style={styles.promptHeaderActions}>
        <Pressable
          accessibilityLabel="复制提示词设定"
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={async (event) => {
            event.stopPropagation();
            if (card.prompt) {
              await Clipboard.setStringAsync(card.prompt);
              setStatus('角色指令已复制到剪贴板。');
            }
          }}
          style={({ pressed }) => [styles.modeTogglePill, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.primaryActive} name="copy-outline" size={13} />
          <Text style={styles.modeToggleText}>复制</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="切换提示词展示格式"
          accessibilityRole="button"
          hitSlop={spacing[2]}
          onPress={(event) => {
            event.stopPropagation();
            setPromptDisplayMode((current) => (current === 'cleaned' ? 'raw' : 'cleaned'));
          }}
          style={({ pressed }) => [styles.modeTogglePill, pressed && styles.pressed]}
        >
          <Ionicons
            color={aiLightColors.primaryActive}
            name={promptDisplayMode === 'cleaned' ? 'sparkles-outline' : 'code-slash-outline'}
            size={13}
          />
          <Text style={styles.modeToggleText}>
            {promptDisplayMode === 'cleaned' ? '已润色' : '原貌'}
          </Text>
        </Pressable>
      </View>
    );

    return (
      <View style={styles.content}>
        <View style={styles.heroPoster}>
          {card.avatarEnabled && card.avatarUri ? (
            <View style={styles.heroImageLayer}>
              <SecureImage contentFit="cover" space={space} style={styles.heroImage} uri={card.avatarUri} />
              <View pointerEvents="none" style={styles.heroWarmOverlay} />
              <LinearGradient
                colors={['transparent', aiLightColors.canvas]}
                end={{ x: 1, y: 0 }}
                pointerEvents="none"
                start={{ x: 0, y: 0 }}
                style={styles.heroFadeRight}
              />
              <LinearGradient
                colors={['transparent', aiLightColors.canvas]}
                end={{ x: 0, y: 1 }}
                pointerEvents="none"
                start={{ x: 0, y: 0 }}
                style={styles.heroFadeBottom}
              />
            </View>
          ) : (
            <View style={styles.heroFallback}>
              <View style={styles.heroFallbackMoon}>
                <Text style={styles.heroFallbackLetter}>
                  {card.name.trim().slice(0, 1) || 'A'}
                </Text>
              </View>
            </View>
          )}

          <View pointerEvents="none" style={styles.heroPaperMark} />

          <View style={styles.heroCopy}>
            <Text numberOfLines={2} style={styles.heroTitle}>{card.name}</Text>
            <Text style={styles.sourceBadge}>{getRoleCardSourceLabel(card)}</Text>
            {cleanedDescription ? <Text numberOfLines={4} style={styles.heroDescription}>{cleanedDescription}</Text> : null}
            <Text style={styles.meta}>{getRoleCardMeta(card)}</Text>
          </View>

          <View style={styles.heroActionWrap}>
            <Pressable
              accessibilityRole="button"
              disabled={starting}
              onPress={() => void (mode === 'apply_to_thread' ? startChat() : startImChat())}
              style={({ pressed }) => [
                styles.primaryActionButton,
                starting && styles.roundButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={aiLightColors.onDark} name="chatbubble-ellipses-outline" size={17} />
              <Text style={styles.primaryActionText}>
                {starting
                  ? mode === 'apply_to_thread'
                    ? '正在应用'
                    : '正在进入'
                  : mode === 'apply_to_thread'
                  ? '应用到当前会话'
                  : '发消息 (即时聊天)'}
              </Text>
            </Pressable>

            <View style={styles.secondaryActionRow}>
              {mode !== 'apply_to_thread' && (
                <Pressable
                  accessibilityLabel="开启长文本剧情对话"
                  accessibilityRole="button"
                  disabled={starting}
                  onPress={() => void startChat()}
                  style={({ pressed }) => [
                    styles.exportButton,
                    starting && styles.roundButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons color={aiLightColors.ink} name="sparkles-outline" size={15} />
                  <Text style={styles.exportButtonText}>长文本剧情</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityLabel="导出角色卡和连续性文本"
                accessibilityRole="button"
                disabled={exporting}
                onPress={() => void exportRoleCard()}
                style={({ pressed }) => [
                  styles.exportButton,
                  exporting && styles.roundButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={aiLightColors.ink} name="download-outline" size={15} />
                <Text style={styles.exportButtonText}>{exporting ? '正在导出' : '导出角色包'}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}

        {card.firstMessage ? (
          <AiRoleDetailSection
            title="默认开场白"
            iconName="chatbubble-ellipses-outline"
            markdown
            previewLines={5}
            variant="quote"
          >
            {cleanedFirstMessage}
          </AiRoleDetailSection>
        ) : null}

        <AiRoleDetailSection
          title="角色指令"
          iconName="book-outline"
          markdown
          previewLines={8}
          rightAction={promptHeaderActions}
        >
          {cleanedPrompt || '暂无角色指令。'}
        </AiRoleDetailSection>

        {card.alternateGreetings.length ? (
          <AiRoleDetailSection
            title="更多开场白"
            footer={hasHiddenAlternateGreetings ? moreGreetingsFooter : undefined}
            iconName="chatbubbles-outline"
            markdown
            previewLines={6}
            variant="list"
          >
            {moreGreetingsText}
          </AiRoleDetailSection>
        ) : null}

        {sanitizedTags.length ? (
          <View style={styles.tagSection}>
            <View style={styles.tagHeader}>
              <View style={styles.tagIconBubble}>
                <Ionicons color={aiLightColors.primaryActive} name="pricetag-outline" size={16} />
              </View>
              <Text style={styles.tagTitle}>标签</Text>
            </View>
            <View style={styles.tagRow}>
              {sanitizedTags.map((tag) => (
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

      {/* 统一黑白弹窗：导出私密角色安全确认 */}
      <AppDialog
        appearance="opaqueMonochrome"
        message="导出的 PNG/Markdown 会保存到你选择的系统目录，请确认该目录安全。"
        onClose={() => setPersonalExportConfirmVisible(false)}
        onPrimary={() => {
          setPersonalExportConfirmVisible(false);
          void runExport();
        }}
        primaryLabel="继续导出"
        secondaryLabel="取消"
        title="导出私密角色"
        visible={personalExportConfirmVisible}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 0,
  },
  content: {
    gap: rhythm.entryCardGap,
    paddingBottom: spacing[8],
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
    bottom: 0,
    height: ROLE_HERO_HEIGHT,
    left: 0,
    position: 'absolute',
    width: ROLE_HERO_IMAGE_WIDTH,
  },
  heroWarmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: aiLightColors.posterWarmOverlay,
  },
  heroFadeRight: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: ROLE_HERO_RIGHT_FADE_WIDTH,
  },
  heroFadeBottom: {
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
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: ROLE_HERO_FALLBACK_MARK_SIZE,
    justifyContent: 'center',
    width: ROLE_HERO_FALLBACK_MARK_SIZE,
  },
  heroFallbackLetter: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.primaryActive,
    fontSize: 56,
    fontWeight: '700',
  },
  heroPaperMark: {
    backgroundColor: aiLightColors.paperMark,
    borderRadius: radius.pill,
    height: ROLE_HERO_MARK_SIZE,
    left: -spacing[8],
    position: 'absolute',
    top: spacing[4],
    width: ROLE_HERO_MARK_SIZE,
  },
  heroCopy: {
    alignItems: 'flex-start',
    gap: rhythm.microGap,
    marginLeft: ROLE_HERO_COPY_OFFSET,
    paddingBottom: spacing[12] + spacing[8],
    paddingHorizontal: spacing[4],
    zIndex: 2,
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: ROLE_HERO_TITLE_SIZE,
    fontWeight: '600',
    lineHeight: ROLE_HERO_TITLE_LINE_HEIGHT,
  },
  heroDescription: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontSize: 13,
    lineHeight: 20,
  },
  heroActionWrap: {
    bottom: spacing[3],
    gap: rhythm.microGap,
    left: spacing[4],
    position: 'absolute',
    right: spacing[4],
    zIndex: 3,
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    height: 44,
    justifyContent: 'center',
    width: '100%',
  },
  primaryActionText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.onDark,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    width: '100%',
  },
  exportButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.microGap,
    height: 38,
    justifyContent: 'center',
  },
  exportButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  promptHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  modeTogglePill: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  modeToggleText: {
    ...typography.textStyles.micro,
    color: aiLightColors.primaryActive,
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
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  meta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    paddingHorizontal: spacing[1],
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
    backgroundColor: aiLightColors.primarySoft,
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
