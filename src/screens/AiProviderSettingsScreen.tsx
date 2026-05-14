import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
  const [status, setStatus] = useState<string | null>(null);

  const orderedCards = useMemo(() => [...cards.filter((card) => !isOtherProvider(card)), ...cards.filter(isOtherProvider)], [cards]);
  const selectedCard = orderedCards.find((card) => card.provider.id === selectedProviderId) ?? orderedCards[0] ?? null;
  const selectedIsOtherProvider = selectedCard ? isOtherProvider(selectedCard) : false;
  const chatModels = selectedCard?.models.filter((model) => model.supportsChat) ?? [];
  const selectedModel = chatModels.find((model) => model.modelId === selectedCard?.provider.defaultChatModelId) ?? null;

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
    setStatus('处理中...');
    try {
      if (selectedIsOtherProvider) {
        await saveProviderBaseUrl(space, selectedCard.provider.id, baseUrlDraft);
      }
      const apiKey = apiDraft.trim();
      await saveProviderApiKey(selectedCard.provider.id, apiKey);
      setApiDraft(apiKey);
      setStatus('已保存。');
      await loadProviders();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function selectModel(model: AiProviderModelRecord) {
    setStatus('处理中...');
    try {
      await saveProviderDefaultModels(space, model.providerId, { defaultChatModelId: model.modelId });
      setModelSheetVisible(false);
      setStatus('已选择。');
      await loadProviders();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '选择失败');
    }
  }

  async function saveManualModel() {
    if (!selectedCard || !manualModelDraft.trim()) {
      return;
    }
    setStatus('处理中...');
    try {
      await saveManualChatModel(space, selectedCard.provider.id, manualModelDraft);
      setManualModelDraft('');
      setStatus('已保存。');
      await loadProviders();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
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

        {status ? <Text style={styles.status}>{status}</Text> : null}
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
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
});
