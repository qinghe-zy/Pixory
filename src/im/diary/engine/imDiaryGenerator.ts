import { initDatabase, type PixorySpace } from '../../../database';
import { streamClient } from '../../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../../core/llm-transport/secureApiKey';
import type { ImCompanionDiary, DiaryPaperTexture, DiaryThemeKey, DiaryMemoryMetadata } from '../types';
import { saveCompanionDiary } from '../repository/imDiaryRepository';
import { harvestDiaryMemoryToL2 } from './diaryMemoryHarvester';
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

function parseDualLayerDiary(rawText: string): {
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
    content = contentMatch[1].trim();
  } else {
    content = rawText
      .replace(/\[THEME:[^\]]+\]/gi, '')
      .replace(/\[MOOD:[^\]]+\]/gi, '')
      .replace(/\[WEATHER:[^\]]+\]/gi, '')
      .replace(/<Memory_Metadata>[\s\S]*?<\/Memory_Metadata>/gi, '')
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
}: GenerateDiaryParams): Promise<ImCompanionDiary> {
  const db = await initDatabase(space);
  const now = new Date();
  const dateStr = targetDateStr || toLocalDateStr(now);
  const dayRange = getLocalDayRange(dateStr);

  // 1. 若为系统静默定时触发（非手动指定日期），若已超过 72h 未交流则静默跳过
  if (!targetDateStr) {
    const lastUserMsg = await db.getFirstAsync<{ createdAt: string }>(
      `SELECT createdAt FROM ai_messages WHERE threadId = ? AND role = 'user' ORDER BY createdAt DESC LIMIT 1;`,
      [threadId]
    );
    if (lastUserMsg?.createdAt && now.getTime() - new Date(lastUserMsg.createdAt).getTime() > 72 * 3600 * 1000) {
      throw new Error('INACTIVE_OVER_72H');
    }
  }

  // 2. 检查当天是否有用户发言记录 (基于本地时区起止范围，杜绝 UTC 错位)
  const userMsgCheck = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(id) as count FROM ai_messages
     WHERE threadId = ? AND role = 'user' AND createdAt >= ? AND createdAt < ?;`,
    [threadId, dayRange.startIso, dayRange.endIso]
  );
  if (!userMsgCheck || (userMsgCheck.count || 0) === 0) {
    throw new Error('NO_MESSAGES_FOR_DATE');
  }

  // 3. 提取当天对话
  const todayMessages = await db.getAllAsync<{ role: string; content: string; type?: string; createdAt?: string }>(
    `SELECT role, content, type, createdAt FROM ai_messages
     WHERE threadId = ? AND createdAt >= ? AND createdAt < ?
     ORDER BY createdAt ASC LIMIT 200;`,
    [threadId, dayRange.startIso, dayRange.endIso]
  );
  const dialogueText = selectDiaryDialogue(todayMessages, 3600);
  if (!dialogueText) {
    throw new Error('NO_MESSAGES_FOR_DATE');
  }

  // 4. 提取当天生活状态轨迹
  const threadRow = await db.getFirstAsync<{ living_state_json: string | null }>(
    `SELECT living_state_json FROM ai_threads WHERE id = ? LIMIT 1;`,
    [threadId]
  );
  let trajectorySummary = '';
  if (threadRow?.living_state_json) {
    try {
      const living = JSON.parse(threadRow.living_state_json);
      if (Array.isArray(living.recentTrajectory) && living.recentTrajectory.length > 0) {
        trajectorySummary = living.recentTrajectory.slice(-4).map((t: any) => `"${t.statusText}"`).join(' → ');
      }
    } catch {}
  }

  // 5. 校验 AI Provider 模型配置（绝不允许在没有 Key 时假冒生成）
  const provider = await getActiveProviderConfig(space);
  if (!provider || !provider.apiKey) {
    throw new Error('NO_PROVIDER_CONFIGURED');
  }

  const trajPrompt = trajectorySummary ? `\n你今天白天真实经历的生活轨迹如下：${trajectorySummary}。\n` : '';
  const prompt = `你是${roleName}。今天是${dateStr}。现在是深夜，你正处于温暖安静的环境中写私人手账日记。\n` +
    `今日真实输入事件与对话：\n${dialogueText}${trajPrompt}\n` +
    `【撰写与记忆留存准则】\n` +
    `篇幅根据今日实际交流内容自然决定（聊得多则详尽叙述，聊得少则精炼温润，通常 300~800 字左右，事多则详，事简则精，严禁机械注水）。禁止使用小标题，以自然段落推进，包含以下维度：\n` +
    `1. 当下空间锚定：写此刻环境、光线与身体感受，把思绪自然拉回白天；\n` +
    `2. 慢镜头细节复盘(核心记忆区)：回味核心互动，自然嵌入具体地点、食物、提到的物品、对方喜好与约定；\n` +
    `3. 潜台词与私密心事(情绪区)：白天未表现出来但很在意的微表情、心跳与咽回去的心声；\n` +
    `4. 记忆钩子与余韵收尾(召回区)：记录产生的小动作或未来计划(信物收在何处、下次要聊的话题)，温暖停笔。\n` +
    `【约束】拒绝空洞抒情与AI口号套话，重在具体画面与真实动作细节。\n` +
    `信纸5选1：sage(草木绿)/rainwater(雨水蓝)/rose(粉蔷薇)/lavender(薰衣草紫)/celadon(青瓷墨)。\n` +
    `【输出格式】\n[THEME: sage|rainwater|rose|lavender|celadon]\n[MOOD: 1~4字心情(如小确幸/挂念/踏实)]\n[WEATHER: 1~4字天气(如微风/细雨/晴暖)]\n<Diary_Content>\n(根据今日实际情况自然成文的沉浸日记正文)\n</Diary_Content>\n` +
    `<Memory_Metadata>\n- 核心事件摘要：(客观简要总结)\n- 捕捉到的用户偏好/状态：(习惯喜好或情绪)\n- 关键物品与地点：(信物与地点)\n- 待触发钩子：(未完成约定或下次话题)\n</Memory_Metadata>`;

  let generated = '';
  for await (const chunk of streamClient.streamText([{ role: 'user', content: prompt }], {
    providerId: provider.providerId,
    modelId: provider.modelId,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  })) {
    generated += chunk;
  }

  if (!generated.trim()) {
    throw new Error('GENERATION_EMPTY_FAILED');
  }

  const parsed = parseDualLayerDiary(generated);
  if (!parsed.content || parsed.content.length < 20) {
    throw new Error('GENERATION_EMPTY_FAILED');
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
      `SELECT id FROM ai_messages WHERE threadId = ? AND type = 'diary_card' AND content LIKE ? LIMIT 1;`,
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
