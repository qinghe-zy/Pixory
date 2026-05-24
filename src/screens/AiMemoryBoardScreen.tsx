import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  createManualMemory,
  deleteMemory,
  deleteSummarySegment,
  formatSummaryRange,
  listMemoryBoardItems,
  listSummarySegments,
  loadMemoryMaintenanceStatus,
  rerunSummaryMaintenance,
  updateMemoryContent,
} from '../ai/aiMemoryService';
import { getUserProfile, updateUserProfile } from '../ai/aiMemoryProfileService';
import type { AiThreadRecord } from '../ai/types';
import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightCard } from '../components/ai/AiLightCard';
import { AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiMemoryRecord, AiMemoryScope, AiMemoryType, AiThreadSummarySegmentRecord, AiUserProfileRecord } from '../database/repositories/aiThreadRepository';
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
const MEMORY_TYPE_FILTERS: Array<'all' | AiMemoryType> = ['all', 'preference', 'fact', 'correction', 'task', 'instruction', 'decision'];

function formatMemoryImportanceLabel(value: number): string {
  if (value >= 4) {
    return '很重要';
  }
  if (value >= 2) {
    return '较重要';
  }
  return '普通重要';
}

function formatMemoryConfidenceLabel(value: number): string {
  if (value >= 0.85) {
    return '判断很可信';
  }
  if (value >= 0.65) {
    return '判断较可信';
  }
  return '待确认';
}

interface MemoryMaintenanceStatus {
  lastMaintenanceCompletedAt: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelId: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceUsedFallback: boolean;
  profileUpdatedAt: string | null;
  summarySegmentCount: number;
  uncompressedRoundCount: number;
}

