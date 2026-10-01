import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { useToast } from '../components/AppToast';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
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
  { value: 'follow_chat', label: '跟随当前对话' },
  { value: 'custom', label: '独立指定模型' },
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





export function AiProviderSettingsScreen({ space, onBack }: AiProviderSettingsScreenProps) {
  const scrollViewRef = useRef<ScrollView>(null);
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
  const [memoryMaintenanceMode, setMemoryMaintenanceMode] = useState<MemoryMaintenanceMode>('follow_chat');
  const [memoryMaintenanceProviderId, setMemoryMaintenanceProviderId] = useState<string | null>(null);
  const [memoryMaintenanceModelDraft, setMemoryMaintenanceModelDraft] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState<ResolvedMemoryMaintenanceModel | null>(null);
  const [maintenanceInfoExpanded, setMaintenanceInfoExpanded] = useState(false);
  const [memoryModelSheetVisible, setMemoryModelSheetVisible] = useState(false);
  const [globalProfileDraft, setGlobalProfileDraft] = useState('');
  const [globalProfileText, setGlobalProfileText] = useState('');
  const [visibleKey, setVisibleKey] = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [selectedModelKeys, setSelectedModelKeys] = useState<string[]>([]);
  const { showToast } = useToast();
  const [usageOverview, setUsageOverview] = useState<AiUsageAggregate | null>(null);
  const [usageWindow, setUsageWindow] = useState<'7d' | '30d' | 'all'>('30d');
  const [selectedUsageBlock, setSelectedUsageBlock] = useState<'cached' | 'nonCached' | 'output' | null>(null);

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

  const fetchUsage = useCallback(async (window: '7d' | '30d' | 'all') => {
    try {
      const usage = await loadAiUsageOverview(space, window);
      setUsageOverview(usage);
    } catch (e) {
      // ignore
    }
  }, [space]);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCards, defaultProviderId, usage] = await Promise.all([
        listProviderCards(space),
        getDefaultChatProviderId(space),
        loadAiUsageOverview(space, usageWindow),
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
    /* cleared toast */;
    await selectProvider(space, providerId);
    await loadProviders();
  }

  async function saveProviderDraft(silent = false): Promise<boolean> {
    if (!selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim())) {
      showToast({ message: selectedIsOtherProvider ? '请填写服务地址和 API key。' : '请填写 API key。', tone: 'warning' });
      return false;
    }

    try {
      if (selectedIsOtherProvider) {
        let parsedBaseUrl: URL;
        try {
          parsedBaseUrl = new URL(baseUrlDraft.trim());
        } catch {
          showToast({ message: '服务地址格式不正确，请检查 Base URL。', tone: 'warning' });
          return false;
        }
        if (parsedBaseUrl.search || parsedBaseUrl.hash) {
          showToast({ message: 'Base URL 不能包含查询参数或片段，请只填写服务地址。', tone: 'warning' });
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
      if (!silent) showToast({ message: '已保存配置', tone: 'success' });
      await loadProviders();
      return true;
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
      return false;
    }
  }

  function importProviderConnection() {
    const result = parseProviderConnectionImport(connectionImportDraft);
    if (!result.ok) {
      showToast({ message: '无效的连接', tone: 'warning' });
      return;
    }
    setBaseUrlDraft(result.baseUrl);
    setApiDraft(result.apiKey);
    setVisibleKey(false);
    setBaseUrlHint(result.hasPath ? null : '该连接未包含 `/v1`，如果测试失败，优先尝试在末尾加 `/v1`。');
    showToast({ message: '已识别，请保存', tone: 'success' });
  }

  async function selectModel(model: AiProviderModelRecord) {

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
      showToast({ message: `已选择 ${model.displayName}。`, tone: 'success' });
      await loadProviders();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '选择失败', tone: 'error' });
    }
  }

  async function selectEmbeddingModel(model: AiProviderModelRecord) {

    try {
      await saveProviderDefaultModels(space, model.providerId, { defaultEmbeddingModelId: model.modelId });
      showToast({ message: `已选择 ${model.displayName} 作为默认 Embedding。`, tone: 'success' });
      await loadProviders();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '选择失败', tone: 'error' });
    }
  }

  async function testSelectedProvider() {
    if (!selectedCard) {
      return;
    }
    const saved = await saveProviderDraft(true);
    if (!saved) {
      return;
    }

    showToast({ message: '正在测试...', tone: 'info' });
    try {
      await verifyCurrentProviderModel(selectedCard.provider.id, space);
      showToast({ message: '已验证', tone: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '测试失败', tone: 'error' });
    } finally {
      await loadProviders();
    }
  }

  async function syncSelectedProviderModels() {
    if (!selectedCard) {
      return;
    }
    const saved = await saveProviderDraft(true);
    if (!saved) {
      return;
    }

    showToast({ message: '正在刷新中...', tone: 'info' });
    try {
      const result = await syncProviderModels(selectedCard.provider.id, space);
      showToast(
        result.synced > 0
          ? { message: '刷新完成', tone: 'success' }
          : { message: '已应用内置模型', tone: 'warning' }
      );
      await loadProviders();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '同步失败', tone: 'error' });
    }
  }

  async function saveManualModel() {
    if (!selectedCard || !manualModelDraft.trim()) {
      return;
    }

    try {
      await saveManualChatModel(space, selectedCard.provider.id, manualModelDraft);
      setManualModelDraft('');
      showToast({ message: `已保存自定义模型 ${manualModelDraft.trim()}。`, tone: 'success' });
      await loadProviders();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
    }
  }

  async function saveManualEmbeddingModelDraft() {
    if (!selectedCard || !manualEmbeddingModelDraft.trim()) {
      return;
    }

    try {
      await saveManualEmbeddingModel(space, selectedCard.provider.id, manualEmbeddingModelDraft);
      setManualEmbeddingModelDraft('');
      showToast({ message: `已保存 Embedding 模型 ${manualEmbeddingModelDraft.trim()}。`, tone: 'success' });
      await loadProviders();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
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

              try {
                await deleteProviderModel(space, model.providerId, model.modelId);
                showToast({ message: `${model.displayName} 已删除。`, tone: 'success' });
                await loadProviders();
              } catch (error) {
                showToast({ message: error instanceof Error ? error.message : '删除模型失败', tone: 'error' });
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

              try {
                const deletedCount = await deleteProviderModels(space, models);
                setSelectedModelKeys([]);
                showToast({
                  message: deletedCount > 0 ? `已删除 ${deletedCount} 个模型。` : '没有可删除的模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',

                });
                await loadProviders();
              } catch (error) {
                showToast({ message: error instanceof Error ? error.message : '批量删除失败', tone: 'error' });
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

              try {
                const deletedCount = await deleteProviderModelsByProvider(space, selectedModelProviderId);
                setSelectedModelKeys([]);
                showToast({
                  message: deletedCount > 0 ? `已删除该来源下 ${deletedCount} 个模型。` : '该来源下没有可删除模型。',
                  tone: deletedCount > 0 ? 'success' : 'warning',

                });
                await loadProviders();
              } catch (error) {
                showToast({ message: error instanceof Error ? error.message : '删除同一来源失败', tone: 'error' });
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
      memoryMaintenanceModelId: memoryMaintenanceModelDraft.trim() || null,
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
    showToast({ message: '记忆维护模型已保存。', tone: 'success' });
  }

  async function selectMemoryMaintenanceModel(model: AiProviderModelRecord) {
    if (!selectedCard) return;
    setMemoryMaintenanceProviderId(selectedCard.provider.id);
    setMemoryMaintenanceModelDraft(model.modelId);
    setMemoryModelSheetVisible(false);
    await saveMemoryMaintenancePatch({
      memoryMaintenanceMode: 'custom',
      memoryMaintenanceModelId: model.modelId,
      memoryMaintenanceProviderId: selectedCard.provider.id,
    });
    showToast({ message: `记忆维护模型已切换为 ${model.displayName}。`, tone: 'success' });
  }

  async function handleSaveGlobalProfile() {
    setLoading(true);

    try {
      const next = await updateUserProfile(space, globalProfileDraft.trim(), null, null);
      setGlobalProfileDraft(next.profileText);
      setGlobalProfileText(next.profileText);
      showToast({ message: '已保存', tone: 'success' });
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function testSelectedMemoryMaintenanceModel() {

    const result = await testMemoryMaintenanceModel(space);
    setMaintenanceStatus(result);
    showToast({
      message: result.statusText,
      tone: result.status === 'error' ? 'error' : result.status === 'local_fallback' ? 'warning' : 'success',

    });
  }

  async function focusMaintenanceProviderKey() {
    const providerId = maintenanceStatus?.providerId ?? memoryMaintenanceProviderId;
    if (providerId && providerId !== selectedProviderId) {
      await chooseProvider(providerId);
    }
    setVisibleKey(true);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    showToast({ message: '请在上方配置 API Key', tone: 'info' });
  }

  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const saveDisabled = !selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim());

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
    <AiLightScaffold
      backgroundColor="#ffffff"
      contentContainerStyle={styles.pageContent}
      onBack={onBack}
      scrollable
      scrollViewRef={scrollViewRef}
      subtitle={spaceLabel}
      title="全局默认模型"
    >
      {usageOverview ? (() => {
        const usage = usageOverview;
        const total = (usage.cachedInputTokens + usage.nonCachedInputTokens + usage.completionTokens) || 1;
        const cachedPct = (usage.cachedInputTokens / total) * 100;
        const nonCachedPct = (usage.nonCachedInputTokens / total) * 100;
        const outputPct = (usage.completionTokens / total) * 100;
        const formatTokens = (val: number) => {
          if (val < 1000) return String(val);
          if (val < 1000000) return (val / 1000).toFixed(1) + 'K';
          return (val / 1000000).toFixed(1) + 'M';
        };
        return (
          <View style={styles.section}>
            <View style={[styles.card, { paddingVertical: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.rowTitle}>用量统计</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {(['7d', '30d', 'all'] as const).map(opt => {
                    const isSelected = usageWindow === opt;
                    const label = opt === '7d' ? '7天' : opt === '30d' ? '30天' : '全部';
                    return (
                      <Pressable 
                        key={opt}
                        onPress={() => {
                          setUsageWindow(opt);
                          void fetchUsage(opt);
                        }}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 4,
                          backgroundColor: isSelected ? '#18181b' : '#f4f4f5',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '500', color: isSelected ? '#ffffff' : '#71717a' }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ flexDirection: 'row', height: 16, alignItems: 'center', backgroundColor: 'transparent' }}>
                {cachedPct > 0 && (
                  <Pressable 
                    onPress={() => setSelectedUsageBlock(selectedUsageBlock === 'cached' ? null : 'cached')}
                    style={{ width: `${cachedPct}%`, height: selectedUsageBlock === 'cached' ? 14 : 8, backgroundColor: '#bfdbfe', borderRadius: selectedUsageBlock === 'cached' ? 4 : 0, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} 
                  />
                )}
                {nonCachedPct > 0 && (
                  <Pressable 
                    onPress={() => setSelectedUsageBlock(selectedUsageBlock === 'nonCached' ? null : 'nonCached')}
                    style={{ width: `${nonCachedPct}%`, height: selectedUsageBlock === 'nonCached' ? 14 : 8, backgroundColor: '#fbcfe8', borderRadius: selectedUsageBlock === 'nonCached' ? 4 : 0, borderTopLeftRadius: cachedPct === 0 ? 4 : 0, borderBottomLeftRadius: cachedPct === 0 ? 4 : 0 }} 
                  />
                )}
                {outputPct > 0 && (
                  <Pressable 
                    onPress={() => setSelectedUsageBlock(selectedUsageBlock === 'output' ? null : 'output')}
                    style={{ width: `${outputPct}%`, height: selectedUsageBlock === 'output' ? 14 : 8, backgroundColor: '#bbf7d0', borderRadius: selectedUsageBlock === 'output' ? 4 : 0, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} 
                  />
                )}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -6 }}>
                <Text style={{ fontSize: 11, color: '#71717a' }}>
                  {selectedUsageBlock === 'cached' && `缓存命中: ${formatTokens(usage.cachedInputTokens)} Token`}
                  {selectedUsageBlock === 'nonCached' && `原始输入: ${formatTokens(usage.nonCachedInputTokens)} Token`}
                  {selectedUsageBlock === 'output' && `模型输出: ${formatTokens(usage.completionTokens)} Token`}
                  {!selectedUsageBlock && `总计 ${formatTokens(usage.totalTokens)} Token`}
                </Text>
                <Text style={{ fontSize: 11, color: '#71717a' }}>
                  {selectedUsageBlock === 'cached' && `占比 ${Math.round(cachedPct)}%`}
                  {selectedUsageBlock === 'nonCached' && `占比 ${Math.round(nonCachedPct)}%`}
                  {selectedUsageBlock === 'output' && `占比 ${Math.round(outputPct)}%`}
                  {!selectedUsageBlock && `缓存命中 ${Math.round((usage.cachedTokenRatio ?? 0) * 100)}%`}
                </Text>
              </View>
            </View>
          </View>
        );
      })() : null}

      <View style={styles.section}>
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProviderSheetVisible((current) => !current);
              setModelSheetVisible(false);
            }}
            style={({ pressed }) => [styles.rowItem, styles.rowBorder, pressed && styles.pressed]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <Ionicons name="business-outline" size={16} color="#3f3f46" />
              </View>
              <Text style={styles.rowLabel}>选择模型商</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{selectedCard?.provider.displayName ?? '未选择'}</Text>
              <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
            </View>
          </Pressable>

          {providerSheetVisible ? (
            <View style={styles.dropdownPanel}>
              {orderedCards.map((card) => {
                const selected = card.provider.id === selectedCard?.provider.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={card.provider.id}
                    onPress={() => {
                      void chooseProvider(card.provider.id);
                    }}
                    style={({ pressed }) => [styles.dropdownRow, selected && styles.selectedDropdownRow, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{card.provider.displayName}</Text>
                    {selected ? (
                      <View style={styles.checkBadge}>
                        <Ionicons color="#fff" name="checkmark" size={12} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {selectedIsOtherProvider ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>基础地址 (Base URL)</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setBaseUrlDraft}
                placeholder="https://api.example.com/v1"
                placeholderTextColor="#a1a1aa"
                selectionColor="#2563eb"
                style={styles.input}
                value={baseUrlDraft}
              />
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>API Key</Text>
            <View style={styles.inputRow}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setApiDraft}
                placeholder={selectedCard?.hasApiKey ? '已保存' : '输入 API Key'}
                placeholderTextColor="#a1a1aa"
                secureTextEntry={!visibleKey}
                selectionColor="#2563eb"
                style={[styles.input, styles.monoInput]}
                value={apiDraft}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisibleKey((current) => !current)}
                style={({ pressed }) => [styles.inputIconBtn, pressed && styles.pressed]}
              >
                <Ionicons color="#a1a1aa" name={visibleKey ? 'eye-off-outline' : 'eye-outline'} size={16} />
              </Pressable>
            </View>
          </View>
          
          {selectedIsOtherProvider ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>连接信息导入</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                onChangeText={setConnectionImportDraft}
                placeholder='{"_type":"newapi_channel_conn","key":"sk-...","url":"https://example.com"}'
                placeholderTextColor="#a1a1aa"
                selectionColor="#2563eb"
                style={[styles.input, styles.importInput]}
                value={connectionImportDraft}
              />
              <Pressable
                disabled={!connectionImportDraft.trim()}
                onPress={importProviderConnection}
                style={({ pressed }) => [styles.outlineBtn, !connectionImportDraft.trim() && styles.disabledBtn, pressed && styles.pressed]}
              >
                <Text style={styles.outlineBtnText}>导入连接信息</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.actionGroup}>
            <Pressable
              disabled={saveDisabled}
              onPress={() => void saveProviderDraft()}
              style={({ pressed }) => [styles.primaryBtn, saveDisabled && styles.disabledBtn, pressed && styles.pressed]}
            >
              <Ionicons color="#d1d5db" name="checkmark" size={16} />
              <Text style={styles.primaryBtnText}>保存配置</Text>
            </Pressable>
            
            <View style={styles.secondaryActionRow}>
              <Pressable
                onPress={() => void syncSelectedProviderModels()}
                style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              >
                <Ionicons color="#9ca3af" name="refresh" size={14} />
                <Text style={styles.secondaryBtnText}>刷新模型列表</Text>
              </Pressable>
              
              <Pressable
                disabled={saveDisabled}
                onPress={() => void testSelectedProvider()}
                style={({ pressed }) => [styles.secondaryBtn, saveDisabled && styles.disabledBtn, pressed && styles.pressed]}
              >
                <Ionicons color="#9ca3af" name="flash-outline" size={14} />
                <Text style={styles.secondaryBtnText}>测试当前模型</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.card}>


          <Pressable
            disabled={chatModels.length === 0}
            onPress={() => {
              setModelSheetVisible((current) => !current);
              setProviderSheetVisible(false);
            }}
            style={({ pressed }) => [styles.rowItem, styles.rowBorder, chatModels.length === 0 && styles.disabledBtn, pressed && styles.pressed, { paddingVertical: 12 }]}
          >
            <View style={styles.rowLeft}>
              <View style={styles.iconBox2}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#52525b" />
              </View>
              <Text style={styles.rowTitle}>全局对话模型</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValueMono}>{selectedModel?.displayName ?? (chatModels.length > 0 ? '未选择' : '暂无可用模型')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
            </View>
          </Pressable>

          {modelSheetVisible ? (
            <View style={styles.dropdownPanel}>
              {providerSelectionMode ? (
                <View style={styles.batchActionRow}>
                  <Text style={styles.caption}>已选 {selectedModelKeys.length} 项</Text>
                  <View style={styles.batchActionButtons}>
                    <Pressable accessibilityRole="button" onPress={confirmDeleteSelectedModels} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                      <Text style={styles.dropdownDeleteText}>批量删除</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={confirmDeleteSameProviderModels} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                      <Text style={styles.dropdownDeleteText}>删除同一来源</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setSelectedModelKeys([])} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                      <Text style={styles.caption}>取消</Text>
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
                    accessibilityRole="button"
                    key={model.id}
                    onLongPress={() => beginModelSelection(model)}
                    onPress={() => {
                      if (providerSelectionMode) {
                        toggleSelectedModel(model);
                        return;
                      }
                      void selectModel(model);
                    }}
                    style={({ pressed }) => [styles.dropdownRow, (selected || selectedForDelete) && styles.selectedDropdownRow, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{model.displayName}</Text>
                    {selectedForDelete ? <Ionicons color="#2563eb" name="checkmark-done-circle" size={18} /> : selected ? (
                      <View style={styles.checkBadge}>
                        <Ionicons color="#fff" name="checkmark" size={10} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {embeddingModels.length > 0 || selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding ? (
            <>
              <Pressable
                onPress={() => setAdvancedVisible((current) => !current)}
                style={({ pressed }) => [styles.rowItem, !advancedVisible && { borderBottomWidth: 0, paddingBottom: 0 }, pressed && styles.pressed, { paddingVertical: 12 }]}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconBox2}>
                    <Ionicons name="options-outline" size={14} color="#52525b" />
                  </View>
                  <View>
                    <Text style={styles.rowTitle}>高级设置</Text>
                    <Text style={styles.rowSubtitle}>向量模型 (Embedding) 与手动配置</Text>
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>{advancedVisible ? '收起' : '展开'}</Text>
                  <Ionicons name={advancedVisible ? 'chevron-up' : 'chevron-down'} size={16} color="#a1a1aa" />
                </View>
              </Pressable>

              {advancedVisible ? (
                <View style={styles.advancedPanel}>
                  {embeddingModels.length > 0 ? (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>默认 Embedding</Text>
                      <View style={styles.dropdownPanel}>
                        {providerSelectionMode ? (
                          <View style={styles.batchActionRow}>
                            <Text style={styles.caption}>已选 {selectedModelKeys.length} 项</Text>
                            <View style={styles.batchActionButtons}>
                              <Pressable accessibilityRole="button" onPress={confirmDeleteSelectedModels} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                                <Text style={styles.dropdownDeleteText}>批量删除</Text>
                              </Pressable>
                              <Pressable accessibilityRole="button" onPress={confirmDeleteSameProviderModels} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                                <Text style={styles.dropdownDeleteText}>删除同一来源</Text>
                              </Pressable>
                              <Pressable accessibilityRole="button" onPress={() => setSelectedModelKeys([])} style={({ pressed }) => [styles.batchActionButton, pressed && styles.pressed]}>
                                <Text style={styles.caption}>取消</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                        {embeddingModels.map((model) => {
                          const selected = model.modelId === selectedCard?.provider.defaultEmbeddingModelId;
                          const modelKey = providerModelKey(model.providerId, model.modelId);
                          const selectedForDelete = selectedModelKeys.includes(modelKey);
                          return (
                            <Pressable
                              accessibilityRole="button"
                              key={model.id}
                              onLongPress={() => beginModelSelection(model)}
                              onPress={() => {
                                if (providerSelectionMode) {
                                  toggleSelectedModel(model);
                                  return;
                                }
                                void selectEmbeddingModel(model);
                              }}
                              style={({ pressed }) => [styles.dropdownRow, (selected || selectedForDelete) && styles.selectedDropdownRow, pressed && styles.pressed]}
                            >
                              <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{model.displayName}</Text>
                              {selectedForDelete ? <Ionicons color="#2563eb" name="checkmark-done-circle" size={18} /> : selected ? (
                                <View style={styles.checkBadge}>
                                  <Ionicons color="#fff" name="checkmark" size={10} />
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding ? (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Embedding 接口</Text>
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={setEmbeddingBaseUrlDraft}
                        placeholder="默认复用上方服务地址"
                        placeholderTextColor="#a1a1aa"
                        selectionColor="#2563eb"
                        style={[styles.input, styles.monoInput]}
                        value={embeddingBaseUrlDraft}
                      />
                    </View>
                  ) : null}

                  {selectedSupportsManualChatModel ? (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>手动添加对话模型</Text>
                      <View style={styles.inputRow}>
                        <TextInput
                          autoCapitalize="none"
                          autoCorrect={false}
                          onChangeText={setManualModelDraft}
                          placeholder="gpt-4o-mini"
                          placeholderTextColor="#a1a1aa"
                          selectionColor="#2563eb"
                          style={[styles.input, styles.monoInput]}
                          value={manualModelDraft}
                        />
                        <Pressable
                          disabled={!manualModelDraft.trim()}
                          onPress={() => void saveManualModel()}
                          style={({ pressed }) => [styles.saveBtn, !manualModelDraft.trim() && styles.disabledBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.saveBtnText}>保存</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {selectedSupportsManualEmbedding ? (
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>自定义 Embedding 模型</Text>
                      <View style={styles.inputRow}>
                        <TextInput
                          autoCapitalize="none"
                          autoCorrect={false}
                          onChangeText={setManualEmbeddingModelDraft}
                          placeholder="text-embedding-3-small"
                          placeholderTextColor="#a1a1aa"
                          selectionColor="#2563eb"
                          style={[styles.input, styles.monoInput]}
                          value={manualEmbeddingModelDraft}
                        />
                        <Pressable
                          disabled={!manualEmbeddingModelDraft.trim()}
                          onPress={() => void saveManualEmbeddingModelDraft()}
                          style={({ pressed }) => [styles.saveBtn, !manualEmbeddingModelDraft.trim() && styles.disabledBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.saveBtnText}>保存</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </View>


      <View style={styles.section}>
        <View style={styles.card}>

          <View style={styles.modeGrid}>
            {MEMORY_MAINTENANCE_MODES.map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode.value}
                onPress={() => void chooseMemoryMaintenanceMode(mode.value)}
                style={({ pressed }) => [
                  styles.modeOption,
                  memoryMaintenanceMode === mode.value && styles.selectedModeOption,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.modeOptionText, memoryMaintenanceMode === mode.value && styles.selectedModeOptionText]}>{mode.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actionGroup}>
            <Pressable
              onPress={() => void focusMaintenanceProviderKey()}
              style={({ pressed }) => [styles.grayFullBtn, pressed && styles.pressed]}
            >
              <Text style={styles.grayFullBtnText}>配置 Key</Text>
            </Pressable>
            <Pressable
              onPress={() => void testSelectedMemoryMaintenanceModel()}
              style={({ pressed }) => [styles.primaryBlueBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBlueBtnText}>测试连通性</Text>
            </Pressable>
          </View>

          {memoryMaintenanceMode === 'custom' ? (
            <View style={[styles.fieldGroup, { paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }]}>
              <Text style={styles.fieldLabel}>自定义记忆模型</Text>
              
              <Pressable
                disabled={chatModels.length === 0}
                onPress={() => setMemoryModelSheetVisible((current) => !current)}
                style={({ pressed }) => [styles.rowItem, styles.rowBorder, chatModels.length === 0 && styles.disabledBtn, pressed && styles.pressed, { paddingVertical: 12, paddingBottom: 12 }]}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.iconBox2}>
                    <Ionicons name="git-network-outline" size={14} color="#52525b" />
                  </View>
                  <Text style={styles.rowTitle}>选择模型</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValueMono}>
                    {(chatModels.find(m => m.modelId === memoryMaintenanceModelDraft)?.displayName ?? memoryMaintenanceModelDraft) || '请选择模型'}
                  </Text>
                  <Ionicons name={memoryModelSheetVisible ? 'chevron-up' : 'chevron-down'} size={16} color="#a1a1aa" />
                </View>
              </Pressable>

              {memoryModelSheetVisible ? (
                <View style={styles.dropdownPanel}>
                  {chatModels.map((model) => {
                    const selected = model.modelId === memoryMaintenanceModelDraft;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={model.id}
                        onPress={() => void selectMemoryMaintenanceModel(model)}
                        style={({ pressed }) => [styles.dropdownRow, selected && styles.selectedDropdownRow, pressed && styles.pressed]}
                      >
                        <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{model.displayName}</Text>
                        {selected ? (
                          <View style={styles.checkBadge}>
                            <Ionicons color="#fff" name="checkmark" size={10} />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.fieldGroup, { paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }]}>
            <Text style={styles.rowTitle}>全局用户画像</Text>
            <TextInput
              multiline
              onChangeText={setGlobalProfileDraft}
              placeholder="例如：我希望默认回答简洁直接；我更喜欢中文交流。"
              placeholderTextColor="#a1a1aa"
              selectionColor="#2563eb"
              style={[styles.input, styles.profileInput]}
              textAlignVertical="top"
              value={globalProfileDraft}
            />
            <Pressable
              disabled={globalProfileDraft === globalProfileText}
              onPress={() => void handleSaveGlobalProfile()}
              style={({ pressed }) => [styles.grayFullBtn, (globalProfileDraft === globalProfileText) && styles.disabledBtn, pressed && styles.pressed]}
            >
              <Text style={styles.grayFullBtnText}>保存全局画像</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AiLightScaffold>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    paddingBottom: 48,
    backgroundColor: '#ffffff',
  },
  section: {
  },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox2: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181b',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181b',
  },
  rowSubtitle: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 2,
  },
  rowSubtitleSuccess: {
    color: '#10b981',
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#71717a',
  },
  rowValueMono: {
    fontSize: 14,
    fontWeight: '500',
    color: '#52525b',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  dropdownPanel: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 6,
    borderColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    gap: 2,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectedDropdownRow: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dropdownText: {
    fontSize: 14,
    color: '#3f3f46',
  },
  selectedDropdownText: {
    color: '#2563eb',
    fontWeight: '500',
  },
  checkBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525b',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f4f4f6',
    color: '#27272a',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    minHeight: 40,
  },
  monoInput: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  inputIconBtn: {
    position: 'absolute',
    right: 10,
    padding: 6,
  },
  importInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  profileInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  outlineBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  outlineBtnText: {
    fontSize: 12,
    color: '#3f3f46',
    fontWeight: '500',
  },
  actionGroup: {
    gap: 8,
    marginTop: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#18181b',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  primaryBlueBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryBlueBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  secondaryBtnText: {
    fontSize: 12,
    color: '#3f3f46',
    fontWeight: '500',
  },
  grayFullBtn: {
    backgroundColor: '#f0f1f4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grayFullBtnText: {
    fontSize: 12,
    color: '#3f3f46',
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#f0f1f4',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 12,
    color: '#3f3f46',
    fontWeight: '500',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  caption: {
    fontSize: 11,
    color: '#a1a1aa',
  },
  monoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18181b',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    marginTop: 4,
  },
  statusIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconBoxSuccess: {
    backgroundColor: '#d1fae5',
  },
  statusIconBoxError: {
    backgroundColor: '#fee2e2',
  },
  statusIconBoxWarning: {
    backgroundColor: '#fef3c7',
  },
  advancedPanel: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    gap: 16,
  },
  batchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
    marginBottom: 4,
  },
  batchActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  batchActionButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f4f4f5',
  },
  dropdownDeleteText: {
    fontSize: 11,
    color: '#ef4444',
  },
  maintenanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  maintenanceBannerIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#d4d4d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceBannerIconText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#52525b',
  },
  maintenanceBannerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#27272a',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  modeOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f4f4f6',
  },
  selectedModeOption: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  modeOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#52525b',
  },
  selectedModeOptionText: {
    color: '#2563eb',
  },
});
