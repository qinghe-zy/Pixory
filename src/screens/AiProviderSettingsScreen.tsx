import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FeedbackBanner, type FeedbackTone } from '../components/FeedbackBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  getSavedProviderApiKey,
  listProviderCards,
  saveManualChatModel,
  saveProviderApiKey,
  saveProviderBaseUrl,
  saveProviderDefaultModels,
  selectProvider,
  syncProviderModels,
  testProvider,
} from '../ai/aiProviderService';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { AiProviderModelRecord } from '../ai/types';
import type { PixorySpace } from '../database';

interface AiProviderSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

type ProviderCard = Awaited<ReturnType<typeof listProviderCards>>[number];

function isOtherProvider(card: ProviderCard): boolean {
  return card.provider.providerType === 'openai_compatible' || card.provider.providerType === 'custom';
}

export function AiProviderSettingsScreen({ space, onBack }: AiProviderSettingsScreenProps) {
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerSheetVisible, setProviderSheetVisible] = useState(false);
  const [modelSheetVisible, setModelSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiDraft, setApiDraft] = useState('');
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [manualModelDraft, setManualModelDraft] = useState('');
  const [visibleKey, setVisibleKey] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone; title?: string } | null>(null);

  const orderedCards = useMemo(() => [...cards.filter((card) => !isOtherProvider(card)), ...cards.filter(isOtherProvider)], [cards]);
  const selectedCard = orderedCards.find((card) => card.provider.id === selectedProviderId) ?? orderedCards[0] ?? null;
  const selectedIsOtherProvider = selectedCard ? isOtherProvider(selectedCard) : false;
  const chatModels = selectedCard?.models.filter((model) => model.supportsChat) ?? [];
  const embeddingModels = selectedCard?.models.filter((model) => model.supportsEmbedding) ?? [];
  const selectedModel = chatModels.find((model) => model.modelId === selectedCard?.provider.defaultChatModelId) ?? null;
  const selectedEmbeddingModel = embeddingModels.find((model) => model.modelId === selectedCard?.provider.defaultEmbeddingModelId) ?? null;

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const nextCards = await listProviderCards(space);
      setCards(nextCards);
      setSelectedProviderId((current) => current ?? nextCards[0]?.provider.id ?? null);
      setBaseUrlDraft((current) => current || nextCards.find((card) => card.provider.id === selectedProviderId)?.provider.baseUrl || '');
    } finally {
      setLoading(false);
    }
  }, [selectedProviderId, space]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!selectedProviderId) {
      setApiDraft('');
      return;
    }
    let active = true;
    void getSavedProviderApiKey(selectedProviderId).then((apiKey) => {
      if (active) {
        setApiDraft(apiKey ?? '');
      }
    });
    return () => {
      active = false;
    };
  }, [selectedProviderId]);

  async function chooseProvider(providerId: string) {
    const nextCard = orderedCards.find((card) => card.provider.id === providerId) ?? null;
    setSelectedProviderId(providerId);
    setProviderSheetVisible(false);
    setModelSheetVisible(false);
    setApiDraft('');
    setBaseUrlDraft(nextCard?.provider.baseUrl ?? '');
    setManualModelDraft('');
    setStatus(null);
    await selectProvider(space, providerId);
    await loadProviders();
  }

  async function saveSelectedApiKey() {
    if (!selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim())) {
      return;
    }
    setStatus({ message: '正在保存模型账号设置...', tone: 'info' });
    try {
      if (selectedIsOtherProvider) {
        await saveProviderBaseUrl(space, selectedCard.provider.id, baseUrlDraft);
      }
      const apiKey = apiDraft.trim();
      await saveProviderApiKey(selectedCard.provider.id, apiKey);
      setApiDraft(apiKey);
      setStatus({ message: '模型账号已保存，后续对话会使用当前配置。', tone: 'success', title: '保存成功' });
      await loadProviders();
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : '保存失败', tone: 'error' });
    }
  }

  async function selectModel(model: AiProviderModelRecord) {
    setStatus({ message: '正在切换默认对话模型...', tone: 'info' });
    try {
      await saveProviderDefaultModels(space, model.providerId, { defaultChatModelId: model.modelId });
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

  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const saveDisabled = !selectedCard || !apiDraft.trim() || (selectedIsOtherProvider && !baseUrlDraft.trim());

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="模型账号"
    >
      <View style={styles.accountCard}>
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
            <Ionicons color={colors.text.tertiary} name={providerSheetVisible ? 'chevron-up' : 'chevron-down'} size={18} />
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
                    {selected ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={18} /> : null}
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
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
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
              placeholderTextColor={colors.text.placeholder}
              secureTextEntry={!visibleKey}
              selectionColor={colors.primary.default}
              style={styles.input}
              value={apiDraft}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleKey((current) => !current)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={colors.text.secondary} name={visibleKey ? 'eye-off-outline' : 'eye-outline'} size={18} />
            </Pressable>
          </View>
          <PrimaryButton disabled={saveDisabled} label="保存" onPress={() => void saveSelectedApiKey()} variant="outline" />
          <View style={styles.inlineActions}>
            <PrimaryButton label="测试连接" onPress={() => void testSelectedProvider()} variant="ghost" />
            <PrimaryButton label="同步模型" onPress={() => void syncSelectedProviderModels()} variant="ghost" />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>模型</Text>
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
              color={chatModels.length > 0 ? colors.text.tertiary : colors.text.placeholder}
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
                    {selected ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

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
                    {selected ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.caption}>{selectedEmbeddingModel ? `当前：${selectedEmbeddingModel.displayName}` : '选择后，材料会在导入后尝试生成本地向量索引。'}</Text>
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
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.input}
              value={manualModelDraft}
            />
            <PrimaryButton disabled={!manualModelDraft.trim()} label="保存" onPress={() => void saveManualModel()} variant="outline" />
          </View>
        ) : null}

        {status ? <FeedbackBanner message={status.message} title={status.title} tone={status.tone} /> : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  accountCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  selectBox: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  activeSelectBox: {
    borderColor: colors.primary.light,
  },
  selectText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
  },
  disabledSelect: {
    opacity: 0.62,
  },
  disabledSelectText: {
    color: colors.text.placeholder,
  },
  dropdownPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
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
    backgroundColor: colors.primary.weak,
  },
  dropdownText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
  },
  selectedDropdownText: {
    color: colors.primary.active,
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
  fieldLabel: {
    ...typography.textStyles.bodyStrong,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.default,
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
    color: colors.text.secondary,
  },
});