export function AiMemoryBoardScreen({ space, threadId, onBack }: AiMemoryBoardScreenProps) {
  const [thread, setThread] = useState<AiThreadRecord | null>(null);
  const [memories, setMemories] = useState<AiMemoryRecord[]>([]);
  const [profile, setProfile] = useState<AiUserProfileRecord | null>(null);
  const [summarySegments, setSummarySegments] = useState<AiThreadSummarySegmentRecord[]>([]);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<'all' | AiMemoryType>('all');
  const [profileDraft, setProfileDraft] = useState('');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingDeleteMemory, setPendingDeleteMemory] = useState<AiMemoryRecord | null>(null);
  const [pendingDeleteSummary, setPendingDeleteSummary] = useState<AiThreadSummarySegmentRecord | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<AiMemoryScope, AiMemoryRecord[]>();
    const visibleMemories = memoryTypeFilter === 'all' ? memories : memories.filter((memory) => memory.type === memoryTypeFilter);
    for (const memory of visibleMemories) {
      const list = map.get(memory.scope) ?? [];
      list.push(memory);
      map.set(memory.scope, list);
    }
    return MEMORY_SCOPE_ORDER.map((scope) => ({ items: map.get(scope) ?? [], scope })).filter((group) => group.items.length > 0);
  }, [memories, memoryTypeFilter]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextThread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
      setThread(nextThread);
      const nextProfile = await getUserProfile(space);
      setProfile(nextProfile);
      setProfileDraft(nextProfile?.profileText ?? '');
      const [segments, nextMaintenanceStatus] = await Promise.all([
        listSummarySegments(space, threadId),
        loadMemoryMaintenanceStatus(space, threadId),
      ]);
      setSummarySegments(segments);
      setMaintenanceStatus(nextMaintenanceStatus);
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

  async function handleDeleteSummary(segmentId: string) {
    setLoading(true);
    try {
      await deleteSummarySegment(space, threadId, segmentId);
      setStatus('删除摘要成功，后续不会再注入这段摘要。');
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除摘要失败');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteMemory() {
    if (!pendingDeleteMemory) {
      return;
    }
    await handleDelete(pendingDeleteMemory.id);
    setPendingDeleteMemory(null);
  }

  async function confirmDeleteSummary() {
    if (!pendingDeleteSummary) {
      return;
    }
    await handleDeleteSummary(pendingDeleteSummary.id);
    setPendingDeleteSummary(null);
  }

  async function handleRerunSummaryMaintenance() {
    setLoading(true);
    try {
      await rerunSummaryMaintenance(space, threadId);
      await reload();
      setStatus('会话摘要已重新整理。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '重新整理摘要失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    setLoading(true);
    try {
      const next = await updateUserProfile(space, profileDraft.trim());
      setProfile(next);
      setProfileDraft(next.profileText);
      setStatus('用户画像已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存用户画像失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <AiLightScaffold loading={loading} onBack={onBack} scrollable subtitle="本地可控记忆" title="AI 记住了这些">
      <View style={styles.content}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <AiLightCard>
          <Text style={styles.sectionTitle}>用户画像</Text>
          <Text style={styles.caption}>画像用于长期理解你，不会覆盖当前要求。</Text>
          <Text style={styles.caption}>{profile?.lastUpdatedAt ? `更新于 ${formatMinute(profile.lastUpdatedAt)}` : '还没有长期画像。'}</Text>
          <AiLightTextareaRow
            label="画像内容"
            minHeight={112}
            onChangeText={setProfileDraft}
            placeholder="例如：喜欢简洁直接的解释，正在维护 Pixory 项目。"
            value={profileDraft}
          />
          <AiLightButton label="保存用户画像" loading={loading} onPress={() => void handleSaveProfile()} />
        </AiLightCard>

        <AiLightCard>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>会话摘要</Text>
              <Text style={styles.caption}>摘要按时间保存；删除后不会进入后续 prompt。</Text>
            </View>
            <AiLightButton label="重新整理摘要" loading={loading} onPress={() => void handleRerunSummaryMaintenance()} variant="outline" />
          </View>
          <View style={styles.maintenanceBox}>
            <Text style={styles.caption}>
              上次维护：{maintenanceStatus?.lastMaintenanceCompletedAt ? formatMinute(maintenanceStatus.lastMaintenanceCompletedAt) : '暂无'}
            </Text>
            <Text style={styles.caption}>
              待整理轮数 {maintenanceStatus?.uncompressedRoundCount ?? 0} · 摘要段数 {maintenanceStatus?.summarySegmentCount ?? summarySegments.length} · 画像更新 {maintenanceStatus?.profileUpdatedAt ? formatMinute(maintenanceStatus.profileUpdatedAt) : '暂无'}
            </Text>
            {maintenanceStatus?.lastMaintenanceModelProviderId || maintenanceStatus?.lastMaintenanceModelId ? (
              <Text style={styles.caption}>
                维护模型：{[maintenanceStatus.lastMaintenanceModelProviderId, maintenanceStatus.lastMaintenanceModelId].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {maintenanceStatus?.lastMaintenanceUsedFallback ? <Text style={styles.status}>远程失败，已使用本地轻量整理</Text> : null}
            {maintenanceStatus?.lastMaintenanceError ? <Text style={styles.status}>失败原因：{maintenanceStatus.lastMaintenanceError}</Text> : null}
          </View>
          <View style={styles.memoryList}>
            {summarySegments.length === 0 ? <Text style={styles.caption}>还没有压缩摘要。长会话开启深度记忆后会在这里生成。</Text> : null}
            {summarySegments.map((segment) => (
              <View key={segment.id} style={styles.memoryItem}>
                <Text style={styles.caption}>{formatSummaryRange(segment)} · {segment.roundCount} 轮</Text>
                <Text style={styles.memoryContent}>{segment.summaryText}</Text>
                <View style={styles.rowActions}>
                  <Pressable accessibilityRole="button" onPress={() => setPendingDeleteSummary(segment)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
                    <Ionicons color={aiLightColors.coralActive} name="trash-outline" size={15} />
                    <Text style={styles.actionLabel}>删除摘要</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </AiLightCard>

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

        <View style={styles.filterRow}>
          {MEMORY_TYPE_FILTERS.map((type) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              onPress={() => setMemoryTypeFilter(type)}
              style={({ pressed }) => [
                styles.filterChip,
                memoryTypeFilter === type && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, memoryTypeFilter === type && styles.filterTextActive]}>
                {type === 'all' ? '全部' : TYPE_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>

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
                        {TYPE_LABELS[memory.type]} · {formatMemoryImportanceLabel(memory.importance)} · {formatMemoryConfidenceLabel(memory.confidence)}
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
                        <Pressable accessibilityRole="button" onPress={() => setPendingDeleteMemory(memory)} style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}>
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
    <AppDialog
      danger
      message="删除后，这条记忆不会再进入后续回复。"
      onClose={() => setPendingDeleteMemory(null)}
      onPrimary={() => void confirmDeleteMemory()}
      primaryLabel="删除"
      title="删除这条记忆"
      visible={Boolean(pendingDeleteMemory)}
    />
    <AppDialog
      danger
      message="删除后，这段会话摘要不会再进入后续回复。"
      onClose={() => setPendingDeleteSummary(null)}
      onPrimary={() => void confirmDeleteSummary()}
      primaryLabel="删除"
      title="删除这段摘要"
      visible={Boolean(pendingDeleteSummary)}
    />
    </>
  );
}

function formatMinute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  content: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  sectionHeaderRow: {
    gap: rhythm.compactGridGap,
  },
  sectionHeaderText: {
    gap: rhythm.microGap,
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
  maintenanceBox: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  filterChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  filterChipActive: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.coral,
  },
  filterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  filterTextActive: {
    color: aiLightColors.coralActive,
    fontWeight: '600',
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
