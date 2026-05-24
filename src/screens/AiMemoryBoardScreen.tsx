import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createManualMemory, deleteMemory, listMemoryBoardItems, updateMemoryContent } from '../ai/aiMemoryService';
import type { AiThreadRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiMemoryRecord, AiMemoryScope, AiMemoryType } from '../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';

interface AiMemoryBoardScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
}

const SCOPE_LABELS: Record<AiMemoryScope, string> = {
  global: '全局',
  ip: '当前 IP',
  knowledge_base: '当前知识库',
  role: '当前角色',
  thread: '本会话',
};

const TYPE_LABELS: Record<AiMemoryType, string> = {
  correction: '纠正',
  decision: '决策',
  fact: '事实',
  instruction: '指令',
  preference: '偏好',
  task: '任务',
};

const MEMORY_SCOPE_ORDER: AiMemoryScope[] = ['global', 'role', 'thread', 'ip', 'knowledge_base'];

export function AiMemoryBoardScreen({ space, threadId, onBack }: AiMemoryBoardScreenProps) {
  const [thread, setThread] = useState<AiThreadRecord | null>(null);
  const [memories, setMemories] = useState<AiMemoryRecord[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AiMemoryScope, AiMemoryRecord[]>();
    for (const memory of memories) {
      const list = map.get(memory.scope) ?? [];
      list.push(memory);
      map.set(memory.scope, list);
    }
    return MEMORY_SCOPE_ORDER.map((scope) => ({ items: map.get(scope) ?? [], scope })).filter((group) => group.items.length > 0);
  }, [memories]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextThread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
      setThread(nextThread);
      if (nextThread) {
        setMemories(await listMemoryBoardItems(space, nextThread));
      }
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAddMemory() {
    const content = draft.trim();
    if (!content || !thread) {
      return;
    }
    setLoading(true);
    try {
      await createManualMemory(space, {
        content,
        scope: 'thread',
        scopeId: thread.id,
        space,
        type: 'fact',
      });
      setDraft('');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '添加记忆失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(memoryId: string) {
    const content = editingText.trim();
    if (!content) {
      return;
    }
    setLoading(true);
    try {
      await updateMemoryContent(space, memoryId, content);
      setEditingId(null);
      setEditingText('');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新记忆失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(memoryId: string) {
    setLoading(true);
    try {
      await deleteMemory(space, memoryId);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除记忆失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AiLightScaffold loading={loading} onBack={onBack} scrollable subtitle="本地可控记忆" title="AI 记住了这些">
      <View style={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <AiLightCard>
          <Text style={styles.sectionTitle}>手动添加</Text>
          <AiLightTextareaRow label="记忆内容" minHeight={72} onChangeText={setDraft} placeholder="例如：这个 IP 的主色调是 #FF0033" value={draft} />
          <AiLightButton label="添加到本会话记忆" loading={loading} onPress={() => void handleAddMemory()} />
        </AiLightCard>

        {grouped.length === 0 ? (
          <AiLightCard>
            <Text style={styles.emptyTitle}>还没有可管理的记忆。</Text>
            <Text style={styles.caption}>开启深度记忆后，明确偏好、纠正和决定会出现在这里，也可以手动添加。</Text>
          </AiLightCard>
        ) : null}

        {grouped.map((group) => (
          <AiLightCard key={group.scope}>
            <Text style={styles.sectionTitle}>{SCOPE_LABELS[group.scope]}</Text>
            <View style={styles.memoryList}>
              {group.items.map((memory) => (
                <View key={memory.id} style={styles.memoryItem}>
                  {editingId === memory.id ? (
                    <TextInput
                      multiline
                      onChangeText={setEditingText}
                      placeholder="编辑记忆内容"
                      placeholderTextColor={aiLightColors.mutedSoft}
                      selectionColor={aiLightColors.coral}
                      style={styles.editInput}
                      textAlignVertical="top"
                      value={editingText}
                    />
                  ) : (
                    <>
                      <Text style={styles.memoryContent}>{memory.content}</Text>
                      <Text style={styles.caption}>
                        {TYPE_LABELS[memory.type]} · 重要度 {memory.importance} · 可信度 {Math.round(memory.confidence * 100)}%
                      </Text>
                    </>
                  )}
                  <View style={styles.rowActions}>
                    {editingId === memory.id ? (
                      <>
                        <Pressable accessibilityRole="button" onPress={() => void handleSaveEdit(memory.id)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.coralActive} name="checkmark-outline" size={16} />
                          <Text style={styles.actionLabel}>保存</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={() => setEditingId(null)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.muted} name="close-outline" size={16} />
                          <Text style={styles.actionLabel}>取消</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setEditingId(memory.id);
                            setEditingText(memory.content);
                          }}
                          style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                        >
                          <Ionicons color={aiLightColors.coralActive} name="create-outline" size={15} />
                          <Text style={styles.actionLabel}>编辑</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={() => void handleDelete(memory.id)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={15} />
                          <Text style={styles.actionLabel}>删除</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </AiLightCard>
        ))}
      </View>
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  emptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  memoryList: {
    gap: rhythm.compactGridGap,
  },
  memoryItem: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  memoryContent: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  iconAction: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[2],
  },
  actionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '600',
  },
  editInput: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    minHeight: 72,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  pressed: {
    opacity: 0.78,
  },
});
