import type { ActivityLoad, PrivacyContext, DeviceAccess, ImCompanionLivingState } from '../types';
import type { EffectiveDndConfig } from '../heartbeat/imDndGuard';
import { parseNaturalTimeToTimestamp } from './naturalTimeParser';

export interface ParsedStatusTag {
  statusText: string;
  activityLoad?: ActivityLoad;
  privacyContext?: PrivacyContext;
  deviceAccess?: DeviceAccess;
  alterDelta?: number;
}

export interface ParsedHeartbeatTag {
  delayMs: number;
  message: string;
}

export interface ParsedNudgeTag {
  action: string;
}

export interface ParsedPingTag {
  targetTimestamp: number;
  intent: string;
}

export interface ParsedStickerTag {
  emotion: string;
  rawTag: string;
}

export interface ParsedVoiceTag {
  text: string;
  rawTag: string;
  styleDirective?: string;
  ttsScript?: string;
  uiTranscript?: string;
}

export interface VoicePayloadTracks {
  styleDirective?: string;
  ttsScript: string;
  uiTranscript: string;
}

export interface ParsedDocumentTag {
  title: string;
  uri?: string;
  content: string;
  rawTag: string;
}

export interface DocumentPatchOperation {
  op: 'replace' | 'append' | 'prepend';
  targetBlockId?: string; // 如 "[[BLK_0002]]"，若未指定则在全文定位
  search: string;
  replace: string;
}

export interface ParsedDocumentPatchTag {
  baseMsgId: string;
  title: string;
  patchContent: string;
  operations: DocumentPatchOperation[];
  rawTag: string;
}

// 模块级提升的协议标签正则 (js-hoist-regexp)
const NUDGE_TAG_REGEX = /\[NUDGE(?::\s*([^\]]+))?\]/i;
const STATUS_TAG_REGEX = /\[STATUS:\s*([^\]]+)\]/i;
const HEARTBEAT_TAG_REGEX = /\[HEARTBEAT:\s*([^|\]]+)\|\s*([^\]]+)\]/i;
const PING_TAG_REGEX = /\[PING:\s*([^|\]]+)\|\s*([^\]]+)\]/i;
export const STICKER_TAG_REGEX = /[\[【]\s*(?:STICKER|表情)\s*[:：]\s*([^\]】]{1,10}?)\s*[\]】]/i;
export const VOICE_TAG_INLINE_COLON_REGEX = /[\[【]\s*(?:VOICE|语音)\s*[:：]\s*([^\]】]+?)\s*[\]】]/i;
export const VOICE_TAG_OUTSIDE_COLON_REGEX = /^[\[【]\s*(?:VOICE|语音)\s*[\]】]\s*[:：]?\s*([\s\S]+)$/i;
export const EMBEDDED_VOICE_OUTSIDE_REGEX = /[\[【]\s*(?:VOICE|语音)\s*[\]】]\s*[:：]?\s*([^\[\]【】]+)/i;
export const VOICE_TAG_REGEX = /[\[【]\s*(?:VOICE|语音)\s*(?:[:：]\s*([^\]】]+?)\s*[\]】]|[\]】]\s*[:：]?\s*([^\[\]【】]+))/i;
const DOCUMENT_BLOCK_REGEX = /\[(?:DOCUMENT|DOC):\s*([^\]\n]+)\]([\s\S]*?)\[\/(?:DOCUMENT|DOC)\]/i;
const DOCUMENT_INLINE_REGEX = /\[(?:DOCUMENT|DOC):\s*([^|\]\n]+)\|\s*([\s\S]+?)\]/i;
const DOCUMENT_PATCH_BLOCK_REGEX = /\[(?:DOCUMENT_PATCH|DOC_PATCH):\s*([^|\]\n]+?)\s*\|\s*([^\]\n]+?)\]([\s\S]*?)\[\/(?:DOCUMENT_PATCH|DOC_PATCH)\]/i;

/**
 * 解析大模型发回的文档卡片协议
 * 支持多行闭合块 [DOCUMENT: 标题.docx] 正文 [/DOCUMENT]
 * 与行内管道格式 [DOCUMENT: 标题.docx | 正文]
 */
export function parseDocumentTag(text: string): ParsedDocumentTag | null {
  if (!text) return null;
  // 1. 优先尝试块状闭合格式 [/DOCUMENT] 或 [/DOC]
  const blockMatch = text.match(DOCUMENT_BLOCK_REGEX);
  if (blockMatch) {
    const title = blockMatch[1].trim();
    const content = blockMatch[2].trim();
    if (title && content) {
      return {
        title,
        uri: title,
        content,
        rawTag: blockMatch[0],
      };
    }
  }

  // 2. 尝试行内管道格式 [DOCUMENT: filename.docx | content]
  const inlineMatch = text.match(DOCUMENT_INLINE_REGEX);
  if (inlineMatch) {
    const title = inlineMatch[1].trim();
    const content = inlineMatch[2].trim();
    if (title && content) {
      return {
        title,
        uri: title,
        content,
        rawTag: inlineMatch[0],
      };
    }
  }

  return null;
}

