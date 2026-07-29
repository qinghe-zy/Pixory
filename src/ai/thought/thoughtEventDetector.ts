import { hashCompanionText } from '../companion/companionRuntimeValidation';

export const THOUGHT_POLICY_VERSION = 'thought-policy-v1';
export type ThoughtEventType = 'vulnerable' | 'hurtful' | 'reconciliation' | 'apology' | 'praise' | 'cold';
export const thoughtEventPriority: Record<ThoughtEventType, number> = { vulnerable: 100, hurtful: 95, reconciliation: 90, apology: 80, praise: 70, cold: 60 };

export const THOUGHT_GENERATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['thoughts'],
  properties: {
    thoughts: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['eventType', 'sourceMessageIds', 'priority', 'body'],
        properties: {
          eventType: { type: 'string', enum: Object.keys(thoughtEventPriority) },
          sourceMessageIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          priority: { type: 'integer' },
          body: { type: 'string', minLength: 30, maxLength: 120 },
        },
      },
    },
  },
};

export interface ThoughtEventCandidate { eventType: ThoughtEventType; priority: number; evidence: { user: string; assistant: string }; semanticKey: string }

const excluded = /(?:翻译|改写|润色|代码|正则|产品|功能|需求|测试|小说|剧本|分析|这句话|引用|假设|举例|第三方|他说|她说|他们说|如果有人)/u;
const quoted = /[“”「」『』"']|(?:原文|台词|句子)(?:是|：|:)/u;
const patterns: Array<[ThoughtEventType, RegExp]> = [
  ['vulnerable', /(?:我.{0,8}(?:害怕|难过|孤独|撑不住|压力很大|想哭|不安|很累|崩溃|脆弱)|不敢.{0,8}(?:告诉|面对)|只有你.{0,8}(?:知道|能听))/u],
  ['hurtful', /(?:你.{0,8}(?:伤害|伤到|让我失望|根本不在乎)|别再理我|我讨厌你|分开吧|不想见你|滚开|吵架|关系结束)/u],
  ['reconciliation', /(?:我原谅你|没关系.{0,8}(?:和好|重新|继续)|我们和好|重新开始|别再生气|愿意再相信)/u],
  ['apology', /(?:对不起|抱歉|是我错了|我不该|我很后悔|请原谅我)/u],
  ['praise', /(?:谢谢你.{0,10}(?:陪|懂|帮|一直)|你真的.{0,8}(?:很好|温柔|可靠|懂我)|我喜欢你|我爱你|有你真好|做得真好)/u],
  ['cold', /(?:随便|哦[。.]?$|嗯[。.]?$|不想说了|别问了|到此为止|先这样吧|没什么好说)/u],
];

function relationshipRelevant(type: ThoughtEventType, user: string, assistant: string): boolean {
  if (type !== 'apology') return true;
  const combined = `${user}\n${assistant}`;
  return /(?:对不起|抱歉).{0,12}(?:你|刚才|那样|伤害|误会|不该)|(?:你|我).{0,12}(?:对不起|抱歉|原谅)/u.test(combined);
}

export function detectThoughtEvents(input: { userText: string; assistantText: string; userMessageVersionHash: string; assistantMessageVersionHash: string }): ThoughtEventCandidate[] {
  const user = input.userText.normalize('NFKC').slice(0, 3000); const assistant = input.assistantText.normalize('NFKC').slice(0, 3000); const combined = `${user}\n${assistant}`;
  if (excluded.test(combined) || quoted.test(user)) return [];
  const result: ThoughtEventCandidate[] = [];
  for (const [eventType, pattern] of patterns) {
    if (!pattern.test(combined) || !relationshipRelevant(eventType, user, assistant)) continue;
    result.push({ eventType, evidence: { assistant: assistant.slice(0, 360), user: user.slice(0, 360) }, priority: thoughtEventPriority[eventType], semanticKey: hashCompanionText([input.userMessageVersionHash, input.assistantMessageVersionHash, eventType].join('\u001F')) });
  }
  return result;
}

export function parseThoughtGeneration(value: string, input: { allowedEventTypes: Set<ThoughtEventType>; allowedSourceMessageIds: Set<string>; allowedSourceIdsByEventType?: Partial<Record<ThoughtEventType, Set<string>>>; limit: number }): Array<{ eventType: ThoughtEventType; sourceMessageIds: string[]; priority: number; body: string }> | null {
  try {
    const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>; if (Object.keys(object).some((key) => key !== 'thoughts') || !Array.isArray(object.thoughts) || object.thoughts.length > input.limit) return null;
    const bodies = new Set<string>(); const output: Array<{ eventType: ThoughtEventType; sourceMessageIds: string[]; priority: number; body: string }> = [];
    for (const item of object.thoughts) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null; const row = item as Record<string, unknown>;
      if (Object.keys(row).some((key) => !['eventType','sourceMessageIds','priority','body'].includes(key))) return null;
      const eventType = row.eventType as ThoughtEventType; const ids = Array.isArray(row.sourceMessageIds) ? row.sourceMessageIds.filter((id): id is string => typeof id === 'string') : [];
      const body = typeof row.body === 'string' ? row.body.trim() : ''; const priority = Number(row.priority); const length = [...body].length;
      const allowedForType = input.allowedSourceIdsByEventType?.[eventType];
      if (!input.allowedEventTypes.has(eventType) || ids.length === 0 || ids.some((id) => !input.allowedSourceMessageIds.has(id) || (allowedForType ? !allowedForType.has(id) : false)) || !Number.isFinite(priority) || priority !== thoughtEventPriority[eventType] || length < 30 || length > 120 || !/我/u.test(body) || bodies.has(body)) return null;
      if (/(?:作为AI|系统|提示词|Token|数据库|我一直在后台思考|你必须|不许离开|只能爱我|惩罚你)/iu.test(body)) return null;
      bodies.add(body); output.push({ body, eventType, priority, sourceMessageIds: [...new Set(ids)] });
    }
    return output;
  } catch { return null; }
}
