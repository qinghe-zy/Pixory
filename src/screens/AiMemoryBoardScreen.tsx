import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  changeMemoryScope,
  confirmMemory,
  createManualMemory,
  deleteMemory,
  listMemoryBoardItems,
  updateMemoryContent,
} from '../ai/aiMemoryService';
import type { AiThreadRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AppDialog } from '../components/AppDialog';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiMemoryRecord, AiMemoryScope } from '../database/repositories/aiThreadRepository';
import { radius, rhythm, spacing, typography } from '../design/tokens';

interface AiMemoryBoardScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
}

const SCOPE_LABELS: Record<AiMemoryScope, string> = {
  global: '所有会话',
  ip: '当前 IP',
  knowledge_base: '当前知识库',
  role: '当前角色',
  thread: '仅本会话',
};

const SCOPE_OPTIONS: AiMemoryScope[] = ['thread', 'role', 'ip', 'global'];

function isConfirmed(memory: AiMemoryRecord): boolean {
  return memory.memoryLane === 'confirmed' || (!memory.memoryLane && memory.sourceKind === 'manual');
}

function isArchived(memory: AiMemoryRecord): boolean {
  return memory.status === 'stale' || memory.memoryLane === 'archive' || memory.status === 'deleted';
}

function scopeIdFor(thread: AiThreadRecord, scope: AiMemoryScope): string | null {
  if (scope === 'thread') return thread.id;
  if (scope === 'role') return thread.roleCardId;
  if (scope === 'ip') return thread.boundIpId == null ? null : String(thread.boundIpId);
  return null;
}

