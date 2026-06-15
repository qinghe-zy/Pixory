import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiUsageSummary } from '../components/ai/AiUsageSummary';
import { aiLightColors } from '../components/ai/aiLightTheme';
import {
  applyRoleCardToThread,
  deleteAiThreads,
  loadThreadAiUsageOverview,
  loadThreadSessionConfig,
  loadThreadSessionModelConfig,
  renameAiThread,
  updateAiThreadSessionConfig,
  type AiThreadSessionModelConfig,
} from '../ai/aiChatService';
import { DEFAULT_AI_ROLE_PROMPT } from '../ai/aiConstants';
import { loadMemoryMaintenanceStatus } from '../ai/aiMemoryService';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
import type { AiBoundaryMode, AiContextType, AiReplyPreference, AiRoleInstructionWeight } from '../ai/types';
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
  onOpenThreadMaterials?: () => void;
  onOpenMemoryBoard?: () => void;
  onStartChat: () => void;
  onCurrentThreadDeleted?: () => void;
}

const BOUNDARY_MODES: Array<{ value: AiBoundaryMode; label: string }> = [
  { value: 'free', label: '自由' },
  { value: 'prefer_material', label: '优先资料' },
  { value: 'strict_material', label: '仅限资料' },
];

const ROLE_INSTRUCTION_WEIGHTS: Array<{ value: AiRoleInstructionWeight; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'high', label: '高' },
];

const REPLY_PREFERENCES: Array<{ value: AiReplyPreference; label: string }> = [
  { value: 'auto', label: '模型自适应' },
  { value: 'concise', label: '更简洁' },
  { value: 'detailed', label: '更详细' },
];

const SYSTEM_PROMPT_FOCUS_SCROLL_DELAY_MS = 260;
const SYSTEM_PROMPT_FOCUS_TOP_OFFSET = 96;
// Long role instructions should scroll inside the field instead of stretching behind the Android keyboard.
const SYSTEM_PROMPT_TEXTAREA_MAX_HEIGHT = 220;

const EMPTY_THREAD_USAGE: AiUsageAggregate = {
  cachedInputTokens: 0,
  cachedTokenRatio: 0,
  completionTokens: 0,
  modelBreakdown: [],
  nonCachedInputTokens: 0,
  observedRequestCount: 0,
  recentRounds: [],
  requestCount: 0,
  totalPromptTokens: 0,
  totalTokens: 0,
};

