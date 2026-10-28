import type { LlmTransportMessage } from '../../core/llm-transport/types';
import type { CompanionMemoryRecord, MemoryRecallCandidate } from '../../core/memory/memoryTypes';
import type { ImMessage, ImCompanionLivingState } from '../types';

export interface ContextBuilderOptions {
  rolePrompt: string;
  roleName?: string;
  l1Slots?: CompanionMemoryRecord[];
  l1Summary?: CompanionMemoryRecord | null;
  historyMessages: ImMessage[];
  windowN?: number;
  anchorMessageId?: string;
  recalledMemories?: MemoryRecallCandidate[];
  companionStatus?: string;
  livingState?: ImCompanionLivingState;
  now?: number;
  currentImageBase64?: string | null;
}

const IM_PROTOCOL_PROMPT = `
【伴侣短聊天协议】
1. 拟真即时通讯风格，单句极度口语精炼（每句 5~25 字），充满真实在场陪伴感。允许在气泡中使用中文括号（...）自然流露细微神态、肢体小动作或内心戏，形成生动层次。
2. 【核心强制规范】你必须像在手机上连续发送多条短消息一样，将完整回复切分为 2~4 个短气泡，每句话之间必须使用 [BR] 隔开！严禁合并成一大段话！
3. 【核心沉浸·状态栏详尽场景与潜台词】会话名正下方常驻展示你当前的生活状态与隐秘心声（已接入平滑循环跑马灯，无需担心字数截断）。每一轮回复末尾你都必须附带最新状态: [STATUS: 场景与心声(20~50字) | load=free|occupied|sleeping | privacy=private|public | device=available|limited|away | alter=增量(-1~+1)]。详细写明你此刻的物理环境细节、身体动作、以及对刚刚聊天的秘密心声。
4. 严禁在气泡正文中直接暴露协议说明或标签语法。

【正例示范】
用户：今天上班好累呀，你在干嘛呢？
回复：抱抱你~[BR]（有些心疼地看着你发来的文字）[BR]快躺下休息会儿[BR]我刚刚泡了杯热可可，分你一半！[STATUS: 趴在被窝里单手打字，耳根还有点热，心里悄悄反复回味你刚才说的那句话，期待明天的见面 | load=free | privacy=private | device=available | alter=+0.3]
`.trim();

export function coalesceHistoryBurstMessages(
  messages: ImMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const last = result[result.length - 1];
    if (last && last.role === msg.role && msg.role === 'assistant') {
      last.content += `[BR]${msg.content}`;
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }
  return result;
}

export function roleSanitizerPipeline(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (turns.length === 0) return [];
  let startIdx = 0;
  while (startIdx < turns.length && turns[startIdx].role === 'assistant') startIdx += 1;
  const stripped = turns.slice(startIdx);
  if (stripped.length === 0) return [];

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of stripped) {
    const safeContent = item.content.length > 4000
      ? `${item.content.slice(0, 1500)}\n[...已折叠过长历史片段...]\n${item.content.slice(-1500)}`
      : item.content;
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) {
      last.content += `\n${safeContent}`;
    } else {
      merged.push({ role: item.role, content: safeContent });
    }
  }
  return merged;
}

export function sliceAnchoredHistory(
  messages: ImMessage[],
  windowN: number,
  anchorMessageId?: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!messages || messages.length === 0) return [];
  const coalesced = coalesceHistoryBurstMessages(messages);
  const actualTurns = Math.min(windowN, coalesced.length);
  if (coalesced.length <= windowN) return roleSanitizerPipeline(coalesced);

  if (anchorMessageId) {
    const foundIdx = messages.findIndex((m) => m.id === anchorMessageId);
    if (foundIdx !== -1) {
      return roleSanitizerPipeline(coalesceHistoryBurstMessages(messages.slice(foundIdx)));
    }
  }
  return roleSanitizerPipeline(coalesced.slice(Math.max(0, coalesced.length - actualTurns)));
}

export function reAnchorHistory(messages: ImMessage[], newN: number): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  const coalesced = coalesceHistoryBurstMessages(messages);
  if (coalesced.length <= newN) return messages[0]?.id;
  const targetIndex = Math.max(0, coalesced.length - newN);
  let cIndex = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (cIndex >= targetIndex) return m.id;
    const next = messages[i + 1];
    if (!next || next.role !== m.role || m.role !== 'assistant') cIndex += 1;
  }
  return messages[messages.length - 1]?.id;
}

export function formatLivingStateAnchor(
  state: ImCompanionLivingState | undefined,
  now: number,
  timeStr: string,
  absenceNotice: string,
  memoryLines?: string
): string {
  let anchor = `[Context Anchor | 当前时间: ${timeStr}${absenceNotice}\n`;
  if (!state) {
    anchor += `• 伴侣状态: 在线\n`;
  } else {
    const isExpired = now > state.validUntil;
    if (!isExpired) {
      const durationMin = Math.max(1, Math.floor((now - state.startedAt) / 60000));
      anchor += `• 伴侣当前正在做: "${state.statusText}" (已持续 ${durationMin} 分钟) | 负荷: ${state.activityLoad} | 场合: ${state.privacyContext} | 设备: ${state.deviceAccess}\n`;
    } else {
      const expiredMin = Math.max(1, Math.floor((now - state.validUntil) / 60000));
      anchor += `• 伴侣上一阶段做的事: "${state.statusText}" 已于 ${expiredMin} 分钟前自然结束。\n• 请结合当前时间 (${timeStr}) 与人设作息，在本次回复中自然推进你的最新生活动作并输出新 [STATUS:...]。\n`;
    }
    if (state.alterValue !== 0) {
      const desc = state.alterValue > 0 ? `愉悦/积极 (+${state.alterValue})` : `低落/疲惫 (${state.alterValue})`;
      anchor += `• 情绪惯性 (Alter): ${desc}\n`;
    }
    if (state.recentTrajectory && state.recentTrajectory.length > 0) {
      anchor += `• 今日生活轨迹: ${state.recentTrajectory.slice(-3).map((t) => `"${t.statusText}"`).join(' → ')}\n`;
    }
  }
  if (memoryLines) anchor += `唤醒记忆:\n${memoryLines}\n`;
  anchor += `• 指令要求: 每一轮回复末尾必须输出最新推进的 [STATUS: 详尽动作描述与心声(20~50字) | load=free|occupied|sleeping | privacy=private|public | device=available|limited|away | alter=增量(-1~+1)] 标签。]`;
  return anchor;
}

