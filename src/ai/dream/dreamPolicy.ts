import { hashCompanionText } from '../companion/companionRuntimeValidation';

export const DREAM_POLICY_VERSION = 'dream-policy-v1';

export type DreamIntent =
  | 'explicit_dream_request'
  | 'active_dream_scene'
  | 'shared_sleep_scene'
  | 'role_sleep_scene'
  | 'bedtime_signal'
  | 'past_dream_report'
  | 'sleep_topic'
  | 'figurative'
  | 'meta_discussion'
  | 'third_party'
  | 'none';

export type DreamSceneState =
  | 'approaching_sleep'
  | 'sleep_established'
  | 'dream_active'
  | 'closing'
  | 'closed';

export interface DreamClassification {
  intentType: DreamIntent;
  participants: string[];
  temporality: 'current' | 'past' | 'hypothetical' | 'unknown';
  assertionMode: 'asserted' | 'negated' | 'quoted' | 'question';
  roleplay: boolean;
  evidenceStrength: 'weak' | 'medium' | 'strong';
  sceneRelation: 'starts' | 'continues' | 'closes' | 'unrelated';
  sourceMessageIds: string[];
  confidence: number;
}

export const dreamIntentProbability: Record<DreamIntent, number> = {
  explicit_dream_request: 0,
  active_dream_scene: 0.55,
  shared_sleep_scene: 0.4,
  role_sleep_scene: 0.3,
  bedtime_signal: 0.1,
  past_dream_report: 0.1,
  sleep_topic: 0,
  figurative: 0,
  meta_discussion: 0,
  third_party: 0,
  none: 0,
};

export const DREAM_CLASSIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intentType', 'participants', 'temporality', 'assertionMode', 'roleplay', 'evidenceStrength', 'sceneRelation', 'sourceMessageIds', 'confidence'],
  properties: {
    intentType: { type: 'string', enum: Object.keys(dreamIntentProbability) },
    participants: { type: 'array', items: { type: 'string' } },
    temporality: { type: 'string', enum: ['current', 'past', 'hypothetical', 'unknown'] },
    assertionMode: { type: 'string', enum: ['asserted', 'negated', 'quoted', 'question'] },
    roleplay: { type: 'boolean' },
    evidenceStrength: { type: 'string', enum: ['weak', 'medium', 'strong'] },
    sceneRelation: { type: 'string', enum: ['starts', 'continues', 'closes', 'unrelated'] },
    sourceMessageIds: { type: 'array', minItems: 1, items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const DREAM_GENERATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', minLength: 4, maxLength: 10 },
    body: { type: 'string', maxLength: 220 },
  },
};

const closingPattern = /(?:醒(?:来|了)|睁开.{0,4}眼|梦醒|天亮|起床|离开.{0,3}梦境|结束.{0,3}(?:睡眠|梦境)|wake(?:s|n|d)?\s*up|open(?:ed|s)?\s+(?:my|your|their)\s+eyes?)/iu;
const manualPattern = /(?:(?:生成|做|写|给我|让我|想看|看看).{0,8}(?:一个|一场|这次|角色的)?梦(?:境)?|(?:梦境|做梦).{0,8}(?:生成|制作|卡片)|(?:make|generate|write|show)\s+(?:me\s+)?(?:a\s+)?dream(?:\s+card)?)/iu;
const pastDreamPattern = /(?:(?:昨晚|刚才|之前|曾经|早上).{0,16}(?:梦见|梦到|做了.{0,3}梦)|(?:做了个梦|梦到过)|(?:last\s+night|earlier|yesterday).{0,24}(?:dream(?:ed|t)?|nightmare))/iu;
const activeDreamPattern = /(?:梦里|梦中|正在做梦|梦见|梦到|噩梦|幻境|半梦半醒|坠入.{0,4}梦|进入.{0,4}梦境|in\s+(?:a|the|my|your|our)\s+dream|dreaming\s+now|nightmare)/iu;
const sharedSleepPattern = /(?:(?:我们|一起|抱着|陪着|相拥|怀里).{0,14}(?:睡|入眠|入睡|闭上眼)|(?:睡|入眠|入睡).{0,14}(?:一起|我们|相拥|怀里)|(?:we|together|in\s+your\s+arms).{0,24}(?:fall\s+asleep|sleep))/iu;
const roleSleepPattern = /(?:(?:你|他|她|角色名).{0,14}(?:睡着|睡熟|入睡|躺下|闭上眼|睡去|打盹|意识模糊)|(?:看着|等着|守在).{0,10}(?:你|他|她).{0,8}(?:睡|入眠)|(?:you|he|she).{0,24}(?:fall(?:s)?\s+asleep|doze(?:s)?\s+off|close(?:s)?\s+(?:your|his|her)\s+eyes))/iu;
const implicitSleepPattern = /(?:呼吸.{0,8}(?:平稳|均匀)|声音.{0,8}(?:越来越轻|低下去)|意识.{0,8}(?:渐远|模糊)|没有回应.{0,8}(?:睡|夜)|breathing.{0,16}(?:steady|slower)|voice.{0,16}(?:fades|quieter))/iu;
const bedtimePattern = /(?:晚安|该睡了|去睡觉|睡觉了|困了|累了|准备睡|休息吧|熄灯|关灯|盖好被子|闭眼休息|躺到床上|good\s*night|sleepy|time\s+for\s+bed|go\s+to\s+sleep)/iu;
const environmentPattern = /(?:床上|枕头|被子|卧室|夜深|夜晚|床边|bedroom|pillow|blanket|bedside)/iu;
const roleplayPattern = /(?:\*[^*]{1,120}\*|（[^）]{1,120}）|\([^)]{1,120}\))/u;
const sleepTopicPattern = /(?:睡眠|失眠|睡不着|睡眠质量|助眠|dream\s+feature|sleep\s+(?:quality|tracking|advice))/iu;

