import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, findNodeHandle, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Animated, PanResponder, Dimensions, Keyboard, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SecureImage } from '../components/SecureImage';

import { AppDialog } from '../components/AppDialog';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightChip } from '../components/ai/AiLightChip';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightListGroup, AiLightListItem } from '../components/ai/AiLightList';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiAvatarPicker } from '../components/ai/AiAvatarPicker';
import { AiSwitch } from '../components/ai/AiSwitch';
import { AiContextSlider } from '../components/ai/AiContextSlider';
import { AiUsageSummary } from '../components/ai/AiUsageSummary';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import {
  addThreadSessionManualModel,
  clearThreadSessionModelOverride,
  deleteProviderModel,
  deleteProviderModels,
  deleteProviderModelsByProvider,
  deleteAiThreads,
  DEFAULT_AI_USER_AVATAR_ENABLED,
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
import { AI_CONTEXT_DEFAULTS, normalizeAiContextSettings } from '../ai/aiContextSettings';
import { buildExternalContinuityPrompt } from '../ai/aiContinuityImportPrompt';
import { PERSONAL_EXTERNAL_IMPORT_REQUIRES_CONSENT } from '../ai/aiContinuityImportService';
import { loadMemoryMaintenanceStatus } from '../ai/aiMemoryService';
import { builtInModelsForProvider } from '../ai/providerRegistry';
import { exportRoleContinuityPackage, getExportableRoleCardIdForThread } from '../ai/aiRoleCardContinuityExportService';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
import type { AiBoundaryMode, AiContextType, AiReplyPreference, AiRoleInstructionWeight } from '../ai/types';
import { radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { BUILT_IN_PROVIDERS } from '../ai/aiConstants';
import { cancelPendingDiaryJobs } from '../ai/diary/diarySchedulerService';
import { isCompanionAwarenessEnabled, setCompanionAwarenessEnabled } from '../ai/companion/companionSettingsService';

interface AiSessionConfigScreenProps {
  space: PixorySpace;
  threadId?: string;
  contextTitle?: string;
  contextType?: AiContextType;
  visible?: boolean;
  onBack: () => void;
  onOpenProviderSettings: () => void;
  onOpenRoleLibrary: () => void;
  onOpenThreadMaterials?: () => void;
  onOpenChatSearch?: () => void;
  onOpenBranchTree?: () => void;
  onOpenMemoryBoard?: () => void;
  onOpenInnerLife?: () => void;
  onOpenCompanionRuntime?: () => void;
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

function requestPersonalExternalImportConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      '允许本次智能整理？',
      '这不是 Pixory 原生包。为了拆分外部聊天，需要把本次文件内容发送给你配置的记忆模型。授权只对这一个文件生效。',
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: '允许本次', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const EMPTY_THREAD_USAGE: AiUsageAggregate = {
  cacheObservedRequestCount: 0,
  cacheUnobservedPromptTokens: 0,
  cachedInputTokens: 0,
  cachedTokenRatio: null,
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


const DRAWER_WIDTH_RATIO = 0.85;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * DRAWER_WIDTH_RATIO;
const SWIPE_CLOSE_THRESHOLD = DRAWER_WIDTH * 0.35;

export function AiSessionConfigScreen({
  space,
  threadId,
  contextTitle,
  contextType = 'normal',
  visible = true,
  onBack,
  onOpenProviderSettings,
  onOpenRoleLibrary,
  onOpenThreadMaterials,
  onOpenChatSearch,
  onOpenBranchTree,
  onOpenMemoryBoard,
  onOpenInnerLife,
  onOpenCompanionRuntime,
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
  const [avatarEnabled, setAvatarEnabled] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarPickerExpanded, setAvatarPickerExpanded] = useState(false);
  const [userAvatarEnabled, setUserAvatarEnabled] = useState(DEFAULT_AI_USER_AVATAR_ENABLED);
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [profileNickname, setProfileNickname] = useState<string | null>(null);
  const [boundaryMode, setBoundaryMode] = useState<AiBoundaryMode>(contextType === 'normal' ? 'free' : 'prefer_material');
  const [roleInstructionWeight, setRoleInstructionWeight] = useState<AiRoleInstructionWeight>('default');
  const [replyPreference, setReplyPreference] = useState<AiReplyPreference>('auto');
  const [thinkingDisabled, setThinkingDisabled] = useState(false);
  const [roleDiaryEnabled, setRoleDiaryEnabled] = useState(true);
  const [companionAwarenessEnabled, setCompanionAwarenessEnabledState] = useState(true);
  const [deepMemoryEnabled, setDeepMemoryEnabled] = useState(true);

  useEffect(() => {
    void runWithDatabaseSpace(space, async (db) => {
      const stored = await settingsRepository.getValue(db, 'AI_ROLE_DIARY_ENABLED');
      setRoleDiaryEnabled(stored !== 'false');
    });
  }, [space]);
  useEffect(() => { void isCompanionAwarenessEnabled(space).then(setCompanionAwarenessEnabledState); }, [space]);
  const updateCompanionAwareness = useCallback((enabled:boolean)=>{setCompanionAwarenessEnabledState(enabled);void setCompanionAwarenessEnabled(space,enabled).catch(()=>setCompanionAwarenessEnabledState(!enabled));},[space]);
  const updateRoleDiaryEnabled = useCallback((enabled: boolean) => {
    setRoleDiaryEnabled(enabled);
    void (async () => {
      await runWithDatabaseSpace(space, (db) =>
        settingsRepository.setValue(db, 'AI_ROLE_DIARY_ENABLED', enabled ? 'true' : 'false'),
      );
      if (!enabled) {
        await cancelPendingDiaryJobs(space);
      }
    })().catch(() => undefined);
  }, [space]);
  const [contextHistoryRoundLimit, setContextHistoryRoundLimit] = useState(AI_CONTEXT_DEFAULTS.historyRoundLimit);
  const [lastMaintenanceError, setLastMaintenanceError] = useState<string | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [sessionModelConfig, setSessionModelConfig] = useState<AiThreadSessionModelConfig | null>(null);
  const [sessionBaseUrlDraft, setSessionBaseUrlDraft] = useState('');
  const [isSystemThinking, setIsSystemThinking] = useState(false);
  const [sessionApiKeyDraft, setSessionApiKeyDraft] = useState('');
  const [manualSessionModelDraft, setManualSessionModelDraft] = useState('');
  const [selectedSessionModelKeys, setSelectedSessionModelKeys] = useState<string[]>([]);
  const [threadUsage, setThreadUsage] = useState<AiUsageAggregate | null>(null);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [exportingRolePackage, setExportingRolePackage] = useState(false);
  const [importingContinuity, setImportingContinuity] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const systemPromptFieldRef = useRef<View | null>(null);
  const settingsLoadedRef = useRef(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const promptConfigured = systemPrompt.trim().length > 0;
  const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
  const avatarSummary = avatarEnabled ? (avatarUri ? '头像已启用' : '头像已启用，使用默认标记') : '无头像';
  const selfAvatarSummary = userAvatarEnabled
    ? `使用“我的”页资料${profileNickname?.trim() ? ` · ${profileNickname.trim()}` : ''}${profileAvatarUri ? '' : ' · 当前无头像'}`
    : '无头像';
  const sessionModelSelectionMode = selectedSessionModelKeys.length > 0;
  const selectedSessionModelProviderId = selectedSessionModelKeys[0]?.split(':')[0] ?? null;

  const reloadConfig = useCallback(async () => {
    if (!threadId) {
      setThreadTitle(fallbackThreadTitle);
      setRenameValue(fallbackThreadTitle);
      setSystemPrompt(getDefaultSystemPrompt(contextType));
      setCurrentRoleCardId(null);
      setUserAvatarEnabled(DEFAULT_AI_USER_AVATAR_ENABLED);
      setRoleInstructionWeight('default');
      setReplyPreference('auto');
      setThinkingDisabled(false);
      setDeepMemoryEnabled(false);
      setContextHistoryRoundLimit(AI_CONTEXT_DEFAULTS.historyRoundLimit);
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
    const [config, nextProfileAvatarUri, nextProfileNickname] = await Promise.all([
      loadThreadSessionConfig(space, threadId),
      runWithDatabaseSpace(space, (db) => settingsRepository.getProfileAvatarUri(db)),
      runWithDatabaseSpace(space, (db) => settingsRepository.getProfileNickname(db)),
    ]);
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
    setContextHistoryRoundLimit(
      normalizeAiContextSettings({ historyRoundLimit: config.thread.contextHistoryRoundLimit }).historyRoundLimit,
    );
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
    setUserAvatarEnabled(config.userAvatarEnabled);
    setProfileAvatarUri(nextProfileAvatarUri);
    setProfileNickname(nextProfileNickname);
    settingsLoadedRef.current = true;
    setConfigLoaded(true);
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
        contextHistoryRoundLimit,
        replyPreference,
        roleInstructionWeight,
        space,
        systemPrompt,
        thinkingDisabled,
        threadId,
        userAvatarEnabled,
      }).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [
    avatarEnabled,
    boundaryMode,
    deepMemoryEnabled,
    contextHistoryRoundLimit,
    replyPreference,
    roleInstructionWeight,
    space,
    systemPrompt,
    thinkingDisabled,
    threadId,
    userAvatarEnabled,
  ]);

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
        userAvatarEnabled,
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
      let importResult;
      try {
        importResult = await importThreadContinuity({
          fileName: asset.name,
          text,
          space,
          threadId,
        });
      } catch (error) {
        if (
          space !== 'personal'
          || !(error instanceof Error)
          || error.message !== PERSONAL_EXTERNAL_IMPORT_REQUIRES_CONSENT
          || !(await requestPersonalExternalImportConsent())
        ) {
          throw error;
        }
        importResult = await importThreadContinuity({
          allowRemoteModelForPersonal: true,
          fileName: asset.name,
          text,
          space,
          threadId,
        });
      }
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

  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const slideAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const drawerAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [promptEditorVisible, setPromptEditorVisible] = useState(false);
  const [usageModalVisible, setUsageModalVisible] = useState(false);
  const [advancedPromptVisible, setAdvancedPromptVisible] = useState(false);
  const [advancedUsageVisible, setAdvancedUsageVisible] = useState(false);

  function startDrawerAnimation(animation: Animated.CompositeAnimation, onFinished?: () => void) {
    drawerAnimationRef.current?.stop();
    drawerAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      drawerAnimationRef.current = null;
      onFinished?.();
    });
  }

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    startDrawerAnimation(Animated.parallel([
      Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(scrimOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]), () => {
      setMounted(false);
      onBack();
    });
  }, [onBack, slideAnim, scrimOpacity]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      startDrawerAnimation(Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 28, stiffness: 260, mass: 0.9, useNativeDriver: true }),
        Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]));
    } else {
      if (mounted) {
        handleClose();
      }
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) && gs.dx > 0,
      onPanResponderMove: (_evt, gs) => {
        const clampedDx = Math.max(0, gs.dx);
        slideAnim.setValue(clampedDx);
        const progress = 1 - clampedDx / DRAWER_WIDTH;
        scrimOpacity.setValue(Math.max(0, progress));
      },
      onPanResponderRelease: (_evt, gs) => {
        if (gs.dx > SWIPE_CLOSE_THRESHOLD || gs.vx > 0.5) {
          startDrawerAnimation(Animated.parallel([
            Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
            Animated.timing(scrimOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
          ]), () => {
            setMounted(false);
            onBack();
          });
        } else {
          Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }),
            Animated.timing(scrimOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(slideAnim, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }).start();
        Animated.timing(scrimOpacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();
      },
    })
  ).current;

  if (!mounted && !visible) {
    return null;
  }

  return (
    <>
      <View pointerEvents="box-none" style={styles.drawerOverlay}>
        <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.drawerScrimBase, { opacity: scrimOpacity }]} />
        <Pressable accessibilityLabel="关闭设置" accessibilityRole="button" onPress={handleClose} style={styles.drawerScrimTouchable} />
        
        <Animated.View
          style={[
            styles.drawerContainer,
            {
              paddingBottom: Math.max(insets.bottom, spacing[5]),
              paddingTop: Math.max(insets.top, spacing[2]),
              transform: [{ translateX: slideAnim }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Sticky Header: title + usage only, no background */}
          <View style={styles.drawerStickyHeader}>
            <Pressable onPress={() => setRenameDialogVisible(true)} style={styles.drawerThreadTitleRow}>
              <Text style={styles.drawerThreadTitleText} numberOfLines={1}>{threadTitle}</Text>
              <Ionicons name="create-outline" size={16} color={aiLightColors.muted} />
            </Pressable>
            <Pressable style={styles.drawerUsageBtn} onPress={() => setUsageModalVisible(true)}>
              <Ionicons name="bar-chart-outline" size={12} color={aiLightColors.muted} />
              <Text style={styles.drawerUsageBtnText}>用量统计</Text>
            </Pressable>
          </View>

          {/* Scrollable Content */}
          <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
            {/* Quick Actions — not sticky */}
            <View style={styles.drawerQuickActions}>
              <DrawerActionItem icon="search-outline" label="搜索" onPress={onOpenChatSearch} disabled={!threadId || !onOpenChatSearch} />
              <DrawerActionItem icon="library-outline" label="资料库" onPress={onOpenThreadMaterials} disabled={!threadId || !onOpenThreadMaterials} />
              <DrawerActionItem icon="git-branch-outline" label="路线树" onPress={onOpenBranchTree} disabled={!threadId || !onOpenBranchTree} />
            </View>
            {/* Engine */}
            <View style={styles.drawerGroup}>
              <Text style={styles.drawerGroupTitle}>核心引擎 Engine</Text>
              <View style={styles.drawerCardGroup}>
                <DrawerListRow
                  icon="hardware-chip-outline"
                  title={(() => {
                    const label = sessionModelConfig?.currentLabel ?? '加载中';
                    // Strip "跟随全局默认（当前：xxx）" to show only model name
                    const match = label.match(/（当前：(.+?)）/);
                    return match ? match[1] : label;
                  })()}
                  value="切换"
                  hasChevron
                  onPress={() => setModelPickerVisible(true)}
                />
                <View style={[styles.drawerListRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                  <Text style={styles.drawerListTitleSmall}>引用资料范围</Text>
                  <View style={styles.drawerChipsRow}>
                    {BOUNDARY_MODES.map((mode) => (
                      <AiLightChip key={mode.value} label={mode.label} active={boundaryMode === mode.value} onPress={() => setBoundaryMode(mode.value)} dense />
                    ))}
                  </View>
                </View>
                <DrawerListRow icon="flash-outline" title="显示大模型思考过程" isLast action={<AiSwitch value={!thinkingDisabled} onValueChange={(val) => setThinkingDisabled(!val)} />} onPress={() => setThinkingDisabled(!thinkingDisabled)} />
              </View>
            </View>

            {/* Role */}
            <View style={styles.drawerGroup}>
              <Text style={styles.drawerGroupTitle}>角色与展现 Role & Presentation</Text>
              <View style={styles.drawerCardGroup}>
                <DrawerListRow icon="person-circle-outline" title={roleCardSummary} value="更换" hasChevron onPress={onOpenRoleLibrary} />
                <DrawerListRow icon="image-outline" title="角色头像" action={avatarUri ? <SecureImage uri={avatarUri} space={space} style={styles.drawerAvatarPreview} /> : null} hasChevron chevronIcon={avatarPickerExpanded ? 'chevron-up' : 'chevron-down'} onPress={() => setAvatarPickerExpanded(!avatarPickerExpanded)} />
                  {avatarPickerExpanded && (
                    <View style={styles.drawerAvatarPickerWrap}>
                      <AiAvatarPicker avatarUri={avatarUri} onAvatarChange={(uri) => { setAvatarUri(uri); if (uri) { setAvatarEnabled(true); setUserAvatarEnabled(true); } }} space={space} />
                    </View>
                  )}
                <DrawerListRow icon="person-outline" title="显示头像" subtitle="统一控制双方头像显示" action={<AiSwitch value={avatarEnabled} onValueChange={(val) => { setAvatarEnabled(val); setUserAvatarEnabled(val); }} />} onPress={() => { setAvatarEnabled(!avatarEnabled); setUserAvatarEnabled(!avatarEnabled); }} />
                <DrawerListRow 
                  icon="code-working-outline" 
                  iconColor={aiLightColors.muted} 
                  title="高级: 角色指令与权重" 
                  hasChevron 
                  chevronIcon={advancedPromptVisible ? "chevron-up-outline" : "chevron-down-outline"} 
                  onPress={() => setAdvancedPromptVisible(!advancedPromptVisible)} 
                  isLast={!advancedPromptVisible}
                />
                {advancedPromptVisible && (
                  <View style={styles.drawerAccordionContent}>
                  <View style={[styles.drawerListRow, { backgroundColor: aiLightColors.surface, borderBottomWidth: 0 }]}>
                      <Text style={styles.drawerListTitleSmall}>权重等级</Text>
                      <View style={[styles.drawerChipsRow, { marginTop: 0, marginLeft: 8 }]}>
                        {ROLE_INSTRUCTION_WEIGHTS.map((item) => (
                          <AiLightChip key={item.value} label={item.label} active={roleInstructionWeight === item.value} onPress={() => setRoleInstructionWeight(item.value)} dense />
                        ))}
                      </View>
                    </View>
                    <View style={styles.drawerSystemPromptContainer}>
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={true}
                        style={styles.drawerSystemPromptScroll}
                        scrollEnabled={!!systemPrompt}
                      >
                        <Pressable onPress={() => setPromptEditorVisible(true)} accessibilityRole="button" accessibilityLabel="编辑角色指令">
                          <Text style={styles.drawerSystemPromptText}>
                            {systemPrompt ? systemPrompt : (
                              <Text style={styles.drawerSystemPromptPlaceholder}>
                                {contextType === 'normal' ? '普通聊天默认不配置角色指令，可按需填写。' : '输入角色指令'}
                              </Text>
                            )}
                          </Text>
                        </Pressable>
                      </ScrollView>
                      {systemPrompt && systemPrompt.split('\n').length > 4 && (
                        <Pressable
                          style={({ pressed }) => [styles.drawerExpandBtn, pressed && styles.drawerPressed]}
                          onPress={() => setPromptEditorVisible(true)}
                        >
                          <Ionicons name="expand-outline" size={14} color={aiLightColors.muted} />
                          <Text style={styles.drawerExpandText}>点击编辑</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* World */}
            <View style={styles.drawerGroup}>
              <Text style={styles.drawerGroupTitle}>记忆与衍生世界 World</Text>
              <View style={styles.drawerCardGroup}>
                <DrawerListRow icon="albums-outline" title="深度记忆引擎" action={<AiSwitch value={deepMemoryEnabled} onValueChange={setDeepMemoryEnabled} />} onPress={() => setDeepMemoryEnabled(!deepMemoryEnabled)} />
                <DrawerListRow icon="albums-outline" iconColor="transparent" title="管理记忆黑板" hasChevron onPress={onOpenMemoryBoard} disabled={!threadId || !onOpenMemoryBoard} />
                <DrawerListRow icon="heart-outline" title="时间与情感感知" action={<AiSwitch value={companionAwarenessEnabled} onValueChange={updateCompanionAwareness} />} onPress={() => updateCompanionAwareness(!companionAwarenessEnabled)} />
                <DrawerListRow icon="heart-outline" iconColor="transparent" title="管理情感与时间" hasChevron onPress={onOpenCompanionRuntime} disabled={!threadId || !onOpenCompanionRuntime} />
                <DrawerListRow icon="book-outline" title="角色日记" action={<AiSwitch value={roleDiaryEnabled} onValueChange={updateRoleDiaryEnabled} />} onPress={() => updateRoleDiaryEnabled(!roleDiaryEnabled)} />
                <DrawerListRow icon="book-outline" iconColor="transparent" title="内心独白 (日记与梦境)" hasChevron onPress={onOpenInnerLife} disabled={!threadId || !currentRoleCardId || !onOpenInnerLife} />
                
                <AiContextSlider value={contextHistoryRoundLimit} onCommit={setContextHistoryRoundLimit} label="上下文轮数" />
              </View>
            </View>

            {/* Migration */}
            <View style={styles.drawerGroup}>
              <View style={styles.drawerCardGroup}>
                <DrawerListRow 
                  title="数据与迁移 Migration" 
                  hasChevron 
                  chevronIcon={advancedUsageVisible ? "chevron-up-outline" : "chevron-down-outline"} 
                  onPress={() => setAdvancedUsageVisible(!advancedUsageVisible)} 
                  isLast={!advancedUsageVisible}
                />
                {advancedUsageVisible && (
                  <View style={styles.drawerAccordionContent}>
                    <DrawerListRow icon="push-outline" iconColor={aiLightColors.muted} title={exportingRolePackage ? '导出中...' : '导出当前角色包'} onPress={confirmExportCurrentRolePackage} disabled={!threadId || !currentRoleCardId || exportingRolePackage} style={{ backgroundColor: aiLightColors.surface }} />
                    <DrawerListRow icon="download-outline" iconColor={aiLightColors.muted} title={importingContinuity ? '导入中...' : '导入外部记忆'} onPress={() => void pickAndImportContinuity()} disabled={!threadId || importingContinuity} style={{ backgroundColor: aiLightColors.surface }} />
                    <DrawerListRow icon="copy-outline" iconColor={aiLightColors.muted} title="复制迁移提示词" onPress={() => void copyExternalContinuityPrompt()} isLast style={{ backgroundColor: aiLightColors.surface }} />
                  </View>
                )}
              </View>
            </View>

            <Pressable style={styles.drawerDangerBtn} onPress={() => setDeleteDialogVisible(true)}>
              <Ionicons name="trash-outline" size={18} color={'#FF3B30'} />
              <Text style={styles.drawerDangerBtnText}>移入回收站</Text>
            </Pressable>
            
            {status ? <View style={{marginTop: 16}}><AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /></View> : null}
            
          </ScrollView>
        </Animated.View>
      </View>

      <AppDialog
        accent="ai"
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
        accent="ai"
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

      <AppDialog
        accent="ai"
        onClose={() => setUsageModalVisible(false)}
        onPrimary={() => setUsageModalVisible(false)}
        primaryLabel="关闭"
        title="本会话用量统计"
        visible={usageModalVisible}
      >
        <AiUsageSummary showRecent={false} usage={threadUsage ?? EMPTY_THREAD_USAGE} />
      </AppDialog>

      <FullscreenPromptEditorModal visible={promptEditorVisible} content={systemPrompt} onClose={(text) => { setPromptEditorVisible(false); if (text !== undefined) setSystemPrompt(text); }} />

      <AppDialog
        accent="ai"
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
        accent="ai"
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
        accent="ai"
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


function DrawerActionItem({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.drawerActionItem, disabled && styles.drawerDisabled, pressed && styles.drawerPressed]}>
      <View style={styles.drawerActionIconWrap}>
        <Ionicons name={icon} size={20} color={aiLightColors.ink} />
      </View>
      <Text style={styles.drawerActionLabel}>{label}</Text>
    </Pressable>
  );
}

function DrawerListRow({ icon, iconColor = aiLightColors.primary, title, subtitle, value, hasChevron, chevronIcon = "chevron-forward-outline", onPress, disabled, isLast, action, style }: any) {
  const content = (
    <>
      {icon && <Ionicons name={icon} size={20} color={iconColor} style={[styles.drawerListIcon, iconColor === 'transparent' && { opacity: 0 }]} />}
      <View style={styles.drawerListContent}>
        <Text style={styles.drawerListTitle}>{title}</Text>
        {subtitle && <Text style={styles.drawerListSubtitle}>{subtitle}</Text>}
      </View>
      {value && <Text style={styles.drawerListValue}>{value}</Text>}
      {action && <View style={styles.drawerListAction}>{action}</View>}
      {hasChevron && <Ionicons name={chevronIcon} size={16} color={aiLightColors.muted} style={styles.drawerListChevron} />}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.drawerListRow, !isLast && styles.drawerListRowBorder, disabled && styles.drawerDisabled, pressed && styles.drawerPressed, style]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.drawerListRow, !isLast && styles.drawerListRowBorder, style]}>
      {content}
    </View>
  );
}

function FullscreenPromptEditorModal({
  content,
  onClose,
  visible,
}: {
  content: string | null;
  onClose: (editedContent?: string) => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [editText, setEditText] = useState(content ?? '');

  useEffect(() => {
    if (visible) {
      setEditText(content ?? '');
    }
  }, [visible, content]);

  const handleBack = () => {
    if (editText !== (content ?? '')) {
      Alert.alert('放弃修改', '您有未保存的修改，确定要放弃吗？', [
        { text: '取消', style: 'cancel' },
        { text: '确定', style: 'destructive', onPress: () => onClose() },
      ]);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    onClose(editText);
  };

  return (
    <Modal animationType="slide" onRequestClose={handleBack} presentationStyle="fullScreen" visible={visible}>
      <View style={[styles.drawerFsScreen, { paddingTop: insets.top }]}>
        <View style={styles.drawerFsHeader}>
          <Pressable accessibilityRole="button" hitSlop={spacing[2]} onPress={handleBack} style={({ pressed }) => [styles.drawerFsHeaderButton, pressed && styles.drawerPressed]}>
            <Ionicons color={aiLightColors.ink} name="chevron-back" size={24} />
          </Pressable>
          <Text style={styles.drawerFsTitle}>角色指令</Text>
          <Pressable accessibilityRole="button" hitSlop={spacing[1]} onPress={handleSave} style={({ pressed }) => [styles.drawerFsHeaderButton, pressed && styles.drawerPressed]}>
            <Ionicons color={aiLightColors.primaryActive} name="checkmark-outline" size={24} />
          </Pressable>
        </View>
        <KeyboardAwareScrollView bottomOffset={spacing[4]} contentContainerStyle={styles.drawerFsKeyboardAvoiding} keyboardShouldPersistTaps="handled" style={styles.drawerFsKeyboardAvoiding}>
          <TextInput
            multiline
            onChangeText={setEditText}
            scrollEnabled={false}
            style={styles.drawerFsEditInput}
            textAlignVertical="top"
            value={editText}
            autoFocus
          />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 20,
  },
  drawerScrimBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  drawerScrimTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  drawerStickyHeader: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopLeftRadius: 20,
    gap: 12,
  },
  drawerHeader: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: aiLightColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
    borderTopLeftRadius: 20,
  },
  drawerHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerUsageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: aiLightColors.canvas,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  drawerUsageBtnText: {
    fontSize: 12,
    color: aiLightColors.muted,
  },
  drawerThreadTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerThreadTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: aiLightColors.ink,
    flexShrink: 1,
  },
  drawerQuickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
  },
  drawerActionItem: {
    alignItems: 'center',
    gap: 6,
  },
  drawerActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: aiLightColors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerActionLabel: {
    fontSize: 11,
    color: aiLightColors.muted,
  },
  drawerContent: {
    padding: spacing[4],
    paddingBottom: 40,
    gap: spacing[4],
  },
  drawerGroup: {
    gap: spacing[2],
  },
  closeButtonShell: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[3],
    minHeight: spacing[10],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    ...shadows.sm,
  },
  closeButtonText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  closeButtonArrows: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stackedArrow: {
    marginRight: -10,
  },
  drawerGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: aiLightColors.muted,
    paddingLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  drawerCardGroup: {
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  drawerListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 54,
    backgroundColor: aiLightColors.surface,
  },
  drawerListRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
  },
  drawerListIcon: {
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  drawerListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  drawerListTitle: {
    fontSize: 15,
    color: aiLightColors.ink,
    fontWeight: '500',
  },
  drawerListTitleSmall: {
    fontSize: 13,
    color: aiLightColors.muted,
  },
  drawerListSubtitle: {
    fontSize: 12,
    color: aiLightColors.muted,
    marginTop: 2,
  },
  drawerListValue: {
    fontSize: 15,
    color: aiLightColors.muted,
    marginRight: 4,
  },
  drawerListChevron: {
    marginLeft: 4,
  },
  drawerListAction: {
    marginLeft: 8,
  },
  drawerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  drawerAvatarPickerWrap: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  drawerAvatarPreview: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  drawerAccordionContent: {
    backgroundColor: aiLightColors.canvas,
  },
  drawerSystemPromptContainer: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[4],
    marginTop: spacing[2],
    padding: spacing[3],
    backgroundColor: '#F9F9F9',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  drawerSystemPromptScroll: {
    maxHeight: 216,
  },
  drawerSystemPromptText: {
    fontSize: 14,
    lineHeight: 24,
    color: aiLightColors.ink,
    textAlignVertical: 'top',
  },
  drawerSystemPromptPlaceholder: {
    fontSize: 14,
    lineHeight: 24,
    color: aiLightColors.muted,
  },
  drawerExpandBtn: {
    alignSelf: 'center',
    marginTop: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: aiLightColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  drawerExpandText: {
    fontSize: 12,
    color: aiLightColors.muted,
    fontWeight: '500',
  },
  drawerListBlock: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
  },
  drawerDangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.md,
    marginTop: 8,
  },
  drawerDangerBtnText: {
    color: '#FF3B30',
    fontWeight: '600',
    fontSize: 16,
  },
  drawerDisabled: {
    opacity: 0.5,
  },
  drawerPressed: {
    opacity: 0.7,
  },
  drawerFsScreen: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
  },
  drawerFsHeader: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: spacing[12],
    paddingHorizontal: 16,
  },
  drawerFsHeaderButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  drawerFsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: aiLightColors.ink,
    flex: 1,
    textAlign: 'center',
  },
  drawerFsKeyboardAvoiding: {
    flexGrow: 1,
  },
  drawerFsEditInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: aiLightColors.ink,
  },

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
  contextRoundHint: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  inlineConfigPadding: {
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
});
