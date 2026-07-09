import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightListGroup, AiLightListItem } from '../components/ai/AiLightList';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiSwitch } from '../components/ai/AiSwitch';
import { AiUsageSummary } from '../components/ai/AiUsageSummary';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import {
  applyRoleCardToThread,
  addThreadSessionManualModel,
  clearThreadSessionModelOverride,
  deleteProviderModel,
  deleteProviderModels,
  deleteProviderModelsByProvider,
  deleteAiThreads,
  loadThreadAiUsageOverview,
  loadThreadSessionConfig,
  loadThreadSessionModelConfig,
  importThreadContinuity,
  renameAiThread,
  saveThreadSessionModelOverride,
  verifyThreadSessionModelOverride,
  updateAiThreadSessionConfig,
  type AiThreadSessionModelConfig,
} from '../ai/aiChatService';
import { DEFAULT_AI_ROLE_PROMPT } from '../ai/aiConstants';
import { buildExternalContinuityPrompt } from '../ai/aiContinuityImportPrompt';
import { loadMemoryMaintenanceStatus } from '../ai/aiMemoryService';
import { builtInModelsForProvider } from '../ai/providerRegistry';
import { exportRoleContinuityPackage, getExportableRoleCardIdForThread } from '../ai/aiRoleCardContinuityExportService';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
import type { AiBoundaryMode, AiContextType, AiReplyPreference, AiRoleInstructionWeight } from '../ai/types';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { BUILT_IN_PROVIDERS } from '../ai/aiConstants';
import { PET_MODELS } from '../config/petModels';
import { Live2DPetManagerModal } from '../components/ai/Live2DPetManagerModal';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: string;
  contextTitle?: string;
  contextType?: AiContextType;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenRoleLibrary: () => void;
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
  ordinaryUncompressedRoundCount: number;
  protectedImportRoundCount: number;
}

function getDefaultSystemPrompt(contextType: AiContextType): string {
  return contextType === 'normal' ? '' : DEFAULT_AI_ROLE_PROMPT;
}

function isProtectedSessionModelOption(option: NonNullable<AiThreadSessionModelConfig['options']>[number]): boolean {
  const providerType = BUILT_IN_PROVIDERS.find((provider) => provider.providerType === option.providerId)?.providerType
    ?? (option.providerId === 'openai_compatible' || option.providerId === 'custom' ? option.providerId : null);
  if (!providerType) {
    return false;
  }
  const builtInModelIds = new Set(builtInModelsForProvider(option.providerId, providerType).map((model) => model.modelId));
  return builtInModelIds.has(option.modelId);
}

function sessionModelOptionKey(option: NonNullable<AiThreadSessionModelConfig['options']>[number]): string {
  return `${option.providerId}:${option.modelId}`;
}

