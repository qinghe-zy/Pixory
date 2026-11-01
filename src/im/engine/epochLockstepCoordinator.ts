import type { PixorySpace } from '../../database';
import { imEpochRepository, type ImEpochStateRow } from '../repository/imEpochRepository';
import { groupMessagesIntoLogicalTurns, type LogicalTurn } from '../context/turnNormalizer';
import type { ImMessage } from '../types';

export interface EpochParameters {
  baseWindow: number;
  stepTurns: number;
  prefetchAt: number;
  commitAt: number;
  elasticMax: number;
}

/**
 * 动态派生阶梯与水线参数
 * 根据用户自定义的 contextWindowN 自适应计算，杜绝写死魔法数字
 */
export function calculateEpochParameters(userConfiguredWindowN?: number): EpochParameters {
  const baseWindow = Math.max(10, userConfiguredWindowN || 20);
  const stepTurns = Math.min(8, Math.max(4, Math.round(baseWindow * 0.3)));
  const prefetchAt = baseWindow + stepTurns - 2;
  const commitAt = baseWindow + stepTurns;
  const elasticMax = commitAt + Math.max(2, Math.floor(stepTurns * 0.5));
  return { baseWindow, stepTurns, prefetchAt, commitAt, elasticMax };
}

export interface LockstepWindowResult {
  activeSlotJson: string;
  activeSummaryJson: string;
  activeCoreFactsJson: string;
  windowMessages: ImMessage[];
  epochVersion: number;
  evictedUpToTurn: number;
  activeAnchorMessageId?: string | null;
  didStepEpoch: boolean;
}

export class EpochLockstepCoordinatorService {
  private inFlightTasks = new Set<string>();

