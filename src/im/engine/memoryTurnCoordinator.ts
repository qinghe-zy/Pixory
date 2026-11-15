import { classifyTurnMemoryIntent } from '../../core/memory/memoryIntentClassifier';
import {
  clearSpaceMemoryPrefetch,
  getWarmedMemoryContext,
  warmRoleMemoryContext,
  type PrefetchSpace,
} from '../../core/memory/memoryPrefetchService';
import { memoryRepository } from '../../core/memory/memoryRepository';
import type {
  CompanionMemoryRecord,
  MemoryRecallCandidate,
  TurnMemoryIntentProfile,
} from '../../core/memory/memoryTypes';
import { retrieveRelevantMemories } from '../../core/memory/zeroVectorRetriever';
import { peekThreadPendingDiaryHook } from '../repository/imThreadRepository';
import { imEpochRepository, type ImEpochStateRow } from '../repository/imEpochRepository';
import type { ImMessage } from '../types';
import {
  buildActiveArcLedgerNotice,
  ingestUserTurnCommitment,
} from './activeArcLedgerService';
import {
  buildTopicIndexCatalog,
  resolveBudgets,
  type ResolvedImBudgets,
} from './imTokenBudgetController';
import { parseMemoryNoteTags, parseMemoryRecallTag } from './imTagParser';
import {
  buildEffectiveRecallQuery,
  filterCooldownRecalledMemories,
} from './recallQueryBuilder';

export interface PrepareTurnMemoryParams {
  space: PrefetchSpace;
  threadId: string;
  roleCardId?: string | null;
  userInput: string;
  recentMessages: ImMessage[];
  recentlyRecalledIds?: Set<string>;
  recallLimit?: number;
  isWakeupOrProactive?: boolean;
  nowMs?: number;
}

export interface PreparedTurnMemoryContext {
  intentProfile: TurnMemoryIntentProfile;
  recallQuery: string;
  rawRecalled: MemoryRecallCandidate[];
  recalled: MemoryRecallCandidate[];
  slots: CompanionMemoryRecord[];
  l1Summary: CompanionMemoryRecord | null;
  coreFacts: CompanionMemoryRecord[];
  allL2Memories: CompanionMemoryRecord[];
  epochState: ImEpochStateRow | null;
  pendingDiaryHook: string | null;
  activeArcNotice: string | null;
  epochCatalogText: string;
  budgets: ResolvedImBudgets;
}

export interface PostReplyMemoryParams {
  space: PrefetchSpace;
  threadId: string;
  roleCardId?: string | null;
  recalled: MemoryRecallCandidate[];
  fullRawResponse: string;
  alreadyExecutedRecallRound?: boolean;
}

export interface PostReplyMemorySettlement {
  echoHitIds: string[];
  appliedNoteIds: string[];
  recallRoundRequested: boolean;
  recallQuery: string | null;
  secondaryRecalledMemories: MemoryRecallCandidate[];
}

/**
 * 伴侣回合记忆总协调器 (MemoryTurnCoordinator)
 *
 * 将“预热读取、承诺提取进账、PPR 图谱检索、L2 目录构建、L4 动态账本封装”以及
 * “回复后回显加分、[MEMORY_NOTE] 勘误落盘、[MEMORY_RECALL] 熔断二次回溯”
 * 收口为高内聚的服务，避免 useImChatSession.ts 膨胀为巨型 Hook。
 */
