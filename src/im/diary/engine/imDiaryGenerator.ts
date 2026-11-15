import { initDatabase, type PixorySpace } from '../../../database';
import { streamClient } from '../../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../../core/llm-transport/secureApiKey';
import type { ImCompanionDiary, DiaryPaperTexture, DiaryThemeKey, DiaryMemoryMetadata } from '../types';
import { saveCompanionDiary, getCompanionDiaryByDate } from '../repository/imDiaryRepository';
import { harvestDiaryMemoryToL2 } from './diaryMemoryHarvester';
import { runDailyMemoryMetabolism } from '../../../core/memory/memoryMetabolismService';
import { insertImMessage } from '../../repository/imThreadRepository';
import type { ImMessage } from '../../types';
import { getLocalDayRange, selectDiaryDialogue, toLocalDateStr } from './diaryDayWindow';

export interface GenerateDiaryParams {
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  roleName: string;
  targetDateStr?: string; // YYYY-MM-DD
  forceRewrite?: boolean;
}

export function parseDualLayerDiary(rawText: string): {
  theme: DiaryThemeKey;
  mood?: string;
  weather?: string;
  content: string;
  metadata: DiaryMemoryMetadata | null;
} {
  let theme: DiaryThemeKey = 'sage';
  const themeMatch = rawText.match(/\[THEME:\s*(sage|rainwater|rose|lavender|celadon)\]/i);
  if (themeMatch && themeMatch[1]) {
    theme = themeMatch[1].toLowerCase() as DiaryThemeKey;
  }

  let mood: string | undefined;
  const moodMatch = rawText.match(/\[MOOD:\s*([^\]]+)\]/i);
  if (moodMatch && moodMatch[1].trim()) {
    mood = moodMatch[1].trim();
  }

  let weather: string | undefined;
  const weatherMatch = rawText.match(/\[WEATHER:\s*([^\]]+)\]/i);
  if (weatherMatch && weatherMatch[1].trim()) {
    weather = weatherMatch[1].trim();
  }

  let content = '';
  const contentMatch = rawText.match(/<Diary_Content>([\s\S]*?)<\/Diary_Content>/i);
  if (contentMatch) {
    content = contentMatch[1].replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  } else {
    content = rawText
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/\[THEME:[^\]]+\]/gi, '')
      .replace(/\[MOOD:[^\]]+\]/gi, '')
      .replace(/\[WEATHER:[^\]]+\]/gi, '')
      .replace(/<Memory_Metadata>[\s\S]*?(?:<\/Memory_Metadata>|$)/gi, '')
      .replace(/<\/?Diary_Content>/gi, '')
      .trim();
  }

  let metadata: DiaryMemoryMetadata | null = null;
  const metaMatch = rawText.match(/<Memory_Metadata>([\s\S]*?)<\/Memory_Metadata>/i);
  if (metaMatch) {
    const raw = metaMatch[1].trim();
    metadata = { rawText: raw };
    const s = raw.match(/核心事件摘要[：:]\s*([^\n]+)/i);
    if (s) metadata.summary = s[1].trim();
    const p = raw.match(/捕捉到的用户偏好[^\n]*[：:]\s*([^\n]+)/i);
    if (p) metadata.userPreferences = [p[1].trim()];
    const e = raw.match(/关键物品与地点[：:]\s*([^\n]+)/i);
    if (e) metadata.keyEntities = [e[1].trim()];
    const h = raw.match(/待触发钩子[^\n]*[：:]\s*([^\n]+)/i);
    if (h) metadata.hooks = [h[1].trim()];
  }
  return { theme, mood, weather, content, metadata };
}