  /**
   * 每一轮组装 Prompt 时调用：极速判定水位并协调预提炼与原子跃迁
   */
  public async evaluateAndAssemble(
    space: PixorySpace,
    threadId: string,
    roleCardId: string,
    userConfiguredWindowN: number,
    allVisibleMessages: ImMessage[],
    llmCompactor?: (evictingSlice: ImMessage[], prevSlot: string, prevSumm: string) => Promise<{
      slotJson?: string;
      summaryJson?: string;
      coreFactsJson?: string;
      l2Mutations?: any[];
    } | null>,
    latestCoreFacts?: any[]
  ): Promise<LockstepWindowResult> {
    const params = calculateEpochParameters(userConfiguredWindowN);
    let state = await imEpochRepository.getOrCreateState(space, threadId, roleCardId);

    // 世代初始画像冻结机制：若当前世代 core facts 为空且存在实时画像，执行首次快照冻结
    if (
      (!state.active_core_facts_json || state.active_core_facts_json === '[]') &&
      Array.isArray(latestCoreFacts) &&
      latestCoreFacts.length > 0
    ) {
      const serialized = JSON.stringify(latestCoreFacts);
      await imEpochRepository.updateActiveCoreFacts(space, threadId, serialized);
      state = await imEpochRepository.getOrCreateState(space, threadId, roleCardId);
    }

    const allTurns = groupMessagesIntoLogicalTurns(allVisibleMessages);

    if (allTurns.length === 0) {
      return {
        activeSlotJson: state.active_slot_json,
        activeSummaryJson: state.active_summary_json,
        activeCoreFactsJson: state.active_core_facts_json || '[]',
        windowMessages: [],
        epochVersion: state.epoch_version,
        evictedUpToTurn: state.evicted_up_to_turn,
        activeAnchorMessageId: state.active_anchor_msg_id,
        didStepEpoch: false,
      };
    }

    // 1. 定位当前活跃锚点回合 (严格区分“首次初始化/真被删”与“分页切片截断”，杜绝假性野指针自愈吞掉预提炼)
    let anchorTurnIdx = this.findTurnIndex(allTurns, state.active_anchor_msg_id);
    if (anchorTurnIdx === -1) {
      const verifiedAnchor = state.active_anchor_msg_id
        ? await imEpochRepository.verifyAndHealAnchor(space, threadId)
        : null;

      if (!verifiedAnchor) {
        // 首次建会话锚点为空，或锚点消息确实在数据库中被删除 -> 安全设定初始锚点
        anchorTurnIdx = Math.max(0, allTurns.length - params.baseWindow);
        const healedAnchorId = allTurns[anchorTurnIdx].firstMessageId;
        await imEpochRepository.updateActiveAnchor(space, threadId, healedAnchorId);
        state = await imEpochRepository.getOrCreateState(space, threadId, roleCardId);
      } else {
        // 锚点仍在数据库中（仅传入的内存切片未包含该早期行）：保留已有世代状态与预备槽不被冲毁，从当前切片首轮起算
        anchorTurnIdx = 0;
      }
    }

    let activeTurns = allTurns.slice(anchorTurnIdx);
    let didStepEpoch = false;

    // 2. 检查阶段 2 COMMIT 水位 (>= commitAt 轮)
    if (activeTurns.length >= params.commitAt) {
      const targetNextAnchor = allTurns[anchorTurnIdx + params.stepTurns];
      const targetNextAnchorId = targetNextAnchor?.firstMessageId;

      // 情况 A (就绪态)：阶段 1 预提炼产物已落盘且锚点严格对齐 -> 原子翻转 Zone 2 与 Zone 3
      if (
        targetNextAnchorId &&
        state.staged_next_anchor_msg_id &&
        state.staged_next_anchor_msg_id === targetNextAnchorId
      ) {
        state = await imEpochRepository.commitStagedEpochLockstep(
          space,
          threadId,
          roleCardId,
          anchorTurnIdx + params.stepTurns - 1
        );
        anchorTurnIdx += params.stepTurns;
        activeTurns = allTurns.slice(anchorTurnIdx);
        didStepEpoch = true;
      }
      // 情况 B (手速超快弹性态)：在 elasticMax 水位以内，后台预提炼仍在途 -> 保持旧锚点不跳！
      else if (activeTurns.length <= params.elasticMax) {
        if (llmCompactor) {
          this.triggerShadowPreCompaction(space, threadId, roleCardId, params, state, activeTurns, llmCompactor, latestCoreFacts);
        }
      }
      // 情况 C (网络/接口兜底态)：突破 elasticMax 安全上限，启动【零丢失本地启发式降级提取】后强制跃迁
      else if (targetNextAnchorId) {
        const evictingTurns = activeTurns.slice(0, params.stepTurns);
        const fallbackSummary = this.generateLocalFallbackSummary(
          state.active_summary_json,
          evictingTurns.flatMap((t) => t.messages)
        );

        await imEpochRepository.saveStagedPreCompaction({
          space,
          threadId,
          expectedEpochVersion: state.epoch_version,
          expectedAnchorMsgId: state.active_anchor_msg_id,
          nextAnchorMsgId: targetNextAnchorId,
          evictEndMsgId: evictingTurns[evictingTurns.length - 1].lastMessageId,
          slotJson: state.active_slot_json,
          summaryJson: fallbackSummary,
          coreFactsJson: state.active_core_facts_json,
        });

        state = await imEpochRepository.commitStagedEpochLockstep(
          space,
          threadId,
          roleCardId,
          anchorTurnIdx + params.stepTurns - 1
        );
        anchorTurnIdx += params.stepTurns;
        activeTurns = allTurns.slice(anchorTurnIdx);
        didStepEpoch = true;
      }
    }

    // 3. 检查阶段 1 PREFETCH 水位 (>= prefetchAt 轮)
    if (activeTurns.length >= params.prefetchAt && !state.staged_next_anchor_msg_id && llmCompactor) {
      this.triggerShadowPreCompaction(space, threadId, roleCardId, params, state, activeTurns, llmCompactor, latestCoreFacts);
    }

    return {
      activeSlotJson: state.active_slot_json,
      activeSummaryJson: state.active_summary_json,
      activeCoreFactsJson: state.active_core_facts_json || '[]',
      windowMessages: activeTurns.flatMap((t) => t.messages),
      epochVersion: state.epoch_version,
      evictedUpToTurn: state.evicted_up_to_turn,
      activeAnchorMessageId: state.active_anchor_msg_id,
      didStepEpoch,
    };
  }

