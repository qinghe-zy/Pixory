/**
 * 情绪音律与自适应节律调节引擎 (Voice Prosody Modulator)
 *
 * 核心职责：
 * 根据伴聊显式语气指令（如 [VOICE: 撒娇轻嗔 | 快睡啦]）或前置神态描写（如 (声音放得又轻又软)），
 * 自适应微调发音语速 (rate) 与音高 (pitch)，赋予语音真实的情绪温度与呼吸起伏感。
 */

export interface DynamicProsodyResult {
  rate: number;
  pitch: number;
  detectedEmotion?: string;
}

/**
 * 情绪声学自适应计算
 *
 * 规则分类：
 * 1. 撒娇 / 粘人 / 甜美 / 娇嗔：语速微缓（~0.94x），音调显著拔高（+6%），展现娇憨灵动与起伏
 * 2. 轻柔 / 轻软 / 耳语 / 低语 / 困倦 / 睡前 / 疲惫 / 委屈 / 温柔：放缓语速（~0.90x），平和微调（-2%），展现亲密放松与舒缓细腻
 * 3. 急促 / 紧张 / 慌张 / 兴奋 / 激动 / 催促 / 快点 / 赶紧：适度提速（~1.15x），音高提升（+5%），展现迫切与活力
 * 4. 傲娇 / 嫌弃 / 生气 / 假装生气 / 严肃 / 冷淡：语速干脆微快（~1.06x），音高稍低（-2%），展现距离感与利落
 * 5. 叹气 / 无奈 / 拿你没办法：语速微慢（~0.95x），音高平稳微降（-1%）
 */
export function modulateVoiceProsody(
  baseRate: number = 1.0,
  basePitch: number = 0.0,
  styleDirective?: string | null
): DynamicProsodyResult {
  const safeBaseRate = Math.max(0.5, Math.min(2.0, baseRate || 1.0));
  const safeBasePitch = Math.max(-50.0, Math.min(50.0, basePitch || 0.0));

  if (!styleDirective || !styleDirective.trim()) {
    return {
      rate: safeBaseRate,
      pitch: safeBasePitch,
    };
  }

  const s = styleDirective.trim();

  // 1. 撒娇 / 粘人 / 甜美 / 娇嗔
  if (/(?:撒娇|娇嗔|粘人|甜|哄|依恋|软绵绵)/.test(s)) {
    const rate = Math.round(safeBaseRate * 0.94 * 100) / 100;
    const pitch = Math.round((safeBasePitch + 6.0) * 10) / 10;
    return {
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(-50.0, Math.min(50.0, pitch)),
      detectedEmotion: 'coy_sweet',
    };
  }

  // 2. 轻柔 / 轻软 / 耳语 / 低语 / 困倦 / 睡前 / 疲惫 / 委屈 / 温柔
  if (/(?:轻|软|耳语|低语|小声|细语|困|累|睡|疲|委屈|温柔|柔和|轻声)/.test(s)) {
    const rate = Math.round(safeBaseRate * 0.90 * 100) / 100;
    const pitch = Math.round((safeBasePitch - 2.0) * 10) / 10;
    return {
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(-50.0, Math.min(50.0, pitch)),
      detectedEmotion: 'gentle_whisper',
    };
  }

  // 3. 急促 / 紧张 / 慌张 / 兴奋 / 激动 / 催促 / 快点 / 赶紧
  if (/(?:急|快|慌|兴奋|激动|催|赶紧|别晾着|慌张|抓狂)/.test(s)) {
    const rate = Math.round(safeBaseRate * 1.15 * 100) / 100;
    const pitch = Math.round((safeBasePitch + 5.0) * 10) / 10;
    return {
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(-50.0, Math.min(50.0, pitch)),
      detectedEmotion: 'hurried_excited',
    };
  }

  // 4. 傲娇 / 嫌弃 / 生气 / 严肃 / 冷淡
  if (/(?:傲娇|嫌弃|生气|翻脸|严肃|冷淡|微嗔|不耐烦)/.test(s)) {
    const rate = Math.round(safeBaseRate * 1.06 * 100) / 100;
    const pitch = Math.round((safeBasePitch - 2.0) * 10) / 10;
    return {
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(-50.0, Math.min(50.0, pitch)),
      detectedEmotion: 'tsundere_annoyed',
    };
  }

  // 5. 叹气 / 无奈 / 拿你没办法
  if (/(?:叹气|无奈|没办法|败给你)/.test(s)) {
    const rate = Math.round(safeBaseRate * 0.95 * 100) / 100;
    const pitch = Math.round((safeBasePitch - 1.0) * 10) / 10;
    return {
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(-50.0, Math.min(50.0, pitch)),
      detectedEmotion: 'helpless_sigh',
    };
  }

  return {
    rate: safeBaseRate,
    pitch: safeBasePitch,
  };
}
