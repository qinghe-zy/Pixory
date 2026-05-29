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
import { formatAiFullMinute } from '../utils/aiTimeFormatters';

interface AiMemoryBoardScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
}

const SCOPE_LABELS: Record<AiMemoryScope, string> = {
  global: '全局记忆',
  ip: '当前项目记忆',
  knowledge_base: '当前知识库',
  role: '当前角色',
  thread: '本会话',
};

const SCOPE_DESCRIPTIONS: Record<AiMemoryScope, string> = {
  global: '跨项目都会被低权重参考，只应保留必要用户信息和明确全局要求。',
  ip: '只在当前 IP 内使用，优先级高于全局记忆。',
  knowledge_base: '只随当前知识库资料一起参考。',
  role: '只随当前角色一起参考。',
  thread: '只在本会话内参考。',
};

const TYPE_LABELS: Record<AiMemoryType, string> = {
  correction: '纠正',
  decision: '决策',
  fact: '事实',
  instruction: '指令',
  preference: '偏好',
  task: '任务',
};

const MEMORY_SCOPE_ORDER: AiMemoryScope[] = ['thread', 'ip', 'knowledge_base', 'role', 'global'];
const MANUAL_MEMORY_SCOPE_OPTIONS: AiMemoryScope[] = ['thread', 'ip', 'global'];
const MEMORY_TYPE_FILTERS: Array<'all' | AiMemoryType> = ['all', 'preference', 'fact', 'correction', 'task', 'instruction', 'decision'];
const MEMORY_STATUS_FILTERS: Array<'active' | 'stale' | 'all'> = ['active', 'stale', 'all'];

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

function resolveManualMemoryScope(thread: AiThreadRecord, scope: AiMemoryScope): { scope: AiMemoryScope; scopeId: string | null } | null {
  if (scope === 'thread') {
    return { scope, scopeId: thread.id };
  }
  if (scope === 'ip') {
    return thread.boundIpId == null ? null : { scope, scopeId: String(thread.boundIpId) };
  }
  if (scope === 'global') {
    return { scope, scopeId: null };
  }
  return null;
}