export async function prepareTurnMemoryContext(
  params: PrepareTurnMemoryParams
): Promise<PreparedTurnMemoryContext> {
  const {
    space,
    threadId,
    roleCardId,
    userInput,
    recentMessages,
    recentlyRecalledIds,
    recallLimit = 4,
    isWakeupOrProactive = false,
  } = params;
  const nowMs = params.nowMs ?? Date.now();
  const threadTurns = Math.floor((recentMessages?.length || 0) / 2);
  const budgets = resolveBudgets(threadTurns);
  const intentProfile: TurnMemoryIntentProfile = isWakeupOrProactive
    ? {
        intent: 'EPISODIC_RECALL',
        confidence: 1.0,
        topK: recallLimit,
        scoreThreshold: 0.16,
        invokeMemoryModel: false,
      }
    : classifyTurnMemoryIntent(userInput);

  // 1. 若用户本轮表达明确忘却指令，优先撤回近 10 分钟非钢印瞬态记忆
  if (
    !isWakeupOrProactive &&
    roleCardId &&
    intentProfile.intent === 'FORGET_REQUEST' &&
    typeof memoryRepository?.softDeleteRecentTransientMemories === 'function'
  ) {
    await Promise.resolve(
      memoryRepository.softDeleteRecentTransientMemories(roleCardId, space)
    ).catch(() => {});
  }

  const recallQuery = isWakeupOrProactive
    ? userInput.trim()
    : buildEffectiveRecallQuery({
        currentUserInput: userInput,
        recentMessages,
        recentlyRecalledIds,
      });

  // 2. 先读取或预热角色记忆与实体共现图，再静默捕捉本轮动态承诺，避免写账本反手清掉预热 L2 图谱缓存
  const warmed = roleCardId
    ? getWarmedMemoryContext(space, roleCardId, nowMs) ||
      (await warmRoleMemoryContext(space, roleCardId).catch(() => null))
    : null;

  const canListMemories = typeof memoryRepository?.listMemories === 'function';
  const canListCoreFacts = typeof memoryRepository?.listCoreProfileFacts === 'function';

  // 3. 双账本动态承诺捕获：通过 skipPrefetchInvalidation 写入 active_arc_ledger 槽位，保留 L2 预热缓存
  let capturedCommitment = null;
  if (!isWakeupOrProactive && roleCardId && userInput && userInput.trim()) {
    capturedCommitment = await ingestUserTurnCommitment(roleCardId, space, userInput, {
      nowMs,
      skipPrefetchInvalidation: true,
    }).catch(() => null);
  }

  const [slots, summaries, coreFacts, allL2Memories, epochState, pendingDiaryHook] =
    await Promise.all([
      roleCardId
        ? !capturedCommitment && warmed
          ? Promise.resolve(warmed.l1Slots)
          : canListMemories
            ? memoryRepository.listMemories(roleCardId, space, 'L1_SLOT')
            : Promise.resolve([])
        : Promise.resolve([]),
      roleCardId
        ? warmed?.l1Summaries
          ? Promise.resolve(warmed.l1Summaries)
          : canListMemories
            ? memoryRepository.listMemories(roleCardId, space, 'L1_SUMMARY')
            : Promise.resolve([])
        : Promise.resolve([]),
      roleCardId
        ? warmed
          ? Promise.resolve(warmed.coreFacts)
          : canListCoreFacts
            ? memoryRepository.listCoreProfileFacts(roleCardId, space, 8)
            : Promise.resolve([])
        : Promise.resolve([]),
      roleCardId
        ? warmed
          ? Promise.resolve(warmed.l2Memories)
          : canListMemories
            ? memoryRepository.listMemories(roleCardId, space, 'L2_EPISODIC')
            : Promise.resolve([])
        : Promise.resolve([]),
      typeof imEpochRepository?.getOrCreateState === 'function'
        ? Promise.resolve(
            imEpochRepository.getOrCreateState(space, threadId, roleCardId || 'default')
          ).catch(() => null)
        : Promise.resolve(null),
      !isWakeupOrProactive && typeof peekThreadPendingDiaryHook === 'function'
        ? Promise.resolve(peekThreadPendingDiaryHook(space, threadId)).catch(() => null)
        : Promise.resolve(null),
    ]);

  if (capturedCommitment && warmed) {
    warmed.l1Slots = slots;
  }

  // 4. 运行 5 通道（含实体共现图 PPR 1~2 跳扩展）相关记忆检索（禁用提前记命中，交由 verifyAndRecordEchoHits 统一闭环结算）
  const rawRecalled =
    roleCardId && recallQuery
      ? await retrieveRelevantMemories(roleCardId, space, recallQuery, recallLimit, intentProfile, {
          preloadedMemories: allL2Memories,
          prebuiltGraph: warmed?.graph,
          skipHitRecording: true,
        }).catch(() => [])
      : [];

  const recalled = filterCooldownRecalledMemories(
    rawRecalled,
    recentlyRecalledIds,
    Math.min(recallLimit, 4)
  );
  if (recentlyRecalledIds) {
    for (const item of recalled) {
      recentlyRecalledIds.add(item.id);
    }
  }

  // 5. L2 话题目录索引世代冻结与 L4 动态进行时承诺感知：
  // 仅在 Epoch 尚未冻结目录 (active_catalog_text == null) 时计算并持久化一次，Epoch 内 100% 字节稳定
  let epochCatalogText: string;
  if (typeof epochState?.active_catalog_text === 'string') {
    epochCatalogText = epochState.active_catalog_text;
  } else {
    epochCatalogText = buildTopicIndexCatalog(
      allL2Memories,
      coreFacts,
      budgets.layer2CatalogMaxTokens
    );
    if (
      epochState &&
      threadId &&
      typeof imEpochRepository.updateActiveCatalogText === 'function'
    ) {
      await Promise.resolve(
        imEpochRepository.updateActiveCatalogText(space, threadId, epochCatalogText)
      ).catch(() => {});
      epochState.active_catalog_text = epochCatalogText;
    }
  }
  const activeArcNotice = buildActiveArcLedgerNotice(slots, nowMs, budgets.activeArcMaxTokens);

  return {
    intentProfile,
    recallQuery,
    rawRecalled,
    recalled,
    slots,
    l1Summary: summaries[0] ?? null,
    coreFacts,
    allL2Memories,
    epochState,
    pendingDiaryHook,
    activeArcNotice,
    epochCatalogText,
    budgets,
  };
}

