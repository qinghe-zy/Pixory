import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { createKnowledgeBase, listKnowledgeBases } from '../ai/aiDocumentService';
import type { AiKnowledgeBaseRecord } from '../database/repositories/aiKnowledgeRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiKnowledgeBaseScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onImportMaterial: (knowledgeBaseId?: string) => void;
  onOpenMaterials: (knowledgeBaseId?: string) => void;
  onStartChat: (knowledgeBaseId: string | undefined, title: string) => void;
}

export function AiKnowledgeBaseScreen({ space, onBack, onImportMaterial, onOpenMaterials, onStartChat }: AiKnowledgeBaseScreenProps) {
  const [items, setItems] = useState<AiKnowledgeBaseRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  async function reload() {
    const nextItems = await listKnowledgeBases(space);
    setItems(nextItems);
    setSelectedId((current) => current ?? nextItems[0]?.id);
  }

  useEffect(() => {
    void reload();
  }, [space]);

  async function handleCreate() {
    try {
      const created = await createKnowledgeBase({ category: 'general', description: '', name, space });
      setName('');
      setSelectedId(created.id);
      setStatus('已创建。');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建失败');
    }
  }

  return (
    <AiLightScaffold
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="资料库"
    >
      <View style={styles.contentStack}>
        <AiLightCard>
          <Text style={styles.sectionTitle}>新建资料库</Text>
          <TextInput
            onChangeText={setName}
            placeholder="名称"
            placeholderTextColor={aiLightColors.mutedSoft}
            selectionColor={aiLightColors.coral}
            style={styles.input}
            value={name}
          />
          <AiLightButton disabled={!name.trim()} label="创建" onPress={() => void handleCreate()} variant="outline" />
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </AiLightCard>

        <View style={styles.list}>
          {items.length ? (
            items.map((item) => {
              const selectedItem = item.id === selectedId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  style={({ pressed }) => [styles.kbRow, selectedItem && styles.selectedRow, pressed && styles.pressed]}
                >
                  <View style={styles.kbIcon}>
                    <Ionicons color={aiLightColors.coralActive} name={selectedItem ? 'radio-button-on' : 'library-outline'} size={20} />
                  </View>
                  <View style={styles.kbCopy}>
                    <Text style={styles.kbName}>{item.name}</Text>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.sectionTitle}>还没有资料库</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <AiLightButton label="导入材料" onPress={() => onImportMaterial(selected?.id)} variant="outline" />
          <AiLightButton label="材料列表" onPress={() => onOpenMaterials(selected?.id)} variant="outline" />
          <AiLightButton
            disabled={!selected}
            label="开始聊天"
            onPress={() => {
              if (selected) {
                onStartChat(selected.id, selected.name);
              }
            }}
          />
        </View>
      </View>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  list: {
    gap: rhythm.listCardGap,
  },
  kbRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[3],
  },
  selectedRow: {
    borderColor: aiLightColors.coral,
  },
  pressed: {
    opacity: 0.78,
  },
  kbIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  kbCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  kbName: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing[4],
  },
  actions: {
    gap: rhythm.inlineGap,
  },
});
