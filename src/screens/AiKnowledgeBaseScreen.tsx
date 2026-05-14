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
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
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
      const created = await createKnowledgeBase({ category, description, name, space });
      setName('');
      setDescription('');
      setSelectedId(created.id);
      setStatus('知识库已创建。');
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
      subtitle={`${spaceLabel} · 本地知识库`}
      title="知识库"
    >
      <View style={styles.createPanel}>
        <Text style={styles.sectionTitle}>新建知识库</Text>
        <TextInput
          onChangeText={setName}
          placeholder="知识库名称"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          value={name}
        />
        <TextInput
          onChangeText={setCategory}
          placeholder="分类，例如 general / customer_project"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          value={category}
        />
        <TextInput
          multiline
          onChangeText={setDescription}
          placeholder="说明，可留空"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={[styles.input, styles.textarea]}
          textAlignVertical="top"
          value={description}
        />
        <PrimaryButton disabled={!name.trim()} label="创建知识库" onPress={() => void handleCreate()} variant="outline" />
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
                  <Text style={styles.kbMeta}>{item.category}{item.description ? ` · ${item.description}` : ''}</Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.sectionTitle}>还没有知识库</Text>
            <Text style={styles.caption}>创建后可导入手写材料、TXT、Markdown、PDF、DOCX 或从已有 IP 生成资料。</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="导入材料" onPress={() => onImportMaterial(selected?.id)} variant="outline" />
        <PrimaryButton label="材料列表" onPress={() => onOpenMaterials(selected?.id)} variant="outline" />
        <PrimaryButton
          disabled={!selected}
          label="开始知识库会话"
          onPress={() => {
            if (selected) {
              onStartChat(selected.id, `${selected.name} 知识库`);
            }
          }}
        />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
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
  caption: {
    ...typography.textStyles.caption,
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
  textarea: {
    minHeight: 88,
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
  kbMeta: {
    ...typography.textStyles.caption,
  },
  emptyCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[4],
  },
  actions: {
    gap: rhythm.inlineGap,
  },
});