/**
 * 弹性解析 SEARCH/REPLACE 块与 APPEND 指令，容忍 4~8 个定界符与可选块锚点
 */
export function parsePatchOperations(patchBody: string): DocumentPatchOperation[] {
  const ops: DocumentPatchOperation[] = [];
  const lines = patchBody.replace(/\r\n/g, '\n').split('\n');

  let currentBlockId: string | undefined;
  let mode: 'idle' | 'search' | 'replace' | 'append' = 'idle';
  let searchBuf: string[] = [];
  let replaceBuf: string[] = [];

  const flushAppendIfNeeded = () => {
    if (mode === 'append' && replaceBuf.length > 0) {
      ops.push({
        op: 'append',
        targetBlockId: currentBlockId,
        search: '',
        replace: replaceBuf.join('\n').trim(),
      });
      replaceBuf = [];
      mode = 'idle';
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. 检测块级指令头：@@ PATCH [[BLK_0002]] @@ 或 @@ PATCH [[BLK_a3f1c2e4]] @@ 或 @@ APPEND_AFTER [[BLK_0003]] @@
    const headerMatch = trimmed.match(/^@@\s*(PATCH|APPEND(?:_AFTER)?|PREPEND)\s*(\[\[BLK_[0-9a-fA-F_]+\]\])?\s*@@/i);
    if (headerMatch) {
      flushAppendIfNeeded();
      const action = headerMatch[1].toUpperCase();
      currentBlockId = headerMatch[2] ? headerMatch[2].toUpperCase() : undefined;
      if (action.startsWith('APPEND')) {
        mode = 'append';
        replaceBuf = [];
      }
      continue;
    }

    // 独立出现的 [[BLK_xxxx]] 行（兼容纯数字与十六进制哈希）
    const standaloneBlk = trimmed.match(/^(\[\[BLK_[0-9a-fA-F_]+\]\])$/i);
    if (standaloneBlk && mode === 'idle') {
      currentBlockId = standaloneBlk[1];
      continue;
    }

    // 2. 检测 <<<<<<< SEARCH
    if (/^<{4,8}\s*SEARCH/i.test(trimmed)) {
      flushAppendIfNeeded();
      mode = 'search';
      searchBuf = [];
      replaceBuf = [];
      continue;
    }

    // 3. 检测 =======
    if (/^={4,8}$/.test(trimmed) && mode === 'search') {
      mode = 'replace';
      continue;
    }

    // 4. 检测 >>>>>>> REPLACE
    if (/^>{4,8}\s*REPLACE/i.test(trimmed) && mode === 'replace') {
      ops.push({
        op: 'replace',
        targetBlockId: currentBlockId,
        search: searchBuf.join('\n'),
        replace: replaceBuf.join('\n'),
      });
      mode = 'idle';
      searchBuf = [];
      replaceBuf = [];
      continue;
    }

    if (mode === 'search') {
      searchBuf.push(line);
    } else if (mode === 'replace' || mode === 'append') {
      replaceBuf.push(line);
    }
  }

  flushAppendIfNeeded();
  return ops;
}

/**
 * 解析大模型发回的文档补丁协议 [DOCUMENT_PATCH: baseMsgId | 标题.ext] ... [/DOCUMENT_PATCH]
 */
export function parseDocumentPatchTag(text: string): ParsedDocumentPatchTag | null {
  if (!text) return null;
  const match = text.match(DOCUMENT_PATCH_BLOCK_REGEX);
  if (!match) return null;

  const baseMsgId = match[1].trim();
  const title = match[2].trim();
  const patchContent = match[3].trim();
  const operations = parsePatchOperations(patchContent);

  return {
    baseMsgId,
    title,
    patchContent,
    operations,
    rawTag: match[0],
  };
}

/**
 * 解析大模型返回的 [STICKER: 情绪词] 或 【表情: 情绪词】
 */
export function parseStickerTag(text: string): ParsedStickerTag | null {
  if (!text) return null;
  const match = text.match(STICKER_TAG_REGEX);
  if (!match) return null;
  const emotion = match[1]?.trim();
  if (!emotion) return null;
  return { emotion, rawTag: match[0] };
}

/**
 * 白名单拟声词：支持直接传给支持副语言合成的 TTS 引擎（如小米 MiMo）
 */
export const PARALINGUISTIC_SOUND_WHITELIST_REGEX =
  /^[（\(]\s*(?:叹气|叹了口气|深深叹气|打哈欠|哈欠|轻笑|冷笑|苦笑|傻笑|抽泣|抽噎|哽咽|咳嗽|轻咳|倒吸一口凉气|深吸一口气|深呼吸|清了清嗓子|小声抽泣)\s*[）\)]$/;

/**
 * 解析语音 Payload 中的语气指令、TTS 读音脚本、UI 转录文本
 */
export function parseVoicePayload(rawContent: string): VoicePayloadTracks {
  if (!rawContent) {
    return { ttsScript: '', uiTranscript: '' };
  }
  let working = rawContent.trim();
  let styleDirective: string | undefined;

  // 1. 提取显式语气指令（支持尖括号 <style:xxx> 或方括号 [语气:xxx] 或 [style:xxx]）
  const styleMatch = working.match(/(?:<style[:=]\s*([^>]+)>|\[(?:style|语气)[:=]\s*([^\]]+)\])/i);
  if (styleMatch) {
    styleDirective = (styleMatch[1] || styleMatch[2])?.trim();
    working = working.replace(styleMatch[0], '').trim();
  }

  // 管道格式支持：[VOICE: 撒娇轻嗔 | 快睡啦，别熬夜]
  if (!styleDirective && working.includes('|')) {
    const pipeParts = working.split('|').map((p) => p.trim());
    if (pipeParts.length >= 2 && pipeParts[0].length <= 15) {
      styleDirective = pipeParts[0];
      working = pipeParts.slice(1).join('|').trim();
    }
  }

  // 2. 区分拟声词与纯舞台动作
  // 白名单内的拟声词保留在 ttsScript（如（打哈欠））；非白名单舞台动作（如（揉了揉眼睛，拉上被子））从 ttsScript 剔除，但保留在 uiTranscript 中
  const actionRegex = /[（\(]([^）\)]+)[）\)]/g;
  let ttsScript = working.replace(actionRegex, (match, inner) => {
    if (PARALINGUISTIC_SOUND_WHITELIST_REGEX.test(match.trim())) {
      return match;
    }
    if (!styleDirective && inner.length <= 15 && /(?:笑|哭|困|嗔|撒娇|轻声|低语|冷|叹|软|温柔|急|快|慌|颤|低沉|耳语)/.test(inner)) {
      styleDirective = inner.trim();
    }
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  if (!ttsScript) {
    ttsScript = working.replace(/[（\(][^）\)]+[）\)]/g, '').trim() || working;
  }

  return {
    styleDirective,
    ttsScript,
    uiTranscript: working,
  };
}