export function AiMemoryBoardScreen({ space, threadId, onBack }: AiMemoryBoardScreenProps) {
  const [thread, setThread] = useState<AiThreadRecord | null>(null);
  const [memories, setMemories] = useState<AiMemoryRecord[]>([]);
  const [archived, setArchived] = useState<AiMemoryRecord[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AiMemoryRecord | null>(null);
  const [editingText, setEditingText] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualScope, setManualScope] = useState<AiMemoryScope>('thread');
  const [manualVisible, setManualVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiMemoryRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextThread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
      setThread(nextThread);
      if (!nextThread) {
        setMemories([]);
        setArchived([]);
        return;
      }
      const [all, stale] = await Promise.all([
        listMemoryBoardItems(space, nextThread, { status: 'active', limit: 120 }),
        listMemoryBoardItems(space, nextThread, { status: 'stale', limit: 120 }),
      ]);
      setMemories(all.filter((memory) => !isArchived(memory)));
      setArchived(stale.filter(isArchived));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('zh-CN');
    const source = showArchived ? archived : memories;
    return source.filter((memory) => !normalized || memory.content.toLocaleLowerCase('zh-CN').includes(normalized));
  }, [archived, memories, search, showArchived]);
  const confirmed = visible.filter(isConfirmed);
  const working = visible.filter((memory) => !isConfirmed(memory) && !isArchived(memory));
  const showSearch = memories.length + archived.length > 8;
  const availableScopes = thread?.boundIpId == null
    ? SCOPE_OPTIONS.filter((scope) => scope !== 'ip')
    : SCOPE_OPTIONS;

  async function saveEdit() {
    if (!selected || !editingText.trim()) return;
    setLoading(true);
    try {
      await updateMemoryContent(space, selected.id, editingText.trim(), selected.memoryVersion);
      setSelected(null);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新失败');
    } finally {
      setLoading(false);
    }
  }

  async function addManual() {
    if (!thread || !manualText.trim()) return;
    const scopeId = scopeIdFor(thread, manualScope);
    if (manualScope !== 'global' && !scopeId) {
      setStatus('当前会话不支持这个作用范围。');
      return;
    }
    setLoading(true);
    try {
      await createManualMemory(space, {
        content: manualText.trim(),
        scope: manualScope,
        scopeId,
        space,
        type: 'fact',
      });
      setManualText('');
      setManualVisible(false);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '添加失败');
    } finally {
      setLoading(false);
    }
  }

  async function makeConfirmed(memory: AiMemoryRecord) {
    setLoading(true);
    try {
      await confirmMemory(space, memory.id, memory.memoryVersion);
      setSelected(null);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存长期记忆失败');
    } finally {
      setLoading(false);
    }
  }

  async function moveToScope(memory: AiMemoryRecord, scope: AiMemoryScope) {
    if (!thread) return;
    const scopeId = scopeIdFor(thread, scope);
    if (scope !== 'global' && !scopeId) {
      setStatus('当前会话不支持这个作用范围。');
      return;
    }
    setLoading(true);
    try {
      await changeMemoryScope(space, memory.id, scope, scopeId, memory.memoryVersion);
      setSelected(null);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '修改范围失败');
    } finally {
      setLoading(false);
    }
  }

  async function removeMemory() {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await deleteMemory(space, deleteTarget.id, deleteTarget.memoryVersion);
      setDeleteTarget(null);
      setSelected(null);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除失败');
    } finally {
      setLoading(false);
    }
  }

  const renderMemory = (memory: AiMemoryRecord) => (
    <Pressable
      key={memory.id}
      accessibilityRole="button"
      onPress={() => {
        setSelected(memory);
        setEditingText(memory.content);
      }}
      style={({ pressed }) => [styles.memoryItem, pressed && styles.pressed]}
    >
      <Text style={styles.memoryContent}>{memory.content}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.scopeText}>{SCOPE_LABELS[memory.scope] ?? '当前会话'}</Text>
        {memory.status === 'stale' ? <Text style={styles.staleText}>已移除</Text> : null}
        {memory.sourceKind === 'manual' ? <Text style={styles.scopeText}>手动</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <>
      <AiLightScaffold
        loading={loading}
        onBack={onBack}
        scrollable
        title="AI 记住了这些"
        rightAction={(
          <Pressable accessibilityRole="button" onPress={() => setManualVisible(true)} style={styles.headerButton}>
            <Ionicons color={aiLightColors.primary} name="add-outline" size={24} />
          </Pressable>
        )}
      >
        <View style={styles.content}>
          <Text style={styles.subtitle}>只展示会影响后续聊天的内容，修改会立即生效。</Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
          {showSearch ? (
            <TextInput
              onChangeText={setSearch}
              placeholder="搜索记忆"
              placeholderTextColor={aiLightColors.mutedSoft}
              style={styles.search}
              value={search}
            />
          ) : null}
          {!showArchived ? (
            <>
              <Section title="长期记住" caption="确认后会稳定用于相关会话。">
                {confirmed.length ? confirmed.map(renderMemory) : <Empty text="还没有长期记住的内容。" />}
              </Section>
              <Section title="最近对话" caption="先放在这里，系统会谨慎观察，不会轻易长期保存。">
                {working.length ? working.map(renderMemory) : <Empty text="最近还没有形成可用记忆。" />}
              </Section>
              {archived.length ? (
                <AiLightButton label="查看已移除内容" onPress={() => setShowArchived(true)} variant="outline" />
              ) : null}
            </>
          ) : (
            <>
              <Section title="已移除内容" caption="这些内容不会再进入回答。">
                {visible.length ? visible.map(renderMemory) : <Empty text="没有已移除内容。" />}
              </Section>
              <AiLightButton label="返回当前记忆" onPress={() => setShowArchived(false)} variant="outline" />
            </>
          )}
        </View>
      </AiLightScaffold>

      <AppDialog
        accent="ai"
        onClose={() => setManualVisible(false)}
        onPrimary={() => void addManual()}
        primaryDisabled={loading || !manualText.trim()}
        primaryLabel="添加"
        title="添加一条记忆"
        visible={manualVisible}
      >
        <View style={styles.dialogBody}>
          <View style={styles.scopeOptions}>
            {availableScopes.map((scope) => (
              <Pressable key={scope} onPress={() => setManualScope(scope)} style={[styles.scopeChip, manualScope === scope && styles.scopeChipActive]}>
                <Text style={[styles.scopeChipText, manualScope === scope && styles.scopeChipTextActive]}>{SCOPE_LABELS[scope]}</Text>
              </Pressable>
            ))}
          </View>
          <AiLightTextareaRow label="内容" minHeight={72} onChangeText={setManualText} placeholder="例如：我不喜欢太辣的食物。" value={manualText} />
        </View>
      </AppDialog>

      <AppDialog
        accent="ai"
        onClose={() => setSelected(null)}
        onPrimary={() => (selected ? void saveEdit() : undefined)}
        primaryDisabled={loading || !selected || !editingText.trim()}
        primaryLabel="保存修改"
        title="修改记忆"
        visible={Boolean(selected)}
      >
        {selected ? (
          <View style={styles.dialogBody}>
            <TextInput multiline onChangeText={setEditingText} style={styles.editInput} textAlignVertical="top" value={editingText} />
            {!isConfirmed(selected) && !isArchived(selected) ? (
              <AiLightButton label="长期记住" loading={loading} onPress={() => void makeConfirmed(selected)} variant="outline" />
            ) : null}
            <Text style={styles.dialogLabel}>作用范围</Text>
            <View style={styles.scopeOptions}>
              {availableScopes.map((scope) => (
                <Pressable key={scope} onPress={() => void moveToScope(selected, scope)} style={[styles.scopeChip, selected.scope === scope && styles.scopeChipActive]}>
                  <Text style={[styles.scopeChipText, selected.scope === scope && styles.scopeChipTextActive]}>{SCOPE_LABELS[scope]}</Text>
                </Pressable>
              ))}
            </View>
            <AiLightButton label="忘记这条" loading={loading} onPress={() => setDeleteTarget(selected)} variant="outline" />
          </View>
        ) : null}
      </AppDialog>

      <AppDialog
        accent="ai"
        danger
        message="删除后，这条内容不会再进入后续回答；原始证据仍可按删除凭证审计。"
        onClose={() => setDeleteTarget(null)}
        onPrimary={() => void removeMemory()}
        primaryLabel="删除"
        title="忘记这条记忆？"
        visible={Boolean(deleteTarget)}
      />
    </>
  );
}

