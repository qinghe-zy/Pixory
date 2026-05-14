import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { listProviderCards, saveProviderDefaultModels } from '../ai/aiProviderService';
import type { AiProviderModelRecord } from '../ai/types';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiModelPickerScreenProps {
  space: PixorySpace;
  providerId?: string;
  onBack: () => void;
}

type ProviderCard = Awaited<ReturnType<typeof listProviderCards>>[number];

export function AiModelPickerScreen({ space, providerId, onBack }: AiModelPickerScreenProps) {
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
    setStatus(`${model.displayName} 已设为${model.supportsEmbedding && !model.supportsChat ? '默认 Embedding 模型' : '默认聊天模型'}。`);
    await loadModels();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      loading={loading}
      onBack={onBack}
      scrollable
      subtitle={providerId ? '当前提供商模型' : '全部提供商模型'}
      title="选择模型"
    >
      {status ? <Text style={styles.status}>{status}</Text> : null}

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
                <Text style={styles.providerName}>{providerDisplayName} · {model.modelId}</Text>
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
    chips.push('Thinking');
  }
  if (model.supportsEmbedding) {
    chips.push('Embedding');
  }
  if (model.supportsVision) {
    chips.push('Vision 预留');
  }
  if (model.supportsTools) {
    chips.push('Tool calls');
  }
  if (chips.length === 0) {
    chips.push(model.supportsChat ? 'Chat' : '模型');
  }
  return chips;
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 1_000_000)}M 上下文`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K 上下文`;
  }
  return `${tokens} 上下文`;
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
});
