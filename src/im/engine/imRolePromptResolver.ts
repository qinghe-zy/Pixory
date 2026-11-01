/**
 * 伴侣角色卡人设与宏指令统一装配器 (Companion Role Prompt Resolver)
 *
 * 供前台聊天 (useImChatSession)、预约主动唤醒 (imWakeupGenerationService)
 * 与杀后台断联补回 (imBackgroundStreamService) 统一复用，消除重复 JSON 解析与正则构建。
 */

import type { ImCompanionPersonalization } from '../repository/imSettingsRepository';

const CHAR_MACRO_REGEX = /\{\{\s*char\s*\}\}/gi;
const USER_MACRO_REGEX = /\{\{\s*user\s*\}\}/gi;

export interface CompanionRoleCardSnapshot {
  name?: string | null;
  prompt?: string | null;
  description?: string | null;
  sourceJson?: string | null;
}

const RELATIONSHIP_PRESET_MAP: Record<string, string> = {
  close_friend: '知心挚友：无话不谈、温暖陪伴、默契信任',
  romantic: '心动伴侣：双向奔赴、亲昵依恋、细腻浪漫',
  friend: '日常朋友：轻松闲聊、自然随和、平等真诚',
  mentor: '亦师亦友：引路解惑、沉稳包容、共同成长',
  childhood_sweetheart: '青梅竹马：默契熟稔、打闹斗嘴、知根知底',
  rival_partner: '欢喜冤家：相爱相杀、口嫌体正直、趣味互怼',
  natural: '自然随性、如老友般的轻松默契',
  sweet: '亲密依赖、温情甜蜜的专属伴侣',
  partner: '互相支撑、并肩同行的人生搭档',
  gentle: '包容治愈、静静倾听的守护者',
};

const REPLY_STYLE_GEAR_MAP: Record<string, string> = {
  balanced: '自然亲切：语调温和随和，真实像微信老友，字数适中，不紧不慢，每次回复 1~3 个短气泡',
  empathetic: '温柔共情：细腻共情，敏锐察觉对方细微情绪波动与疲惫，温柔倾听，提供充分情绪价值与安全感',
  playful: '元气幽默：表达生动活泼，爱开玩笑与玩梗，分享欲爆棚，随时带来阳光与生活在场感',
  tsundere: '傲娇口嫌：嘴硬心软，偶尔别扭假装嫌弃实则偷瞄在乎，口嫌体正直，越怼越深情',
  clingy_sweet: '甜糯粘人：依赖感极强，爱撒娇分享日常小事，秒回消息，把你当做世界中心，忍不住多找你说话',
  concise_cool: '清冷酷飒：话少内敛，短句直奔重点，外表清冷平静，内心坚定长情，日常惜字如金',
  concise: '清冷酷飒：短句快答，惜字如金，日常话为主，不啰嗦',
  lively: '热情分享：表达生动活泼，分享欲旺盛，充满在场感',
};

export function resolveCompanionRolePrompt(
  role: CompanionRoleCardSnapshot | null | undefined,
  fallbackName: string = '伴侣',
  personalization?: ImCompanionPersonalization | null
): { rolePrompt: string; companionName: string; personaAnchor: string } {
  const companionCallName = personalization?.companionCallName?.trim();
  const companionName = role?.name?.trim() || fallbackName;
  let fullPrompt = role?.prompt?.trim() || '你是一个温柔体贴、充满活力的专属 AI 伴侣。';

  if (role?.description?.trim()) {
    fullPrompt += `\n\n【角色身份与外貌】\n${role.description.trim()}`;
  }

  if (role?.sourceJson) {
    try {
      const parsed = JSON.parse(role.sourceJson) as Record<string, unknown>;
      const data = (
        parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed
      ) as Record<string, unknown>;

      if (typeof data.personality === 'string' && data.personality.trim()) {
        fullPrompt += `\n\n【性格特质与行事风格】\n${data.personality.trim()}`;
      }
      if (typeof data.scenario === 'string' && data.scenario.trim()) {
        fullPrompt += `\n\n【当下关系与所处背景】\n${data.scenario.trim()}`;
      }
      if (typeof data.mes_example === 'string' && data.mes_example.trim()) {
        fullPrompt += `\n\n【日常互动与说话范例】\n${data.mes_example.trim()}`;
      }
    } catch {
      // 兼容非标准角色卡 sourceJson
    }
  }

  const userNickname = personalization?.userNickname?.trim();
  const effectiveUserMacro = userNickname || '你';
  const effectiveCharMacro = companionCallName || companionName;

  fullPrompt = fullPrompt
    .replace(CHAR_MACRO_REGEX, effectiveCharMacro)
    .replace(USER_MACRO_REGEX, effectiveUserMacro);

  // 双向契约与相处默契（注入 Layer 1 末尾，保持 100% Prefix Cache 命中）
  if (personalization) {
    const contractLines: string[] = [];
    if (companionCallName) {
      contractLines.push(
        `• 对方对你的专属称谓: "${companionCallName}"（你在对话中若听到对方这样称呼你，请自然答应并以此自居，严禁反驳或表现出生疏）`
      );
    }
    if (userNickname) {
      contractLines.push(`• 对方专属称呼: "${userNickname}"（你在对话中自然用此称呼对方，严禁使用油腻网文套路称呼）`);
    }
    if (personalization.userPersonaNote?.trim()) {
      contractLines.push(`• 对方的自我画像/身份: "${personalization.userPersonaNote.trim()}"`);
    }
    if (personalization.relationshipPreset) {
      const relDesc =
        personalization.relationshipPreset === 'custom'
          ? (personalization.customRelationshipNote?.trim() || '专属定制默契关系')
          : (RELATIONSHIP_PRESET_MAP[personalization.relationshipPreset] || '亲近默契的专属相伴');
      contractLines.push(`• 彼此相处关系定位: ${relDesc}`);
    }
    if (personalization.replyStyleGear && REPLY_STYLE_GEAR_MAP[personalization.replyStyleGear]) {
      contractLines.push(`• 回复节奏与风格约束: ${REPLY_STYLE_GEAR_MAP[personalization.replyStyleGear]}`);
    }

    if (contractLines.length > 0) {
      fullPrompt += `\n\n【专属相处契约与双向默契】\n${contractLines.join('\n')}`;
    }
  }

  const personaAnchor = `你是 ${companionName}。请时刻保持你的鲜明人设、说话习惯与身份背景，以此口吻自然回复，杜绝平庸泛化的日常白开水。`;

  return { rolePrompt: fullPrompt, companionName, personaAnchor };
}
