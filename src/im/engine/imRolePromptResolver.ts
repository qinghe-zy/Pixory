/**
 * 伴侣角色卡人设与宏指令统一装配器 (Companion Role Prompt Resolver)
 *
 * 供前台聊天 (useImChatSession)、预约主动唤醒 (imWakeupGenerationService)
 * 与杀后台断联补回 (imBackgroundStreamService) 统一复用，消除重复 JSON 解析与正则构建。
 */

import type {
  ImCompanionPersonalization,
  ImRelationshipPreset,
  ImReplyStyleGear,
} from '../repository/imSettingsRepository';

const CHAR_MACRO_REGEX = /\{\{\s*char\s*\}\}/gi;
const USER_MACRO_REGEX = /\{\{\s*user\s*\}\}/gi;

export const NEUTRAL_FALLBACK_ROLE_PROMPT =
  '你是一位具有独立性格、背景与立场的人物。请完全沉浸在自身设定与当前语境中与对方对话。';

export interface CompanionRoleCardSnapshot {
  name?: string | null;
  prompt?: string | null;
  description?: string | null;
  sourceJson?: string | null;
}

const RELATIONSHIP_PRESET_MAP: Record<string, string> = {
  close_friend: '知心挚友：坦诚相待、温暖信任的挚友关系',
  romantic: '心动伴侣：双向奔赴、亲昵依恋、细腻浪漫',
  friend: '日常朋友：轻松自在、平等真诚的朋友关系',
  mentor: '亦师亦友：引路解惑、沉稳包容、共同成长',
  childhood_sweetheart: '青梅竹马：默契熟稔、打闹斗嘴、知根知底',
  rival_partner: '欢喜冤家：相爱相杀、口嫌体正直、趣味互怼',
  natural: '自然随性：轻松默契、坦然相对的相处感',
  sweet: '亲密依赖：温情甜蜜、彼此挂念的伴侣感',
  partner: '并肩同行：互相支撑、共担风雨的搭档关系',
  gentle: '温和守护：包容沉静、认真倾听的陪伴感',
};

const REPLY_STYLE_GEAR_MAP: Record<string, string> = {
  empathetic: '温柔共情：对情绪更敏感柔和',
  playful: '元气幽默：倾向轻松打趣与活泼表达',
  tsundere: '傲娇口嫌：倾向嘴硬心软、别扭表达',
  clingy_sweet: '甜糯粘人：倾向亲近依恋、多表达挂念',
  concise_cool: '清冷酷飒：倾向言简意赅、内敛克制',
  concise: '清冷克制：言简意赅，少赘述',
  lively: '热情活泼：倾向外向直白、分享感强',
};

function hasExplicitCustomizationFields(personalization: ImCompanionPersonalization): boolean {
  return Boolean(
    personalization.userNickname?.trim() ||
      personalization.companionCallName?.trim() ||
      personalization.userPersonaNote?.trim() ||
      personalization.customRelationshipNote?.trim()
  );
}

/**
 * 判定是否为历史版本遗留的“未定制默认元组” (`close_friend` + `balanced` | 未设置，且无任何自定义称谓/画像/关系说明)。
 *
 * 旧版设置弹窗曾默认自动落盘 `{ relationshipPreset: 'close_friend', replyStyleGear: 'balanced' }`，
 * 在用户未填写任何定制字段时应按零注入处理以尊重角色卡原设；
 * 而当用户显式选择 `{ relationshipPreset: 'close_friend', replyStyleGear: 'role_default' }` 时，
 * 代表用户在新版中主动保留“知心挚友”，必须保留 `close_friend` 关系定位而不能误判为零注入。
 */
export function isLegacyDefaultRelationshipTuple(
  personalization: ImCompanionPersonalization | null | undefined
): boolean {
  if (!personalization) return false;
  const styleGear = personalization.replyStyleGear;
  const isLegacyUnsetOrBalancedStyle = !styleGear || styleGear === 'balanced';
  return (
    personalization.relationshipPreset === 'close_friend' &&
    isLegacyUnsetOrBalancedStyle &&
    !hasExplicitCustomizationFields(personalization)
  );
}