/**
 * 解析大模型返回的语音条协议
 * 具备极高容错性，全面兼容以下形式：
 * 1. 标准内联冒号：[VOICE: 语音内容] 或 【语音: 语音内容】
 * 2. 剧本外置冒号：[VOICE]: 语音内容、[VOICE]：语音内容、[VOICE] 语音内容
 * 3. 中文标签与空格：【语音】: 语音内容、[语音]: 语音内容
 */
export function parseVoiceTag(text: string): ParsedVoiceTag | null {
  if (!text) return null;
  const trimmed = text.trim();

  // 综合匹配标准内联冒号 [VOICE: ...]、外置冒号 [VOICE]: ... 及嵌入变体
  const match =
    trimmed.match(VOICE_TAG_INLINE_COLON_REGEX) ||
    trimmed.match(VOICE_TAG_OUTSIDE_COLON_REGEX) ||
    trimmed.match(EMBEDDED_VOICE_OUTSIDE_REGEX);

  if (!match || !match[1]?.trim()) return null;

  const voiceContent = match[1].trim();
  const payload = parseVoicePayload(voiceContent);
  return {
    text: payload.uiTranscript,
    rawTag: match[0],
    styleDirective: payload.styleDirective,
    ttsScript: payload.ttsScript,
    uiTranscript: payload.uiTranscript,
  };
}

/**
 * 解析 [NUDGE] 或 [NUDGE: 动作描述]
 */
export function parseNudgeTag(text: string): ParsedNudgeTag | null {
  const match = text.match(NUDGE_TAG_REGEX);
  if (!match) return null;
  const rawAction = match[1]?.trim();
  const action = rawAction || '小脑瓜';
  return { action };
}

/**
 * 解析大模型返回的 [STATUS: 动作描述 | load=... | privacy=... | device=... | alter=...]
 */
