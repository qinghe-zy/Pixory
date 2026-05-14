import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { listProviderCards, saveManualChatModel, saveProviderDefaultModels } from '../ai/aiProviderService';
import type { AiProviderModelRecord } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiModelPickerScreenProps {
  space: PixorySpace;
  providerId?: string;
  onBack: () => void;
}

type ProviderCard = Awaited<ReturnType<typeof listProviderCards>>[number];
const MANUAL_MODEL_POLICY_LABEL = '手动模型 ID';

export function AiModelPickerScreen({ space, providerId, onBack }: AiModelPickerScreenProps) {
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [manualModelId, setManualModelId] = useState('');

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const nextCards = await listProviderCards(space);
      setCards(providerId ? nextCards.filter((card) => card.provider.id === providerId) : nextCards);
    } finally {
      setLoading(false);
    }
  }, [providerId, space]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const rows = useMemo(
    () =>
      cards.flatMap((card) =>
        card.models.map((model) => ({
          model,
          providerDisplayName: card.provider.displayName,
          selectedChat: card.provider.defaultChatModelId === model.modelId,
          selectedEmbedding: card.provider.defaultEmbeddingModelId === model.modelId,
        }))
      ),
    [cards]
  );

  async function selectModel(model: AiProviderModelRecord) {
    await saveProviderDefaultModels(space, model.providerId, {
      defaultChatModelId: model.supportsChat ? model.modelId : undefined,
      defaultEmbeddingModelId: model.supportsEmbedding ? model.modelId : undefined,
    });
    setStatus(`${model.displayName} 已选择。`);
    await loadModels();
  }

  async function saveManualModel() {
    const targetProviderId = providerId ?? cards[0]?.provider.id;
    if (!targetProviderId) {
      setStatus('请先添加账号。');
      return;
    }
    await saveManualChatModel(space, targetProviderId, manualModelId);
    setManualModelId('');
    setStatus('已保存。');
    await loadModels();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle={providerId ? '当前账号' : '全部账号'}
      title="选择模型"
    >
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {MANUAL_MODEL_POLICY_LABEL ? null : null}

      <View style={styles.manualPanel}>
        <Text style={styles.modelName}>自定义模型</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setManualModelId}
          placeholder="例如 deepseek-chat 或 custom-model"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          value={manualModelId}
        />
        <PrimaryButton disabled={!manualModelId.trim()} label="保存" onPress={() => void saveManualModel()} variant="outline" />
      </View>

      <View style={styles.list}>
        {rows.map(({ model, providerDisplayName, selectedChat, selectedEmbedding }) => (
          <Pressable
            accessibilityRole="button"
            key={model.id}
            onPress={() => {
              void selectModel(model);
            }}
            style={({ pressed }) => [styles.row, (selectedChat || selectedEmbedding) && styles.selectedRow, pressed && styles.pressed]}
          >
            <View style={styles.rowHeader}>
              <View style={styles.copy}>
                <Text style={styles.modelName}>{model.displayName}</Text>
                <Text style={styles.providerName}>{providerDisplayName}</Text>
              </View>
              {selectedChat || selectedEmbedding ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={22} /> : null}
            </View>
            <View style={styles.chips}>
              {capabilityChips(model).map((chip) => (
                <Text key={chip} style={styles.chip}>{chip}</Text>
              ))}
            </View>
          </Pressable>
        ))}
      </View>
    </ScreenScaffold>
  );
}

function capabilityChips(model: AiProviderModelRecord): string[] {
  const chips: string[] = [];
  if (model.contextWindowTokens) {
    chips.push(formatContextWindow(model.contextWindowTokens));
  }
  if (model.supportsThinking) {
    chips.push('思路');
  }
  if (model.supportsEmbedding) {
    chips.push('资料');
  }
  if (model.supportsVision) {
    chips.push('图像');
  }
  if (model.supportsTools) {
    chips.push('工具');
  }
  if (chips.length === 0) {
    chips.push(model.supportsChat ? '聊天' : '模型');
  }
  return chips;
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 1_000_000)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return `${tokens}`;
}

const styles = StyleSheet.create({
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  selectedRow: {
    borderColor: colors.primary.light,
  },
  pressed: {
    opacity: 0.78,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  modelName: {
    ...typography.textStyles.bodyStrong,
  },
  providerName: {
    ...typography.textStyles.caption,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  chip: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.primary.active,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  manualPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.fieldContentGap,
    padding: spacing[4],
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
});
