import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { createKnowledgeBase, listKnowledgeBases } from '../ai/aiDocumentService';
import type { AiKnowledgeBaseRecord } from '../database/repositories/aiKnowledgeRepository';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
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
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="资料库"
    >
      <View style={styles.contentStack}>
        <View style={styles.createPanel}>
          <Text style={styles.sectionTitle}>新建资料库</Text>
          <TextInput
            onChangeText={setName}
            placeholder="名称"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.input}
            value={name}
          />
          <PrimaryButton disabled={!name.trim()} label="创建" onPress={() => void handleCreate()} variant="outline" />
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>

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
                    <Ionicons color={colors.primary.active} name={selectedItem ? 'radio-button-on' : 'library-outline'} size={20} />
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
          <PrimaryButton label="导入材料" onPress={() => onImportMaterial(selected?.id)} variant="outline" />
          <PrimaryButton label="材料列表" onPress={() => onOpenMaterials(selected?.id)} variant="outline" />
          <PrimaryButton
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
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.entryCardGap,
  },
  createPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.fieldContentGap,
    padding: spacing[4],
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
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
  list: {
    gap: rhythm.listCardGap,
  },
  kbRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    padding: spacing[3],
  },
  selectedRow: {
    borderColor: colors.primary.light,
  },
  pressed: {
    opacity: 0.78,
  },
  kbIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
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
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing[4],
  },
  actions: {
    gap: rhythm.inlineGap,
  },
});