export function parseStatusTag(text: string): ParsedStatusTag | null {
  const match = text.match(STATUS_TAG_REGEX);
  if (!match) return null;
  const inner = match[1].trim();
  const parts = inner.split('|').map((p) => p.trim());
  const statusText = parts[0] || '在线';
  const result: ParsedStatusTag = { statusText };

  for (let i = 1; i < parts.length; i++) {
    const [rawKey, rawVal] = parts[i].split('=').map((s) => s.trim().toLowerCase());
    if (rawKey === 'load' && (rawVal === 'free' || rawVal === 'occupied' || rawVal === 'sleeping')) {
      result.activityLoad = rawVal;
    } else if (rawKey === 'privacy' && (rawVal === 'private' || rawVal === 'public')) {
      result.privacyContext = rawVal;
    } else if (rawKey === 'device' && (rawVal === 'available' || rawVal === 'limited' || rawVal === 'away')) {
      result.deviceAccess = rawVal;
    } else if (rawKey === 'alter') {
      const delta = parseInt(rawVal, 10);
      if (!isNaN(delta)) {
        result.alterDelta = Math.max(-1, Math.min(1, delta));
      }
    }
  }
  return result;
}

/**
 * 解析 [HEARTBEAT: delay | message] 预埋气泡信封
 */
export function parseHeartbeatTag(text: string): ParsedHeartbeatTag | null {
  const match = text.match(HEARTBEAT_TAG_REGEX);
  if (!match) return null;
  const rawDelay = match[1].trim().toLowerCase();
  const message = match[2].trim();
  let delayMs = 15 * 60 * 1000;

  if (rawDelay.endsWith('m')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 60 * 1000;
  } else if (rawDelay.endsWith('h')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 3600 * 1000;
  } else if (rawDelay.endsWith('s')) {
    delayMs = Math.max(1, parseInt(rawDelay, 10)) * 1000;
  } else {
    const num = parseInt(rawDelay, 10);
    if (!isNaN(num)) delayMs = num * 60 * 1000;
  }

  return { delayMs, message };
}

/**
 * 解析 [PING: 相对/绝对时间 | 计划联络意图] 预约主动唤醒闹钟
 * 示例：[PING: 22:30 | 问他回寝室没] 或 [PING: +45m | 问问洗完澡没]
 */
export function parsePingTag(
  text: string,
  now: number = Date.now(),
  livingState?: ImCompanionLivingState,
  dndConfig?: EffectiveDndConfig | null
): ParsedPingTag | null {
  const match = text.match(PING_TAG_REGEX);
  if (!match) return null;
  const rawTimeStr = match[1].trim();
  const rawIntent = match[2].trim();

  const parsedTime = parseNaturalTimeToTimestamp(rawTimeStr, now, livingState, dndConfig);
  if (!parsedTime) return null;

  let finalTimestamp = parsedTime.targetTimestamp;
  // 若伴侣处于 occupied 或 away，且目标时间落在忙碌时间内，顺延至忙碌结束后
  if (livingState) {
    if (
      (livingState.activityLoad === 'occupied' || livingState.deviceAccess === 'away') &&
      livingState.validUntil > finalTimestamp
    ) {
      finalTimestamp = livingState.validUntil + 5 * 60 * 1000;
    }
  }

  return {
    targetTimestamp: finalTimestamp,
    intent: rawIntent,
  };
}

/**
 * ScriptCommit 出站自洽守卫
 *
 * 核心规则：
 * 1. 若伴侣进入 sleeping，丢弃近期心跳（或推迟至次晨），杜绝“刚说睡了 15 分钟后又发消息”；
 * 2. 若伴侣处于 occupied 或 away，强制 heartBeat.delayMs >= (validUntil - now)，确保忙完后才联系。
 */
export function validateHeartbeatConsistency(
  heartbeat: ParsedHeartbeatTag | null,
  livingState: { activityLoad: ActivityLoad; deviceAccess: DeviceAccess; validUntil: number },
  now: number = Date.now()
): ParsedHeartbeatTag | null {
  if (!heartbeat) return null;

  // 1. 睡觉期间拦截丢弃近期心跳
  if (livingState.activityLoad === 'sleeping') {
    return null;
  }

  // 2. 忙碌或脱手状态，必须等任务自然结束后才触发
  const remainingBusyMs = Math.max(0, livingState.validUntil - now);
  if (
    (livingState.activityLoad === 'occupied' || livingState.deviceAccess === 'away') &&
    remainingBusyMs > 0
  ) {
    if (heartbeat.delayMs < remainingBusyMs) {
      return {
        ...heartbeat,
        delayMs: remainingBusyMs + 5 * 60 * 1000, // 忙完后 5 分钟联系
      };
    }
  }

  return heartbeat;
}
