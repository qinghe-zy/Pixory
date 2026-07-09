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
  ip: '当前 IP 记忆',
  knowledge_base: '当前知识库',
  role: '当前角色',
  thread: '本会话记忆',
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
const MEMORY_STATUS_FILTERS: Array<'active' | 'stale' | 'all'> = ['active', 'stale', 'all'];

interface MemoryMaintenanceStatus {
  lastMaintenanceCompletedAt: string | null;
  lastMaintenanceError: string | null;
  lastMaintenanceModelId: string | null;
  lastMaintenanceModelProviderId: string | null;
  lastMaintenanceUsedFallback: boolean;
  profileUpdatedAt: string | null;
  summarySegmentCount: number;
  uncompressedRoundCount: number;
  ordinaryUncompressedRoundCount: number;
  protectedImportRoundCount: number;
}

function formatPendingRoundsSummary(status: MemoryMaintenanceStatus | null): string {
  const ordinaryRounds = status?.ordinaryUncompressedRoundCount ?? status?.uncompressedRoundCount ?? 0;
  const protectedRounds = status?.protectedImportRoundCount ?? 0;
  if (protectedRounds > 0) {
    return `待整理轮数 ${ordinaryRounds} · 导入保护 ${protectedRounds}`;
  }
  return `待整理轮数 ${ordinaryRounds}`;
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
  const [sessionProfile, setSessionProfile] = useState<AiUserProfileRecord | null>(null);
  const [projectProfile, setProjectProfile] = useState<AiUserProfileRecord | null>(null);
  const [summarySegments, setSummarySegments] = useState<AiThreadSummarySegmentRecord[]>([]);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MemoryMaintenanceStatus | null>(null);
  const [memoryStatusFilter, setMemoryStatusFilter] = useState<'active' | 'stale' | 'all'>('active');
  const [sessionProfileDraft, setSessionProfileDraft] = useState('');
  const [projectProfileDraft, setProjectProfileDraft] = useState('');
  const [draft, setDraft] = useState('');
  const [manualMemoryScope, setManualMemoryScope] = useState<AiMemoryScope>('thread');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingDeleteMemory, setPendingDeleteMemory] = useState<AiMemoryRecord | null>(null);
  const [pendingDeleteSummary, setPendingDeleteSummary] = useState<AiThreadSummarySegmentRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'memories' | 'profiles' | 'summaries'>('memories');
  const [manualMemoryVisible, setManualMemoryVisible] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<AiMemoryRecord | null>(null);
  const [profilesExpanded, setProfilesExpanded] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AiMemoryScope, AiMemoryRecord[]>();
    for (const memory of memories) {
      const list = map.get(memory.scope) ?? [];
      list.push(memory);
      map.set(memory.scope, list);
    }
    return MEMORY_SCOPE_ORDER.map((scope) => ({ items: map.get(scope) ?? [], scope })).filter((group) => group.items.length > 0);
  }, [memories]);
  const availableManualMemoryScopes = thread?.boundIpId != null ? MANUAL_MEMORY_SCOPE_OPTIONS : MANUAL_MEMORY_SCOPE_OPTIONS.filter((scope) => scope !== 'ip');
  const resolvedManualMemoryScope = availableManualMemoryScopes.includes(manualMemoryScope) ? manualMemoryScope : 'thread';
  const manualMemoryPlaceholder = resolvedManualMemoryScope === 'ip'
    ? '例如：这个 IP 的主色调是 #FF0033'
    : resolvedManualMemoryScope === 'global'
      ? '例如：我希望默认回答简洁直接。'
      : '例如：本会话里希望保持冷静、克制的语气。';
  const profileGovernanceCaption = thread?.boundIpId != null
    ? '画像用于长期理解你，不会覆盖当前要求；本会话画像优先于当前 IP 画像和全局画像。'
    : '画像用于长期理解你，不会覆盖当前要求；本会话画像优先于全局画像。';

  useEffect(() => {
    if (manualMemoryScope === 'ip' && thread?.boundIpId == null) {
      setManualMemoryScope('thread');
    }
  }, [manualMemoryScope, thread?.boundIpId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextThread = await runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId));
      setThread(nextThread);
      const [nextSessionProfile, nextProjectProfile] = await Promise.all([
        getUserProfile(space, null, threadId),
        nextThread?.boundIpId != null ? getUserProfile(space, nextThread.boundIpId, null) : Promise.resolve(null),
      ]);
      setSessionProfile(nextSessionProfile);
      setSessionProfileDraft(nextSessionProfile?.profileText ?? '');
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

  async function handleAddMemory(): Promise<boolean> {
    const content = draft.trim();
    if (!content || !thread) {
      setStatus(!content ? '请先填写记忆内容。' : '没有找到当前会话。');
      return false;
    }
    const manualScope = resolveManualMemoryScope(thread, resolvedManualMemoryScope);
    if (!manualScope) {
      setStatus('当前会话未绑定 IP，不能添加当前 IP 记忆。');
      return false;
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
      setStatus(`已添加到${SCOPE_LABELS[resolvedManualMemoryScope]}。`);
      await reload();
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '添加记忆失败');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(memoryId: string): Promise<boolean> {
    const content = editingText.trim();
    if (!content) {
      setStatus('记忆内容不能为空。');
      return false;
    }
    setLoading(true);
    try {
      await updateMemoryContent(space, memoryId, content);
      setEditingId(null);
      setEditingText('');
      await reload();
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '更新记忆失败');
      return false;
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

  async function handleSaveSessionProfile() {
    setLoading(true);
    try {
      const next = await updateUserProfile(space, sessionProfileDraft.trim(), null, threadId);
      setSessionProfile(next);
      setSessionProfileDraft(next.profileText);
      setStatus('本会话画像已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存本会话画像失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProjectProfile() {
    if (thread?.boundIpId == null) {
      setStatus('当前会话未绑定 IP，没有当前 IP 画像。');
      return;
    }
    setLoading(true);
    try {
      const next = await updateUserProfile(space, projectProfileDraft.trim(), thread.boundIpId, null);
      setProjectProfile(next);
      setProjectProfileDraft(next.profileText);
      setStatus('当前 IP 画像已保存。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存当前 IP 画像失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AiLightScaffold
        loading={loading}
        onBack={onBack}
        scrollable
        title="AI 记住了这些"
        rightAction={
          activeTab === 'memories' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setManualMemoryVisible(true)}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
            >
              <Ionicons color={aiLightColors.primary} name="add-outline" size={24} />
            </Pressable>
          ) : undefined
        }
      >
        <View style={styles.content}>
          <View style={styles.segmentContainer}>
            {(['memories', 'profiles', 'summaries'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.segmentButton, activeTab === tab && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, activeTab === tab && styles.segmentTextActive]}>
                  {tab === 'memories' ? '记忆碎片' : tab === 'profiles' ? '人设画像' : '会话摘要'}
                </Text>
              </Pressable>
            ))}
          </View>
          {status ? <Text style={styles.status}>{status}</Text> : null}

          {activeTab === 'memories' ? (
            <>
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
                      {statusFilter === 'active' ? '当前有效' : statusFilter === 'stale' ? '已过期' : '全部'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {grouped.length === 0 ? (
                <AiLightCard>
                  <Text style={styles.emptyTitle}>还没有可管理的记忆。</Text>
                  <Text style={styles.caption}>开启深度记忆后，明确偏好、纠正和决定会出现在这里，也可以手动添加。</Text>
                </AiLightCard>
              ) : null}

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
                      <Pressable
                        key={memory.id}
                        onPress={() => setSelectedMemory(memory)}
                        style={({ pressed }) => [styles.memoryItem, pressed && styles.pressed]}
                      >
                        <View style={styles.memoryTags}>
                          <View style={styles.microTag}>
                            <Text style={styles.microTagText}>{SCOPE_LABELS[memory.scope]}</Text>
                          </View>
                          <View style={styles.microTag}>
                            <Text style={styles.microTagText}>{TYPE_LABELS[memory.type]}</Text>
                          </View>
                          {memory.status === 'stale' && (
                            <View style={[styles.microTag, styles.microTagStale]}>
                              <Text style={styles.microTagStaleText}>已过期</Text>
                            </View>
                          )}
                          {memory.sourceKind === 'manual' && (
                            <View style={styles.microTag}>
                              <Text style={styles.microTagText}>手动</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.memoryContent}>{memory.content}</Text>
                      </Pressable>
                    ))}
                  </View>
                </AiLightCard>
              ))}
            </>
          ) : activeTab === 'profiles' ? (
            <>
              <AiLightCard>
                <View style={styles.profileSection}>
                  <Text style={styles.sectionTitle}>本会话画像</Text>
                  <Text style={styles.caption}>{profileGovernanceCaption}</Text>
                  <Text style={styles.caption}>{sessionProfile?.lastUpdatedAt ? `更新于 ${formatAiFullMinute(sessionProfile.lastUpdatedAt)}` : '本会话暂无画像。'}</Text>
                  <AiLightTextareaRow
                    label="本会话画像内容"
                    minHeight={112}
                    onChangeText={setSessionProfileDraft}
                    placeholder="例如：这个聊天里偏好冷静、克制的角色语气。"
                    value={sessionProfileDraft}
                  />
                  {sessionProfileDraft !== (sessionProfile?.profileText ?? '') && (
                    <AiLightButton label="保存修改" loading={loading} onPress={() => void handleSaveSessionProfile()} />
                  )}
                </View>
              </AiLightCard>

              {thread?.boundIpId != null ? (
                <AiLightCard>
                  <Pressable onPress={() => setProfilesExpanded(!profilesExpanded)} style={styles.scopeHeader}>
                    <View style={styles.sectionHeaderText}>
                      <Text style={styles.sectionTitle}>当前 IP 画像</Text>
                      <Text style={styles.caption}>只在当前 IP 内生效，优先级低于本会话画像。</Text>
                    </View>
                    <Ionicons name={profilesExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={20} color={aiLightColors.muted} />
                  </Pressable>

                  {profilesExpanded ? (
                    <View style={[styles.profileSection, styles.profileSectionInset]}>
                      <Text style={styles.profileScopeTitle}>当前 IP 画像</Text>
                      <AiLightTextareaRow
                        label="当前 IP 画像内容"
                        minHeight={80}
                        onChangeText={setProjectProfileDraft}
                        placeholder="例如：在这个 IP 中偏好..."
                        value={projectProfileDraft}
                      />
                      {projectProfileDraft !== (projectProfile?.profileText ?? '') && (
                        <AiLightButton label="保存 IP 画像" loading={loading} onPress={() => void handleSaveProjectProfile()} />
                      )}
                    </View>
                  ) : null}
                </AiLightCard>
              ) : null}
            </>
          ) : (
            <>
              <AiLightCard>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>会话摘要</Text>
                    <Text style={styles.caption}>
                      {maintenanceStatus?.lastMaintenanceCompletedAt
                        ? `上次维护: ${formatAiFullMinute(maintenanceStatus.lastMaintenanceCompletedAt)}`
                        : '暂无维护记录'}
                    </Text>
                  </View>
                  <AiLightButton label="重新整理" loading={loading} onPress={() => void handleRerunSummaryMaintenance()} variant="outline" />
                </View>

                {(maintenanceStatus?.ordinaryUncompressedRoundCount ?? 0) > 0 || maintenanceStatus?.lastMaintenanceError ? (
                  <View style={styles.maintenanceBanner}>
                    <Text style={styles.maintenanceBannerText}>
                      待整理: {formatPendingRoundsSummary(maintenanceStatus)}
                    </Text>
                    {maintenanceStatus?.lastMaintenanceError && (
                      <Text style={styles.status}>失败: {maintenanceStatus.lastMaintenanceError}</Text>
                    )}
                  </View>
                ) : null}

                <View style={[styles.memoryList, styles.summaryList]}>
                  {summarySegments.length === 0 ? <Text style={styles.caption}>还没有压缩摘要。长对话后会在这里生成。</Text> : null}
                  {summarySegments.map((segment) => (
                    <View key={segment.id} style={styles.timelineItem}>
                      <View style={styles.timelineDot} />
                      <View style={styles.timelineContent}>
                        <Text style={styles.caption}>{formatSummaryRange(segment)} · {segment.roundCount} 轮</Text>
                        <Text style={styles.memoryContent}>{segment.summaryText}</Text>
                        <Pressable accessibilityRole="button" onPress={() => setPendingDeleteSummary(segment)} style={({ pressed }) => [styles.iconAction, styles.inlineAction, pressed && styles.pressed]}>
                          <Ionicons color={aiLightColors.primaryActive} name="trash-outline" size={15} />
                          <Text style={styles.actionLabel}>删除</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </AiLightCard>
            </>
          )}

        </View>
      </AiLightScaffold>

      <AppDialog
        visible={manualMemoryVisible}
        title="手动添加记忆"
        onClose={() => setManualMemoryVisible(false)}
        primaryDisabled={loading || !draft.trim()}
        primaryLabel={`添加到${SCOPE_LABELS[resolvedManualMemoryScope]}`}
        onPrimary={() => {
          void handleAddMemory().then((success) => {
            if (success) {
              setManualMemoryVisible(false);
            }
          });
        }}
      >
        <View style={styles.dialogBody}>
          <View style={styles.filterRow}>
            {availableManualMemoryScopes.map((scope) => (
              <Pressable
                key={scope}
                accessibilityRole="button"
                onPress={() => setManualMemoryScope(scope)}
                style={({ pressed }) => [
                  styles.filterChip,
                  resolvedManualMemoryScope === scope && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.filterText, resolvedManualMemoryScope === scope && styles.filterTextActive]}>{SCOPE_LABELS[scope]}</Text>
              </Pressable>
            ))}
          </View>
          <AiLightTextareaRow label="记忆内容" minHeight={72} onChangeText={setDraft} placeholder={manualMemoryPlaceholder} value={draft} />
        </View>
      </AppDialog>

      <AppDialog
        visible={Boolean(selectedMemory)}
        title="管理记忆"
        onClose={() => {
          setSelectedMemory(null);
          setEditingId(null);
          setEditingText('');
        }}
        primaryLabel={editingId ? '保存' : '确定'}
        primaryDisabled={loading || (Boolean(editingId) && !editingText.trim())}
        onPrimary={() => {
          if (editingId) {
            void handleSaveEdit(editingId).then((success) => {
              if (success) {
                setSelectedMemory(null);
              }
            });
          } else {
            setSelectedMemory(null);
          }
        }}
      >
        {selectedMemory && (
          <View style={styles.dialogBody}>
            {editingId === selectedMemory.id ? (
              <TextInput
                multiline
                onChangeText={setEditingText}
                placeholder="编辑记忆内容"
                placeholderTextColor={aiLightColors.mutedSoft}
                selectionColor={aiLightColors.primary}
                style={[styles.editInput, styles.dialogEditInput]}
                textAlignVertical="top"
                value={editingText}
              />
            ) : (
              <>
                <View style={styles.memoryTags}>
                  <View style={styles.microTag}>
                    <Text style={styles.microTagText}>{SCOPE_LABELS[selectedMemory.scope]}</Text>
                  </View>
                  <View style={styles.microTag}>
                    <Text style={styles.microTagText}>{TYPE_LABELS[selectedMemory.type]}</Text>
                  </View>
                  {selectedMemory.status === 'stale' ? (
                    <View style={[styles.microTag, styles.microTagStale]}>
                      <Text style={styles.microTagStaleText}>已过期</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.memoryContent}>{selectedMemory.content}</Text>
              </>
            )}

            <View style={styles.rowActions}>
              {editingId !== selectedMemory.id && (
                <>
                  {selectedMemory.status === 'active' ? (
                    <Pressable
                      onPress={() => {
                        setEditingId(selectedMemory.id);
                        setEditingText(selectedMemory.content);
                      }}
                      style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                    >
                      <Ionicons color={aiLightColors.primaryActive} name="create-outline" size={15} />
                      <Text style={styles.actionLabel}>编辑</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      setPendingDeleteMemory(selectedMemory);
                      setSelectedMemory(null);
                    }}
                    style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                  >
                    <Ionicons color={aiLightColors.primaryActive} name="trash-outline" size={15} />
                    <Text style={styles.actionLabel}>删除</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </AppDialog>

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
  profileSectionInset: {
    marginTop: spacing[4],
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
    color: aiLightColors.primaryActive,
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
  summaryList: {
    marginTop: spacing[4],
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
    borderColor: aiLightColors.primary,
  },
  filterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  filterTextActive: {
    color: aiLightColors.primaryActive,
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
  inlineAction: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
  },
  actionLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  editInput: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    minHeight: 72,
  },
  dialogBody: {
    gap: rhythm.compactGridGap,
  },
  dialogEditInput: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[3],
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  pressed: {
    opacity: 0.78,
  },
  headerIconButton: {
    padding: spacing[1],
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    padding: spacing[1],
    marginBottom: spacing[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing[2],
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentButtonActive: {
    backgroundColor: aiLightColors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  segmentTextActive: {
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  memoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  microTag: {
    backgroundColor: aiLightColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.xs,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1] / 2,
  },
  microTagStale: {
    backgroundColor: aiLightColors.surface,
  },
  microTagText: {
    ...typography.textStyles.micro,
    color: aiLightColors.primaryActive,
  },
  microTagStaleText: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
  },
  maintenanceBanner: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[3],
    marginTop: spacing[3],
  },
  maintenanceBannerText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '500',
  },
  timelineItem: {
    flexDirection: 'row',
    paddingLeft: spacing[2],
  },
  timelineDot: {
    width: spacing[2],
    height: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: aiLightColors.primary,
    marginTop: spacing[1] + spacing[1] / 2,
    marginRight: spacing[3],
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing[4],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: aiLightColors.hairline,
    paddingLeft: spacing[4],
    marginLeft: -spacing[2] - spacing[1] / 2,
  },
});
