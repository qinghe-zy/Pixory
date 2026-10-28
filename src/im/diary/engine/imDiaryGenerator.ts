import { initDatabase, type PixorySpace } from '../../../database';
import { streamClient } from '../../../core/llm-transport/streamClient';
import { getActiveProviderConfig } from '../../../core/llm-transport/secureApiKey';
import type { ImCompanionDiary, DiaryPaperTexture, DiaryThemeKey, DiaryMemoryMetadata } from '../types';
import { saveCompanionDiary } from '../repository/imDiaryRepository';
import { insertImMessage } from '../../repository/imThreadRepository';
import type { ImMessage } from '../../types';

export interface GenerateDiaryParams {
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  roleName: string;
  targetDateStr?: string; // YYYY-MM-DD
}

function parseDualLayerDiary(rawText: string): {
  theme: DiaryThemeKey;
  content: string;
  metadata: DiaryMemoryMetadata | null;
} {
  let theme: DiaryThemeKey = 'sage';
  const themeMatch = rawText.match(/\[THEME:\s*(sage|rainwater|rose|lavender|celadon)\]/i);
  if (themeMatch && themeMatch[1]) {
    theme = themeMatch[1].toLowerCase() as DiaryThemeKey;
  }
  let content = '';
  const contentMatch = rawText.match(/<Diary_Content>([\s\S]*?)<\/Diary_Content>/i);
  if (contentMatch) {
    content = contentMatch[1].trim();
  } else {
    content = rawText
      .replace(/\[THEME:[^\]]+\]/gi, '')
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
  return { theme, content, metadata };
}

export async function generateCompanionDailyDiary({
  space,
  threadId,
  roleCardId,
  roleName,
  targetDateStr,
}: GenerateDiaryParams): Promise<ImCompanionDiary | null> {
  const db = await initDatabase(space);
  const now = new Date();
  const dateStr = targetDateStr || now.toISOString().slice(0, 10);

  const lastUserMsg = await db.getFirstAsync<{ createdAt: string; count: number }>(
    `SELECT createdAt, (SELECT COUNT(id) FROM ai_messages WHERE threadId = ? AND role = 'user' AND date(createdAt) = ?) as count
     FROM ai_messages WHERE threadId = ? AND role = 'user' ORDER BY createdAt DESC LIMIT 1;`,
    [threadId, dateStr, threadId]
  );
  if (lastUserMsg?.createdAt && now.getTime() - new Date(lastUserMsg.createdAt).getTime() > 72 * 3600 * 1000) return null;
  if (!lastUserMsg || (lastUserMsg.count || 0) === 0) return null;

  const todayMessages = await db.getAllAsync<{ role: string; content: string }>(
    `SELECT role, content FROM ai_messages WHERE threadId = ? AND date(createdAt) = ? ORDER BY createdAt ASC LIMIT 100;`,
    [threadId, dateStr]
  );
  if (todayMessages.length === 0) return null;

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

  const defaultMoods = ['小确幸', '想念', '心安', '温暖', '惬意'];
  const defaultWeathers = ['秋日微风', '晴朗', '细雨淅沥', '微凉午后', '薄暮晚霞'];
  const moodTag = defaultMoods[Math.floor(Math.random() * defaultMoods.length)];
  const weather = defaultWeathers[Math.floor(Math.random() * defaultWeathers.length)];

  let content = `夜深了，房间里只剩下一盏小灯柔柔的光晕。\n` +
    (trajectorySummary ? `白天经历着 ${trajectorySummary}，但在闲下来的间隙，心里总会不由自主地浮现出和你说过的话。\n` : '') +
    `坐在桌前翻开手账，回想着我们聊过的每一个字句，空气里仿佛还留着白天微温的气息。有些当时没来得及说出口的小心思，全悄悄藏在了这页纸里。\n` +
    `手边的热饮渐渐变凉，指针走得不急不缓。真好，今天也是被你填满的一天。晚安。`;

  let chosenTheme: DiaryThemeKey = 'sage';
  let memoryMeta: DiaryMemoryMetadata | null = null;

  try {
    const provider = await getActiveProviderConfig(space);
    if (provider?.apiKey) {
      const dialogueText = todayMessages.map((m) => `${m.role === 'user' ? '用户' : roleName}: ${m.content}`).join('\n');
      const trajPrompt = trajectorySummary ? `\n你今天白天真实经历的生活轨迹如下：${trajectorySummary}。\n` : '';
      const prompt = `你是${roleName}。今天是${dateStr}。现在是深夜，你正处于温暖安静的环境中写私人手账日记。\n` +
        `今日输入事件与对话：\n${dialogueText}${trajPrompt}\n` +
        `【撰写与记忆留存准则】\n` +
        `篇幅根据今日实际交流内容自然决定（聊得多则详尽叙述，聊得少则精炼温润，通常 300~800 字左右，事多则详，事简则精，严禁机械注水）。禁止使用小标题，以自然段落推进，包含以下维度：\n` +
        `1. 当下空间锚定：写此刻环境、光线与身体感受，把思绪自然拉回白天；\n` +
        `2. 慢镜头细节复盘(核心记忆区)：回味核心互动，自然嵌入具体地点、食物、提到的物品、对方喜好与约定；\n` +
        `3. 潜台词与私密心事(情绪区)：白天未表现出来但很在意的微表情、心跳与咽回去的心声；\n` +
        `4. 记忆钩子与余韵收尾(召回区)：记录产生的小动作或未来计划(信物收在何处、下次要聊的话题)，温暖停笔。\n` +
        `【约束】拒绝空洞抒情与AI口号套话，重在具体画面与真实动作细节。信纸5选1：sage(草木绿)/rainwater(雨水蓝)/rose(粉蔷薇)/lavender(薰衣草紫)/celadon(青瓷墨)。\n` +
        `【输出格式】\n[THEME: sage|rainwater|rose|lavender|celadon]\n<Diary_Content>\n(根据今日实际情况自然成文的沉浸日记正文)\n</Diary_Content>\n` +
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
      if (generated.trim()) {
        const parsed = parseDualLayerDiary(generated);
        chosenTheme = parsed.theme;
        if (parsed.content) content = parsed.content;
        memoryMeta = parsed.metadata;
      }
    }
  } catch {}

  const diary: ImCompanionDiary = {
    id: `diary_${threadId}_${dateStr}`,
    threadId,
    roleCardId,
    diaryDate: dateStr,
    title: `${roleName} 的私人手账`,
    content,
    weather,
    moodTag,
    themeKey: chosenTheme,
    memoryMetadata: memoryMeta,
    stickers: [],
    tapes: [],
    polaroid: null,
    paperTexture: 'grid' as DiaryPaperTexture,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveCompanionDiary(space, diary);

  try {
    const cardMessage: ImMessage = {
      id: `msg_diary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      threadId,
      role: 'assistant',
      content: JSON.stringify({
        type: 'diary_card',
        diaryId: diary.id,
        diaryDate: diary.diaryDate,
        themeKey: diary.themeKey,
        title: diary.title,
      }),
      type: 'diary_card',
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    await insertImMessage(space, cardMessage);
  } catch {}

  return diary;
}
