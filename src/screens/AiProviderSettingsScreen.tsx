import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, ScrollView, SafeAreaView } from 'react-native';

import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { loadAiUsageOverview } from '../ai/aiChatService';
import {
  deleteProviderModel,
  deleteProviderModels,
  deleteProviderModelsByProvider,
  getDefaultChatProviderId,
  getSavedProviderApiKey,
  listProviderCards,
  saveManualChatModel,
  saveManualEmbeddingModel,
  saveProviderApiKeyForSpace,
  saveProviderBaseUrl,
  saveProviderEmbeddingBaseUrl,
  saveProviderDefaultModels,
  selectProvider,
  syncProviderModels,
  verifyCurrentProviderModel,
} from '../ai/aiProviderService';
import { parseProviderConnectionImport } from '../ai/aiProviderConnectionImport';
import { builtInModelsForProvider } from '../ai/providerRegistry';
import {
  resolveMemoryMaintenanceModel,
  testMemoryMaintenanceModel,
  type ResolvedMemoryMaintenanceModel,
} from '../ai/aiMemoryMaintenanceModelService';
import { getUserProfile, updateUserProfile } from '../ai/aiMemoryProfileService';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { AiUsageAggregate } from '../ai/aiUsageAnalytics';
import type { AiProviderModelRecord } from '../ai/types';
import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import type { MemoryMaintenanceMode } from '../database/repositories/settingsRepository';

interface AiProviderSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

type ProviderCard = Awaited<ReturnType<typeof listProviderCards>>[number];
const MEMORY_MAINTENANCE_MODES: Array<{ value: MemoryMaintenanceMode; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'follow_chat', label: '跟随聊天模型' },
  { value: 'deepseek_flash', label: 'DeepSeek V4 Flash' },
  { value: 'custom', label: '自定义' },
];

