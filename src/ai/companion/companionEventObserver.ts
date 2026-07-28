import type { MemorySpeechMode } from '../memory/memoryTypes';
import {
  COMPANION_EVENT_EXTRACTOR_VERSION,
  COMPANION_EVENT_THRESHOLDS,
  NON_EFFECTIVE_SPEECH_MODES,
} from './companionEventPolicy';
import type {
  CompanionEventCandidate,
  CompanionEventCategory,
  CompanionObservedMessage,
} from './companionTypes';
import { hashCompanionMessageVersion, hashCompanionText } from './companionRuntimeValidation';

export interface ObserveCompanionEventsInput {
  message: CompanionObservedMessage;
  branchRouteHash: string;
  lineageVersion: number;
  contextMessages?: Array<Pick<CompanionObservedMessage, 'content' | 'role'>>;
}

export interface ObserveCompanionEventsResult {
  accepted: CompanionEventCandidate[];
  diagnostic: CompanionEventCandidate[];
  speechMode: MemorySpeechMode;
}

type EventMatch = {
  category: CompanionEventCategory;
  subtype: string;
  match: RegExpExecArray;
  confidence: number;
  intensity?: number;
  payload?: Record<string, unknown>;
};

function normalizedText(value: string): string {
  return value.normalize('NFKC').replace(/[\t\r ]+/gu, ' ').replace(/\n{2,}/gu, '\n').trim();
}

function detectSpeechMode(text: string): MemorySpeechMode {
  if (/(?:他说|她说|对方说|有人说|引用|原话).{0,8}[“"「『][\s\S]*[”"」』]/u.test(text)) return 'quoted';
  if (/(?:如果|假如|假设|要是|倘若|suppose|\bif\b)/iu.test(text)) return 'hypothetical';
  if (/(?:开玩笑|玩笑而已|逗你的|just kidding|\bjk\b)/iu.test(text)) return 'joke';
  if (/(?:角色扮演|设定里|剧情里|假装|扮演)/u.test(text)) return 'roleplay';
  if (/(?:我(?:并)?没有|我没(?:有)?|并不是我|那不是我说的|我不曾|never said)/iu.test(text)) return 'negated';
  if (/(?:你(?:记|说|理解)错了|纠正一下|更正一下|不是[^，。！？]{1,30}[，,]\s*(?:而)?是)/u.test(text)) return 'corrected';
  if (/(?:也许|可能|大概|好像|不确定|maybe|perhaps)/iu.test(text)) return 'uncertain';
  return 'asserted';
}

function firstMatch(text: string, pattern: RegExp): RegExpExecArray | null {
  pattern.lastIndex = 0;
  return pattern.exec(text);
}

function allMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))];
}