export function detectManualDreamRequest(text: string): boolean {
  return manualPattern.test(text.normalize('NFKC'));
}

export function detectDreamIntent(text: string): {
  intent: DreamIntent;
  sceneState: DreamSceneState;
  candidate: boolean;
  closing: boolean;
} {
  const value = text.normalize('NFKC').slice(0, 5000);
  if (closingPattern.test(value)) {
    return { candidate: false, closing: true, intent: 'none', sceneState: 'closing' };
  }
  if (pastDreamPattern.test(value)) {
    return { candidate: true, closing: false, intent: 'past_dream_report', sceneState: 'dream_active' };
  }
  if (activeDreamPattern.test(value)) {
    return { candidate: true, closing: false, intent: 'active_dream_scene', sceneState: 'dream_active' };
  }
  if (sharedSleepPattern.test(value)) {
    return { candidate: true, closing: false, intent: 'shared_sleep_scene', sceneState: 'sleep_established' };
  }
  if (roleSleepPattern.test(value) || (roleplayPattern.test(value) && implicitSleepPattern.test(value))) {
    return { candidate: true, closing: false, intent: 'role_sleep_scene', sceneState: 'sleep_established' };
  }
  if (bedtimePattern.test(value) || (roleplayPattern.test(value) && environmentPattern.test(value))) {
    return { candidate: true, closing: false, intent: 'bedtime_signal', sceneState: 'approaching_sleep' };
  }
  if (sleepTopicPattern.test(value)) {
    return { candidate: true, closing: false, intent: 'sleep_topic', sceneState: 'closed' };
  }
  return { candidate: false, closing: false, intent: 'none', sceneState: 'closed' };
}

export function deterministicDreamRoll(idempotencyKey: string): number {
  const prefix = hashCompanionText(idempotencyKey).slice(0, 13);
  return Number.parseInt(prefix, 16) / 0x10000000000000;
}

export function dreamFrequencyAllowed(input: {
  totalRounds: number;
  lastDreamSuccessRound: number | null;
  dailyDreamSuccessCount: number;
  dailyDreamReservedCount: number;
  manual?: boolean;
}): boolean {
  if (input.manual) return true;
  if (input.dailyDreamSuccessCount + input.dailyDreamReservedCount >= 2) return false;
  return input.lastDreamSuccessRound == null || input.totalRounds - input.lastDreamSuccessRound >= 50;
}

export function shouldPrepruneDream(roll: number, manual = false, provenUpperBound = dreamIntentProbability.active_dream_scene): boolean {
  return !manual && roll >= provenUpperBound;
}