export function buildChatPayload(
  options: ContextBuilderOptions,
  currentUserInput: string
): LlmTransportMessage[] {
  const now = options.now || Date.now();
  const windowN = options.windowN ?? 20;
  const zone1: LlmTransportMessage = {
    role: 'system',
    content: `${options.rolePrompt.trim()}\n\n${IM_PROTOCOL_PROMPT}`,
  };

  const timeStr = new Date(now).toLocaleString('zh-CN', { hour12: false });
  let absenceNotice = '';
  const lastMsg = options.historyMessages?.[options.historyMessages.length - 1];
  if (lastMsg?.createdAt) {
    const diffMs = now - new Date(lastMsg.createdAt).getTime();
    if (diffMs > 3 * 60 * 1000) {
      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);
      const str = days > 0 ? `${days} 天` : hours > 0 ? `${hours} 小时 ${mins % 60} 分钟` : `${mins} 分钟`;
      absenceNotice = ` | 时间流逝感知: 距离上次交流已过去 ${str}`;
    }
  }

  const memoryLines = (options.recalledMemories || []).map((m) => `- ${m.content}`).join('\n');
  const anchor = formatLivingStateAnchor(options.livingState, now, timeStr, absenceNotice, memoryLines);
  const isOccupied = options.livingState && (options.livingState.activityLoad === 'occupied' || options.livingState.deviceAccess === 'limited');
  const brevityNotice = isOccupied ? '\n\n(提示：你当前正在忙碌或在公共场合，请压低单次字数，用 1~2 句简短回复)' : '';
  const zone4Text = `${anchor}\n\n${currentUserInput.trim()}${brevityNotice}`;
  const zone4Content = options.currentImageBase64
    ? [
        { type: 'text' as const, text: zone4Text },
        {
          type: 'image_url' as const,
          image_url: {
            url: options.currentImageBase64.startsWith('data:')
              ? options.currentImageBase64
              : `data:image/jpeg;base64,${options.currentImageBase64}`,
          },
        },
      ]
    : zone4Text;
  const zone4: LlmTransportMessage = { role: 'user', content: zone4Content };
  if (!options.historyMessages || options.historyMessages.length === 0) return [zone1, zone4];

  const slotLines = (options.l1Slots || []).map((s) => `• ${s.category}: ${s.content}`).join('\n');
  const summaryText = options.l1Summary?.content ? `【剧情连续性】\n${options.l1Summary.content}` : '';
  const zone2: LlmTransportMessage = {
    role: 'system',
    content: `【核心画像与状态】\n${slotLines || '暂无画像'}\n\n${summaryText}`.trim(),
  };

  const sliced = sliceAnchoredHistory(options.historyMessages, windowN, options.anchorMessageId);
  const zone3: LlmTransportMessage[] = sliced.map((m) => ({ role: m.role, content: m.content }));
  return [zone1, zone2, ...zone3, zone4];
}

export function buildShadowCompactionPayload(options: ContextBuilderOptions): LlmTransportMessage[] {
  const windowN = options.windowN ?? 20;
  const zone1: LlmTransportMessage = { role: 'system', content: `${options.rolePrompt.trim()}\n\n${IM_PROTOCOL_PROMPT}` };
  const slotLines = (options.l1Slots || []).map((s) => `• ${s.category}: ${s.content}`).join('\n');
  const summaryText = options.l1Summary?.content ? `【剧情连续性】\n${options.l1Summary.content}` : '';
  const zone2: LlmTransportMessage = { role: 'system', content: `【核心画像与状态】\n${slotLines || '暂无画像'}\n\n${summaryText}`.trim() };
  const sliced = sliceAnchoredHistory(options.historyMessages, windowN, options.anchorMessageId);
  const zone3: LlmTransportMessage[] = sliced.map((m) => ({ role: m.role, content: m.content }));
  const compactionDirective: LlmTransportMessage = {
    role: 'user',
    content: `[System Maintenance Mode: 暂停角色扮演。严格输出增量记忆压缩 JSON。将 Zone 3 中滑出窗口的前 4~5 轮提炼入 narrative_summary。\n{"episodic_continuity":{"unresolved_tension":"未闭合话头","emotional_aftertaste":"情绪余温","narrative_summary":"历史摘要"},"l1_slot_mutations":[{"op":"UPDATE","slot":"ongoing_threads","value":"最新状态"}],"l2_memory_mutations":[{"op":"ADD","content":"原子事实描述","importance":7,"entities":["实体名"],"expanded_triggers":["触发词"]}]}]`,
  };
  return [zone1, zone2, ...zone3, compactionDirective];
}