function detectTemporalPhrases(text: string): string[] {
  const result: string[] = [];
  for (const match of text.matchAll(/(?:今天|明天|后天)(?:早上|上午|中午|下午|晚上)?|(?:下周|每周)[一二三四五六日天]|(?:截止)?\d{1,2}月\d{1,2}日/gu)) {
    const value = match[0].replace(/^截止/u, '');
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function collectMatches(text: string): EventMatch[] {
  const matches: EventMatch[] = [];
  const completedCommitment = firstMatch(text, /(?:结果|消息|通知)[^。！？]{0,12}(?:出来了|收到了|有了)|(?:已经|终于)(?:完成|做完|搞定|结束)了?/u);
  if (completedCommitment) {
    matches.push({ category: 'commitment', confidence: 0.91, match: completedCommitment, subtype: 'completed', payload: { commitmentText: completedCommitment[0].trim() } });
  }
  const cancelledCommitment = firstMatch(text, /(?:不等了|取消(?:这个|这件事)?|这事算了|不打算继续了|别再等了)/u);
  if (cancelledCommitment) {
    matches.push({ category: 'commitment', confidence: 0.91, match: cancelledCommitment, subtype: 'cancelled', payload: { commitmentText: cancelledCommitment[0].trim() } });
  }
  const boundary = firstMatch(text, /(?:请|麻烦)?(?:别|不要|不许|请勿)(?:再)?([^。！？!?]{1,60})/u)
    ?? firstMatch(text, /(?:please\s+)?(?:don't|do not)([^.!?]{1,80})/iu);
  if (boundary) {
    const span = boundary[0];
    const subtype = /(?:叫我|称呼|昵称|call me)/iu.test(span)
      ? 'naming'
      : /(?:话题|提|聊|topic)/iu.test(span)
        ? 'topic'
        : /(?:语气|口气|tone)/iu.test(span)
          ? 'tone'
          : 'behavior';
    matches.push({ category: 'boundary', confidence: 0.94, match: boundary, subtype, payload: { constraint: span.trim(), dismissOpenLoops: /(?:别|不要)(?:再)?(?:问|提)/u.test(span) } });
  }

  const correction = firstMatch(text, /(?:你(?:记|说|理解)错了|纠正一下|更正一下|不是[^，。！？]{1,30}[，,]\s*(?:而)?是[^。！？]{1,40})/u);
  if (correction) {
    matches.push({ category: 'correction', confidence: 0.94, match: correction, subtype: /叫|名字|我是/u.test(correction[0]) ? 'identity' : 'fact', payload: { correction: correction[0].trim() } });
  }

  const commitment = firstMatch(text, /(?:等[^。！？]{1,30}(?:结果|消息|通知)[^。！？]{0,40}(?:告诉你|跟你说|再聊|一起)|(?:今天|明天|后天|下周[一二三四五六日天]|之后|到时候)[^。！？]{0,45}(?:告诉你|跟你说|再聊|一起|完成|确认))/u);
  if (commitment) {
    matches.push({
      category: 'commitment',
      confidence: 0.90,
      match: commitment,
      subtype: 'created',
      payload: {
        commitmentText: commitment[0].trim(),
        temporalPhrases: detectTemporalPhrases(commitment[0]),
        kind: /结果|消息|通知/u.test(commitment[0]) ? 'result_wait' : 'deadline',
      },
    });
  }
  const temporalPhrases = detectTemporalPhrases(text);
  if (temporalPhrases.length > 0 && !commitment) {
    const temporalMatch = firstMatch(text, /(?:今天|明天|后天)(?:早上|上午|中午|下午|晚上)?|下周[一二三四五六日天]|每周[一二三四五六日天]|(?:截止\s*)?\d{1,2}月\d{1,2}日/u);
    if (temporalMatch) {
      matches.push({
        category: 'temporal',
        confidence: 0.88,
        match: temporalMatch,
        subtype: /每周/u.test(temporalMatch[0]) ? 'recurrence' : /截止/u.test(temporalMatch[0]) ? 'deadline' : 'relative_date',
        payload: { temporalPhrases },
      });
    }
  }

  const affects: Array<[string, RegExp]> = [
    ['fatigue', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:累|疲惫|困倦)/gu],
    ['anxiety', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:焦虑|紧张|不安)/gu],
    ['sadness', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:难过|伤心|低落)/gu],
    ['joy', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:开心|高兴|快乐)/gu],
    ['anger', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:生气|愤怒|恼火)/gu],
    ['loneliness', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:孤单|孤独)/gu],
    ['excitement', /(?:我|今天|现在)[^。！？]{0,12}(?:很|好|有点|真的)?(?:兴奋|激动)/gu],
  ];
  for (const [subtype, pattern] of affects) {
    for (const match of allMatches(text, pattern)) {
      matches.push({ category: 'user_affect', confidence: 0.72, intensity: /真的|很|好/u.test(match[0]) ? 0.8 : 0.6, match, subtype, payload: { observation: subtype } });
    }
  }

  const interactions: Array<[string, RegExp, number]> = [
    ['gratitude', /(?:谢谢你|多谢|thank you|thanks)/iu, 0.86],
    ['praise', /(?:你真(?:好|棒|厉害)|做得真好|you(?:'re| are) (?:great|amazing))/iu, 0.82],
    ['question', /(?:[？?]|(?:怎么|为什么|能不能|可以吗))/u, 0.72],
  ];
  for (const [subtype, pattern, confidence] of interactions) {
    const match = firstMatch(text, pattern);
    if (match) matches.push({ category: 'interaction', confidence, match, subtype, payload: {} });
  }
  const apology = firstMatch(text, /(?:对不起|抱歉|是我不好|sorry)/iu);
  if (apology) matches.push({ category: 'relationship', confidence: 0.82, match: apology, subtype: 'apology', payload: {} });
  return matches.slice(0, 12);
}

function toCandidate(input: ObserveCompanionEventsInput, mode: MemorySpeechMode, found: EventMatch): CompanionEventCandidate {
  const start = found.match.index ?? 0;
  const text = found.match[0].trim();
  const end = start + found.match[0].length;
  const versionHash = hashCompanionMessageVersion(input.message);
  const suppressed = NON_EFFECTIVE_SPEECH_MODES.has(mode) || mode === 'negated';
  const confidence = mode === 'uncertain' ? Math.min(found.confidence, 0.6) : found.confidence;
  const threshold = COMPANION_EVENT_THRESHOLDS[found.category];
  const effectiveNow = !suppressed && confidence >= threshold && ['boundary', 'correction', 'commitment'].includes(found.category);
  const normalizedPayload = JSON.stringify(found.payload ?? {});
  const semanticKey = hashCompanionText([
    input.message.id,
    versionHash,
    found.category,
    found.subtype,
    normalizedPayload,
  ].join('\u001F'));
  return {
    category: found.category,
    confidence,
    diagnosticReason: suppressed ? `speech_mode:${mode}` : confidence < threshold ? 'below_threshold' : null,
    effectiveNow,
    evidence: { end, messageId: input.message.id, messageVersionHash: versionHash, start, text },
    extractorVersion: COMPANION_EVENT_EXTRACTOR_VERSION,
    intensity: found.intensity ?? 0.6,
    needsEnrichment: !suppressed && confidence >= 0.55 && confidence < 0.85,
    payload: found.payload ?? {},
    semanticKey,
    sincerity: mode === 'uncertain' ? 0.25 : suppressed ? 0 : 1,
    speechMode: mode,
    subtype: found.subtype,
  };
}

export function observeCompanionEvents(input: ObserveCompanionEventsInput): ObserveCompanionEventsResult {
  if (input.message.role !== 'user' || input.message.status !== 'completed') {
    return { accepted: [], diagnostic: [], speechMode: 'asserted' };
  }
  const text = normalizedText(input.message.content).slice(0, 4000);
  if (!text) return { accepted: [], diagnostic: [], speechMode: 'asserted' };
  const speechMode = detectSpeechMode(text);
  const candidates = collectMatches(text).map((found) => toCandidate(input, speechMode, found));
  return {
    accepted: candidates.filter((candidate) => !candidate.diagnosticReason),
    diagnostic: candidates.filter((candidate) => Boolean(candidate.diagnosticReason)),
    speechMode,
  };
}

export const CompanionEventObserver = { observe: observeCompanionEvents };