export function AiMemoryBoardScreen({ space, threadId, onBack }: AiMemoryBoardScreenProps) {
  const [thread, setThread] = useState<AiThreadRecord | null>(null);
  const [memories, setMemories] = useState<AiMemoryRecord[]>([]);
  const [globalProfile, setGlobalProfile] = useState<AiUserProfileRecord | null>(null);
  const [projectProfile, setProjectProfile] = useState<AiUserProfileRecord | null>(null);
  const [summarySegments, setSummarySegments] = useState<AiThreadSummarySegmentRecord[]>([]);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<'all' | AiMemoryType>('all');
  const [memoryStatusFilter, setMemoryStatusFilter] = useState<'active' | 'stale' | 'all'>('active');
  const [globalProfileDraft, setGlobalProfileDraft] = useState('');
  const [projectProfileDraft, setProjectProfileDraft] = useState('');
  const [draft, setDraft] = useState('');
  const [manualMemoryScope, setManualMemoryScope] = useState<AiMemoryScope>('thread');
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
      const [nextGlobalProfile, nextProjectProfile] = await Promise.all([
        getUserProfile(space, null),
        nextThread?.boundIpId != null ? getUserProfile(space, nextThread.boundIpId) : Promise.resolve(null),
      ]);
      setGlobalProfile(nextGlobalProfile);
      setGlobalProfileDraft(nextGlobalProfile?.profileText ?? '');
      setProjectProfile(nextProjectProfile);
      setProjectProfileDraft(nextProjectProfile?.profileText ?? '');
      const [segments, nextMaintenanceStatus] = await Promise.all([
        listSummarySegments(space, threadId),
        loadMemoryMaintenanceStatus(space, threadId),
      ]);
      setSummarySegments(segments);
      setMaintenanceStatus(nextMaintenanceStatus);
      if (nextThread) {
        setMemories(await listMemoryBoardItems(space, nextThread, { status: memoryStatusFilter }));
      } else {
        setMemories([]);
      }
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [memoryStatusFilter, space, threadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAddMemory() {
    const content = draft.trim();
    if (!content || !thread) {
      return;
    }
    const manualScope = resolveManualMemoryScope(thread, manualMemoryScope);
    if (!manualScope) {
      setStatus('当前会话未绑定 IP，不能添加当前项目记忆。');
      return;
    }
    setLoading(true);
    try {
      await createManualMemory(space, {
        content,
        scope: manualScope.scope,
        scopeId: manualScope.scopeId,
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

  async function handleSaveGlobalProfile() {
    setLoading(true);
    try {
      const next = await updateUserProfile(space, globalProfileDraft.trim(), null);
      setGlobalProfile(next);
      setGlobalProfileDraft(next.profileText);
      setStatus('全局画像已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存全局画像失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProjectProfile() {
    if (thread?.boundIpId == null) {
      setStatus('当前会话未绑定 IP，没有项目画像。');
      return;
    }
    setLoading(true);
    try {
      const next = await updateUserProfile(space, projectProfileDraft.trim(), thread.boundIpId);
      setProjectProfile(next);
      setProjectProfileDraft(next.profileText);
      setStatus('当前项目画像已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存当前项目画像失败');
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
          <Text style={styles.caption}>画像用于长期理解你，不会覆盖当前要求；当前项目画像优先于全局画像。</Text>
          <View style={styles.profileSection}>
            <Text style={styles.profileScopeTitle}>全局画像</Text>
            <Text style={styles.caption}>{globalProfile?.lastUpdatedAt ? `更新于 ${formatAiFullMinute(globalProfile.lastUpdatedAt)}` : '还没有全局画像。'}</Text>
            <AiLightTextareaRow
              label="全局画像内容"
              minHeight={96}
              onChangeText={setGlobalProfileDraft}
              placeholder="例如：喜欢简洁直接的解释。"
              value={globalProfileDraft}
            />
            <AiLightButton label="保存全局画像" loading={loading} onPress={() => void handleSaveGlobalProfile()} />
          </View>
          <View style={styles.profileSection}>
            <Text style={styles.profileScopeTitle}>当前项目画像</Text>
            <Text style={styles.caption}>
              {thread?.boundIpId != null
                ? projectProfile?.lastUpdatedAt
                  ? `更新于 ${formatAiFullMinute(projectProfile.lastUpdatedAt)}`
                  : '还没有当前项目画像。'
                : '当前会话未绑定 IP，不会生成项目画像。'}
            </Text>
            {thread?.boundIpId != null ? (
              <>
                <AiLightTextareaRow
                  label="当前项目画像内容"
                  minHeight={112}
                  onChangeText={setProjectProfileDraft}
                  placeholder="例如：在这个 IP 中偏好冷静、克制的角色语气。"
                  value={projectProfileDraft}
                />
                <AiLightButton label="保存当前项目画像" loading={loading} onPress={() => void handleSaveProjectProfile()} />
              </>
            ) : null}
          </View>
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
              上次维护：{maintenanceStatus?.lastMaintenanceCompletedAt ? formatAiFullMinute(maintenanceStatus.lastMaintenanceCompletedAt) : '暂无'}
            </Text>
            <Text style={styles.caption}>
              待整理轮数 {maintenanceStatus?.uncompressedRoundCount ?? 0} · 摘要段数 {maintenanceStatus?.summarySegmentCount ?? summarySegments.length} · 画像更新 {maintenanceStatus?.profileUpdatedAt ? formatAiFullMinute(maintenanceStatus.profileUpdatedAt) : '暂无'}
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
          <View style={styles.filterRow}>
            {MANUAL_MEMORY_SCOPE_OPTIONS.map((scope) => (
              <Pressable
                key={scope}
                accessibilityRole="button"
                onPress={() => setManualMemoryScope(scope)}
                style={({ pressed }) => [
                  styles.filterChip,
                  manualMemoryScope === scope && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, manualMemoryScope === scope && styles.filterTextActive]}>{SCOPE_LABELS[scope]}</Text>
              </Pressable>
            ))}
          </View>
          <AiLightTextareaRow label="记忆内容" minHeight={72} onChangeText={setDraft} placeholder="例如：这个 IP 的主色调是 #FF0033" value={draft} />
          <AiLightButton label={`添加到${SCOPE_LABELS[manualMemoryScope]}`} loading={loading} onPress={() => void handleAddMemory()} />
        </AiLightCard>

        {grouped.length === 0 ? (
          <AiLightCard>
            <Text style={styles.emptyTitle}>还没有可管理的记忆。</Text>
            <Text style={styles.caption}>开启深度记忆后，明确偏好、纠正和决定会出现在这里，也可以手动添加。</Text>
          </AiLightCard>
        ) : null}

        <View style={styles.filterRow}>
          {MEMORY_STATUS_FILTERS.map((statusFilter) => (
            <Pressable
              key={statusFilter}
              accessibilityRole="button"
              onPress={() => setMemoryStatusFilter(statusFilter)}
              style={({ pressed }) => [
                styles.filterChip,
                memoryStatusFilter === statusFilter && styles.filterChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.filterText, memoryStatusFilter === statusFilter && styles.filterTextActive]}>
                {statusFilter === 'active' ? '当前记忆' : statusFilter === 'stale' ? '已过期' : '全部状态'}
              </Text>
            </Pressable>
          ))}
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
            <View style={styles.scopeHeader}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>{SCOPE_LABELS[group.scope]}</Text>
                <Text style={styles.caption}>{SCOPE_DESCRIPTIONS[group.scope]}</Text>
              </View>
              <Text style={styles.scopeCount}>{group.items.length}</Text>
            </View>
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
                        作用域：{SCOPE_LABELS[memory.scope]} · {TYPE_LABELS[memory.type]} · {memory.sourceKind === 'manual' ? '手动添加' : '自动整理'} · {memory.status === 'stale' ? '已过期' : '当前'} · {formatMemoryImportanceLabel(memory.importance)} · {formatMemoryConfidenceLabel(memory.confidence)}
                      </Text>
                      {memory.status === 'stale' && memory.mergeReason ? <Text style={styles.status}>过期原因：{memory.mergeReason}</Text> : null}
                      {memory.supersededByMemoryId ? <Text style={styles.caption}>替代记忆：{memory.supersededByMemoryId}</Text> : null}
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
                        {memory.status === 'active' ? (
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
                        ) : null}
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
  profileSection: {
    gap: rhythm.microGap,
    paddingTop: spacing[2],
  },
  profileScopeTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
  scopeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
    justifyContent: 'space-between',
  },
  scopeCount: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '700',
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