export function shouldSelectDream(roll: number, classification: DreamClassification): boolean {
  if (!Number.isFinite(classification.confidence) || classification.confidence < 0.7) return false;
  if (classification.assertionMode !== 'asserted' || classification.evidenceStrength === 'weak') return false;
  if (classification.intentType !== 'past_dream_report' && classification.temporality !== 'current') return false;
  return roll < dreamIntentProbability[classification.intentType];
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let escaped = false;
  let quoted = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

export function parseDreamClassification(
  value: string,
  allowedSourceMessageIds?: Set<string>,
): DreamClassification | null {
  try {
    const json = extractFirstJsonObject(value);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    const keys = [
      'intentType', 'participants', 'temporality', 'assertionMode', 'roleplay',
      'evidenceStrength', 'sceneRelation', 'sourceMessageIds', 'confidence',
    ];
    if (Object.keys(object).some((key) => !keys.includes(key)) || keys.some((key) => !(key in object))) return null;
    const intentType = object.intentType as DreamIntent;
    const participants = Array.isArray(object.participants)
      ? object.participants.filter((item): item is string => typeof item === 'string' && item.length <= 40)
      : [];
    const sourceMessageIds = Array.isArray(object.sourceMessageIds)
      ? [...new Set(object.sourceMessageIds.filter((item): item is string => typeof item === 'string'))]
      : [];
    const temporality = object.temporality as DreamClassification['temporality'];
    const assertionMode = object.assertionMode as DreamClassification['assertionMode'];
    const evidenceStrength = object.evidenceStrength as DreamClassification['evidenceStrength'];
    const sceneRelation = object.sceneRelation as DreamClassification['sceneRelation'];
    const confidence = Number(object.confidence);
    if (!(intentType in dreamIntentProbability)) return null;
    if (!['current', 'past', 'hypothetical', 'unknown'].includes(temporality)) return null;
    if (!['asserted', 'negated', 'quoted', 'question'].includes(assertionMode)) return null;
    if (!['weak', 'medium', 'strong'].includes(evidenceStrength)) return null;
    if (!['starts', 'continues', 'closes', 'unrelated'].includes(sceneRelation)) return null;
    if (typeof object.roleplay !== 'boolean' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    if (sourceMessageIds.length === 0 || sourceMessageIds.some((id) => allowedSourceMessageIds && !allowedSourceMessageIds.has(id))) return null;
    return {
      assertionMode,
      confidence,
      evidenceStrength,
      intentType,
      participants,
      roleplay: object.roleplay,
      sceneRelation,
      sourceMessageIds,
      temporality,
    };
  } catch {
    return null;
  }
}

export function parseDreamGeneration(value: string): { title: string; body: string } | null {
  try {
    const json = extractFirstJsonObject(value);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    if (Object.keys(object).some((key) => !['title', 'body'].includes(key))) return null;
    const title = typeof object.title === 'string' ? object.title.trim() : '';
    const body = typeof object.body === 'string' ? object.body.trim() : '';
    const titleLength = [...title].length;
    if (titleLength < 4 || titleLength > 10 || body.length === 0 || [...body].length > 220) return null;
    if (/(?:作为AI|系统提示|提示词|Token|预言成真|现实中你已经)/iu.test(`${title}\n${body}`)) return null;
    return { body, title };
  } catch {
    return null;
  }
}

export type DreamRetryMode = 'retry_same' | 'regenerate_current';

export function presentDreamFailure(code: string | null): {
  message: string;
  actionLabel: string;
  retryMode: DreamRetryMode;
} {
  if (code === 'source_changed') {
    return {
      actionLabel: '按当前对话重新生成',
      message: '原对话来源已经变化，请按当前对话重新生成。',
      retryMode: 'regenerate_current',
    };
  }
  if (code === 'model_unavailable' || code === 'personal_remote_not_authorized') {
    return {
      actionLabel: '配置后重试',
      message: code === 'personal_remote_not_authorized'
        ? '个人空间尚未允许远程模型，请解锁并授权后重试。'
        : '当前没有可用模型，请完成模型配置后重试。',
      retryMode: 'retry_same',
    };
  }
  if (code === 'invalid_generation' || code === 'invalid_classification') {
    return {
      actionLabel: '重试',
      message: '梦境内容没有正确完成，请重试。',
      retryMode: 'retry_same',
    };
  }
  if (code === 'frequency_blocked') {
    return {
      actionLabel: '稍后再试',
      message: '已达到今日次数或仍在梦境间隔内，请稍后再试。',
      retryMode: 'retry_same',
    };
  }
  return {
    actionLabel: '重试',
    message: '梦境生成失败，请稍后重试。',
    retryMode: 'retry_same',
  };
}
