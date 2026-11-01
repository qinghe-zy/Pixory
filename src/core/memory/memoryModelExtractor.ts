import type { PixorySpace } from '../../database';
import { getMemoryModelProviderConfig } from '../llm-transport/secureApiKey';
import { streamClient } from '../llm-transport/streamClient';
import type { LlmTransportMessage } from '../llm-transport/types';
import { memoryRepository } from './memoryRepository';
import type { CompanionMemoryRecord, L2MemoryMutation } from './memoryTypes';

export interface MemoryModelExtractionParams {
  space: PixorySpace;
  roleCardId: string;
  chatProviderId?: string | null;
  chatModelId?: string | null;
  userMessage: string;
  assistantMessage?: string | null;
  existingFacts?: CompanionMemoryRecord[];
  baseTimestamp?: number;
}

function extractJsonObject(text: string): any {
  if (!text) return null;
  try {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const raw = fenced?.[1] ? fenced[1].trim() : text;
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function extractMemoryMutationsWithMemoryModel(
  params: MemoryModelExtractionParams
): Promise<number> {
  const { space, roleCardId, userMessage } = params;
  if (!userMessage || userMessage.trim().length < 3) return 0;

  // 1. 获取记忆模型配置
  const modelConfig = await getMemoryModelProviderConfig(
    space,
    params.chatProviderId,
    params.chatModelId
  ).catch(() => null);

  // 若未配置有效 Key，直接回退到本地即时启发式提取
  if (!modelConfig || !modelConfig.apiKey) {
    return memoryRepository.harvestImmediateUserFacts(roleCardId, space, userMessage);
  }

  const baseTime = params.baseTimestamp || Date.now();
  const d = new Date(baseTime);
  const benchmarkDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

  const existing = params.existingFacts ?? (await memoryRepository.listCoreProfileFacts(roleCardId, space, 10));
  const existingSummary = existing.map((f) => `- [ID: ${f.id}] ${f.content}`).join('\n') || '暂无已有记忆';

  const systemPrompt = `你是一个轻量级高精度的伴聊记忆提取与冲突消解专家。严格以 JSON 格式输出记忆增量。
基准日期为：${benchmarkDate}。
【核心准则】:
1. 仅依据【用户本人自述】提取事实。绝对禁止采信【伴侣回复】中未经证实的单方面猜测！
2. 相对日期（如“明天下午考高数”、“下周三出差”）必须换算为绝对日期 [YYYY-MM-DD]（如 [${benchmarkDate}] 下午考高数）。
3. 偏好演进与冲突消解：若用户宣布新喜好或变更习惯（如“我戒咖啡改喝乌龙茶了”），且已有记忆中有冲突旧记录，输出 {"op": "SUPERSEDE", "targetId": "原有记忆ID", "content": "..."}。
4. 严格过滤垃圾信息：严禁提取瞬态生理动作（洗澡/刷牙/上厕所/喝水/吃饱/犯困）与闲聊语气词。无长期价值信息时返回 {"mutations": []}。
【输出 JSON Schema】:
{"mutations": [{"op": "ADD"|"UPDATE"|"SUPERSEDE", "targetId": "string|null", "content": "记忆内容", "tier": "L2_FACT"|"L2_EPISODE", "importance": 7, "entities": ["实体名"], "expanded_triggers": ["触发词"]}]}`;

  const userPrompt = `【已有核心记忆】:
${existingSummary}

【本轮对话】:
【用户本人自述】: ${userMessage.trim()}
【伴侣回复(仅作语境参考)】: ${(params.assistantMessage || '').trim() || '无'}`;

  const messages: LlmTransportMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const result = await streamClient.completeText(messages, {
      providerId: modelConfig.providerId,
      modelId: modelConfig.modelId,
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      protocol: modelConfig.protocol,
      temperature: 0.1,
      maxTokens: 600,
    });

    const parsed = extractJsonObject(result.text);
    if (!parsed || !Array.isArray(parsed.mutations) || parsed.mutations.length === 0) {
      // 兜底本地启发式
      return memoryRepository.harvestImmediateUserFacts(roleCardId, space, userMessage);
    }

    const mutations: L2MemoryMutation[] = parsed.mutations
      .filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
      .map((m: any) => ({
        op: m.op === 'SUPERSEDE' ? ('SUPERSEDE' as const) : m.op === 'UPDATE' ? ('UPDATE' as const) : ('ADD' as const),
        targetId: typeof m.targetId === 'string' ? m.targetId : undefined,
        content: m.content.trim(),
        importance: typeof m.importance === 'number' ? m.importance : 7,
        entities: Array.isArray(m.entities) ? m.entities : [],
        expanded_triggers: Array.isArray(m.expanded_triggers) ? m.expanded_triggers : [],
        tier: m.tier === 'L2_EPISODE' ? ('L2_EPISODE' as const) : ('L2_FACT' as const),
        confidence: 0.95,
      }));

    if (mutations.length > 0) {
      await memoryRepository.applyCompaction(roleCardId, space, {
        l2_memory_mutations: mutations,
      });
      return mutations.length;
    }
  } catch {
    // 远程失败时本地启发式保底
    return memoryRepository.harvestImmediateUserFacts(roleCardId, space, userMessage);
  }

  return 0;
}