/**
 * 回复后记忆协议标签结算器：
 * 1. Echo-Verified Hit 回响命中加权；
 * 2. [MEMORY_NOTE] 经 Gatekeeper 校验后覆盖/更新/新增长期事实；
 * 3. [MEMORY_RECALL] 带单轮熔断的静默二次深度下钻检索。
 */
export async function settlePostReplyMemorySignals(
  params: PostReplyMemoryParams
): Promise<PostReplyMemorySettlement> {
  const {
    space,
    roleCardId,
    recalled,
    fullRawResponse,
    alreadyExecutedRecallRound = false,
  } = params;

  const settlement: PostReplyMemorySettlement = {
    echoHitIds: [],
    appliedNoteIds: [],
    recallRoundRequested: false,
    recallQuery: null,
    secondaryRecalledMemories: [],
  };

  if (!roleCardId || !fullRawResponse) {
    return settlement;
  }

  if (recalled.length > 0 && typeof memoryRepository?.verifyAndRecordEchoHits === 'function') {
    settlement.echoHitIds = await Promise.resolve(
      memoryRepository.verifyAndRecordEchoHits(roleCardId, space, recalled, fullRawResponse)
    ).catch(() => []);
  }

  // 解析并执行模型主动纠偏/补充标签 [MEMORY_NOTE: ...]
  const notes = parseMemoryNoteTags(fullRawResponse);
  if (typeof memoryRepository?.applyExplicitMemoryNoteTag === 'function') {
    for (const note of notes) {
      const res = await Promise.resolve(
        memoryRepository.applyExplicitMemoryNoteTag({
          roleCardId,
          space,
          op: note.op,
          targetHint: note.targetHint,
          newContent: note.newContent,
        })
      ).catch(() => ({ applied: false as const }));
      if (res.applied && res.affectedId) {
        settlement.appliedNoteIds.push(res.affectedId);
      }
    }
  }

  // 解析并执行模型主动下钻检索标签 [MEMORY_RECALL: ...]，严格受限于单轮熔断开关
  if (!alreadyExecutedRecallRound) {
    const recallTag = parseMemoryRecallTag(fullRawResponse);
    if (recallTag && recallTag.query) {
      settlement.recallQuery = recallTag.query;
      const existingIds = new Set(recalled.map((r) => r.id));
      const secondary = await retrieveRelevantMemories(
        roleCardId,
        space,
        recallTag.query,
        4,
        {
          intent: 'EPISODIC_RECALL',
          confidence: 1.0,
          topK: 4,
          scoreThreshold: 0.14,
          invokeMemoryModel: false,
        },
        { skipHitRecording: true }
      ).catch(() => []);

      settlement.secondaryRecalledMemories = secondary.filter(
        (item) => !existingIds.has(item.id)
      );
      settlement.recallRoundRequested = true;
    }
  }

  return settlement;
}

/**
 * 为 [MEMORY_RECALL] 二次接续生成组装静默上下文注记
 */
export function buildSecondaryRecallFollowupDirective(
  recallQuery: string,
  secondaryMemories: MemoryRecallCandidate[],
  hasSpokenOpening: boolean = false
): string {
  const continuationRule = hasSpokenOpening
    ? '请紧接着你刚才已说出的话自然补全后续细节，严禁重复刚才已经发出的开场白，且严禁再次输出 [MEMORY_RECALL] 标签'
    : '严禁再次输出 [MEMORY_RECALL] 标签';
  if (secondaryMemories.length > 0) {
    return `\n[内部检索补充就绪: 针对你刚回想查询的「${recallQuery}」，以上 <memory_data> 已补全真实记忆。请顺畅自然地补充回答用户，${continuationRule}]`;
  }
  return `\n[内部检索结果: 记忆库中暂未找到更多关于「${recallQuery}」的细节。请坦诚温柔地顺接话题，严禁编造虚假往事，且${continuationRule}]`;
}

/**
 * 清理指定空间的内存预热缓存（暴露给会话层做隐秘空间退出擦除）
 */
export function releaseSpaceMemoryPrefetch(space: PrefetchSpace): void {
  clearSpaceMemoryPrefetch(space);
}

/**
 * 异步触发角色记忆与图谱预热
 */
export function warmCompanionMemoryPrefetch(
  space: PrefetchSpace,
  roleCardId?: string | null
): void {
  if (!roleCardId) return;
  void warmRoleMemoryContext(space, roleCardId).catch(() => {});
}
