import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightFeedbackBanner, type FeedbackTone } from '../components/ai/AiLightFeedbackBanner';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import {
  getDefaultChatProviderId,
  getSavedProviderApiKey,
  listProviderCards,
  saveManualChatModel,
  saveManualEmbeddingModel,
  saveProviderApiKey,
  saveProviderBaseUrl,
  saveProviderEmbeddingBaseUrl,
  saveProviderDefaultModels,
  selectProvider,
  syncProviderModels,
  testProvider,
} from '../ai/aiProviderService';
import {
  resolveMemoryMaintenanceModel,
  testMemoryMaintenanceModel,
  type ResolvedMemoryMaintenanceModel,
} from '../ai/aiMemoryMaintenanceModelService';
import { radius, rhythm, spacing, typography } from '../design/tokens';
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

function isOtherProvider(card: ProviderCard): boolean {
  return card.provider.providerType === 'openai_compatible' || card.provider.providerType === 'custom';
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
  const [embeddingBaseUrlDraft, setEmbeddingBaseUrlDraft] = useState('');
  const [manualModelDraft, setManualModelDraft] = useState('');
  const [manualEmbeddingModelDraft, setManualEmbeddingModelDraft] = useState('');
  const [memoryMaintenanceMode, setMemoryMaintenanceMode] = useState<MemoryMaintenanceMode>('auto');
  const [memoryMaintenanceProviderId, setMemoryMaintenanceProviderId] = useState<string | null>(null);
  const [memoryMaintenanceModelDraft, setMemoryMaintenanceModelDraft] = useState('');
  const [maintenanceStatus, setMaintenanceStatus] = useState<ResolvedMemoryMaintenanceModel | null>(null);
  const [maintenanceInfoExpanded, setMaintenanceInfoExpanded] = useState(false);
  const [visibleKey, setVisibleKey] = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);

  const orderedCards = useMemo(() => [...cards.filter((card) => !isOtherProvider(card)), ...cards.filter(isOtherProvider)], [cards]);
  const selectedCard = orderedCards.find((card) => card.provider.id === selectedProviderId) ?? orderedCards[0] ?? null;
  const selectedIsOtherProvider = selectedCard ? isOtherProvider(selectedCard) : false;
  const selectedSupportsManualEmbedding = selectedCard?.provider.protocol === 'openai_compatible';
  const chatModels = selectedCard?.models.filter((model) => model.supportsChat) ?? [];
  const embeddingModels = selectedCard?.models.filter((model) => model.supportsEmbedding) ?? [];
  const selectedModel = chatModels.find((model) => model.modelId === selectedCard?.provider.defaultChatModelId) ?? null;
  const selectedEmbeddingModel = embeddingModels.find((model) => model.modelId === selectedCard?.provider.defaultEmbeddingModelId) ?? null;
  const maintenanceTone = maintenanceBannerTone(maintenanceStatus);
  const maintenanceTestTime = formatMaintenanceTestTime(maintenanceStatus?.lastTestAt);
  const maintenanceStatusMessage = maintenanceStatus?.lastTestMessage || maintenanceStatus?.statusText || '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型';

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
      const [nextCards, defaultProviderId] = await Promise.all([listProviderCards(space), getDefaultChatProviderId(space)]);
      setCards(nextCards);
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
    if (!selectedProviderId) {
      setApiDraft('');
      setBaseUrlDraft('');
      setEmbeddingBaseUrlDraft('');
      setManualEmbeddingModelDraft('');
      return;
    }
    let active = true;
    const selected = orderedCards.find((card) => card.provider.id === selectedProviderId);
    setBaseUrlDraft(selected?.provider.baseUrl ?? '');
    setEmbeddingBaseUrlDraft(selected?.provider.embeddingBaseUrl ?? '');
    setManualEmbeddingModelDraft('');
    void getSavedProviderApiKey(selectedProviderId).then((apiKey) => {
      if (active) {
        setApiDraft(apiKey ?? '');
      }
    });
    return () => {
      active = false;
    };
  }, [orderedCards, selectedProviderId]);

  async function chooseProvider(providerId: string) {
    const nextCard = orderedCards.find((card) => card.provider.id === providerId) ?? null;
    setSelectedProviderId(providerId);
    setProviderSheetVisible(false);
    setModelSheetVisible(false);
    setApiDraft('');
    setBaseUrlDraft(nextCard?.provider.baseUrl ?? '');
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
        await saveProviderBaseUrl(space, selectedCard.provider.id, baseUrlDraft);
      }
      await saveProviderEmbeddingBaseUrl(space, selectedCard.provider.id, embeddingBaseUrlDraft);
      const apiKey = apiDraft.trim();
      await selectProvider(space, selectedCard.provider.id);
      await saveProviderApiKey(selectedCard.provider.id, apiKey);
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

  async function selectModel(model: AiProviderModelRecord) {
    setStatus({ message: '正在切换默认对话模型...', tone: 'info' });
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
    setStatus({ message: '正在验证 API key、模型和服务地址...', tone: 'info', title: '测试连接中' });
    try {
      await testProvider(selectedCard.provider.id, space);
      setStatus({ message: `${selectedCard.provider.displayName} 连接可用，可以开始对话。`, tone: 'success', title: '连接成功' });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '测试失败', tone: 'error', title: '连接失败' });
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
    setStatus({ message: '正在从模型商读取模型列表...', tone: 'info', title: '同步模型中' });
    try {
      const result = await syncProviderModels(selectedCard.provider.id, space);
      setStatus(
        result.synced > 0
          ? { message: `已同步 ${result.synced} 个模型。`, tone: 'success', title: '同步完成' }
          : { message: `没有读取到远程列表，已使用 ${result.fallback} 个内置模型。`, tone: 'warning', title: '使用内置模型' }
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
    <AiLightScaffold
      contentContainerStyle={styles.pageContent}
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="全局默认模型"
    >
      <AiLightCard>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>全局默认模型</Text>
          <Text style={styles.caption}>新创建会话的默认选择。修改此项不会影响已有独立设置的会话。</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>模型商</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setProviderSheetVisible((current) => !current);
              setModelSheetVisible(false);
            }}
            style={({ pressed }) => [styles.selectBox, providerSheetVisible && styles.activeSelectBox, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.selectText}>{selectedCard?.provider.displayName ?? '选择模型商'}</Text>
            <Ionicons color={aiLightColors.mutedSoft} name={providerSheetVisible ? 'chevron-up' : 'chevron-down'} size={18} />
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
                    {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {selectedIsOtherProvider ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>地址</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setBaseUrlDraft}
              placeholder="https://api.example.com/v1"
              placeholderTextColor={aiLightColors.mutedSoft}
              selectionColor={aiLightColors.coral}
              style={styles.input}
              value={baseUrlDraft}
            />
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>API</Text>
          <View style={styles.inputRow}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setApiDraft}
              placeholder={selectedCard?.hasApiKey ? '已保存' : '输入 API'}
              placeholderTextColor={aiLightColors.mutedSoft}
              secureTextEntry={!visibleKey}
              selectionColor={aiLightColors.coral}
              style={styles.input}
              value={apiDraft}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleKey((current) => !current)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={aiLightColors.muted} name={visibleKey ? 'eye-off-outline' : 'eye-outline'} size={18} />
            </Pressable>
          </View>
          <AiLightButton disabled={saveDisabled} label="保存并测试连接" onPress={() => void testSelectedProvider()} />
          <View style={styles.inlineActions}>
            <AiLightButton label="同步模型" onPress={() => void syncSelectedProviderModels()} variant="ghost" />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>默认对话模型</Text>
          <Pressable
            accessibilityRole="button"
            disabled={chatModels.length === 0}
            onPress={() => {
              setModelSheetVisible((current) => !current);
              setProviderSheetVisible(false);
            }}
            style={({ pressed }) => [
              styles.selectBox,
              modelSheetVisible && styles.activeSelectBox,
              chatModels.length === 0 && styles.disabledSelect,
              pressed && chatModels.length > 0 && styles.pressed,
            ]}
          >
            <Text numberOfLines={1} style={[styles.selectText, chatModels.length === 0 && styles.disabledSelectText]}>
              {selectedModel?.displayName ?? (chatModels.length > 0 ? '选择模型' : '暂无可用模型')}
            </Text>
            <Ionicons
              color={chatModels.length > 0 ? aiLightColors.mutedSoft : aiLightColors.mutedSoft}
              name={modelSheetVisible ? 'chevron-up' : 'chevron-down'}
              size={18}
            />
          </Pressable>
          {modelSheetVisible ? (
            <View style={styles.dropdownPanel}>
              {chatModels.map((model) => {
                const selected = model.modelId === selectedCard?.provider.defaultChatModelId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={model.id}
                    onPress={() => {
                      void selectModel(model);
                    }}
                    style={({ pressed }) => [styles.dropdownRow, selected && styles.selectedDropdownRow, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{model.displayName}</Text>
                    {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {embeddingModels.length > 0 || selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding ? (
          <View style={styles.fieldGroup}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdvancedVisible((current) => !current)}
              style={({ pressed }) => [styles.advancedToggle, pressed && styles.pressed]}
            >
              <Text style={styles.fieldLabel}>高级设置</Text>
              <Ionicons color={aiLightColors.mutedSoft} name={advancedVisible ? 'chevron-up' : 'chevron-down'} size={18} />
            </Pressable>

            {advancedVisible ? (
              <View style={styles.advancedPanel}>
                {embeddingModels.length > 0 ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>默认 Embedding</Text>
                    <View style={styles.dropdownPanel}>
                      {embeddingModels.map((model) => {
                        const selected = model.modelId === selectedCard?.provider.defaultEmbeddingModelId;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            key={model.id}
                            onPress={() => {
                              void selectEmbeddingModel(model);
                            }}
                            style={({ pressed }) => [styles.dropdownRow, selected && styles.selectedDropdownRow, pressed && styles.pressed]}
                          >
                            <Text numberOfLines={1} style={[styles.dropdownText, selected && styles.selectedDropdownText]}>{model.displayName}</Text>
                            {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={18} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.caption}>{selectedEmbeddingModel ? `当前：${selectedEmbeddingModel.displayName}` : '选择后，材料会在导入后尝试生成本地向量索引。'}</Text>
                  </View>
                ) : null}

                {selectedCard?.provider.embeddingEnabled || selectedSupportsManualEmbedding ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Embedding 接口</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setEmbeddingBaseUrlDraft}
                      placeholder="默认复用上方服务地址，可单独填写 Embedding 接口"
                      placeholderTextColor={aiLightColors.mutedSoft}
                      selectionColor={aiLightColors.coral}
                      style={styles.input}
                      value={embeddingBaseUrlDraft}
                    />
                    <Text style={styles.caption}>
                      留空时使用对话服务地址；只有向量检索和材料索引会调用这里。DeepSeek 官方接口暂未列出 Embedding，兼容网关可在这里填写 /embeddings 所在的基础地址。
                    </Text>
                  </View>
                ) : null}

                {selectedIsOtherProvider ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>自定义模型</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setManualModelDraft}
                      placeholder="模型名称"
                      placeholderTextColor={aiLightColors.mutedSoft}
                      selectionColor={aiLightColors.coral}
                      style={styles.input}
                      value={manualModelDraft}
                    />
                    <AiLightButton disabled={!manualModelDraft.trim()} label="保存模型" onPress={() => void saveManualModel()} variant="outline" />
                  </View>
                ) : null}

                {selectedSupportsManualEmbedding ? (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>自定义 Embedding 模型</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setManualEmbeddingModelDraft}
                      placeholder="text-embedding-3-small"
                      placeholderTextColor={aiLightColors.mutedSoft}
                      selectionColor={aiLightColors.coral}
                      style={styles.input}
                      value={manualEmbeddingModelDraft}
                    />
                    <AiLightButton disabled={!manualEmbeddingModelDraft.trim()} label="保存 Embedding 模型" onPress={() => void saveManualEmbeddingModelDraft()} variant="outline" />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {status ? <AiLightFeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}

        <View style={styles.sectionDivider} />

        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>记忆维护模型</Text>
          <View style={styles.statusPanel}>
            <View style={[
              styles.maintenanceResultBanner,
              maintenanceTone === 'success' && styles.maintenanceResultSuccess,
              maintenanceTone === 'warning' && styles.maintenanceResultWarning,
              maintenanceTone === 'error' && styles.maintenanceResultError,
              maintenanceTone === 'info' && styles.maintenanceResultInfo,
            ]}>
              <Ionicons
                color={maintenanceTone === 'success' ? aiLightColors.coral : maintenanceTone === 'info' ? aiLightColors.muted : aiLightColors.coralActive}
                name={maintenanceTone === 'success' ? 'checkmark-circle' : maintenanceTone === 'error' ? 'close-circle' : maintenanceTone === 'warning' ? 'alert-circle' : 'information-circle'}
                size={18}
              />
              <View style={styles.maintenanceResultCopy}>
                <Text style={styles.maintenanceResultTitle}>{maintenanceBannerTitle(maintenanceStatus)}</Text>
                <Text style={styles.caption}>{maintenanceStatusMessage}</Text>
                {maintenanceTestTime ? <Text style={styles.caption}>上次测试：{maintenanceTestTime}</Text> : null}
              </View>
            </View>
            <Text style={styles.caption}>当前使用</Text>
            <Text style={styles.statusValue}>
              {maintenanceStatus ? `${maintenanceStatus.providerName} · ${maintenanceStatus.modelName}` : '本地 · 未启用远程维护'}
            </Text>
            <Text style={styles.caption}>配置状态</Text>
            <Text style={styles.statusValue}>{maintenanceStatus?.statusText ?? '未配置远程维护模型，摘要压缩和画像维护不会调用远程模型'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMaintenanceInfoExpanded((current) => !current)}
              style={({ pressed }) => [styles.infoToggle, pressed && styles.pressed]}
            >
              <Text style={styles.caption}>远程维护只用于摘要和画像，Key 保存在本机。</Text>
              <Ionicons color={aiLightColors.mutedSoft} name={maintenanceInfoExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
            </Pressable>
            {maintenanceInfoExpanded ? (
              <Text style={styles.caption}>
                开启后，Pixory 会把需要整理的对话片段发送给你配置的模型服务商；未配置或测试失败时不会调用远程维护模型。API Key 仅保存在本机安全存储中。
              </Text>
            ) : null}
          </View>
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
          <Text style={styles.caption}>
            {isMaintenanceTestPassed(maintenanceStatus?.lastTestStatus)
              ? '测试通过后，摘要压缩和画像维护会使用该远程模型。'
              : '保存 Key 或切换模型后，请点击“测试记忆模型”，通过后再视为配置成功。'}
          </Text>
          <View style={styles.inlineActions}>
            <AiLightButton label="配置 Key" onPress={() => void focusMaintenanceProviderKey()} variant="outline" />
            <AiLightButton label="测试记忆模型" onPress={() => void testSelectedMemoryMaintenanceModel()} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>自定义记忆模型 ID</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setMemoryMaintenanceModelDraft}
              placeholder="deepseek-v4-flash"
              placeholderTextColor={aiLightColors.mutedSoft}
              selectionColor={aiLightColors.coral}
              style={styles.input}
              value={memoryMaintenanceModelDraft}
            />
            <Text style={styles.caption}>自定义模式复用当前选中的模型商和上方 API Key，不会保存第二份 Key。</Text>
            <AiLightButton disabled={!selectedCard || !memoryMaintenanceModelDraft.trim()} label="保存自定义记忆模型" onPress={() => void saveCustomMemoryMaintenanceModel()} variant="outline" />
          </View>
        </View>
      </AiLightCard>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    gap: rhythm.listCardGap,
  },
  selectBox: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  activeSelectBox: {
    borderColor: aiLightColors.coral,
  },
  selectText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
  },
  disabledSelect: {
    opacity: 0.62,
  },
  disabledSelectText: {
    color: aiLightColors.mutedSoft,
  },
  dropdownPanel: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dropdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  selectedDropdownRow: {
    backgroundColor: aiLightColors.card,
  },
  dropdownText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
  },
  selectedDropdownText: {
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  fieldGroup: {
    gap: rhythm.fieldContentGap,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  infoToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  sectionDivider: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
  },
  advancedToggle: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  advancedPanel: {
    gap: rhythm.cardContentGap,
  },
  fieldLabel: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  statusPanel: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  maintenanceResultBanner: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    marginBottom: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  maintenanceResultSuccess: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.coral,
  },
  maintenanceResultWarning: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coralActive,
  },
  maintenanceResultError: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coralActive,
  },
  maintenanceResultInfo: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
  },
  maintenanceResultCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  maintenanceResultTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  statusValue: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  modeOption: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  selectedModeOption: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coral,
  },
  modeOptionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  selectedModeOptionText: {
    color: aiLightColors.coralActive,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.78,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});
