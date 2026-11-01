import type { TurnMemoryIntent, TurnMemoryIntentProfile } from './memoryTypes';

const PHATIC_EXACT_SET = new Set([
  '哈哈', '哈哈哈', '哈哈哈哈', '好的', '好滴', '好呀', '好', '收到', '嗯', '嗯嗯', '嗯呐',
  'okk', 'ok', '行', '行吧', '行啊', '去吧', '拜拜', '晚安', '早', '早安', '对', '对的', '对呀', '对呢',
  '是', '是的', '是啊', '是的呢', '确实', '没事的', '没事', '好嘞', '谢啦', '谢谢', '溜了',
]);

const PHATIC_PATTERN_REGEX = /^(哈哈+|嘻嘻+|嘿嘿+|呜呜+|好[的滴呀嘞啊吧]?|嗯[嗯呐]?|ok+k?|行[吧啊]?|去吧|收到|知道了|对[的呀呢]?|是[的呀呢啊]?|确实|谢啦?|晚安|早安|拜拜)$/i;

const TEMPORAL_CUE_REGEX = /(明天|后天|大后天|下周[一二三四五六日天]?|周[一二三四五六日天]|今晚|明早|过几天|这周末|月底|考试|面试|出差|答辩|开会|生日|纪念日)/;

const FACT_MUTATION_REGEX =
  /(我叫|我名字|我今年|我职业|我是做|我大学|我专业|我住在|我老家|我养了|我的小狗|我的猫|我过敏|我不吃|我不喝|我喜欢|我最爱|我习惯|我最近戒|我换了|记住|别忘[了记]|提醒我|我.*(只喝|只吃|爱喝|爱吃|讨厌|喜欢|不爱)|平时(只|喝|吃))/;

const PREFERENCE_DECISION_REGEX = /(吃什么|喝什么|去哪|选哪个|买哪个|推荐|好不好|要不要|哪种好|喝咖啡还是|点外卖|哪家)/;

const EPISODIC_RECALL_REGEX = /(你还记得|上次|之前|那天|那回|那时候|上回|还记得.*吗|前几天|上周说)/;

const EMOTIONAL_CONFIDE_REGEX =
  /(累死[了我]?|太难受[了]?|好烦[啊呀]?|(太|超|特|真|好)开心[了]?|好委屈|抑郁|难过|想哭|太狠了|顶不住|破防[了]?|好想你|抱抱)/;

const DIARY_INQUIRY_REGEX = /(日记|手账|那篇|写了什么|你记的|当时|回忆|记不记得)/;

export function classifyTurnMemoryIntent(
  userInput: string,
  _recentContext?: string
): TurnMemoryIntentProfile {
  const trimmed = (userInput || '').trim();

  // 1. 拍一拍或空消息
  if (!trimmed || trimmed.startsWith('[NUDGE') || trimmed.startsWith('[系统动作提示:')) {
    return {
      intent: 'PHATIC_SHORT_ACK',
      confidence: 1.0,
      topK: 0,
      invokeMemoryModel: false,
      scoreThreshold: 0.99,
      boostCategory: 'none',
      detectedTemporalCue: null,
    };
  }

  // 2. 极短寒暄
  if (trimmed.length <= 6 && (PHATIC_EXACT_SET.has(trimmed.toLowerCase()) || PHATIC_PATTERN_REGEX.test(trimmed))) {
    return {
      intent: 'PHATIC_SHORT_ACK',
      confidence: 0.95,
      topK: 0,
      invokeMemoryModel: false,
      scoreThreshold: 0.99,
      boostCategory: 'none',
      detectedTemporalCue: null,
    };
  }

  const temporalMatch = trimmed.match(TEMPORAL_CUE_REGEX);
  const detectedTemporalCue = temporalMatch ? temporalMatch[0] : null;

  // 3. 事实自述、偏好变更或日程约定
  const hasFactMutation = FACT_MUTATION_REGEX.test(trimmed);
  const hasTemporalSchedule = Boolean(detectedTemporalCue && /(要|去|有|准备|打算|参加|考)/.test(trimmed));

  if (hasFactMutation || hasTemporalSchedule) {
    return {
      intent: 'FACT_OR_COMMITMENT_MUTATION',
      confidence: 0.92,
      topK: 4,
      invokeMemoryModel: true,
      scoreThreshold: 0.28,
      boostCategory: 'fact',
      detectedTemporalCue,
    };
  }

  // 4. 追忆与指代检索
  if (EPISODIC_RECALL_REGEX.test(trimmed)) {
    return {
      intent: 'EPISODIC_RECALL',
      confidence: 0.88,
      topK: 5,
      invokeMemoryModel: false,
      scoreThreshold: 0.22,
      boostCategory: 'episode',
      detectedTemporalCue,
    };
  }

  // 5. 偏好与决策求助
  if (PREFERENCE_DECISION_REGEX.test(trimmed)) {
    return {
      intent: 'PREFERENCE_DECISION',
      confidence: 0.85,
      topK: 4,
      invokeMemoryModel: false,
      scoreThreshold: 0.25,
      boostCategory: 'preference',
      detectedTemporalCue,
    };
  }

  // 6. 情绪倾诉
  if (EMOTIONAL_CONFIDE_REGEX.test(trimmed)) {
    return {
      intent: 'EMOTIONAL_CONFIDE',
      confidence: 0.86,
      topK: 3,
      invokeMemoryModel: false,
      scoreThreshold: 0.20,
      boostCategory: 'episode',
      detectedTemporalCue,
    };
  }

  // 7. 日记/手账回忆追问
  if (DIARY_INQUIRY_REGEX.test(trimmed)) {
    return {
      intent: 'DIARY_INQUIRY',
      confidence: 0.90,
      topK: 4,
      invokeMemoryModel: false,
      scoreThreshold: 0.15,
      boostCategory: 'diary',
      detectedTemporalCue,
    };
  }

  // 8. 通用情境对话（自适应记忆召回，降低门槛至 0.18）
  return {
    intent: 'GENERAL_CHAT',
    confidence: 0.7,
    topK: trimmed.length > 8 ? 3 : 2,
    invokeMemoryModel: false,
    scoreThreshold: 0.18,
    boostCategory: 'none',
    detectedTemporalCue,
  };
}