/**
 * 将持久化个性化设置归一化为 UI 弹窗选中态，使弹窗回显与提示词解析层保持一致：
 * 未定制的历史遗留 `{ close_friend, balanced | undefined }` 映射为 `role_default / role_default`，
 * 同时保留显式定制（如附带昵称、`custom`、`romantic` 或 `close_friend + role_default`）。
 */
export function normalizePersonalizationForUi(
  personalization?: ImCompanionPersonalization | null
): { relationshipPreset: ImRelationshipPreset; replyStyleGear: ImReplyStyleGear } {
  if (!personalization || isLegacyDefaultRelationshipTuple(personalization)) {
    return {
      relationshipPreset: 'role_default',
      replyStyleGear: 'role_default',
    };
  }

  return {
    relationshipPreset: personalization.relationshipPreset || 'role_default',
    replyStyleGear: personalization.replyStyleGear || 'role_default',
  };
}

export function resolveCompanionRolePrompt(
  role: CompanionRoleCardSnapshot | null | undefined,
  fallbackName: string = '伴侣',
  personalization?: ImCompanionPersonalization | null
): { rolePrompt: string; companionName: string; personaAnchor: string } {
  const companionCallName = personalization?.companionCallName?.trim();
  const companionName = role?.name?.trim() || fallbackName;
  let fullPrompt = role?.prompt?.trim() || NEUTRAL_FALLBACK_ROLE_PROMPT;

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

  // 可选个性化补充设定（默认遵从角色卡原设时零注入，避免覆盖角色本身世界观与口吻）
  if (personalization) {
    const contractLines: string[] = [];
    if (companionCallName) {
      contractLines.push(
        `• 对方对你的专属称谓: "${companionCallName}"（若对方在对话中以此称呼你，请自然知晓这是指代你并贴合自身性格回应）`
      );
    }
    if (userNickname) {
      contractLines.push(
        `• 对方专属称呼: "${userNickname}"（仅作称呼对方时的称谓参考，依自身人物口吻自然使用）`
      );
    }
    if (personalization.userPersonaNote?.trim()) {
      contractLines.push(`• 对方的自我画像/身份: "${personalization.userPersonaNote.trim()}"`);
    }

    const relPreset = personalization.relationshipPreset;
    if (
      relPreset &&
      relPreset !== 'role_default' &&
      !isLegacyDefaultRelationshipTuple(personalization)
    ) {
      if (relPreset === 'custom') {
        const customNote = personalization.customRelationshipNote?.trim();
        if (customNote) {
          contractLines.push(`• 彼此相处关系定位: ${customNote}`);
        }
      } else {
        const relDesc = RELATIONSHIP_PRESET_MAP[relPreset];
        if (relDesc) {
          contractLines.push(`• 彼此相处关系定位: ${relDesc}`);
        }
      }
    }

    const styleGear = personalization.replyStyleGear;
    if (
      styleGear &&
      styleGear !== 'role_default' &&
      styleGear !== 'balanced' &&
      REPLY_STYLE_GEAR_MAP[styleGear]
    ) {
      contractLines.push(`• 补充表达风格倾向: ${REPLY_STYLE_GEAR_MAP[styleGear]}`);
    }

    if (contractLines.length > 0) {
      contractLines.push(
        '• 补充优先级说明: 以上仅为互动补充偏好，绝不可覆盖角色卡自身的世界观、立场、性格与说话口吻。'
      );
      fullPrompt += `\n\n【专属相处契约与双向默契】\n${contractLines.join('\n')}`;
    }
  }

  const personaAnchor = `[身份锚定: 你是「${companionName}」，请始终站在自身角色立场、性格与所处世界观中回应，无需迁就通用聊天模板]`;

  return { rolePrompt: fullPrompt, companionName, personaAnchor };
}
