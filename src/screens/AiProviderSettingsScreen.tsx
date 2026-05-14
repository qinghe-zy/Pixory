import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  listProviderCards,
  saveProviderApiKey,
  saveProviderBaseUrl,
  syncProviderModels,
  testProvider,
} from '../ai/aiProviderService';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiProviderSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenModelPicker: (providerId?: string) => void;
}

type ProviderCard = Awaited<ReturnType<typeof listProviderCards>>[number];

export function AiProviderSettingsScreen({ space, onBack, onOpenModelPicker }: AiProviderSettingsScreenProps) {
  const [cards, setCards] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [baseUrlDrafts, setBaseUrlDrafts] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [statusByProvider, setStatusByProvider] = useState<Record<string, string>>({});

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const nextCards = await listProviderCards(space);
      setCards(nextCards);
      setBaseUrlDrafts((current) => {
        const next = { ...current };
        for (const card of nextCards) {
          next[card.provider.id] = next[card.provider.id] ?? card.provider.baseUrl ?? '';
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  async function runProviderAction(providerId: string, action: () => Promise<string>) {
    setStatusByProvider((current) => ({ ...current, [providerId]: '处理中...' }));
    try {
      const message = await action();
      setStatusByProvider((current) => ({ ...current, [providerId]: message }));
      await loadProviders();
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败';
      setStatusByProvider((current) => ({ ...current, [providerId]: message }));
    }
  }

  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

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
      {cards.map((card) => {
        const providerId = card.provider.id;
        const keyDraft = keyDrafts[providerId] ?? '';
        const baseUrlDraft = baseUrlDrafts[providerId] ?? '';
        const hasEmbedding = card.provider.embeddingEnabled || card.models.some((model) => model.supportsEmbedding);

        return (
          <View key={providerId} style={styles.providerCard}>
            <View style={styles.providerHeader}>
              <View style={styles.providerTitleWrap}>
                <Text style={styles.providerTitle}>{card.provider.displayName}</Text>
                <Text style={styles.providerMeta}>{card.hasApiKey ? '已保存' : '未保存'}</Text>
              </View>
              <Ionicons color={colors.primary.active} name="server-outline" size={22} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>密钥</Text>
              <View style={styles.inputRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => setKeyDrafts((current) => ({ ...current, [providerId]: value }))}
                  placeholder={card.hasApiKey ? '已保存，输入新密钥可替换' : '输入密钥'}
                  placeholderTextColor={colors.text.placeholder}
                  secureTextEntry={!visibleKeys[providerId]}
                  selectionColor={colors.primary.default}
                  style={styles.input}
                  value={keyDraft}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setVisibleKeys((current) => ({ ...current, [providerId]: !current[providerId] }))}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.text.secondary} name={visibleKeys[providerId] ? 'eye-off-outline' : 'eye-outline'} size={18} />
                </Pressable>
              </View>
              <PrimaryButton
                disabled={!keyDraft.trim()}
                label="保存密钥"
                onPress={() =>
                  runProviderAction(providerId, async () => {
                    await saveProviderApiKey(providerId, keyDraft.trim());
                    setKeyDrafts((current) => ({ ...current, [providerId]: '' }));
                    return '已保存。';
                  })
                }
                variant="outline"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>接口地址</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => setBaseUrlDrafts((current) => ({ ...current, [providerId]: value }))}
                placeholder="https://api.example.com/v1"
                placeholderTextColor={colors.text.placeholder}
                selectionColor={colors.primary.default}
                style={styles.input}
                value={baseUrlDraft}
              />
              <PrimaryButton
                label="保存"
                onPress={() =>
                  runProviderAction(providerId, async () => {
                    await saveProviderBaseUrl(space, providerId, baseUrlDraft);
                    return '已保存。';
                  })
                }
                variant="outline"
              />
            </View>

            <View style={styles.modelRows}>
              <ModelSettingRow
                label="聊天模型"
                value={card.provider.defaultChatModelId ?? '未选择'}
                onPress={() => onOpenModelPicker(providerId)}
              />
              {hasEmbedding ? (
                <ModelSettingRow
                  label="资料模型"
                  value={card.provider.defaultEmbeddingModelId ?? '未选择'}
                  onPress={() => onOpenModelPicker(providerId)}
                />
              ) : null}
            </View>

            <View style={styles.actions}>
              <PrimaryButton
                label="测试连接"
                onPress={() =>
                  runProviderAction(providerId, async () => {
                    await testProvider(providerId, space);
                    return '可用。';
                  })
                }
                variant="outline"
              />
              <PrimaryButton
                label="更新列表"
                onPress={() =>
                  runProviderAction(providerId, async () => {
                    const result = await syncProviderModels(providerId, space);
                    return result.synced > 0 ? `已更新 ${result.synced} 个。` : `已更新 ${result.fallback} 个。`;
                  })
                }
              />
            </View>

            {statusByProvider[providerId] ? <Text style={styles.status}>{statusByProvider[providerId]}</Text> : null}
          </View>
        );
      })}
    </ScreenScaffold>
  );
}

interface ModelSettingRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

function ModelSettingRow({ label, value, onPress }: ModelSettingRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.modelRow, pressed && styles.pressed]}>
      <View style={styles.providerTitleWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.providerMeta}>{value}</Text>
      </View>
      <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  providerCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  providerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  providerTitleWrap: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  providerTitle: {
    ...typography.textStyles.sectionTitle,
  },
  providerMeta: {
    ...typography.textStyles.caption,
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
  modelRows: {
    gap: rhythm.listCardGap,
  },
  modelRow: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    padding: spacing[3],
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
});
