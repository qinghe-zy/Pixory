/**
 * Shared IM Epoch Shadow Compaction & L1 Commit Sync Runner
 *
 * 供前台会话 (useImChatSession) 与后台断联补回 (imBackgroundStreamService) 复用，
 * 保证两套通路执行完全一致的四维增量压缩、L2-only 预提炼及世代跃迁后 L1 持久化逻辑。
 */

import type { PixorySpace } from '../../database';
import { streamClient } from '../../core/llm-transport/streamClient';
import { getMemoryModelProviderConfig } from '../../core/llm-transport/secureApiKey';
import { memoryRepository } from '../../core/memory/memoryRepository';
import type { CompanionMemoryRecord, FourDCompactionResult } from '../../core/memory/memoryTypes';
import { extractJsonObject } from '../../core/utils/jsonParser';
import { imEpochRepository } from '../repository/imEpochRepository';
import type { ImMessage } from '../types';
import { buildShadowCompactionPayload } from './imContextBuilder';

export interface EpochCompactorProviderFallback {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey?: string | null;
}

export interface CreateEpochShadowCompactorParams {
  space: PixorySpace;
  roleCardId?: string | null;
  rolePrompt: string;
  slots: CompanionMemoryRecord[];
  l1Summary: CompanionMemoryRecord | null;
  coreFacts: CompanionMemoryRecord[];
  windowN: number;
  provider: EpochCompactorProviderFallback;
  effectiveProviderId: string;
  effectiveModelId: string;
  voiceReplyEnabled?: boolean;
  isNativeReasoningModel?: boolean;
}

/**
 * 构造 Epoch Lockstep 阶段 1 影子预提炼回调：仅落盘 L2 记忆，不提前覆写持久层 L1
 */
export function createImEpochShadowCompactor(
  params: CreateEpochShadowCompactorParams
) {
  return async (
    evictingSlice: ImMessage[],
    prevSlot: string,
    prevSumm: string
  ): Promise<{
    slotJson?: string;
    summaryJson?: string;
    l2Mutations?: any[];
  } | null> => {
    try {
      const compPayload = buildShadowCompactionPayload({
        rolePrompt: params.rolePrompt,
        l1Slots: params.slots,
        l1Summary: params.l1Summary,
        coreFacts: params.coreFacts,
        historyMessages: evictingSlice,
        windowN: params.windowN,
        epochSlotJson: prevSlot,
        epochSummaryJson: prevSumm,
        voiceReplyEnabled: params.voiceReplyEnabled,
        isNativeReasoningModel: params.isNativeReasoningModel,
      });

      const memProvider = await getMemoryModelProviderConfig(params.space);
      const compProviderConfig = memProvider || params.provider;
      const compModel = memProvider ? memProvider.modelId : params.effectiveModelId;
      const compProviderId = memProvider ? memProvider.providerId : params.effectiveProviderId;

      let compRaw = '';
      try {
        const compRes = await streamClient.completeText(compPayload, {
          providerId: compProviderId,
          modelId: compModel,
          baseUrl: compProviderConfig.baseUrl,
          apiKey: compProviderConfig.apiKey || undefined,
          temperature: 0.1,
        });
        compRaw = compRes.text;
      } catch {
        for await (const chunk of streamClient.streamText(compPayload, {
          providerId: params.effectiveProviderId,
          modelId: params.effectiveModelId,
          baseUrl: params.provider.baseUrl,
          apiKey: params.provider.apiKey || undefined,
        })) {
          compRaw += chunk;
        }
      }

      const parsed = extractJsonObject<FourDCompactionResult>(compRaw);
      if (!parsed) return null;

      if (params.roleCardId) {
        // 阶段 1 预提炼隔离：仅提炼 L2，禁止覆写持久层 L1 破坏活跃世代前缀缓存
        await memoryRepository.applyCompaction(params.roleCardId, params.space, parsed, { skipL1: true });
      }

      let mergedSlotJson = prevSlot;
      if (parsed.l1_slot_mutations && parsed.l1_slot_mutations.length > 0) {
        try {
          const existingSlots = JSON.parse(prevSlot || '{}');
          for (const mut of parsed.l1_slot_mutations) {
            if (mut.op === 'DELETE') {
              delete existingSlots[mut.slot];
            } else {
              existingSlots[mut.slot] = mut.value;
            }
          }
          mergedSlotJson = JSON.stringify(existingSlots);
        } catch {
          mergedSlotJson = prevSlot;
        }
      }

      return {
        slotJson: mergedSlotJson,
        summaryJson: parsed.episodic_continuity ? JSON.stringify(parsed.episodic_continuity) : prevSumm,
        l2Mutations: parsed.l2_memory_mutations,
      };
    } catch {
      return null;
    }
  };
}

/**
 * 阶段 2 跃迁同步：世代原子翻转后，将新 committed 槽位与摘要同步回持久层 L1
 */
export async function syncCommittedEpochL1ToMemoryRepository(
  space: PixorySpace,
  threadId: string,
  roleCardId: string
): Promise<void> {
  try {
    const committed = await imEpochRepository.getOrCreateState(space, threadId, roleCardId);
    const l1SlotMutations: Array<{ op: 'UPDATE'; slot: string; value: string }> = [];

    if (committed.active_slot_json && committed.active_slot_json !== '{}') {
      try {
        const sObj = JSON.parse(committed.active_slot_json) as Record<string, unknown>;
        for (const [k, v] of Object.entries(sObj)) {
          if (typeof v === 'string') {
            l1SlotMutations.push({ op: 'UPDATE', slot: k, value: v });
          }
        }
      } catch {}
    }

    let episodicContinuity: any = undefined;
    if (committed.active_summary_json && committed.active_summary_json !== '{}') {
      try {
        const parsedSummary = JSON.parse(committed.active_summary_json);
        if (parsedSummary && typeof parsedSummary === 'object') {
          episodicContinuity = parsedSummary;
        }
      } catch {
        episodicContinuity = { narrative_summary: committed.active_summary_json };
      }
    }

    if (l1SlotMutations.length > 0 || episodicContinuity) {
      await memoryRepository.applyCompaction(roleCardId, space, {
        l1_slot_mutations: l1SlotMutations,
        episodic_continuity: episodicContinuity,
        l2_memory_mutations: [],
      });
    }
  } catch {}
}
