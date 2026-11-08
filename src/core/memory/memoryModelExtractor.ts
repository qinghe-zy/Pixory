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

  const candidates = params.existingFacts && params.existingFacts.length > 0
    ? params.existingFacts
    : await memoryRepository.recallCandidateMemoriesForMutation(roleCardId, space, userMessage, 5);

  const existingXml = candidates.length > 0
    ? candidates.map((f) => `  <item id="${f.id}" category="${f.category}">${f.content}</item>`).join('\n')
    : '  <item id="none">暂无已有记忆</item>';

  const systemPrompt = `你是一个轻量级高精度的伴聊认知记忆提取与冲突仲裁专家。严格以 JSON 格式输出。
基准日期为：${benchmarkDate}。

<extraction_rules>
1. 语态过滤（严禁提取气话与口嗨）：若用户处于情绪宣泄、赌气、反讽或开玩笑状态（如“气死我了明天就辞职去卖烤肠/天桥贴膜”），严禁提取为 L2_FACT 或 commitment，仅允许在 l1_slot_mutations 中记录 user_mood。
2. 跨字面状态演进覆写：对比 <existing_l2_memories>，若用户最新表述推翻、修正或完成了某条旧记忆（即使字面用词完全不同，如“已签Offer下周去入职”推翻了“正在准备考研”），必须输出 op="SUPERSEDE" 并准确填写 targetId。
3. 相对日期转换与时效归一化：相对日期（如“明天下午考高数”、“下周三出差”）必须换算为绝对日期 [YYYY-MM-DD]。短期一次性安排必须归为 L2_EPISODE。
4. 严格过滤垃圾信息：严禁提取瞬态生理动作（洗澡/刷牙/上厕所/喝水/吃饱/犯困）与闲聊语气词。无长期价值信息时返回空数组。
</extraction_rules>

【输出 JSON Schema】:
{
  "l1_slot_mutations": [{"op": "UPDATE", "slot": "user_mood", "value": "心情描述"}],
  "mutations": [{"op": "ADD"|"UPDATE"|"SUPERSEDE", "targetId": "string|null", "content": "记忆内容", "tier": "L2_FACT"|"L2_EPISODE", "importance": 7, "entities": ["实体名"], "expanded_triggers": ["触发词"]}]
}`;

  const userPrompt = `<existing_l2_memories>
${existingXml}
</existing_l2_memories>

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
    if (!parsed) {
      return memoryRepository.harvestImmediateUserFacts(roleCardId, space, userMessage);
    }

    const rawMutations = Array.isArray(parsed.mutations) ? parsed.mutations : [];
    const l1Slots = Array.isArray(parsed.l1_slot_mutations) ? parsed.l1_slot_mutations : [];

    // 语态双重安全门禁：若用户处于极端情绪宣泄，拦截其提取为长期事实
    const isVentMessage = /(?:气死|烦死|累死|崩溃|受够).*(?:辞职|离职|退学|不读了|卖烤肠|卖红薯|贴膜|要饭|摆摊)/.test(userMessage);

    const mutations: L2MemoryMutation[] = rawMutations
      .filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
      .filter((m: any) => {
        if (isVentMessage && (m.tier === 'L2_FACT' || m.category?.includes('preference') || m.category?.includes('identity'))) {
          return false;
        }
        return true;
      })
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

    if (mutations.length > 0 || l1Slots.length > 0) {
      await memoryRepository.applyCompaction(roleCardId, space, {
        l1_slot_mutations: l1Slots.map((s: any) => ({
          op: s.op === 'DELETE' ? ('DELETE' as const) : s.op === 'ADD' ? ('ADD' as const) : ('UPDATE' as const),
          slot: s.slot || 'user_mood',
          value: s.value || '',
        })),
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
