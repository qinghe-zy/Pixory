import { initDatabase, type PixorySpace } from '../../../database';
import type { ImCompanionDiary, DiaryPaperTexture, DiaryStickerItem, DiaryWashiTapeItem, DiaryPolaroidCard, DiaryThemeKey, DiaryMemoryMetadata } from '../types';

interface RawDiaryRow {
  id: string;
  thread_id: string;
  role_card_id: string;
  diary_date: string;
  title: string;
  content: string;
  weather: string | null;
  mood_tag: string | null;
  stickers_json: string | null;
  tapes_json: string | null;
  polaroid_json: string | null;
  paper_texture: string | null;
  theme_key?: string | null;
  memory_metadata_json?: string | null;
  created_at: number;
  updated_at: number;
}

export async function ensureDiaryTable(space: PixorySpace): Promise<void> {
  const db = await initDatabase(space);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ai_companion_diaries (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role_card_id TEXT NOT NULL,
      diary_date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      weather TEXT,
      mood_tag TEXT,
      stickers_json TEXT,
      tapes_json TEXT,
      polaroid_json TEXT,
      paper_texture TEXT DEFAULT 'grid',
      theme_key TEXT DEFAULT 'sage',
      memory_metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(thread_id, diary_date)
    );
    CREATE INDEX IF NOT EXISTS idx_diaries_thread_date 
    ON ai_companion_diaries(thread_id, diary_date);
  `);
  try {
    await db.execAsync(`ALTER TABLE ai_companion_diaries ADD COLUMN theme_key TEXT;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE ai_companion_diaries ADD COLUMN memory_metadata_json TEXT;`);
  } catch {}
}

function rowToDiary(row: RawDiaryRow): ImCompanionDiary {
  let stickers: DiaryStickerItem[] = [];
  let tapes: DiaryWashiTapeItem[] = [];
  let polaroid: DiaryPolaroidCard | null = null;
  let memoryMetadata: DiaryMemoryMetadata | null = null;
  try {
    if (row.stickers_json) stickers = JSON.parse(row.stickers_json);
  } catch {}
  try {
    if (row.tapes_json) tapes = JSON.parse(row.tapes_json);
  } catch {}
  try {
    if (row.polaroid_json) polaroid = JSON.parse(row.polaroid_json);
  } catch {}
  try {
    if (row.memory_metadata_json) memoryMetadata = JSON.parse(row.memory_metadata_json);
  } catch {}

  return {
    id: row.id,
    threadId: row.thread_id,
    roleCardId: row.role_card_id,
    diaryDate: row.diary_date,
    title: row.title,
    content: row.content,
    weather: row.weather,
    moodTag: row.mood_tag,
    stickers,
    tapes,
    polaroid,
    paperTexture: (row.paper_texture as DiaryPaperTexture) || 'grid',
    themeKey: (row.theme_key as DiaryThemeKey) || 'sage',
    memoryMetadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveCompanionDiary(space: PixorySpace, diary: ImCompanionDiary): Promise<void> {
  const db = await initDatabase(space);
  await ensureDiaryTable(space);
  await db.runAsync(
    `INSERT INTO ai_companion_diaries (
      id, thread_id, role_card_id, diary_date, title, content,
      weather, mood_tag, stickers_json, tapes_json, polaroid_json,
      paper_texture, theme_key, memory_metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id, diary_date) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      weather = excluded.weather,
      mood_tag = excluded.mood_tag,
      stickers_json = excluded.stickers_json,
      tapes_json = excluded.tapes_json,
      polaroid_json = excluded.polaroid_json,
      paper_texture = excluded.paper_texture,
      theme_key = excluded.theme_key,
      memory_metadata_json = excluded.memory_metadata_json,
      updated_at = excluded.updated_at;`,
    [
      diary.id,
      diary.threadId,
      diary.roleCardId,
      diary.diaryDate,
      diary.title,
      diary.content,
      diary.weather ?? null,
      diary.moodTag ?? null,
      JSON.stringify(diary.stickers || []),
      JSON.stringify(diary.tapes || []),
      diary.polaroid ? JSON.stringify(diary.polaroid) : null,
      diary.paperTexture || 'grid',
      diary.themeKey || 'sage',
      diary.memoryMetadata ? JSON.stringify(diary.memoryMetadata) : null,
      diary.createdAt || Date.now(),
      diary.updatedAt || Date.now(),
    ]
  );
}

export async function getCompanionDiaries(
  space: PixorySpace,
  threadId: string,
  limit = 30,
  offset = 0
): Promise<ImCompanionDiary[]> {
  const db = await initDatabase(space);
  await ensureDiaryTable(space);
  const rows = await db.getAllAsync<RawDiaryRow>(
    `SELECT * FROM ai_companion_diaries 
     WHERE thread_id = ? 
     ORDER BY diary_date ASC 
     LIMIT ? OFFSET ?;`,
    [threadId, limit, offset]
  );
  return rows.map(rowToDiary);
}

export async function getCompanionDiaryByDate(
  space: PixorySpace,
  threadId: string,
  date: string
): Promise<ImCompanionDiary | null> {
  const db = await initDatabase(space);
  await ensureDiaryTable(space);
  const row = await db.getFirstAsync<RawDiaryRow>(
    `SELECT * FROM ai_companion_diaries 
     WHERE thread_id = ? AND diary_date = ? 
     LIMIT 1;`,
    [threadId, date]
  );
  return row ? rowToDiary(row) : null;
}

export async function getCompanionDiaryCount(space: PixorySpace, threadId: string): Promise<number> {
  const db = await initDatabase(space);
  await ensureDiaryTable(space);
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(id) as count FROM ai_companion_diaries WHERE thread_id = ?;`,
    [threadId]
  );
  return row?.count ?? 0;
}

export async function getCompanionDiaryDates(
  space: PixorySpace,
  threadId: string
): Promise<Array<{ id: string; diaryDate: string; title: string; moodTag?: string | null }>> {
  const db = await initDatabase(space);
  await ensureDiaryTable(space);
  const rows = await db.getAllAsync<{ id: string; diary_date: string; title: string; mood_tag: string | null }>(
    `SELECT id, diary_date, title, mood_tag 
     FROM ai_companion_diaries 
     WHERE thread_id = ? 
     ORDER BY diary_date ASC;`,
    [threadId]
  );
  return rows.map((r) => ({ id: r.id, diaryDate: r.diary_date, title: r.title, moodTag: r.mood_tag }));
}