export async function generateCompanionDailyDiary({
  space,
  threadId,
  roleCardId,
  roleName,
  targetDateStr,
  forceRewrite = false,
}: GenerateDiaryParams): Promise<ImCompanionDiary> {
  const db = await initDatabase(space);
  const now = new Date();
  let dateStr = targetDateStr || toLocalDateStr(now);
  let dayRange = getLocalDayRange(dateStr);

  // 1. 若为系统静默定时触发（非手动指定日期），若已超过 72h 未交流则静默跳过；若当日已存在且非重写则直接返回
  if (!targetDateStr) {
    const lastUserMsg = await db.getFirstAsync<{ createdAt: string }>(
      `SELECT createdAt FROM ai_messages WHERE threadId = ? AND role = 'user' ORDER BY createdAt DESC LIMIT 1;`,
      [threadId]
    );
    if (lastUserMsg?.createdAt && now.getTime() - new Date(lastUserMsg.createdAt).getTime() > 72 * 3600 * 1000) {
      throw new Error('INACTIVE_OVER_72H');
    }
    if (!forceRewrite) {
      const existingToday = await getCompanionDiaryByDate(space, threadId, dateStr);
      if (existingToday) {
        return existingToday;
      }
    }
  }

  // 2. 检查当天是否有用户发言记录 (基于本地时区起止范围，杜绝 UTC 错位)
  let userMsgCheck = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(id) as count FROM ai_messages
     WHERE threadId = ? AND role = 'user' AND createdAt >= ? AND createdAt < ?;`,
    [threadId, dayRange.startIso, dayRange.endIso]
  );

  // 凌晨或当日暂无消息的人性化回溯：若指定日期为今天但今日无记录（特别是凌晨 00:00~06:00 跨夜场景），向前探查昨天深夜的高质量聊天
  if (!userMsgCheck || (userMsgCheck.count || 0) === 0) {
    const isTargetingToday = !targetDateStr || targetDateStr === toLocalDateStr(now);
    if (isTargetingToday) {
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
      const yesterdayStr = toLocalDateStr(yesterday);
      const yesterdayRange = getLocalDayRange(yesterdayStr);
      const yesterdayCheck = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(id) as count FROM ai_messages
         WHERE threadId = ? AND role = 'user' AND createdAt >= ? AND createdAt < ?;`,
        [threadId, yesterdayRange.startIso, yesterdayRange.endIso]
      );
      if (yesterdayCheck && (yesterdayCheck.count || 0) > 0) {
        dateStr = yesterdayStr;
        dayRange = yesterdayRange;
        userMsgCheck = yesterdayCheck;
      } else {
        // 向前查找最近一次有交流的日期（例如前天或更早）
        const latestMsg = await db.getFirstAsync<{ createdAt: string }>(
          `SELECT createdAt FROM ai_messages WHERE threadId = ? AND role = 'user' ORDER BY createdAt DESC LIMIT 1;`,
          [threadId]
        );
        if (latestMsg?.createdAt) {
          const fallbackDateStr = toLocalDateStr(new Date(latestMsg.createdAt));
          const fallbackRange = getLocalDayRange(fallbackDateStr);
          const fallbackCheck = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(id) as count FROM ai_messages
             WHERE threadId = ? AND role = 'user' AND createdAt >= ? AND createdAt < ?;`,
            [threadId, fallbackRange.startIso, fallbackRange.endIso]
          );
          if (fallbackCheck && (fallbackCheck.count || 0) > 0) {
            dateStr = fallbackDateStr;
            dayRange = fallbackRange;
            userMsgCheck = fallbackCheck;
          }
        }
      }
    }
  }

  if (!userMsgCheck || (userMsgCheck.count || 0) === 0) {
    throw new Error('NO_MESSAGES_FOR_DATE');
  }

  // 3. 提取当天对话（只读取 SQLite 中真实存在的字段，过滤未显影 staged 消息，杜绝字段不存在异常与未来剧透）
  const nowMs = Date.now();
  const rawRows = await db.getAllAsync<{ role: string; content: string; createdAt: string }>(
    `SELECT role, content, createdAt FROM ai_messages
     WHERE threadId = ?
       AND createdAt >= ? AND createdAt < ?
       AND (visible_at IS NULL OR visible_at <= ?)
       AND (delivery_status IS NULL OR delivery_status != 'staged')
     ORDER BY createdAt ASC LIMIT 200;`,
    [threadId, dayRange.startIso, dayRange.endIso, nowMs]
  );

  const todayMessages = rawRows.map((r) => {
    let type: string = 'text';
    let content = r.content;
    let metadata: any = null;
    const trimmed = typeof r.content === 'string' ? r.content.trim() : '';

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, any> | null;
        if (parsed && typeof parsed === 'object') {
          if (parsed.type === 'diary_card' || 'diaryDate' in parsed || 'diaryId' in parsed) {
            type = 'diary_card';
          } else if (parsed.type === 'thought') {
            // 内部思考心声严禁写入手账语料，防止思维链与裸 JSON 泄露
            type = 'thought';
            content = '';
          } else if (parsed.type === 'voice') {
            type = 'voice';
            const spoken = String(parsed.transcription ?? parsed.text ?? '').trim();
            content = spoken ? `[语音] ${spoken}` : '';
          } else if (parsed.type === 'sticker') {
            type = 'sticker';
            content = String(parsed.name ?? parsed.text ?? '[表情]');
            metadata = { sticker: parsed };
          } else if (parsed.type === 'image' || 'imageUri' in parsed) {
            type = 'image';
            content = String(parsed.text ?? '').trim() || '[图片]';
          } else if (parsed.type === 'document' || 'document' in parsed) {
            type = 'document';
            const title = String(parsed.title ?? parsed.fileName ?? '').trim();
            content = title ? `[文档: ${title}]` : '[文档]';
          } else {
            // 未知 JSON 信封降级提取可读正文，若无可读正文则置空丢弃，避免裸 JSON 混入手账上下文
            const fallbackText = parsed.text ?? parsed.content ?? parsed.transcription ?? parsed.message;
            content = typeof fallbackText === 'string' ? fallbackText.trim() : '';
          }
        }
      } catch {
        // 非合法 JSON，保留原文交给下游清洗
      }
    }

    if (type === 'text' && (r.role === 'system' || trimmed.startsWith('[系统提示:'))) {
      type = 'notice';
    }

    return {
      role: r.role,
      content,
      type,
      metadata,
      createdAt: r.createdAt,
    };
  });

  const dialogueText = selectDiaryDialogue(todayMessages, 3600);
  if (!dialogueText) {
    throw new Error('NO_MESSAGES_FOR_DATE');
  }

  // 4. 提取当天生活状态轨迹、会话模型配置、角色人设与称谓
  const threadRow = await db.getFirstAsync<{
    providerId: string | null;
    modelId: string | null;
    living_state_json: string | null;
    roleSnapshotJson?: string | null;
    im_settings_json?: string | null;
  }>(
    `SELECT providerId, modelId, living_state_json, roleSnapshotJson, im_settings_json FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  ).catch(async () => {
    return db.getFirstAsync<{
      providerId: string | null;
      modelId: string | null;
      living_state_json: string | null;
      roleSnapshotJson?: string | null;
      im_settings_json?: string | null;
    }>(
      `SELECT providerId, modelId, living_state_json FROM ai_threads WHERE id = ? LIMIT 1;`,
      [threadId]
    );
  });

  let rolePrompt = '';
  let roleDescription = '';
  if (roleCardId) {
    try {
      const roleRow = await db.getFirstAsync<{
        prompt?: string | null;
        description?: string | null;
      }>(
        `SELECT prompt, description FROM ai_role_cards WHERE id = ? LIMIT 1;`,
        [roleCardId]
      );
      if (roleRow) {
        rolePrompt = roleRow.prompt ? roleRow.prompt.trim() : '';
        roleDescription = roleRow.description ? roleRow.description.trim() : '';
      }
    } catch {}
  }
  if (!rolePrompt && threadRow?.roleSnapshotJson) {
    try {
      const snap = JSON.parse(threadRow.roleSnapshotJson);
      if (snap?.prompt) rolePrompt = String(snap.prompt).trim();
      if (snap?.description) roleDescription = String(snap.description).trim();
    } catch {}
  }

  let userNickname = '';
  if (threadRow?.im_settings_json) {
    try {
      const parsedSettings = JSON.parse(threadRow.im_settings_json);
      if (parsedSettings?.personalization?.userNickname) {
        userNickname = String(parsedSettings.personalization.userNickname).trim();
      }
    } catch {}
  }

  let trajectorySummary = '';
  if (threadRow?.living_state_json) {
    try {
      const living = JSON.parse(threadRow.living_state_json);
      if (Array.isArray(living.recentTrajectory) && living.recentTrajectory.length > 0) {
        trajectorySummary = living.recentTrajectory.slice(-4).map((t: any) => `"${t.statusText}"`).join(' → ');
      }
    } catch {}
  }

  // 5. 校验 AI Provider 模型配置（优先使用当前会话配置，绝不允许在没有 Key 时假冒生成）
  const provider = await getActiveProviderConfig(
    space,
    threadRow?.providerId,
    threadRow?.modelId
  );
  if (!provider || !provider.apiKey) {
    throw new Error('NO_PROVIDER_CONFIGURED');
  }

  const trajPrompt = trajectorySummary ? `\n你今天真实经历的生活轨迹如下：${trajectorySummary}。\n` : '';
  const personaBlock = rolePrompt ? `\n【你的角色人设与性格】\n${rolePrompt}\n` : '';
  const nicknameBlock = userNickname ? `\n【你对对方的专属称呼】：${userNickname}\n` : '';

  const prompt = `你是「${roleName}」。今天是${dateStr}。${personaBlock}${nicknameBlock}` +
    `今日真实互动与对话记录：\n${dialogueText}${trajPrompt}\n` +
    `【撰写准则】\n` +
    `请站在「${roleName}」的第一人称视角，写下一篇真实记录今日经历与内心独白的私密手账日记。\n` +
    `- 人设立场：完全符合你的性格口吻与心理活动（依角色性格可以克制、吐槽、暗自欢喜、深情回味或冷淡寡言，切勿套用千篇一律的温暖日记套话）；\n` +
    `- 内容与细节：自然融入白天的互动细节、对方提到的喜好、具体地点或未完成的约定，记录产生的心绪起伏与真实内心独白；\n` +
    `- 篇幅与结构：篇幅根据今日交流情况自发决定（通常 300~800 字左右，事多则详，事简则精，严禁机械注水），禁止使用小标题，以自然段落推进成文。\n` +
    `信纸风格（根据今日心境5选1）：sage(草木绿)/rainwater(雨水蓝)/rose(粉蔷薇)/lavender(薰衣草紫)/celadon(青瓷墨)。\n` +
    `【输出格式】\n[THEME: sage|rainwater|rose|lavender|celadon]\n[MOOD: 1~4字心情(如小确幸/挂念/踏实/纠结)]\n[WEATHER: 1~4字天气(如微风/细雨/晴暖/阴)]\n<Diary_Content>\n(以第一人称自然写就的手账日记正文)\n</Diary_Content>\n` +
    `<Memory_Metadata>\n- 核心事件摘要：(客观简要总结)\n- 捕捉到的用户偏好/状态：(习惯喜好或情绪)\n- 关键物品与地点：(信物与地点)\n- 待触发钩子：(未完成约定或下次话题)\n</Memory_Metadata>`;

  let generated = '';
  const abortCtrl = new AbortController();
  const timeoutId = setTimeout(() => abortCtrl.abort(), 45000);

  try {
    for await (const chunk of streamClient.streamText([{ role: 'user', content: prompt }], {
      providerId: provider.providerId,
      modelId: provider.modelId,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      protocol: provider.protocol,
      abortSignal: abortCtrl.signal,
    })) {
      generated += chunk;
    }
  } catch (err: any) {
    if (abortCtrl.signal.aborted) {
      throw new Error('GENERATION_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  let parsed = parseDualLayerDiary(generated);
  if (!parsed.content || parsed.content.length < 10) {
    // 拟真保底：当大模型输出异常中断或为空时，基于今日对话提炼一段真实陪伴手账
    const cleanDialogueSummary = dialogueText
      .replace(/\[(BR|br)\]/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 100);
    const userRef = userNickname || '你';
    parsed = {
      theme: 'sage',
      mood: '平静',
      weather: '夜色',
      content: `回顾今天与${userRef}的对话：“${cleanDialogueSummary}…” 诸多细节犹在眼前。静下心随手记下几笔，明天再续。`,
      metadata: {
        rawText: '今日交流日常小记',
        summary: cleanDialogueSummary.slice(0, 50),
      },
    };
  }

  const diary: ImCompanionDiary = {
    id: `diary_${threadId}_${dateStr}`,
    threadId,
    roleCardId,
    diaryDate: dateStr,
    title: `${roleName} 的私人手账`,
    content: parsed.content,
    weather: parsed.weather || '晴朗',
    moodTag: parsed.mood || '温暖',
    themeKey: parsed.theme || 'sage',
    memoryMetadata: parsed.metadata,
    stickers: [],
    tapes: [],
    polaroid: null,
    paperTexture: 'grid' as DiaryPaperTexture,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 6. 持久化手账（已内置版本历史栈，自动记录上一版）
  await saveCompanionDiary(space, diary);

  // 7. 反哺记忆库：将手账元数据沉淀入 SQLite 永久 L2 事实与次日未闭合钩子
  if (diary.memoryMetadata) {
    try {
      await harvestDiaryMemoryToL2({
        space,
        threadId,
        roleCardId,
        diaryDate: diary.diaryDate,
        metadata: diary.memoryMetadata,
      });
    } catch {}
  }

  // 7.1 伴聊记忆夜间睡眠新陈代谢：静默修剪僵尸记忆与过期待办
  try {
    await runDailyMemoryMetabolism(db, roleCardId, space, Date.now());
  } catch {}

  // 8. 聊天流小信封卡片维护（幂等更新，同一天绝不堆积重复卡片）
  try {
    const cardContent = JSON.stringify({
      type: 'diary_card',
      diaryId: diary.id,
      diaryDate: diary.diaryDate,
      themeKey: diary.themeKey,
      title: diary.title,
    });

    const existingCard = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM ai_messages
       WHERE threadId = ?
         AND (
           content LIKE '{"type":"diary_card"%'
           OR content LIKE '{"diaryDate":%'
           OR content LIKE '{"diaryId":%'
         )
         AND content LIKE ?
       LIMIT 1;`,
      [threadId, `%"diaryDate":"${diary.diaryDate}"%`]
    );

    if (existingCard) {
      await db.runAsync(
        `UPDATE ai_messages SET content = ? WHERE id = ?;`,
        [cardContent, existingCard.id]
      );
    } else {
      const cardMessage: ImMessage = {
        id: `msg_diary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        threadId,
        role: 'assistant',
        content: cardContent,
        type: 'diary_card',
        status: 'sent',
        createdAt: new Date().toISOString(),
      };
      await insertImMessage(space, cardMessage);
    }
  } catch {}

  return diary;
}
