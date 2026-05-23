import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { applyRoleCardToThread, loadThreadSessionConfig, updateAiThreadSessionConfig } from '../ai/aiChatService';
import { DEFAULT_AI_ROLE_PROMPT } from '../ai/aiConstants';
import type { AiBoundaryMode, AiContextType } from '../ai/types';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: string;
  contextTitle?: string;
  contextType?: AiContextType;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenRoleCardEditor: () => void;
  onStartChat: () => void;
}

const BOUNDARY_MODES: Array<{ value: AiBoundaryMode; label: string }> = [
  { value: 'free', label: '自由' },
  { value: 'prefer_material', label: '优先资料' },
  { value: 'strict_material', label: '仅限资料' },
];

function getDefaultSystemPrompt(contextType: AiContextType): string {
  return contextType === 'normal' ? '' : DEFAULT_AI_ROLE_PROMPT;
}

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  onBack,
  onOpenProviderSettings,
  onOpenRoleCardEditor,
  onStartChat,
}: AiSessionConfigScreenProps) {
  const [systemPrompt, setSystemPrompt] = useState(getDefaultSystemPrompt(contextType));
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [advancedPromptVisible, setAdvancedPromptVisible] = useState(contextType !== 'normal');
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const promptConfigured = systemPrompt.trim().length > 0;
  const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
  const avatarSummary = avatarEnabled ? (avatarUri ? '头像已启用' : '头像已启用，使用默认标记') : '无头像';

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      setSystemPrompt(getDefaultSystemPrompt(contextType));
      setAdvancedPromptVisible(contextType !== 'normal');
      return;
    }
    const config = await loadThreadSessionConfig(space, threadId);
    if (!config) {
      setStatus({ message: '没有找到当前会话。', tone: 'error' });
      return;
    }
    setSystemPrompt(config.thread.systemPrompt);
    setAdvancedPromptVisible(config.thread.systemPrompt.trim().length > 0 || contextType !== 'normal');
    setBoundaryMode(config.thread.boundaryMode);
    setRoleCardSummary(config.roleCardName ?? '默认角色');
    setAvatarEnabled(config.avatar.avatarEnabled);
    setAvatarUri(config.avatar.avatarUri);
  }, [contextType, space, threadId]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardBottomInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardBottomInset(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function handleSystemPromptFocus() {
    if (Platform.OS !== 'android') {
      return;
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }

  async function saveSessionSettings(): Promise<boolean> {
    if (!threadId) {
      setStatus({ message: '请先进入一个会话后再保存设置。', tone: 'warning' });
      return false;
    }
    setSaving(true);
    setStatus({ message: '正在保存会话设置...', tone: 'info', title: '保存中' });
    try {
      const updated = await updateAiThreadSessionConfig({
        boundaryMode,
        avatarEnabled,
        space,
        systemPrompt,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，设置未保存。');
      }
      setStatus({ message: '角色指令和回答范围已应用到当前会话。', tone: 'success', title: '设置已保存' });
      return true;
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error', title: '保存失败' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndStartChat() {
    const saved = await saveSessionSettings();
    if (saved) {
      onStartChat();
    }
  }

  async function clearRoleCard() {
    if (!threadId) {
      setRoleCardSummary('默认角色');
      return;
    }
    await applyRoleCardToThread({ roleCardId: null, space, threadId });
    setRoleCardSummary('默认角色');
    setAvatarEnabled(false);
    setAvatarUri(null);
    setStatus({ message: '当前会话已恢复为 Pixory 默认角色。', tone: 'success', title: '角色已重置' });
    await reloadConfig();
  }

  return (
    <AiLightScaffold
      contentContainerStyle={keyboardBottomInset ? { paddingBottom: keyboardBottomInset + spacing[8] } : undefined}
      onBack={onBack}
      scrollable
      scrollViewRef={scrollViewRef}
      subtitle={`${spaceLabel}${threadId != null ? ` · 会话 ${threadId}` : ''}`}
      title="会话设置"
    >
      <View style={styles.content}>
        <AiLightCard>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>当前会话</Text>
              <Text numberOfLines={1} style={styles.body}>{contextTitle ?? '普通聊天'}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
              <Text style={styles.textActionLabel}>模型账号</Text>
            </Pressable>
          </View>
          <View style={styles.summaryMetaRow}>
            <Text style={styles.metaPill}>{spaceLabel}</Text>
            <Text style={styles.metaPill}>{BOUNDARY_MODES.find((mode) => mode.value === boundaryMode)?.label ?? '自由'}</Text>
            <Text numberOfLines={1} style={styles.metaPill}>{roleCardSummary}</Text>
          </View>
        </AiLightCard>

        <AiLightCard>
          <View style={styles.roleRow}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>角色显示</Text>
              <Text numberOfLines={1} style={styles.body}>{roleCardSummary}</Text>
              <Text style={styles.caption}>{avatarSummary}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onOpenRoleCardEditor} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
              <Text style={styles.textActionLabel}>更换</Text>
            </Pressable>
          </View>
          <View style={styles.roleActions}>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: avatarEnabled }} onPress={() => setAvatarEnabled((current) => !current)} style={({ pressed }) => [styles.compactButton, avatarEnabled && styles.compactButtonActive, pressed && styles.pressed]}>
              <Text style={[styles.compactButtonText, avatarEnabled && styles.compactButtonTextActive]}>{avatarEnabled ? '头像开启' : '头像关闭'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void clearRoleCard()} style={({ pressed }) => [styles.compactButton, pressed && styles.pressed]}>
              <Text style={styles.compactButtonText}>默认角色</Text>
            </Pressable>
          </View>
        </AiLightCard>

        <AiLightCard>
          <Text style={styles.sectionTitle}>回答范围</Text>
          <View style={styles.chips}>
            {BOUNDARY_MODES.map((mode) => (
              <AiLightChip
                active={boundaryMode === mode.value}
                key={mode.value}
                label={mode.label}
                onPress={() => setBoundaryMode(mode.value)}
              />
            ))}
          </View>
        </AiLightCard>

        <AiLightCard>
          <Pressable accessibilityRole="button" onPress={() => setAdvancedPromptVisible((current) => !current)} style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>高级角色指令</Text>
              <Text style={styles.caption}>{promptSummary}</Text>
            </View>
            <Text style={styles.textActionLabel}>{advancedPromptVisible ? '收起' : '展开'}</Text>
          </Pressable>
          {advancedPromptVisible ? (
            <AiLightTextareaRow
              label="角色指令"
              minHeight={104}
              onChangeText={setSystemPrompt}
              onFocus={handleSystemPromptFocus}
              placeholder={contextType === 'normal' ? '普通聊天默认不配置角色指令，可按需填写。' : '输入角色指令'}
              value={systemPrompt}
            />
          ) : null}
        </AiLightCard>

        <View style={styles.actions}>
          <AiLightButton label="保存并开始聊天" loading={saving} onPress={() => void saveAndStartChat()} />
          <AiLightButton label="仅保存设置" loading={saving} onPress={() => void saveSessionSettings()} variant="ghost" />
        </View>
        {status ? <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
      </View>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  summaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  metaPill: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.muted,
    maxWidth: '100%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  roleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  textAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  textActionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  compactButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  compactButtonActive: {
    backgroundColor: aiLightColors.coral,
    borderColor: aiLightColors.coral,
  },
  compactButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  compactButtonTextActive: {
    color: aiLightColors.onDark,
  },
  advancedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  actions: {
    gap: rhythm.listCardGap,
  },
  pressed: {
    opacity: 0.78,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