interface MemoryMaintenanceStatus {
  lastMaintenanceCompletedAt: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelId: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceUsedFallback: boolean;
  profileUpdatedAt: string | null;
  summarySegmentCount: number;
  uncompressedRoundCount: number;
}

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
  onOpenThreadMaterials,
  onOpenMemoryBoard,
  onStartChat,
  onCurrentThreadDeleted,
}: AiSessionConfigScreenProps) {
  const fallbackThreadTitle = contextTitle ?? '普通聊天';
  const [threadTitle, setThreadTitle] = useState(fallbackThreadTitle);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [renameValue, setRenameValue] = useState(fallbackThreadTitle);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(getDefaultSystemPrompt(contextType));
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [roleInstructionWeight, setRoleInstructionWeight] = useState<AiRoleInstructionWeight>('default');
  const [replyPreference, setReplyPreference] = useState<AiReplyPreference>('auto');
  const [deepMemoryEnabled, setDeepMemoryEnabled] = useState(false);
  const [lastMaintenanceError, setLastMaintenanceError] = useState<string | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [sessionModelConfig, setSessionModelConfig] = useState<AiThreadSessionModelConfig | null>(null);
  const [threadUsage, setThreadUsage] = useState<AiUsageAggregate | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [advancedPromptVisible, setAdvancedPromptVisible] = useState(contextType !== 'normal');
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const systemPromptFieldRef = useRef<View | null>(null);
  const settingsLoadedRef = useRef(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const promptConfigured = systemPrompt.trim().length > 0;
  const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
  const avatarSummary = avatarEnabled ? (avatarUri ? '头像已启用' : '头像已启用，使用默认标记') : '无头像';

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      setThreadTitle(fallbackThreadTitle);
      setRenameValue(fallbackThreadTitle);
      setSystemPrompt(getDefaultSystemPrompt(contextType));
      setRoleInstructionWeight('default');
      setReplyPreference('auto');
      setDeepMemoryEnabled(false);
      setLastMaintenanceError(null);
      setMaintenanceStatus(null);
      setSessionModelConfig(null);
      setThreadUsage(null);
      setAdvancedPromptVisible(contextType !== 'normal');
      return;
    }
    const config = await loadThreadSessionConfig(space, threadId);
    if (!config) {
      setStatus({ message: '没有找到当前会话。', tone: 'error' });
      return;
    }
    setThreadTitle(config.thread.title);
    setRenameValue(config.thread.title);
    setSystemPrompt(config.thread.systemPrompt);
    setRoleInstructionWeight(config.thread.roleInstructionWeight);
    setReplyPreference(config.thread.replyPreference);
    setDeepMemoryEnabled(config.deepMemoryEnabled);
    setLastMaintenanceError(config.lastMaintenanceError);
    const [nextMaintenanceStatus, nextSessionModelConfig, nextThreadUsage] = await Promise.all([
      loadMemoryMaintenanceStatus(space, threadId),
      loadThreadSessionModelConfig(space, threadId),
      loadThreadAiUsageOverview(space, threadId),
    ]);
    setMaintenanceStatus(nextMaintenanceStatus);
    setSessionModelConfig(nextSessionModelConfig);
    setThreadUsage(nextThreadUsage);
    setAdvancedPromptVisible(config.thread.systemPrompt.trim().length > 0 || contextType !== 'normal');
    setBoundaryMode(config.thread.boundaryMode);
    setRoleCardSummary(config.roleCardName ?? '默认角色');
    setAvatarEnabled(config.avatar.avatarEnabled);
    setAvatarUri(config.avatar.avatarUri);
    settingsLoadedRef.current = true;
  }, [contextType, fallbackThreadTitle, space, threadId]);

  useEffect(() => {
    if (!threadId || !settingsLoadedRef.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void updateAiThreadSessionConfig({
        avatarEnabled,
        boundaryMode,
        deepMemoryEnabled,
        replyPreference,
        roleInstructionWeight,
        space,
        systemPrompt,
        threadId,
      }).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [boundaryMode, deepMemoryEnabled, replyPreference, space, threadId]);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  function handleSystemPromptFocus() {
    if (Platform.OS !== 'android') {
      return;
    }
    setTimeout(() => {
      if (!scrollViewRef.current || !systemPromptFieldRef.current) {
        return;
      }
      const scrollNodeHandle = findNodeHandle(scrollViewRef.current);
      if (!scrollNodeHandle) {
        return;
      }
      systemPromptFieldRef.current.measureLayout(
        scrollNodeHandle,
        (_x, y) => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, y - SYSTEM_PROMPT_FOCUS_TOP_OFFSET), animated: true });
        },
        () => undefined
      );
    }, SYSTEM_PROMPT_FOCUS_SCROLL_DELAY_MS);
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
        deepMemoryEnabled,
        replyPreference,
        roleInstructionWeight,
        space,
        systemPrompt,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，设置未保存。');
      }
      setStatus({ message: '会话设置已保存。', tone: 'success', title: '设置已保存' });
      return true;
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error', title: '保存失败' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveSessionModel(providerId: string | null, modelId: string | null) {
    if (!threadId || savingModel) {
      return;
    }
    setSavingModel(true);
    try {
      const updated = await updateAiThreadSessionConfig({
        avatarEnabled,
        boundaryMode,
        deepMemoryEnabled,
        modelId,
        providerId,
        replyPreference,
        roleInstructionWeight,
        space,
        systemPrompt,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，模型未保存。');
      }
      setModelPickerVisible(false);
      setSessionModelConfig(await loadThreadSessionModelConfig(space, threadId));
      setStatus({ message: '已切换当前会话模型，可返回聊天重新生成上一条回复。', tone: 'success', title: '模型已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '模型保存失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function saveAndStartChat() {
    const saved = await saveSessionSettings();
    if (saved) {
      onStartChat();
    }
  }

  async function confirmRenameThread() {
    if (!threadId) {
      return;
    }
    setSaving(true);
    try {
      const updated = await renameAiThread(space, threadId, renameValue);
      if (!updated) {
        throw new Error('没有找到当前会话，名称未保存。');
      }
      setThreadTitle(updated.title);
      setRenameValue(updated.title);
      setRenameDialogVisible(false);
      setStatus({ message: '当前会话已重命名。', tone: 'success', title: '名称已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '重命名失败', tone: 'error', title: '重命名失败' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteCurrentThread() {
    if (!threadId) {
      return;
    }
    setSaving(true);
    try {
      const count = await deleteAiThreads(space, [threadId]);
      if (count < 1) {
        throw new Error('没有找到当前会话，未移入回收站。');
      }
      setDeleteDialogVisible(false);
      if (onCurrentThreadDeleted) {
        onCurrentThreadDeleted();
      } else {
        onBack();
      }
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '移入回收站失败', tone: 'error', title: '移入失败' });
    } finally {
      setSaving(false);
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

  function formatMinute(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatMaintenanceError(error: string): string {
    const normalized = error.replace(/^remote_failed_used_local_fallback:\s*/, '').trim();
    return normalized ? `最近一次远程维护失败，已使用本地轻量整理：${normalized}` : '最近一次远程维护失败，已使用本地轻量整理。';
  }

  return (
    <>
      <AiLightScaffold
        onBack={onBack}
        scrollable
        scrollViewRef={scrollViewRef}
        subtitle={spaceLabel}
        title="会话设置"
      >
        <View style={styles.content}>
          <AiLightCard>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryCopy}>
                <Text style={styles.sectionTitle}>当前会话</Text>
                <View style={styles.threadTitleRow}>
                  <Text numberOfLines={1} style={[styles.body, styles.threadTitleText]}>{threadTitle}</Text>
                  <Pressable
                    accessibilityLabel="重命名当前会话"
                    accessibilityRole="button"
                    disabled={!threadId || saving}
                    hitSlop={spacing[2]}
                    onPress={() => {
                      setRenameValue(threadTitle);
                      setRenameDialogVisible(true);
                    }}
                    style={({ pressed }) => [styles.titleIconButton, (!threadId || saving) && styles.disabled, pressed && threadId && !saving && styles.pressed]}
                  >
                    <Ionicons color={aiLightColors.coralActive} name="create-outline" size={15} />
                  </Pressable>
                </View>
              </View>
              <Pressable accessibilityRole="button" onPress={onOpenProviderSettings} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                <Text style={styles.textActionLabel}>全局默认</Text>
              </Pressable>
              {threadId && onOpenThreadMaterials ? (
                <Pressable accessibilityRole="button" onPress={onOpenThreadMaterials} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
                  <Text style={styles.textActionLabel}>资料库</Text>
                </Pressable>
              ) : null}
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
              <Text style={styles.sectionTitle}>当前会话模型</Text>
              <Text numberOfLines={1} style={styles.body}>{sessionModelConfig?.currentLabel ?? '加载中'}</Text>
              <Text style={styles.caption}>仅在当前会话生效。切换后，下一次发送或重新生成会使用新模型。</Text>
              {sessionModelConfig?.currentStatus === 'invalid' ? (
                <Text style={styles.maintenanceWarning}>模型配置已失效，请重新选择模型，或切换为跟随全局默认。</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!threadId || saving || savingModel}
              onPress={() => setModelPickerVisible(true)}
              style={({ pressed }) => [styles.textAction, (!threadId || saving || savingModel) && styles.disabled, pressed && threadId && !saving && !savingModel && styles.pressed]}
            >
              <Text style={styles.textActionLabel}>{savingModel ? '保存中' : '更换'}</Text>
            </Pressable>
          </View>
        </AiLightCard>

        <AiLightCard>
          <Text style={styles.sectionTitle}>本会话用量</Text>
          <AiUsageSummary recentTitle="最近" usage={threadUsage ?? EMPTY_THREAD_USAGE} />
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
          <Text style={styles.sectionTitle}>回复设置</Text>
          <Text style={styles.caption}>资料范围、回复倾向和深度记忆这些选项会自动保存。</Text>
          <View style={styles.settingGroup}>
            <Text style={styles.caption}>资料范围</Text>
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
          </View>
          <View style={styles.settingGroup}>
            <Text style={styles.caption}>回复倾向</Text>
            <View style={styles.chips}>
              {REPLY_PREFERENCES.map((item) => (
                <AiLightChip
                  active={replyPreference === item.value}
                  key={item.value}
                  label={item.label}
                  onPress={() => setReplyPreference(item.value)}
                />
              ))}
            </View>
          </View>
        </AiLightCard>

        <AiLightCard>
          <View style={styles.memoryRow}>
            <View style={styles.summaryCopy}>
              <Text style={styles.sectionTitle}>深度记忆</Text>
              <Text style={styles.caption}>开启后在本地保存会话摘要和可复用记忆，用于长对话回看；关闭后不会继续注入记忆背景。</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: deepMemoryEnabled }}
              onPress={() => setDeepMemoryEnabled((current) => !current)}
              style={({ pressed }) => [styles.memorySwitch, deepMemoryEnabled && styles.memorySwitchActive, pressed && styles.pressed]}
            >
              <Text style={[styles.memorySwitchText, deepMemoryEnabled && styles.memorySwitchTextActive]}>{deepMemoryEnabled ? '开启' : '关闭'}</Text>
            </Pressable>
          </View>
          {deepMemoryEnabled ? (
            <View style={styles.settingGroup}>
              <Text style={styles.caption}>记忆只作为背景参考，不会覆盖当前最新要求、角色指令或资料事实。</Text>
              <Text style={styles.caption}>
                上次维护：{maintenanceStatus?.lastMaintenanceCompletedAt ? formatMinute(maintenanceStatus.lastMaintenanceCompletedAt) : '暂无'} · 待整理 {maintenanceStatus?.uncompressedRoundCount ?? 0} 轮 · 摘要 {maintenanceStatus?.summarySegmentCount ?? 0} 段
              </Text>
              {maintenanceStatus?.profileUpdatedAt ? <Text style={styles.caption}>用户画像更新于 {formatMinute(maintenanceStatus.profileUpdatedAt)}</Text> : null}
              {maintenanceStatus?.lastMaintenanceUsedFallback ? <Text style={styles.maintenanceWarning}>远程失败，已使用本地轻量整理</Text> : null}
            </View>
          ) : null}
          {deepMemoryEnabled && lastMaintenanceError ? (
            <Text style={styles.maintenanceWarning}>{formatMaintenanceError(lastMaintenanceError)}</Text>
          ) : null}
          {threadId ? (
            <Pressable accessibilityRole="button" onPress={onOpenMemoryBoard} style={({ pressed }) => [styles.memoryManageButton, pressed && styles.pressed]}>
              <Text style={styles.textActionLabel}>管理记忆</Text>
            </Pressable>
          ) : null}
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
            <View style={styles.advancedContent}>
              <Text style={styles.caption}>角色指令需要点击保存后生效，避免输入过程中频繁改写当前会话。</Text>
              <View style={styles.weightRow}>
                <Text style={styles.caption}>权重等级</Text>
                <View style={styles.weightChips}>
                  {ROLE_INSTRUCTION_WEIGHTS.map((item) => (
                    <AiLightChip
                      active={roleInstructionWeight === item.value}
                      dense
                      key={item.value}
                      label={item.label}
                      onPress={() => setRoleInstructionWeight(item.value)}
                    />
                  ))}
                </View>
              </View>
              <View collapsable={false} ref={systemPromptFieldRef}>
                <AiLightTextareaRow
                  label="角色指令"
                  minHeight={104}
                  onChangeText={setSystemPrompt}
                  onFocus={handleSystemPromptFocus}
                  placeholder={contextType === 'normal' ? '普通聊天默认不配置角色指令，可按需填写。' : '输入角色指令'}
                  scrollEnabled
                  style={styles.systemPromptTextarea}
                  value={systemPrompt}
                />
              </View>
            </View>
          ) : null}
        </AiLightCard>

          <View style={styles.actions}>
            <AiLightButton label="保存角色指令并开始聊天" loading={saving} onPress={() => void saveAndStartChat()} />
            <AiLightButton label="仅保存角色指令" loading={saving} onPress={() => void saveSessionSettings()} variant="ghost" />
            <View style={styles.dangerSection}>
              <Pressable
                accessibilityRole="button"
                disabled={!threadId || saving}
                onPress={() => setDeleteDialogVisible(true)}
                style={({ pressed }) => [styles.deleteButton, (!threadId || saving) && styles.disabled, pressed && threadId && !saving && styles.pressed]}
              >
                <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={17} />
                <Text style={styles.deleteButtonText}>移入回收站</Text>
              </Pressable>
            </View>
          </View>
          {status ? <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
        </View>
      </AiLightScaffold>

      <AppDialog
        message="选择跟随全局默认后，此会话会使用模型账号页里的全局默认模型。选择具体模型后，只影响当前会话。"
        onClose={() => {
          if (!savingModel) {
            setModelPickerVisible(false);
          }
        }}
        onPrimary={() => setModelPickerVisible(false)}
        primaryDisabled={savingModel}
        primaryLabel="关闭"
        title="当前会话模型"
        visible={modelPickerVisible}
      >
        <ScrollView style={styles.modelPickerScroll}>
          <View style={styles.modelPickerList}>
            <Pressable
              accessibilityRole="button"
              disabled={savingModel}
              onPress={() => void saveSessionModel(null, null)}
              style={({ pressed }) => [styles.modelOption, savingModel && styles.disabled, pressed && !savingModel && styles.pressed]}
            >
              <Text style={styles.modelOptionTitle}>跟随全局默认</Text>
              <Text style={styles.caption}>{sessionModelConfig?.followDefaultLabel ?? '使用全局默认模型'}</Text>
            </Pressable>
            {sessionModelConfig?.options.map((option) => (
              <Pressable
                accessibilityRole="button"
                disabled={savingModel}
                key={`${option.providerId}:${option.modelId}`}
                onPress={() => void saveSessionModel(option.providerId, option.modelId)}
                style={({ pressed }) => [styles.modelOption, savingModel && styles.disabled, pressed && !savingModel && styles.pressed]}
              >
                <Text style={styles.modelOptionTitle}>{option.providerLabel} · {option.label}</Text>
                <Text style={styles.caption}>{option.hasApiKey ? '可用于当前会话' : '未填写 API key'}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </AppDialog>

      <AppDialog
        message="修改后会同步显示在聊天页、最近继续和历史列表。"
        onClose={() => {
          if (!saving) {
            setRenameDialogVisible(false);
          }
        }}
        onPrimary={() => void confirmRenameThread()}
        primaryDisabled={saving || !renameValue.trim()}
        primaryLabel={saving ? '正在保存' : '保存'}
        title="重命名当前会话"
        visible={renameDialogVisible}
      >
        <TextInput
          editable={!saving}
          onChangeText={setRenameValue}
          placeholder="会话名称"
          placeholderTextColor={aiLightColors.mutedSoft}
          selectionColor={aiLightColors.coral}
          style={styles.dialogInput}
          value={renameValue}
        />
      </AppDialog>

      <AppDialog
        danger
        message="删除后会将当前会话移入回收站，聊天记录和会话资料会保留，之后可在历史会话的回收站中恢复或永久删除。"
        onClose={() => {
          if (!saving) {
            setDeleteDialogVisible(false);
          }
        }}
        onPrimary={() => void confirmDeleteCurrentThread()}
        primaryDisabled={saving || !threadId}
        primaryLabel={saving ? '正在移入' : '移入回收站'}
        title="删除当前会话"
        visible={deleteDialogVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  summaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  threadTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minWidth: 0,
  },
  threadTitleText: {
    flex: 1,
    minWidth: 0,
  },
  titleIconButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 26,
    justifyContent: 'center',
    width: 26,
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
  maintenanceWarning: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
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
  memoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  memorySwitch: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    minWidth: 58,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  memorySwitchActive: {
    backgroundColor: aiLightColors.coral,
    borderColor: aiLightColors.coral,
  },
  memorySwitchText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '700',
  },
  memorySwitchTextActive: {
    color: aiLightColors.onDark,
  },
  memoryManageButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing[3],
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
  advancedContent: {
    gap: rhythm.cardContentGap,
  },
  weightRow: {
    gap: rhythm.microGap,
  },
  settingGroup: {
    gap: rhythm.microGap,
  },
  weightChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  systemPromptTextarea: {
    maxHeight: SYSTEM_PROMPT_TEXTAREA_MAX_HEIGHT,
  },
  actions: {
    gap: rhythm.listCardGap,
  },
  dangerSection: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[3],
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: spacing[10],
    paddingHorizontal: spacing[4],
  },
  deleteButtonText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: spacing[10],
    paddingHorizontal: spacing[3],
  },
  modelPickerList: {
    gap: rhythm.microGap,
  },
  modelPickerScroll: {
    maxHeight: 320,
  },
  modelOption: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  modelOptionTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.48,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
});