function formatPendingRoundsSummary(status: MemoryMaintenanceStatus | null): string {
  const ordinaryRounds = status?.ordinaryUncompressedRoundCount ?? status?.uncompressedRoundCount ?? 0;
  const protectedRounds = status?.protectedImportRoundCount ?? 0;
  if (protectedRounds > 0) {
    return `待整理 ${ordinaryRounds} 轮 · 导入保护 ${protectedRounds} 轮`;
  }
  return `待整理 ${ordinaryRounds} 轮`;
}

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  onBack,
  onOpenProviderSettings,
  onOpenRoleLibrary,
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
  const [currentRoleCardId, setCurrentRoleCardId] = useState<string | null>(null);
  const [roleCardSummary, setRoleCardSummary] = useState('默认角色');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [roleInstructionWeight, setRoleInstructionWeight] = useState<AiRoleInstructionWeight>('default');
  const [replyPreference, setReplyPreference] = useState<AiReplyPreference>('auto');
  const [thinkingDisabled, setThinkingDisabled] = useState(false);
  const [deepMemoryEnabled, setDeepMemoryEnabled] = useState(false);
  const [lastMaintenanceError, setLastMaintenanceError] = useState<string | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [sessionModelConfig, setSessionModelConfig] = useState<AiThreadSessionModelConfig | null>(null);
  const [sessionBaseUrlDraft, setSessionBaseUrlDraft] = useState('');
  const [isSystemThinking, setIsSystemThinking] = useState(false);
  const [currentPetModelId, setCurrentPetModelId] = useState<string | null>(null);
  const [petManagerVisible, setPetManagerVisible] = useState(false);
  const [sessionApiKeyDraft, setSessionApiKeyDraft] = useState('');
  const [manualSessionModelDraft, setManualSessionModelDraft] = useState('');
  const [selectedSessionModelKeys, setSelectedSessionModelKeys] = useState<string[]>([]);
  const [threadUsage, setThreadUsage] = useState<AiUsageAggregate | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [advancedPromptVisible, setAdvancedPromptVisible] = useState(contextType !== 'normal');
  const [advancedUsageVisible, setAdvancedUsageVisible] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [exportingRolePackage, setExportingRolePackage] = useState(false);
  const [importingContinuity, setImportingContinuity] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const systemPromptFieldRef = useRef<View | null>(null);
  const settingsLoadedRef = useRef(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const promptConfigured = systemPrompt.trim().length > 0;
  const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
  const avatarSummary = avatarEnabled ? (avatarUri ? '头像已启用' : '头像已启用，使用默认标记') : '无头像';
  const sessionModelSelectionMode = selectedSessionModelKeys.length > 0;
  const selectedSessionModelProviderId = selectedSessionModelKeys[0]?.split(':')[0] ?? null;

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      setThreadTitle(fallbackThreadTitle);
      setRenameValue(fallbackThreadTitle);
      setSystemPrompt(getDefaultSystemPrompt(contextType));
      setCurrentRoleCardId(null);
      setRoleInstructionWeight('default');
      setReplyPreference('auto');
      setThinkingDisabled(false);
      setDeepMemoryEnabled(false);
      setLastMaintenanceError(null);
      setMaintenanceStatus(null);
      setSessionModelConfig(null);
      setSessionBaseUrlDraft('');
      setSessionApiKeyDraft('');
      setManualSessionModelDraft('');
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
    setThinkingDisabled(config.thread.thinkingDisabled);
    setDeepMemoryEnabled(config.deepMemoryEnabled);
    setLastMaintenanceError(config.lastMaintenanceError);
    const [nextMaintenanceStatus, nextSessionModelConfig, nextThreadUsage] = await Promise.all([
      loadMemoryMaintenanceStatus(space, threadId),
      loadThreadSessionModelConfig(space, threadId),
      loadThreadAiUsageOverview(space, threadId),
    ]);
    setMaintenanceStatus(nextMaintenanceStatus);
    setSessionModelConfig(nextSessionModelConfig);
    setSessionBaseUrlDraft(nextSessionModelConfig?.sessionBaseUrl ?? '');
    setSessionApiKeyDraft('');
    setManualSessionModelDraft('');
    setThreadUsage(nextThreadUsage);
    setAdvancedPromptVisible(config.thread.systemPrompt.trim().length > 0 || contextType !== 'normal');
    setBoundaryMode(config.thread.boundaryMode);
    setCurrentRoleCardId(config.thread.roleCardId);
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
        thinkingDisabled,
        threadId,
      }).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [boundaryMode, deepMemoryEnabled, replyPreference, space, thinkingDisabled, threadId]);

  useEffect(() => {
    let isMounted = true;
    void runWithDatabaseSpace('normal', async (db) => {
      const loadedPetModelId = await settingsRepository.getValue(db, 'GLOBAL_PET_MODEL_ID');
      if (isMounted) {
        setCurrentPetModelId(loadedPetModelId === '' ? null : (loadedPetModelId ?? PET_MODELS[0].id));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void reloadConfig();
  }, [reloadConfig]);

  useEffect(() => {
    setSelectedSessionModelKeys([]);
  }, [threadId, modelPickerVisible]);

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
      if (!threadId) {
        return false;
      }
      const updated = await updateAiThreadSessionConfig({
        boundaryMode,
        avatarEnabled,
        deepMemoryEnabled,
        replyPreference,
        roleInstructionWeight,
        space,
        systemPrompt: systemPrompt.trim(),
        thinkingDisabled,
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
      const updated = providerId || modelId
        ? await saveThreadSessionModelOverride({
            apiKey: sessionApiKeyDraft || undefined,
            baseUrl: sessionBaseUrlDraft,
            modelId,
            providerId,
            space,
            threadId,
          })
        : await clearThreadSessionModelOverride(space, threadId);
      if (!updated) {
        throw new Error('没有找到当前会话，模型未保存。');
      }
      setModelPickerVisible(false);
      const modelConfig = await loadThreadSessionModelConfig(space, threadId);
      setSessionModelConfig(modelConfig);
      setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
      setSessionApiKeyDraft('');
      setManualSessionModelDraft('');
      setStatus({ message: '仅本会话已更新。', tone: 'success', title: '模型已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '模型保存失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function persistCurrentSessionModelDraft(): Promise<boolean> {
    const providerId = sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId ?? null;
    const modelId = sessionModelConfig?.modelId ?? sessionModelConfig?.defaultModelId ?? null;
    if (!threadId || !providerId) {
      return false;
    }
    const updated = await saveThreadSessionModelOverride({
      apiKey: sessionApiKeyDraft || undefined,
      baseUrl: sessionBaseUrlDraft,
      modelId,
      providerId,
      space,
      threadId,
    });
    if (!updated) {
      throw new Error('没有找到当前会话，模型未保存。');
    }
    const modelConfig = await loadThreadSessionModelConfig(space, threadId);
    setSessionModelConfig(modelConfig);
    setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
    setSessionApiKeyDraft('');
    setManualSessionModelDraft('');
    return true;
  }

  async function saveCurrentSessionModelDraft() {
    if (savingModel) {
      return;
    }
    setSavingModel(true);
    try {
      const saved = await persistCurrentSessionModelDraft();
      if (saved) {
        setStatus({ message: '本会话模型配置已保存。', tone: 'success', title: '模型已保存' });
      }
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '模型保存失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function reuseGlobalModelConfig() {
    if (!threadId || savingModel || !sessionModelConfig?.defaultProviderId) {
      return;
    }
    setSavingModel(true);
    try {
      const updated = await saveThreadSessionModelOverride({
        apiKey: '',
        baseUrl: null,
        modelId: sessionModelConfig.defaultModelId,
        providerId: sessionModelConfig.defaultProviderId,
        space,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，模型未保存。');
      }
      const modelConfig = await loadThreadSessionModelConfig(space, threadId);
      setSessionModelConfig(modelConfig);
      setSessionBaseUrlDraft('');
      setSessionApiKeyDraft('');
      setManualSessionModelDraft('');
      setStatus({ message: '当前会话已复用全局模型账号配置。', tone: 'success', title: '已复用全局配置' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '复用失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function testCurrentSessionModel() {
    if (!threadId || savingModel) {
      return;
    }
    setSavingModel(true);
    try {
      const saved = await persistCurrentSessionModelDraft();
      if (!saved) {
        throw new Error('请先选择或复用一个模型后再测试。');
      }
      await verifyThreadSessionModelOverride(space, threadId);
      setStatus({ message: '当前会话模型可用。', tone: 'success', title: '测试通过' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '测试失败', tone: 'error', title: '测试失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function addManualSessionModel() {
    const modelId = manualSessionModelDraft.trim();
    const providerId = sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId ?? null;
    if (!threadId || savingModel || !providerId || !modelId) {
      return;
    }
    setSavingModel(true);
    try {
      await addThreadSessionManualModel({ modelId, providerId, space });
      const updated = await saveThreadSessionModelOverride({
        apiKey: sessionApiKeyDraft || undefined,
        baseUrl: sessionBaseUrlDraft,
        modelId,
        providerId,
        space,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，模型未保存。');
      }
      const modelConfig = await loadThreadSessionModelConfig(space, threadId);
      setSessionModelConfig(modelConfig);
      setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
      setSessionApiKeyDraft('');
      setManualSessionModelDraft('');
      setStatus({ message: `已添加并切换到 ${modelId}。`, tone: 'success', title: '模型已添加' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '添加模型失败', tone: 'error', title: '保存失败' });
    } finally {
      setSavingModel(false);
    }
  }

  async function clearSessionApiKey() {
    if (!threadId || savingModel || !sessionModelConfig?.providerId) {
      return;
    }
    setSavingModel(true);
    try {
      const updated = await saveThreadSessionModelOverride({
        apiKey: '',
        baseUrl: sessionBaseUrlDraft,
        modelId: sessionModelConfig.modelId,
        providerId: sessionModelConfig.providerId,
        space,
        threadId,
      });
      if (!updated) {
        throw new Error('没有找到当前会话，API 未清除。');
      }
      const modelConfig = await loadThreadSessionModelConfig(space, threadId);
      setSessionModelConfig(modelConfig);
      setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
      setSessionApiKeyDraft('');
      setStatus({ message: '仅本会话 API 已清除。', tone: 'success', title: '模型已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : 'API 清除失败', tone: 'error', title: '保存失败' });
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
    setCurrentRoleCardId(null);
    setRoleCardSummary('默认角色');
    setAvatarEnabled(false);
    setAvatarUri(null);
    setStatus({ message: '当前会话已恢复为 Pixory 默认角色。', tone: 'success', title: '角色已重置' });
    await reloadConfig();
  }

  async function exportCurrentRolePackage() {
    if (!threadId || exportingRolePackage) {
      return;
    }
    setExportingRolePackage(true);
    try {
      const roleCardId = await getExportableRoleCardIdForThread(space, threadId);
      if (!roleCardId) {
        throw new Error('当前会话没有绑定可导出的角色卡。');
      }
      const result = await exportRoleContinuityPackage({
        includeMarkdown: true,
        roleCardId,
        space,
        threadId,
      });
      setStatus({
        message: `已导出 ${result.pngFileName}${result.markdownFileName ? ` 和 ${result.markdownFileName}` : ''}。`,
        tone: 'success',
        title: '角色包已导出',
      });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '角色包导出失败', tone: 'error', title: '导出失败' });
    } finally {
      setExportingRolePackage(false);
    }
  }

  function confirmExportCurrentRolePackage() {
    if (space !== 'personal') {
      void exportCurrentRolePackage();
      return;
    }
    Alert.alert('导出私密角色包',
      '导出的 Markdown 会包含当前私密会话的全量可见上下文、上一轮对话和 active memory。请选择可信目录保存。',
      [
        { text: '取消', style: 'cancel' },
        { text: '继续导出', style: 'destructive', onPress: () => void exportCurrentRolePackage() },
      ]
    );
  }

  function toggleSelectedSessionModel(option: NonNullable<AiThreadSessionModelConfig['options']>[number]) {
    const key = sessionModelOptionKey(option);
    setSelectedSessionModelKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function beginSessionModelSelection(option: NonNullable<AiThreadSessionModelConfig['options']>[number]) {
    setSelectedSessionModelKeys([sessionModelOptionKey(option)]);
  }

  async function pickAndImportContinuity() {
    if (!threadId || importingContinuity) {
      return;
    }
    setImportingContinuity(true);
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        multiple: false,
        type: ['text/plain', 'text/markdown', '*/*'],
      });
      if (pickerResult.canceled || !pickerResult.assets?.[0]) {
        return;
      }
      const asset = pickerResult.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const importResult = await importThreadContinuity({
        fileName: asset.name,
        text,
        space,
        threadId,
      });
      const importedMessageCount = importResult.importedMessageCount;
      const continuityBlockCount = importResult.continuityBlockCount;
      const blocksOnlyImport = importedMessageCount === 0 && continuityBlockCount > 0;
      setStatus({
        message: blocksOnlyImport
          ? `已导入 ${asset.name} 的连续性内容：暂未安全恢复出可渲染聊天消息，已保留 ${continuityBlockCount} 段连续性块交给记忆系统审读。`
          : importResult.partial
            ? `已部分接回 ${asset.name}：恢复 ${importedMessageCount} 条消息，另有 ${continuityBlockCount} 段内容保留为连续性块交给记忆系统审读。`
            : `已接回 ${asset.name}，当前会话会切到导入分支继续聊天。`,
        tone: 'success',
        title: blocksOnlyImport ? '连续性内容已导入' : importResult.partial ? '外部对话已部分接回' : '外部对话已接回',
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : '外部对话接回失败',
        tone: 'error',
        title: '导入失败',
      });
    } finally {
      setImportingContinuity(false);
    }
  }

  function confirmDeleteSessionModel(option: NonNullable<AiThreadSessionModelConfig['options']>[number]) {
    Alert.alert(
      '删除模型',
      '删除后，这个模型会从全局和本会话模型列表中移除；如果当前会话正在使用它，会自动回退为跟随全局默认。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSavingModel(true);
              try {
                await deleteProviderModel({
                  modelId: option.modelId,
                  providerId: option.providerId,
                  space,
                });
                const modelConfig = threadId ? await loadThreadSessionModelConfig(space, threadId) : null;
                setSessionModelConfig(modelConfig);
                setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
                setSessionApiKeyDraft('');
                setManualSessionModelDraft('');
                setStatus({ message: `${option.label} 已删除。`, tone: 'success', title: '模型已删除' });
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '删除模型失败', tone: 'error', title: '删除失败' });
              } finally {
                setSavingModel(false);
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteSelectedSessionModels() {
    const models = selectedSessionModelKeys
      .map((key) => {
        const [providerId, ...rest] = key.split(':');
        return { providerId, modelId: rest.join(':') };
      })
      .filter((item) => item.providerId && item.modelId);
    if (models.length === 0) {
      return;
    }
    Alert.alert(
      '批量删除',
      `删除后，这 ${models.length} 个模型会从全局和本会话模型列表中移除，当前会话若命中会自动回退。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '批量删除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSavingModel(true);
              try {
                const deletedCount = await deleteProviderModels({ models, space });
                const modelConfig = threadId ? await loadThreadSessionModelConfig(space, threadId) : null;
                setSelectedSessionModelKeys([]);
                setSessionModelConfig(modelConfig);
                setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
                setSessionApiKeyDraft('');
                setManualSessionModelDraft('');
                setStatus({
                  message: deletedCount > 0 ? `已删除 ${deletedCount} 个模型。` : '没有可删除的模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',
                  title: deletedCount > 0 ? '删除完成' : '未删除模型',
                });
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '批量删除失败', tone: 'error', title: '删除失败' });
              } finally {
                setSavingModel(false);
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteSameProviderSessionModels() {
    if (!selectedSessionModelProviderId) {
      return;
    }
    Alert.alert(
      '删除同一来源',
      '将删除当前来源下全部可删除模型，当前会话命中时会自动回退为可用配置。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除同一来源',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSavingModel(true);
              try {
                const deletedCount = await deleteProviderModelsByProvider({ providerId: selectedSessionModelProviderId, space });
                const modelConfig = threadId ? await loadThreadSessionModelConfig(space, threadId) : null;
                setSelectedSessionModelKeys([]);
                setSessionModelConfig(modelConfig);
                setSessionBaseUrlDraft(modelConfig?.sessionBaseUrl ?? '');
                setSessionApiKeyDraft('');
                setManualSessionModelDraft('');
                setStatus({
                  message: deletedCount > 0 ? `已删除该来源下 ${deletedCount} 个模型。` : '该来源下没有可删除模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',
                  title: deletedCount > 0 ? '清理完成' : '未删除模型',
                });
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '删除同一来源失败', tone: 'error', title: '删除失败' });
              } finally {
                setSavingModel(false);
              }
            })();
          },
        },
      ]
    );
  }

  async function copyExternalContinuityPrompt() {
    try {
      await Clipboard.setStringAsync(buildExternalContinuityPrompt());
      setStatus({
        message: '已复制外部迁移提示词，可发给其他平台 AI 生成导回 Pixory 的连续性文档。',
        tone: 'success',
        title: '提示词已复制',
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : '复制迁移提示词失败',
        tone: 'error',
        title: '复制失败',
      });
    }
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

  const handleSelectPetModel = async (id: string | null) => {
    const isChanging = id !== currentPetModelId;
    setCurrentPetModelId(id);
    await runWithDatabaseSpace('normal', async (db) => {
      await settingsRepository.setValue(db, 'GLOBAL_PET_MODEL_ID', id ?? '');
      if (isChanging && id) {
        await settingsRepository.setValue(db, 'GLOBAL_PET_OFFSET_X', '0');
        await settingsRepository.setValue(db, 'GLOBAL_PET_OFFSET_Y', '0');
        await settingsRepository.setValue(db, 'GLOBAL_PET_SCALE', '1');
      }
    });
    
    import('react-native').then(({ DeviceEventEmitter }) => {
      DeviceEventEmitter.emit('LIVE2D_MODEL_CHANGED');
    });
  };

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
          <AiLightListGroup title="当前会话">
            <AiLightListItem
              accessibilityLabel="重命名当前会话"
              icon="create-outline"
              title="会话名称"
              value={threadTitle}
              onPress={() => {
                setRenameValue(threadTitle);
                setRenameDialogVisible(true);
              }}
            />
            <AiLightListItem
              icon="hardware-chip-outline"
              title="会话模型"
              value={sessionModelConfig?.currentLabel ?? '加载中'}
              subtitle={sessionModelConfig?.currentStatus === 'invalid' ? '模型配置已失效，请重新选择' : undefined}
              destructive={sessionModelConfig?.currentStatus === 'invalid'}
              onPress={() => setModelPickerVisible(true)}
            />
            {threadId && onOpenThreadMaterials ? (
              <AiLightListItem
                icon="library-outline"
                title="会话资料库"
                onPress={onOpenThreadMaterials}
              />
            ) : null}
          </AiLightListGroup>

          <AiLightListGroup title="角色与表现">
            <AiLightListItem
              icon="person-circle-outline"
              title="角色身份"
              subtitle="从角色库中选择或新建角色"
              value={roleCardSummary}
              onPress={onOpenRoleLibrary}
            />
            <AiLightListItem
              accessibilityRole="switch"
              icon="image-outline"
              title="角色头像"
              subtitle={avatarSummary}
              value={avatarEnabled ? '头像开启' : '头像关闭'}
              onPress={() => setAvatarEnabled((current) => !current)}
              showChevron={false}
              action={
                <AiSwitch
                  value={avatarEnabled}
                  onValueChange={setAvatarEnabled}
                />
              }
            />
            <AiLightListItem
              accessibilityRole="switch"
              accessibilityState={{ checked: thinkingDisabled }}
              icon="flash-outline"
              title="思考过程"
              value={thinkingDisabled ? '已关闭' : '允许输出'}
              showChevron={false}
              isLast
              onPress={() => setThinkingDisabled((current) => !current)}
              action={
                <AiSwitch
                  value={!thinkingDisabled}
                  onValueChange={(val) => setThinkingDisabled(!val)}
                />
              }
            />
          </AiLightListGroup>


          <AiLightListGroup footer="此设置全局生效。" title="桌宠与互动">
            <AiLightListItem
              accessibilityRole="switch"
              icon="eye-outline"
              title="显示桌宠"
              onPress={() => void handleSelectPetModel(currentPetModelId === null ? PET_MODELS[0].id : null)}
              action={
                <AiSwitch
                  value={currentPetModelId !== null}
                  onValueChange={(val) => void handleSelectPetModel(val ? PET_MODELS[0].id : null)}
                />
              }
            />
            <AiLightListItem
              icon="shirt-outline"
              title="桌宠管理"
              onPress={() => setPetManagerVisible(true)}
              value={currentPetModelId ? PET_MODELS.find((m) => m.id === currentPetModelId)?.name : undefined}
            />
          </AiLightListGroup>

          <AiLightListGroup title="上下文与偏好">
            <View style={styles.inlineConfigPadding}>
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
              <Text style={[styles.caption, { marginTop: spacing[4] }]}>回复倾向</Text>
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
          </AiLightListGroup>

          <AiLightListGroup
            footer={deepMemoryEnabled ? `上次维护：${maintenanceStatus?.lastMaintenanceCompletedAt ? formatMinute(maintenanceStatus.lastMaintenanceCompletedAt) : '暂无'} · 摘要 ${maintenanceStatus?.summarySegmentCount ?? 0} 段` : '开启后在本地保存会话摘要和可复用记忆，用于长对话回看。'}
            title="记忆与历史"
          >
            <AiLightListItem
              accessibilityRole="switch"
              action={
                <AiSwitch
                  onValueChange={setDeepMemoryEnabled}
                  value={deepMemoryEnabled}
                />
              }
              onPress={() => setDeepMemoryEnabled((current) => !current)}
              icon="albums-outline"
              showChevron={false}
              title="深度记忆"
              subtitle="开启后在本地保存会话摘要和可复用记忆，用于长对话回看；关闭后不会继续注入记忆背景。"
              isLast={!threadId}
            />
            {threadId ? (
              <AiLightListItem
                icon="layers-outline"
                onPress={onOpenMemoryBoard}
                title="管理记忆黑板"
                isLast={!maintenanceStatus?.lastMaintenanceUsedFallback && !lastMaintenanceError}
              />
            ) : null}
            {maintenanceStatus?.lastMaintenanceUsedFallback ? (
              <AiLightListItem
                icon="warning-outline"
                title="维护警告"
                subtitle="远程失败，已使用本地轻量整理"
                showChevron={false}
                isLast={!lastMaintenanceError}
              />
            ) : null}
            {lastMaintenanceError ? (
              <AiLightListItem
                icon="alert-circle-outline"
                title="维护失败"
                subtitle={formatMaintenanceError(lastMaintenanceError)}
                showChevron={false}
                isLast
              />
            ) : null}
          </AiLightListGroup>

          <AiLightListGroup footer="这些选项会自动保存。" title="回复设置">
            <AiLightListItem
              icon="code-working-outline"
              onPress={() => setAdvancedPromptVisible((current) => !current)}
              title="高级角色指令"
              value={advancedPromptVisible ? '收起' : '展开'}
            />
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
            <AiLightListItem
              icon="bar-chart-outline"
              onPress={() => setAdvancedUsageVisible((current) => !current)}
              title="本会话用量统计"
              value={advancedUsageVisible ? '收起' : '展开'}
              isLast={!advancedUsageVisible}
            />
            {advancedUsageVisible ? (
              <View style={styles.inlineConfigPadding}>
                <AiUsageSummary showRecent={false} usage={threadUsage ?? EMPTY_THREAD_USAGE} />
              </View>
            ) : null}
          </AiLightListGroup>

          <AiLightListGroup title="角色与数据迁移">
            <AiLightListItem
              icon="refresh-outline"
              title="恢复默认角色"
              onPress={() => void clearRoleCard()}
              showChevron={false}
            />
            <AiLightListItem
              icon="push-outline"
              title={exportingRolePackage ? '导出中' : '导出当前角色包'}
              onPress={confirmExportCurrentRolePackage}
              disabled={!threadId || !currentRoleCardId || exportingRolePackage}
              showChevron={false}
            />
            <AiLightListItem
              icon="download-outline"
              title={importingContinuity ? '导入中' : '导入外部记忆'}
              onPress={() => void pickAndImportContinuity()}
              disabled={!threadId || importingContinuity}
              showChevron={false}
            />
            <AiLightListItem
              icon="copy-outline"
              title="复制迁移提示词"
              onPress={() => void copyExternalContinuityPrompt()}
              showChevron={false}
              isLast
            />
          </AiLightListGroup>

          <View style={styles.actions}>
            <AiLightButton label="保存角色指令并开始聊天" loading={saving} onPress={() => void saveAndStartChat()} />
            <AiLightButton label="仅保存角色指令" loading={saving} onPress={() => void saveSessionSettings()} variant="ghost" />
          </View>

          <AiLightListGroup>
            <AiLightListItem
              destructive
              icon="trash-outline"
              iconBackgroundColor="#FFECEB"
              iconColor="#FF3B30"
              isLast
              onPress={() => setDeleteDialogVisible(true)}
              showChevron={false}
              title="移入回收站"
            />
          </AiLightListGroup>

          {status ? <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
        </View>
      </AiLightScaffold>



      <AppDialog
        message="选择跟随全局默认后，此会话会使用模型账号页里的全局默认模型。选择具体模型后，仅在当前会话生效。"
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
            <View style={styles.modelOverrideFields}>
              <Text style={styles.caption}>仅本会话</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingModel}
                onChangeText={setSessionBaseUrlDraft}
                placeholder="地址"
                placeholderTextColor={aiLightColors.mutedSoft}
                selectionColor={aiLightColors.primary}
                style={styles.dialogInput}
                value={sessionBaseUrlDraft}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingModel}
                onChangeText={setSessionApiKeyDraft}
                placeholder={sessionModelConfig?.sessionHasApiKeyOverride ? '已保存本会话 API' : 'API'}
                placeholderTextColor={aiLightColors.mutedSoft}
                secureTextEntry
                selectionColor={aiLightColors.primary}
                style={styles.dialogInput}
                value={sessionApiKeyDraft}
              />
              {sessionModelConfig?.sessionHasApiKeyOverride ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={savingModel}
                  onPress={() => void clearSessionApiKey()}
                  style={({ pressed }) => [styles.modelInlineAction, savingModel && styles.disabled, pressed && !savingModel && styles.pressed]}
                >
                  <Text style={styles.textActionLabel}>清除 API</Text>
                </Pressable>
              ) : null}
              <View style={styles.modelActionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingModel || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)}
                  onPress={() => void saveCurrentSessionModelDraft()}
                  style={({ pressed }) => [
                    styles.modelInlineAction,
                    (savingModel || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)) && styles.disabled,
                    pressed && !savingModel && (sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId) && styles.pressed,
                  ]}
                >
                  <Text style={styles.textActionLabel}>保存本会话配置</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingModel || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)}
                  onPress={() => void testCurrentSessionModel()}
                  style={({ pressed }) => [
                    styles.modelInlineAction,
                    (savingModel || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)) && styles.disabled,
                    pressed && !savingModel && (sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId) && styles.pressed,
                  ]}
                >
                  <Text style={styles.textActionLabel}>测试当前模型</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={savingModel || !sessionModelConfig?.defaultProviderId}
                onPress={() => void reuseGlobalModelConfig()}
                style={({ pressed }) => [styles.modelInlineAction, (savingModel || !sessionModelConfig?.defaultProviderId) && styles.disabled, pressed && !savingModel && sessionModelConfig?.defaultProviderId && styles.pressed]}
              >
                <Text style={styles.textActionLabel}>复用全局模型配置</Text>
              </Pressable>
            </View>
            <View style={styles.modelOverrideFields}>
              <Text style={styles.caption}>添加新模型</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingModel}
                onChangeText={setManualSessionModelDraft}
                placeholder="模型 ID / 中转站别名"
                placeholderTextColor={aiLightColors.mutedSoft}
                selectionColor={aiLightColors.primary}
                style={styles.dialogInput}
                value={manualSessionModelDraft}
              />
              <Pressable
                accessibilityRole="button"
                disabled={savingModel || !manualSessionModelDraft.trim() || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)}
                onPress={() => void addManualSessionModel()}
                style={({ pressed }) => [
                  styles.modelInlineAction,
                  (savingModel || !manualSessionModelDraft.trim() || !(sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId)) && styles.disabled,
                  pressed && !savingModel && manualSessionModelDraft.trim() && (sessionModelConfig?.providerId ?? sessionModelConfig?.defaultProviderId) && styles.pressed,
                ]}
              >
                <Text style={styles.textActionLabel}>添加并用于当前会话</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={savingModel || sessionModelSelectionMode}
              onPress={() => void saveSessionModel(null, null)}
              style={({ pressed }) => [styles.modelOption, (savingModel || sessionModelSelectionMode) && styles.disabled, pressed && !savingModel && !sessionModelSelectionMode && styles.pressed]}
            >
              <Text style={styles.modelOptionTitle}>跟随全局默认</Text>
              <Text style={styles.caption}>{sessionModelConfig?.followDefaultLabel ?? '使用全局默认模型'}</Text>
            </Pressable>
            {sessionModelSelectionMode ? (
              <View style={styles.modelBatchActionRow}>
                <Text style={styles.caption}>已选 {selectedSessionModelKeys.length} 项</Text>
                <View style={styles.modelActionRow}>
                  <Pressable accessibilityRole="button" onPress={confirmDeleteSelectedSessionModels} style={({ pressed }) => [styles.modelInlineAction, pressed && styles.pressed]}>
                    <Text style={styles.textActionLabel}>批量删除</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={confirmDeleteSameProviderSessionModels} style={({ pressed }) => [styles.modelInlineAction, pressed && styles.pressed]}>
                    <Text style={styles.textActionLabel}>删除同一来源</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setSelectedSessionModelKeys([])} style={({ pressed }) => [styles.modelInlineAction, pressed && styles.pressed]}>
                    <Text style={styles.caption}>取消</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {sessionModelConfig?.options.map((option) => (
              <View key={`${option.providerId}:${option.modelId}`} style={[
                styles.modelOption,
                selectedSessionModelKeys.includes(sessionModelOptionKey(option)) && styles.modelOptionSelected,
              ]}>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingModel}
                  onLongPress={() => beginSessionModelSelection(option)}
                  onPress={() => {
                    if (sessionModelSelectionMode) {
                      toggleSelectedSessionModel(option);
                      return;
                    }
                    void saveSessionModel(option.providerId, option.modelId);
                  }}
                  style={({ pressed }) => [styles.modelOptionSelectAction, savingModel && styles.disabled, pressed && !savingModel && styles.pressed]}
                >
                  <Text style={styles.modelOptionTitle}>{option.providerLabel} · {option.label}</Text>
                  <Text style={styles.caption}>{option.hasApiKey ? '可用于当前会话' : '未填写 API key'}</Text>
                </Pressable>
                {!isProtectedSessionModelOption(option) ? (
                  <Pressable
                    accessibilityLabel={`删除模型 ${option.label}`}
                    accessibilityRole="button"
                    disabled={savingModel}
                    onLongPress={() => beginSessionModelSelection(option)}
                    onPress={() => confirmDeleteSessionModel(option)}
                    style={({ pressed }) => [styles.modelOptionDeleteAction, savingModel && styles.disabled, pressed && !savingModel && styles.pressed]}
                  >
                    <Ionicons color={aiLightColors.primaryActive} name="trash-outline" size={16} />
                    <Text style={styles.textActionLabel}>删除模型</Text>
                  </Pressable>
                ) : null}
              </View>
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
          selectionColor={aiLightColors.primary}
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
      <Live2DPetManagerModal
        visible={petManagerVisible}
        currentModelId={currentPetModelId}
        onClose={() => setPetManagerVisible(false)}
        onSelect={(id) => {
          void handleSelectPetModel(id);
          setPetManagerVisible(false);
        }}
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
    color: aiLightColors.primaryActive,
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
    backgroundColor: aiLightColors.primary,
    borderColor: aiLightColors.primary,
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
    color: aiLightColors.primaryActive,
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
    backgroundColor: aiLightColors.primary,
    borderColor: aiLightColors.primary,
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
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    paddingTop: spacing[3],
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
    color: aiLightColors.primaryActive,
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
  modelOverrideFields: {
    gap: rhythm.compactGridGap,
  },
  modelActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  modelInlineAction: {
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
  modelOption: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  modelOptionSelected: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primary,
  },
  modelOptionSelectAction: {
    gap: rhythm.microGap,
  },
  modelBatchActionRow: {
    gap: rhythm.microGap,
  },
  modelOptionDeleteAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing[1],
    marginTop: spacing[2],
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
  inlineConfigPadding: {
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
});