const EMPTY_USAGE_OVERVIEW: AiUsageAggregate = {
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

function isOtherProvider(card: ProviderCard): boolean {
  return card.provider.providerType === 'openai_compatible' || card.provider.providerType === 'custom';
}

function isProtectedProviderModel(card: ProviderCard, modelId: string): boolean {
  const builtInModelIds = new Set(builtInModelsForProvider(card.provider.id, card.provider.providerType).map((model) => model.modelId));
  return builtInModelIds.has(modelId);
}

function providerModelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function formatMaintenanceTestTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isMaintenanceTestPassed(status: string | null | undefined): boolean {
  return status === 'ready' || status === 'follow_chat';
}

function maintenanceBannerTone(status: ResolvedMemoryMaintenanceModel | null): FeedbackTone {
  if (isMaintenanceTestPassed(status?.lastTestStatus)) {
    return 'success';
  }
  if (status?.lastTestStatus === 'error') {
    return 'error';
  }
  if (status?.status === 'local_fallback' || status?.status === 'error') {
    return 'warning';
  }
  return 'info';
}

function maintenanceBannerTitle(status: ResolvedMemoryMaintenanceModel | null): string {
  if (isMaintenanceTestPassed(status?.lastTestStatus)) {
    return '链路测试通过';
  }
  if (status?.lastTestStatus === 'error') {
    return '链路测试失败';
  }
  if (status?.status === 'local_fallback') {
    return '未启用远程维护';
  }
  return '已保存，待测试';
}

export function AiProviderSettingsScreen({ space, onBack }: AiProviderSettingsScreenProps) {
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerSheetVisible, setProviderSheetVisible] = useState(false);
  const [modelSheetVisible, setModelSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiDraft, setApiDraft] = useState('');
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [baseUrlHint, setBaseUrlHint] = useState<string | null>(null);
  const [connectionImportDraft, setConnectionImportDraft] = useState('');
  const [embeddingBaseUrlDraft, setEmbeddingBaseUrlDraft] = useState('');
  const [manualModelDraft, setManualModelDraft] = useState('');
  const [manualEmbeddingModelDraft, setManualEmbeddingModelDraft] = useState('');
  const [memoryMaintenanceMode, setMemoryMaintenanceMode] = useState<MemoryMaintenanceMode>('auto');
  const [memoryMaintenanceProviderId, setMemoryMaintenanceProviderId] = useState<string | null>(null);
  const [memoryMaintenanceModelDraft, setMemoryMaintenanceModelDraft] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState<ResolvedMemoryMaintenanceModel | null>(null);
  const [maintenanceInfoExpanded, setMaintenanceInfoExpanded] = useState(false);
  const [globalProfileDraft, setGlobalProfileDraft] = useState('');
  const [globalProfileText, setGlobalProfileText] = useState('');
  const [visibleKey, setVisibleKey] = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);
  const [usageOverview, setUsageOverview] = useState<AiUsageAggregate | null>(null);

  const orderedCards = useMemo(() => [...cards.filter((card) => !isOtherProvider(card)), ...cards.filter(isOtherProvider)], [cards]);
  const selectedCard = orderedCards.find((card) => card.provider.id === selectedProviderId) ?? orderedCards[0] ?? null;
  const selectedIsOtherProvider = selectedCard ? isOtherProvider(selectedCard) : false;
  const selectedSupportsManualChatModel = selectedCard?.provider.protocol === 'openai_compatible';
  const selectedSupportsManualEmbedding = selectedCard?.provider.protocol === 'openai_compatible';
  const chatModels = selectedCard?.models.filter((model) => model.supportsChat) ?? [];
  const embeddingModels = selectedCard?.models.filter((model) => model.supportsEmbedding) ?? [];
  const selectedModel = chatModels.find((model) => model.modelId === selectedCard?.provider.defaultChatModelId) ?? null;
  const selectedEmbeddingModel = embeddingModels.find((model) => model.modelId === selectedCard?.provider.defaultEmbeddingModelId) ?? null;
  const selectedModelProviderId = selectedModelKeys[0]?.split(':')[0] ?? selectedCard?.provider.id ?? null;
  const providerSelectionMode = selectedModelKeys.length > 0;
  const maintenanceTone = maintenanceBannerTone(maintenanceStatus);
  const maintenanceTestTime = formatMaintenanceTestTime(maintenanceStatus?.lastTestAt);
  const maintenanceStatusMessage = maintenanceStatus?.lastTestMessage || maintenanceStatus?.statusText || '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型';

  const loadGlobalProfile = useCallback(async () => {
    const globalProfile = await getUserProfile(space, null, null);
    setGlobalProfileDraft(globalProfile?.profileText ?? '');
    setGlobalProfileText(globalProfile?.profileText ?? '');
  }, [space]);

  const loadMaintenanceSettings = useCallback(async () => {
    const [settings, resolved] = await Promise.all([
      runWithDatabaseSpace(space, (db) => settingsRepository.getMemoryMaintenanceSettings(db)),
      resolveMemoryMaintenanceModel(space),
    ]);
    setMemoryMaintenanceMode(settings.memoryMaintenanceMode);
    setMemoryMaintenanceProviderId(settings.memoryMaintenanceProviderId);
    setMemoryMaintenanceModelDraft(settings.memoryMaintenanceModelId ?? '');
    setMaintenanceStatus(resolved);
  }, [space]);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCards, defaultProviderId, usage] = await Promise.all([
        listProviderCards(space),
        getDefaultChatProviderId(space),
        loadAiUsageOverview(space, '30d'),
      ]);
      setCards(nextCards);
      setUsageOverview(usage);
      setSelectedProviderId((current) => {
        if (current && nextCards.some((card) => card.provider.id === current)) {
          return current;
        }
        if (defaultProviderId && nextCards.some((card) => card.provider.id === defaultProviderId)) {
          return defaultProviderId;
        }
        return nextCards[0]?.provider.id ?? null;
      });
      await loadMaintenanceSettings();
    } finally {
      setLoading(false);
    }
  }, [loadMaintenanceSettings, space]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    void loadGlobalProfile();
  }, [loadGlobalProfile]);

  useEffect(() => {
    if (!selectedProviderId) {
      setApiDraft('');
      setBaseUrlDraft('');
      setBaseUrlHint(null);
      setConnectionImportDraft('');
      setEmbeddingBaseUrlDraft('');
      setManualEmbeddingModelDraft('');
      return;
    }
    let active = true;
    const selected = orderedCards.find((card) => card.provider.id === selectedProviderId);
    setBaseUrlDraft(selected?.provider.baseUrl ?? '');
    setBaseUrlHint(null);
    setConnectionImportDraft('');
    setEmbeddingBaseUrlDraft(selected?.provider.embeddingBaseUrl ?? '');
    setManualEmbeddingModelDraft('');
    void getSavedProviderApiKey(selectedProviderId, space).then((apiKey) => {
      if (active) {
        setApiDraft(apiKey ?? '');
      }
    });
    return () => {
      active = false;
    };
  }, [orderedCards, selectedProviderId, space]);

  useEffect(() => {
    setSelectedModelKeys([]);
  }, [selectedProviderId]);

  async function chooseProvider(providerId: string) {
    const nextCard = orderedCards.find((card) => card.provider.id === providerId) ?? null;
    setSelectedProviderId(providerId);
    setProviderSheetVisible(false);
    setModelSheetVisible(false);
    setApiDraft('');
    setBaseUrlDraft(nextCard?.provider.baseUrl ?? '');
    setBaseUrlHint(null);
    setConnectionImportDraft('');
    setEmbeddingBaseUrlDraft(nextCard?.provider.embeddingBaseUrl ?? '');
    setManualModelDraft('');
    setManualEmbeddingModelDraft('');
    setStatus(null);
    await selectProvider(space, providerId);
    await loadProviders();
  }

  async function saveProviderDraft(): Promise<boolean> {
    if (!selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim())) {
      setStatus({ message: selectedIsOtherProvider ? '请填写服务地址和 API key。' : '请填写 API key。', tone: 'warning' });
      return false;
    }
    setStatus({ message: '正在保存模型账号设置...', tone: 'info' });
    try {
      if (selectedIsOtherProvider) {
        let parsedBaseUrl: URL;
        try {
          parsedBaseUrl = new URL(baseUrlDraft.trim());
        } catch {
          setStatus({ message: '服务地址格式不正确，请检查 Base URL。', tone: 'warning' });
          return false;
        }
        if (parsedBaseUrl.search || parsedBaseUrl.hash) {
          setStatus({ message: 'Base URL 不能包含查询参数或片段，请只填写服务地址。', tone: 'warning' });
          return false;
        }
        await saveProviderBaseUrl(space, selectedCard.provider.id, baseUrlDraft);
      }
      await saveProviderEmbeddingBaseUrl(space, selectedCard.provider.id, embeddingBaseUrlDraft);
      const apiKey = apiDraft.trim();
      await selectProvider(space, selectedCard.provider.id);
      await saveProviderApiKeyForSpace(space, selectedCard.provider.id, apiKey);
      await runWithDatabaseSpace(space, (db) =>
        settingsRepository.updateMemoryMaintenanceSettings(db, {
          memoryMaintenanceLastTestAt: null,
          memoryMaintenanceLastTestMessage: null,
          memoryMaintenanceLastTestStatus: null,
        })
      );
      setApiDraft(apiKey);
      setStatus({ message: '模型账号已保存。全局默认模型只影响后续新创建会话。', tone: 'success', title: '保存成功' });
      await loadProviders();
      return true;
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
      return false;
    }
  }

  function importProviderConnection() {
    const result = parseProviderConnectionImport(connectionImportDraft);
    if (!result.ok) {
      setStatus({ message: '未识别到有效的 url 和 key。', tone: 'warning', title: '导入失败' });
      return;
    }
    setBaseUrlDraft(result.baseUrl);
    setApiDraft(result.apiKey);
    setVisibleKey(false);
    setBaseUrlHint(result.hasPath ? null : '该连接未包含 `/v1`，如果测试失败，优先尝试在末尾加 `/v1`。');
    setStatus({ message: '已识别连接信息，请检查后先保存配置，再测试当前模型。', tone: 'success', title: '导入成功' });
  }

  async function selectModel(model: AiProviderModelRecord) {
    setStatus({ message: '正在切换全局默认模型...', tone: 'info' });
    try {
      await saveProviderDefaultModels(space, model.providerId, { defaultChatModelId: model.modelId });
      await runWithDatabaseSpace(space, (db) =>
        settingsRepository.updateMemoryMaintenanceSettings(db, {
          memoryMaintenanceLastTestAt: null,
          memoryMaintenanceLastTestMessage: null,
          memoryMaintenanceLastTestStatus: null,
        })
      );
      setModelSheetVisible(false);
      setStatus({ message: `已选择 ${model.displayName}。`, tone: 'success', title: '模型已更新' });
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '选择失败', tone: 'error' });
    }
  }

  async function selectEmbeddingModel(model: AiProviderModelRecord) {
    setStatus({ message: '正在切换默认 Embedding 模型...', tone: 'info' });
    try {
      await saveProviderDefaultModels(space, model.providerId, { defaultEmbeddingModelId: model.modelId });
      setStatus({ message: `已选择 ${model.displayName} 作为默认 Embedding。`, tone: 'success', title: 'Embedding 已更新' });
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '选择失败', tone: 'error' });
    }
  }

  async function testSelectedProvider() {
    if (!selectedCard) {
      return;
    }
    const saved = await saveProviderDraft();
    if (!saved) {
      return;
    }
    setStatus({ message: '正在验证 API key、模型和服务地址...', tone: 'info', title: '测试当前模型' });
    try {
      await verifyCurrentProviderModel(selectedCard.provider.id, space);
      setStatus({ message: `${selectedCard.provider.displayName} 当前模型可用，可以开始对话。`, tone: 'success', title: '已验证' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '测试失败', tone: 'error', title: '连接失败' });
    } finally {
      await loadProviders();
    }
  }

  async function syncSelectedProviderModels() {
    if (!selectedCard) {
      return;
    }
    const saved = await saveProviderDraft();
    if (!saved) {
      return;
    }
    setStatus({ message: '正在从模型商读取模型列表...', tone: 'info', title: '刷新模型列表' });
    try {
      const result = await syncProviderModels(selectedCard.provider.id, space);
      setStatus(
        result.synced > 0
          ? { message: `已同步 ${result.synced} 个模型。`, tone: 'success', title: '刷新完成' }
          : { message: `${result.message ? `${result.message} ` : ''}已使用 ${result.fallback} 个内置模型，当前模型不会被清空。`, tone: 'warning', title: '使用内置模型' }
      );
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '同步失败', tone: 'error' });
    }
  }

  async function saveManualModel() {
    if (!selectedCard || !manualModelDraft.trim()) {
      return;
    }
    setStatus({ message: '正在保存自定义模型...', tone: 'info' });
    try {
      await saveManualChatModel(space, selectedCard.provider.id, manualModelDraft);
      setManualModelDraft('');
      setStatus({ message: `已保存自定义模型 ${manualModelDraft.trim()}。`, tone: 'success', title: '模型已保存' });
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
    }
  }

  async function saveManualEmbeddingModelDraft() {
    if (!selectedCard || !manualEmbeddingModelDraft.trim()) {
      return;
    }
    setStatus({ message: '正在保存 Embedding 模型...', tone: 'info' });
    try {
      await saveManualEmbeddingModel(space, selectedCard.provider.id, manualEmbeddingModelDraft);
      setManualEmbeddingModelDraft('');
      setStatus({ message: `已保存 Embedding 模型 ${manualEmbeddingModelDraft.trim()}。`, tone: 'success', title: 'Embedding 已保存' });
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
    }
  }

  function toggleSelectedModel(model: AiProviderModelRecord) {
    const key = providerModelKey(model.providerId, model.modelId);
    setSelectedModelKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  function beginModelSelection(model: AiProviderModelRecord) {
    setSelectedModelKeys([providerModelKey(model.providerId, model.modelId)]);
  }

  function confirmDeleteModel(model: AiProviderModelRecord, kind: 'chat' | 'embedding') {
    Alert.alert(
      '删除模型',
      `删除后，这个模型会从全局和会话模型列表中移除。${kind === 'chat' ? '如果它正被设为默认聊天模型，会自动取消默认。' : '如果它正被设为默认 Embedding，会自动取消默认。'}`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setStatus({ message: `正在删除 ${model.displayName}...`, tone: 'info', title: '删除模型' });
              try {
                await deleteProviderModel(space, model.providerId, model.modelId);
                setStatus({ message: `${model.displayName} 已删除。`, tone: 'success', title: '模型已删除' });
                await loadProviders();
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '删除模型失败', tone: 'error', title: '删除失败' });
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteSelectedModels() {
    const models = selectedModelKeys
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
      `将删除已选中的 ${models.length} 个模型，并同步清理会话中的失效绑定。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '批量删除',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setStatus({ message: `正在删除 ${models.length} 个模型...`, tone: 'info', title: '批量删除' });
              try {
                const deletedCount = await deleteProviderModels(space, models);
                setSelectedModelKeys([]);
                setStatus({
                  message: deletedCount > 0 ? `已删除 ${deletedCount} 个模型。` : '没有可删除的模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',
                  title: deletedCount > 0 ? '删除完成' : '未删除模型',
                });
                await loadProviders();
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '批量删除失败', tone: 'error', title: '删除失败' });
              }
            })();
          },
        },
      ]
    );
  }

  function confirmDeleteSameProviderModels() {
    if (!selectedModelProviderId) {
      return;
    }
    Alert.alert(
      '删除同一来源',
      '将删除当前来源下全部可删除模型，内置模型会被保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除同一来源',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setStatus({ message: '正在清理同一来源模型...', tone: 'info', title: '删除同一来源' });
              try {
                const deletedCount = await deleteProviderModelsByProvider(space, selectedModelProviderId);
                setSelectedModelKeys([]);
                setStatus({
                  message: deletedCount > 0 ? `已删除该来源下 ${deletedCount} 个模型。` : '该来源下没有可删除模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',
                  title: deletedCount > 0 ? '清理完成' : '未删除模型',
                });
                await loadProviders();
              } catch (error) {
                setStatus({ message: error instanceof Error ? error.message : '删除同一来源失败', tone: 'error', title: '删除失败' });
              }
            })();
          },
        },
      ]
    );
  }

  async function saveMemoryMaintenancePatch(patch: {
    memoryMaintenanceMode?: MemoryMaintenanceMode;
    memoryMaintenanceProviderId?: string | null;
    memoryMaintenanceModelId?: string | null;
  }) {
    await runWithDatabaseSpace(space, (db) =>
      settingsRepository.updateMemoryMaintenanceSettings(db, {
        ...patch,
        memoryMaintenanceLastTestAt: null,
        memoryMaintenanceLastTestMessage: null,
        memoryMaintenanceLastTestStatus: null,
      })
    );
    await loadMaintenanceSettings();
  }

  async function chooseMemoryMaintenanceMode(mode: MemoryMaintenanceMode) {
    setMemoryMaintenanceMode(mode);
    await saveMemoryMaintenancePatch({
      memoryMaintenanceMode: mode,
      memoryMaintenanceProviderId: mode === 'custom' ? memoryMaintenanceProviderId ?? selectedCard?.provider.id ?? null : memoryMaintenanceProviderId,
      memoryMaintenanceModelId: mode === 'deepseek_flash' ? 'deepseek-v4-flash' : memoryMaintenanceModelDraft.trim() || null,
    });
  }

  async function saveCustomMemoryMaintenanceModel() {
    if (!selectedCard || !memoryMaintenanceModelDraft.trim()) {
      return;
    }
    setMemoryMaintenanceProviderId(selectedCard.provider.id);
    await saveMemoryMaintenancePatch({
      memoryMaintenanceMode: 'custom',
      memoryMaintenanceModelId: memoryMaintenanceModelDraft.trim(),
      memoryMaintenanceProviderId: selectedCard.provider.id,
    });
    setStatus({ message: '记忆维护模型已保存。', tone: 'success', title: '设置已更新' });
  }

  async function handleSaveGlobalProfile() {
    setLoading(true);
    setStatus({ message: '正在保存全局用户画像...', tone: 'info' });
    try {
      const next = await updateUserProfile(space, globalProfileDraft.trim(), null, null);
      setGlobalProfileDraft(next.profileText);
      setGlobalProfileText(next.profileText);
      setStatus({ message: '全局用户画像已保存。', tone: 'success', title: '画像已更新' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存全局用户画像失败', tone: 'error', title: '保存失败' });
    } finally {
      setLoading(false);
    }
  }

  async function testSelectedMemoryMaintenanceModel() {
    setStatus({ message: '正在测试记忆维护模型...', tone: 'info', title: '测试记忆模型' });
    const result = await testMemoryMaintenanceModel(space);
    setMaintenanceStatus(result);
    setStatus({
      message: result.statusText,
      tone: result.status === 'error' ? 'error' : result.status === 'local_fallback' ? 'warning' : 'success',
      title: '记忆模型状态',
    });
  }

  async function focusMaintenanceProviderKey() {
    const providerId = maintenanceStatus?.providerId ?? memoryMaintenanceProviderId;
    if (providerId && providerId !== selectedProviderId) {
      await chooseProvider(providerId);
    }
    setVisibleKey(true);
    setStatus({ message: '请在上方 API 输入框配置当前模型商 Key。API Key 仅保存在本机安全存储中。', tone: 'info' });
  }

  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const saveDisabled = !selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim());

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable style={({pressed}) => [styles.backBtn, pressed && styles.backBtnPressed]} onPress={onBack}>
            <Svg width={20} height={20} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#27272a">
              <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </Svg>
          </Pressable>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>默认模型配置</Text>
            <Text style={styles.headerSubtitle}>{spaceLabel}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>全应用 AI 用量</Text>
            <Text style={styles.sectionSubtitle}>实时统计</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>总量</Text>
                <Text style={styles.metricValue}>{usageOverview ? formatTokenCount(usageOverview.totalTokens) : '0'}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>缓存</Text>
                <Text style={styles.metricValue}>{usageOverview && usageOverview.cacheObservedRequestCount > 0 ? formatTokenCount(usageOverview.cachedInputTokens) : '未观测'}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>命中率</Text>
                <Text style={styles.metricValueSuccess}>{usageOverview ? formatPercent(usageOverview.cachedTokenRatio) : '未观测'}</Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>请求</Text>
                <Text style={styles.metricValue}>{usageOverview?.observedRequestCount ?? 0}</Text>
              </View>
            </View>
            <View style={styles.tokenBarContainer}>
              <View style={styles.tokenBarTrack}>
                <View style={[styles.tokenBarSegment, styles.cachedSegment, { flex: usageOverview?.cachedInputTokens || 0 }]} />
                <View style={[styles.tokenBarSegment, styles.inputSegment, { flex: usageOverview?.nonCachedInputTokens || 0 }]} />
                <View style={[styles.tokenBarSegment, styles.outputSegment, { flex: usageOverview?.completionTokens || 0 }]} />
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.cachedSegment]} />
                  <Text style={styles.legendText}>缓存 <Text style={styles.legendTextBold}>{usageOverview ? formatTokenCount(usageOverview.cachedInputTokens) : '0'}</Text></Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.inputSegment]} />
                  <Text style={styles.legendText}>未缓存 <Text style={styles.legendTextBold}>{usageOverview ? formatTokenCount(usageOverview.nonCachedInputTokens) : '0'}</Text></Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.outputSegment]} />
                  <Text style={styles.legendText}>输出 <Text style={styles.legendTextBold}>{usageOverview ? formatTokenCount(usageOverview.completionTokens) : '0'}</Text></Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>接口与连接配置</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.providerRowContainer}>
              <Pressable style={styles.providerRow} onPress={() => {
                setProviderSheetVisible((c) => !c);
                setModelSheetVisible(false);
              }}>
                <View style={styles.providerRowLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#3f3f46">
                      <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </Svg>
                  </View>
                  <Text style={styles.providerRowText}>选择模型商</Text>
                </View>
                <View style={styles.providerRowRight}>
                  <Text style={styles.providerValue}>{selectedCard?.provider.displayName ?? '未选择'}</Text>
                  <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#a1a1aa">
                    <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </Svg>
                </View>
              </Pressable>
            </View>

            {providerSheetVisible ? (
              <View style={styles.dropdownPanel}>
                {orderedCards.map((card) => {
                  const selected = card.provider.id === selectedCard?.provider.id;
                  return (
                    <Pressable
                      key={card.provider.id}
                      style={({pressed}) => [styles.dropdownItem, pressed && styles.pressed, selected && styles.dropdownItemSelected]}
                      onPress={() => void chooseProvider(card.provider.id)}
                    >
                      <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{card.provider.displayName}</Text>
                      {selected && (
                        <View style={styles.dropdownCheck}>
                          <Svg width={10} height={10} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#ffffff">
                            <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </Svg>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {selectedIsOtherProvider ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>基础地址 (Base URL)</Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setBaseUrlDraft}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor="#a1a1aa"
                  value={baseUrlDraft}
                />
                {baseUrlHint && <Text style={styles.captionXs}>{baseUrlHint}</Text>}
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>API Key</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.monoText]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!visibleKey}
                  onChangeText={setApiDraft}
                  placeholder={selectedCard?.hasApiKey ? '已保存' : '输入 API Key'}
                  placeholderTextColor="#a1a1aa"
                  value={apiDraft}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setVisibleKey(!visibleKey)}>
                  {visibleKey ? (
                    <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#a1a1aa">
                      <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </Svg>
                  ) : (
                    <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#a1a1aa">
                      <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </Svg>
                  )}
                </Pressable>
              </View>
            </View>

            {selectedIsOtherProvider ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>连接信息导入</Text>
                <TextInput
                  style={[styles.input, styles.textareaImport]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  onChangeText={setConnectionImportDraft}
                  placeholder='{"_type":"newapi_channel_conn","key":"sk-...","url":"https://example.com"}'
                  placeholderTextColor="#a1a1aa"
                  value={connectionImportDraft}
                />
                <Pressable
                  disabled={!connectionImportDraft.trim()}
                  style={({pressed}) => [styles.outlineBtn, (!connectionImportDraft.trim()) && styles.disabledBtn, pressed && styles.pressed]}
                  onPress={importProviderConnection}
                >
                  <Text style={styles.outlineBtnText}>导入连接信息</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.actionGroup}>
              <Pressable disabled={saveDisabled} style={({pressed}) => [styles.primaryBtn, saveDisabled && styles.disabledBtn, pressed && styles.pressed]} onPress={() => void saveProviderDraft()}>
                <Svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" color="#d4d4d8">
                  <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </Svg>
                <Text style={styles.primaryBtnText}>保存配置</Text>
              </Pressable>
              <View style={styles.secondaryActions}>
                <Pressable style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]} onPress={() => void syncSelectedProviderModels()}>
                  <Svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" color="#a1a1aa">
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </Svg>
                  <Text style={styles.secondaryBtnText}>刷新模型列表</Text>
                </Pressable>
                <Pressable disabled={saveDisabled} style={({pressed}) => [styles.secondaryBtn, saveDisabled && styles.disabledBtn, pressed && styles.pressed]} onPress={() => void testSelectedProvider()}>
                  <Svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" color="#a1a1aa">
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </Svg>
                  <Text style={styles.secondaryBtnText}>测试当前模型</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {status ? (
          <View style={styles.statusBannerWrapper}>
            <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} />
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>全局对话与向量模型</Text>
          </View>
          <View style={styles.card}>
            {selectedCard?.provider.lastVerifyStatus ? (
              <View style={styles.verifyStatusRow}>
                <View style={[styles.verifyStatusIcon, selectedCard.provider.lastVerifyStatus === 'ready' ? styles.verifyIconSuccess : selectedCard.provider.lastVerifyStatus === 'failed' ? styles.verifyIconError : styles.verifyIconWarning]}>
                  <Svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    {selectedCard.provider.lastVerifyStatus === 'ready' ? (
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    ) : selectedCard.provider.lastVerifyStatus === 'failed' ? (
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <Path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    )}
                  </Svg>
                </View>
                <View style={styles.verifyStatusTextCol}>
                  <Text style={styles.verifyStatusTitle}>{selectedCard.provider.lastVerifyStatus === 'ready' ? '接口已验证' : selectedCard.provider.lastVerifyStatus === 'changed' ? '配置已变更' : selectedCard.provider.lastVerifyStatus === 'failed' ? '接口测试失败' : '接口未验证'}</Text>
                  <Text style={[styles.verifyStatusSubtitle, selectedCard.provider.lastVerifyStatus === 'ready' ? styles.textSuccess : selectedCard.provider.lastVerifyStatus === 'failed' ? styles.textError : styles.textWarning]}>{selectedCard.provider.lastVerifyMessage || '新创建会话将默认继承这些配置'}</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.modelSelectRow, !selectedCard?.provider.lastVerifyStatus && { borderTopWidth: 0 }]}>
              <View style={styles.modelSelectLeft}>
                <View style={styles.iconBoxSecondary}>
                  <Svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <Path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </Svg>
                </View>
                <Text style={styles.providerRowText}>全局对话模型</Text>
              </View>
              <Pressable
                disabled={chatModels.length === 0}
                style={styles.providerRowRight}
                onPress={() => {
                  setModelSheetVisible((c) => !c);
                  setProviderSheetVisible(false);
                }}
              >
                <Text style={styles.modelValueMono}>{selectedModel?.displayName ?? (chatModels.length > 0 ? '未选择' : '暂无可用模型')}</Text>
                <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#a1a1aa">
                  <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </Svg>
              </Pressable>
            </View>

            {modelSheetVisible ? (
              <View style={styles.dropdownPanelOutline}>
                {providerSelectionMode ? (
                  <View style={styles.batchActionRow}>
                    <Text style={styles.captionXs}>已选 {selectedModelKeys.length} 项</Text>
                    <View style={styles.batchActionButtons}>
                      <Pressable style={({pressed}) => [styles.batchActionButton, pressed && styles.pressed]} onPress={confirmDeleteSelectedModels}>
                        <Text style={styles.dropdownDeleteText}>批量删除</Text>
                      </Pressable>
                      <Pressable style={({pressed}) => [styles.batchActionButton, pressed && styles.pressed]} onPress={confirmDeleteSameProviderModels}>
                        <Text style={styles.dropdownDeleteText}>删除同一来源</Text>
                      </Pressable>
                      <Pressable style={({pressed}) => [styles.batchActionButton, pressed && styles.pressed]} onPress={() => setSelectedModelKeys([])}>
                        <Text style={styles.captionXs}>取消</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {chatModels.map((model) => {
                  const selected = model.modelId === selectedCard?.provider.defaultChatModelId;
                  const modelKey = providerModelKey(model.providerId, model.modelId);
                  const selectedForDelete = selectedModelKeys.includes(modelKey);
                  return (
                    <Pressable
                      key={model.id}
                      style={({pressed}) => [styles.dropdownItem, pressed && styles.pressed, (selected || selectedForDelete) && styles.dropdownItemSelected]}
                      onLongPress={() => beginModelSelection(model)}
                      onPress={() => {
                        if (providerSelectionMode) {
                          toggleSelectedModel(model);
                          return;
                        }
                        void selectModel(model);
                      }}
                    >
                      <Text numberOfLines={1} style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{model.displayName}</Text>
                      {selectedForDelete ? (
                        <Ionicons color="#2563eb" name="checkmark-done-circle" size={18} />
                      ) : selected ? (
                        <Ionicons color="#2563eb" name="checkmark-circle" size={18} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {(embeddingModels.length > 0 || selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding) && (
              <>
                <Pressable style={styles.advancedToggle} onPress={() => setAdvancedVisible((c) => !c)}>
                  <View style={styles.advancedToggleLeft}>
                    <View style={styles.iconBoxSecondary}>
                      <Svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <Path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </Svg>
                    </View>
                    <View style={styles.advancedToggleTextCol}>
                      <Text style={styles.advancedToggleTitle}>高级设置</Text>
                      <Text style={styles.advancedToggleSubtitle}>向量模型 (Embedding) 与手动配置</Text>
                    </View>
                  </View>
                  <View style={styles.advancedToggleRight}>
                    <Text style={styles.advancedToggleStatus}>{advancedVisible ? '收起' : '展开'}</Text>
                    <Svg width={16} height={16} fill="none" stroke="currentColor" viewBox="0 0 24 24" color="#a1a1aa">
                      <Path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={advancedVisible ? "M5 15l7-7 7 7" : "M9 5l7 7-7 7"} />
                    </Svg>
                  </View>
                </Pressable>

                {advancedVisible && (
                  <View style={styles.advancedPanel}>
                    {embeddingModels.length > 0 && (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>默认 Embedding</Text>
                        <View style={styles.dropdownPanelOutline}>
                          {embeddingModels.map((model) => {
                            const selected = model.modelId === selectedCard?.provider.defaultEmbeddingModelId;
                            return (
                              <Pressable
                                key={model.id}
                                style={({pressed}) => [styles.dropdownItem, pressed && styles.pressed, selected && styles.dropdownItemSelected]}
                                onPress={() => void selectEmbeddingModel(model)}
                              >
                                <Text numberOfLines={1} style={[styles.dropdownItemText, selected && styles.dropdownItemTextSelected]}>{model.displayName}</Text>
                                {selected && <Ionicons color="#2563eb" name="checkmark-circle" size={18} />}
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {(selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding) && (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Embedding 接口</Text>
                        <TextInput
                          style={[styles.input, styles.monoText]}
                          autoCapitalize="none"
                          autoCorrect={false}
                          onChangeText={setEmbeddingBaseUrlDraft}
                          placeholder="默认复用上方服务地址"
                          placeholderTextColor="#a1a1aa"
                          value={embeddingBaseUrlDraft}
                        />
                      </View>
                    )}

                    {selectedSupportsManualChatModel && (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>手动添加对话模型</Text>
                        <View style={styles.inputRow}>
                          <TextInput
                            style={[styles.input, styles.monoText]}
                            autoCapitalize="none"
                            autoCorrect={false}
                            onChangeText={setManualModelDraft}
                            placeholder="gpt-4o-mini"
                            placeholderTextColor="#a1a1aa"
                            value={manualModelDraft}
                          />
                          <Pressable style={({pressed}) => [styles.miniSaveBtn, pressed && styles.pressed, !manualModelDraft.trim() && styles.disabledBtn]} disabled={!manualModelDraft.trim()} onPress={() => void saveManualModel()}>
                            <Text style={styles.miniSaveBtnText}>保存</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.captionXs}>中转站无法读取模型列表时手动配置。</Text>
                      </View>
                    )}

                    {selectedSupportsManualEmbedding && (
                      <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>自定义 Embedding 模型</Text>
                        <View style={styles.inputRow}>
                          <TextInput
                            style={[styles.input, styles.monoText]}
                            autoCapitalize="none"
                            autoCorrect={false}
                            onChangeText={setManualEmbeddingModelDraft}
                            placeholder="text-embedding-3-small"
                            placeholderTextColor="#a1a1aa"
                            value={manualEmbeddingModelDraft}
                          />
                          <Pressable style={({pressed}) => [styles.miniSaveBtn, pressed && styles.pressed, !manualEmbeddingModelDraft.trim() && styles.disabledBtn]} disabled={!manualEmbeddingModelDraft.trim()} onPress={() => void saveManualEmbeddingModelDraft()}>
                            <Text style={styles.miniSaveBtnText}>保存</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>后台智能与记忆模型</Text>
          </View>
          
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>全局用户画像</Text>
              <Text style={styles.cardSubtitle}>跨会话生效，只适合放稳定、明确、全局都适用的用户偏好。</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textareaProfile]}
              multiline
              onChangeText={setGlobalProfileDraft}
              placeholder="例如：我希望默认回答简洁直接；我更喜欢中文交流。"
              placeholderTextColor="#a1a1aa"
              textAlignVertical="top"
              value={globalProfileDraft}
            />
            <Pressable disabled={loading || globalProfileDraft === globalProfileText} style={({pressed}) => [styles.ghostBtn, (loading || globalProfileDraft === globalProfileText) && styles.disabledBtn, pressed && styles.pressed]} onPress={() => void handleSaveGlobalProfile()}>
              <Text style={styles.ghostBtnText}>保存全局画像</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { marginTop: 10 }]}>
            <View style={styles.maintenanceBanner}>
              <View style={styles.maintenanceIconBox}>
                <Text style={styles.maintenanceIconText}>i</Text>
              </View>
              <View style={styles.maintenanceTextCol}>
                <Text style={styles.maintenanceTitle}>{maintenanceBannerTitle(maintenanceStatus)}</Text>
              </View>
            </View>

            <View style={styles.maintenanceConfigRow}>
              <Text style={styles.captionXs}>当前使用</Text>
              <Text style={styles.maintenanceMonoValue}>{maintenanceStatus ? `${maintenanceStatus.providerName} · ${maintenanceStatus.modelName}` : '本地 · 未启用远程维护'}</Text>
            </View>
            <View style={styles.maintenanceConfigRow}>
              <Text style={styles.captionXs}>配置状态</Text>
              <Text style={styles.maintenanceStatusValue}>{maintenanceStatusMessage}</Text>
            </View>

            <View style={styles.modePills}>
              {MEMORY_MAINTENANCE_MODES.map((mode) => {
                const selected = memoryMaintenanceMode === mode.value;
                return (
                  <Pressable
                    key={mode.value}
                    style={({pressed}) => [styles.modePill, selected && styles.modePillSelected, pressed && styles.pressed]}
                    onPress={() => void chooseMemoryMaintenanceMode(mode.value)}
                  >
                    <Text style={[styles.modePillText, selected && styles.modePillTextSelected]}>{mode.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.maintenanceActionGrid}>
              <Pressable style={({pressed}) => [styles.ghostBtn, pressed && styles.pressed]} onPress={() => void focusMaintenanceProviderKey()}>
                <Text style={styles.ghostBtnText}>配置 Key</Text>
              </Pressable>
              <Pressable style={({pressed}) => [styles.primaryBtnAction, pressed && styles.pressed]} onPress={() => void testSelectedMemoryMaintenanceModel()}>
                <Text style={styles.primaryBtnActionText}>测试连通性</Text>
              </Pressable>
            </View>

            {memoryMaintenanceMode === 'custom' && (
              <View style={styles.customMemorySection}>
                <Text style={styles.fieldLabel}>自定义记忆模型 ID</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.monoText]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setMemoryMaintenanceModelDraft}
                    placeholder="deepseek-v4-flash"
                    placeholderTextColor="#a1a1aa"
                    value={memoryMaintenanceModelDraft}
                  />
                  <Pressable style={({pressed}) => [styles.miniSaveBtn, pressed && styles.pressed, (!selectedCard || !memoryMaintenanceModelDraft.trim()) && styles.disabledBtn]} disabled={!selectedCard || !memoryMaintenanceModelDraft.trim()} onPress={() => void saveCustomMemoryMaintenanceModel()}>
                    <Text style={styles.miniSaveBtnText}>保存</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function formatTokenCount(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}
function formatPercent(value: number | null): string {
  return value === null ? '未观测' : `${Math.round(value * 100)}%`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f7f8' },
  header: {
    backgroundColor: 'rgba(247, 247, 248, 0.9)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 40,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 32, height: 32, marginLeft: -4, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backBtnPressed: { backgroundColor: 'rgba(0,0,0,0.05)' },
  headerTitleGroup: { flexDirection: 'column' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#18181b', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 11, fontWeight: '500', color: '#71717a' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 24 },
  
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, color: '#a1a1aa', textTransform: 'uppercase' },
  sectionSubtitle: { fontSize: 10, color: '#a1a1aa' },
  
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1, gap: 16 },
  
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricItem: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)', width: '47.5%' },
  metricLabel: { fontSize: 11, fontWeight: '500', color: '#71717a' },
  metricValue: { fontSize: 20, fontWeight: 'bold', color: '#18181b', marginTop: 2, letterSpacing: -0.2 },
  metricValueSuccess: { fontSize: 20, fontWeight: 'bold', color: '#059669', marginTop: 2, letterSpacing: -0.2 },
  
  tokenBarContainer: { paddingTop: 4 },
  tokenBarTrack: { height: 8, width: '100%', backgroundColor: '#f4f4f5', borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
  tokenBarSegment: { height: '100%' },
  cachedSegment: { backgroundColor: '#3b82f6' },
  inputSegment: { backgroundColor: '#d4d4d8' },
  outputSegment: { backgroundColor: '#18181b' },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#71717a', fontWeight: '500' },
  legendTextBold: { color: '#27272a' },
  
  providerRowContainer: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)', paddingBottom: 14 },
  providerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  providerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f4f4f5', alignItems: 'center', justifyContent: 'center' },
  providerRowText: { fontSize: 14, fontWeight: '600', color: '#18181b' },
  providerRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerValue: { fontSize: 14, fontWeight: '500', color: '#71717a' },
  
  dropdownPanel: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)', gap: 2 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  dropdownItemSelected: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  dropdownItemText: { fontSize: 14, color: '#3f3f46' },
  dropdownItemTextSelected: { color: '#2563eb', fontWeight: '500' },
  dropdownCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#52525b' },
  inputRow: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  input: { flex: 1, backgroundColor: '#f4f4f6', color: '#27272a', fontSize: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  monoText: { fontFamily: 'SF Mono, Menlo, Monaco, Courier New, monospace', letterSpacing: 0.5 },
  eyeBtn: { position: 'absolute', right: 10, padding: 6 },
  textareaImport: { minHeight: 88 },
  outlineBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  outlineBtnText: { fontSize: 12, fontWeight: '500', color: '#3f3f46' },
  
  actionGroup: { gap: 8, marginTop: 6 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#18181b', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  primaryBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  secondaryActions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ffffff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  secondaryBtnText: { fontSize: 12, fontWeight: '500', color: '#3f3f46' },
  
  verifyStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  verifyStatusIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  verifyIconSuccess: { backgroundColor: '#d1fae5', color: '#059669' },
  verifyIconWarning: { backgroundColor: '#fef3c7', color: '#d97706' },
  verifyIconError: { backgroundColor: '#fee2e2', color: '#ef4444' },
  verifyStatusTextCol: {},
  verifyStatusTitle: { fontSize: 14, fontWeight: '600', color: '#18181b', lineHeight: 18 },
  verifyStatusSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  textSuccess: { color: '#059669' },
  textWarning: { color: '#d97706' },
  textError: { color: '#ef4444' },
  
  modelSelectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  modelSelectLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBoxSecondary: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#f4f4f5', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modelValueMono: { fontSize: 14, fontWeight: '500', color: '#52525b', fontFamily: 'SF Mono, Menlo, Monaco, Courier New, monospace' },
  
  advancedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  advancedToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  advancedToggleTextCol: {},
  advancedToggleTitle: { fontSize: 14, fontWeight: '600', color: '#18181b', lineHeight: 18 },
  advancedToggleSubtitle: { fontSize: 11, color: '#a1a1aa' },
  advancedToggleRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advancedToggleStatus: { fontSize: 12, fontWeight: '500', color: '#71717a' },
  advancedPanel: { paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', gap: 16 },
  
  dropdownPanelOutline: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  
  miniSaveBtn: { marginLeft: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f0f1f4', borderRadius: 12, justifyContent: 'center' },
  miniSaveBtnText: { fontSize: 12, fontWeight: '500', color: '#3f3f46' },
  captionXs: { fontSize: 11, color: '#a1a1aa' },
  
  cardHeader: {},
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#18181b' },
  cardSubtitle: { fontSize: 11, color: '#a1a1aa', marginTop: 2, lineHeight: 16 },
  textareaProfile: { minHeight: 76 },
  ghostBtn: { width: '100%', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#18181b', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '500', color: '#ffffff' },
  
  maintenanceBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#f8f9fa', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  maintenanceIconBox: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#d4d4d8', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  maintenanceIconText: { fontSize: 10, fontWeight: 'bold', color: '#52525b' },
  maintenanceTextCol: {},
  maintenanceTitle: { fontSize: 12, fontWeight: '600', color: '#27272a' },
  
  maintenanceConfigRow: { gap: 4 },
  maintenanceMonoValue: { fontSize: 12, fontWeight: '600', color: '#18181b', fontFamily: 'SF Mono, Menlo, Monaco, Courier New, monospace' },
  maintenanceStatusValue: { fontSize: 12, color: '#3f3f46' },
  
  modePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  modePill: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f4f4f6', borderRadius: 8 },
  modePillSelected: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', paddingVertical: 3, paddingHorizontal: 9 },
  modePillText: { fontSize: 12, fontWeight: '500', color: '#52525b' },
  modePillTextSelected: { color: '#2563eb' },
  
  maintenanceActionGrid: { paddingTop: 2, gap: 8 },
  primaryBtnAction: { width: '100%', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#2563eb', borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  primaryBtnActionText: { fontSize: 12, fontWeight: '500', color: '#ffffff' },
  customMemorySection: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' },
  
  pressed: { opacity: 0.7 },
  disabledBtn: { opacity: 0.5 },
  
  statusBannerWrapper: { paddingHorizontal: 16, paddingBottom: 16 },
  
  batchActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  batchActionButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  batchActionButton: {},
  dropdownDeleteText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
});