function Section({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <AiLightCard>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.caption}>{caption}</Text>
      <View style={styles.list}>{children}</View>
    </AiLightCard>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { gap: rhythm.listCardGap },
  subtitle: { ...typography.textStyles.caption, color: aiLightColors.muted },
  status: { ...typography.textStyles.caption, color: aiLightColors.primaryActive },
  sectionTitle: { ...typography.textStyles.bodyStrong, color: aiLightColors.ink },
  caption: { ...typography.textStyles.caption, color: aiLightColors.muted, marginTop: spacing[1] },
  list: { gap: rhythm.compactGridGap, marginTop: spacing[3] },
  empty: { ...typography.textStyles.caption, color: aiLightColors.mutedSoft, paddingVertical: spacing[2] },
  memoryItem: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    padding: spacing[3],
  },
  memoryContent: { ...typography.textStyles.body, color: aiLightColors.ink },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  scopeText: { ...typography.textStyles.micro, color: aiLightColors.primaryActive },
  staleText: { ...typography.textStyles.micro, color: aiLightColors.mutedSoft },
  search: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 42,
    paddingHorizontal: spacing[3],
  },
  headerButton: { padding: spacing[1] },
  dialogBody: { gap: rhythm.compactGridGap },
  dialogLabel: { ...typography.textStyles.caption, color: aiLightColors.muted },
  editInput: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 96,
    padding: spacing[3],
  },
  scopeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  scopeChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  scopeChipActive: { backgroundColor: aiLightColors.surface, borderColor: aiLightColors.primary },
  scopeChipText: { ...typography.textStyles.caption, color: aiLightColors.muted },
  scopeChipTextActive: { color: aiLightColors.primaryActive, fontWeight: '600' },
  pressed: { opacity: 0.78 },
});