  private triggerShadowPreCompaction(
    space: PixorySpace,
    threadId: string,
    roleCardId: string,
    params: EpochParameters,
    state: ImEpochStateRow,
    activeTurns: LogicalTurn[],
    llmCompactor: (evictingSlice: ImMessage[], prevSlot: string, prevSumm: string) => Promise<any>,
    latestCoreFacts?: any[]
  ) {
    if (activeTurns.length <= params.stepTurns) return;

    const taskKey = `${space}:${threadId}:${state.epoch_version}:${state.active_anchor_msg_id}`;
    if (this.inFlightTasks.has(taskKey)) return;

    const evictingTurns = activeTurns.slice(0, params.stepTurns);
    const nextAnchorTurn = activeTurns[params.stepTurns];
    if (!nextAnchorTurn) return;

    const evictingMessages = evictingTurns.flatMap((t) => t.messages);
    const expectedEpochVersion = state.epoch_version;
    const expectedAnchorMsgId = state.active_anchor_msg_id;
    const nextAnchorMsgId = nextAnchorTurn.firstMessageId;
    const evictEndMsgId = evictingTurns[evictingTurns.length - 1].lastMessageId;

    this.inFlightTasks.add(taskKey);

    Promise.resolve()
      .then(async () => {
        const result = await llmCompactor(evictingMessages, state.active_slot_json, state.active_summary_json);
        if (!result) return;

        const stagedCoreFacts =
          result.coreFactsJson ||
          (Array.isArray(latestCoreFacts) && latestCoreFacts.length > 0
            ? JSON.stringify(latestCoreFacts)
            : state.active_core_facts_json);

        // 阶段 1：L1 槽位与摘要写入 staged_* 预备槽，绝不触碰活跃 Zone 2
        await imEpochRepository.saveStagedPreCompaction({
          space,
          threadId,
          expectedEpochVersion,
          expectedAnchorMsgId,
          nextAnchorMsgId,
          evictEndMsgId,
          slotJson: result.slotJson || state.active_slot_json,
          summaryJson: result.summaryJson || state.active_summary_json,
          coreFactsJson: stagedCoreFacts,
        });
      })
      .catch((err) => {
        console.warn('[EpochLockstep] Prefetch compaction failed:', err);
      })
      .finally(() => {
        this.inFlightTasks.delete(taskKey);
      });
  }

  /**
   * 本地启发式零丢失降级抽取器：断网或极端超时时毫秒级生成保底摘要
   */
  public generateLocalFallbackSummary(prevSummaryJson: string, evictingMessages: ImMessage[]): string {
    const keyPhrases = evictingMessages
      .filter((m) => m.content && m.content.trim().length > 0)
      .slice(-4)
      .map((m) => `${m.role === 'user' ? '用户' : '伴侣'}: ${m.content.slice(0, 30)}`)
      .join('；');

    let baseNarrative = '';
    try {
      const parsed = JSON.parse(prevSummaryJson);
      baseNarrative = parsed.narrative_summary || '';
    } catch {
      baseNarrative = prevSummaryJson || '';
    }

    return JSON.stringify({
      narrative_summary: `${baseNarrative ? `${baseNarrative}。` : ''}前情承接: [${keyPhrases}]`.slice(-400),
      emotional_aftertaste: '温和陪伴',
      unresolved_tension: '',
    });
  }

  private findTurnIndex(turns: LogicalTurn[], anchorMsgId: string | null): number {
    if (!anchorMsgId) return -1;
    return turns.findIndex((t) => t.messages.some((m) => m.id === anchorMsgId));
  }
}

export const epochLockstepCoordinator = new EpochLockstepCoordinatorService();
