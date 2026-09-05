import type { SQLiteDatabase } from 'expo-sqlite';

import { runWithDatabaseSpace, type PixorySpace } from '../database';
import {
  JOURNAL_ACHIEVEMENT_DEFINITION_BY_ID,
  JOURNAL_ACHIEVEMENT_DEFINITIONS,
  type JournalAchievementCategory,
  type JournalAchievementDefinition,
} from './journalAchievementDefinitions';
import {
  hasContinuousRounds,
  hasCrossDateContinuousRounds,
  hasDateInLocalHour,
  hasSevenConsecutiveDates,
  type JournalRound,
} from './journalAchievementRules';

export interface JournalAchievementRecord {
  id: number;
  space: PixorySpace;
  achievementId: string;
  category: JournalAchievementCategory;
  title: string;
  description: string;
  requirement: string;
  occurredAt: number;
  unlockedAt: number;
  readAt: number | null;
  sourceType: string;
  sourceId: string | null;
  sourcePayload: Record<string, unknown>;
  routeKind: JournalAchievementDefinition['routeKind'];
}

export interface JournalAchievementCategoryView {
  id: JournalAchievementCategory;
  title: string;
  achievements: JournalAchievementRecord[];
  hasUnread: boolean;
}

export interface JournalAchievementProjection {
  categories: JournalAchievementCategoryView[];
  unreadCategoryIds: JournalAchievementCategory[];
  generatedAt: number;
}

interface Candidate {
  achievementId: string;
  occurredAt: string;
  sourceType: string;
  sourceId?: string | number | null;
  sourcePayload?: Record<string, unknown>;
}

interface StoredAchievementRow {
  id: number;
  space: PixorySpace;
  achievementId: string;
  category: JournalAchievementCategory;
  occurredAt: string;
  unlockedAt: string;
  readAt: string | null;
  sourceType: string;
  sourceId: string | null;
  sourcePayload: string;
  createdAt: string;
}

const CATEGORY_TITLES: Record<JournalAchievementCategory, string> = {
  journey: '启程',
  connection: '心灵触碰',
  time: '时光守候',
  world: '世界共建',
  organize: '光影整理',
};

const ACTIVE_MEMORY_STATUSES = ['active', 'stale'];

function toTimestamp(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function toStoredRecord(row: StoredAchievementRow): JournalAchievementRecord | null {
  const definition = JOURNAL_ACHIEVEMENT_DEFINITION_BY_ID.get(row.achievementId);
  if (!definition) return null;
  let sourcePayload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.sourcePayload || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      sourcePayload = parsed as Record<string, unknown>;
    }
  } catch {
    sourcePayload = {};
  }
  return {
    id: row.id,
    space: row.space,
    achievementId: row.achievementId,
    category: row.category,
    title: definition.title,
    description: definition.description,
    requirement: definition.requirement,
    occurredAt: toTimestamp(row.occurredAt),
    unlockedAt: toTimestamp(row.unlockedAt),
    readAt: row.readAt ? toTimestamp(row.readAt) : null,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourcePayload,
    routeKind: definition.routeKind,
  };
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function seasonKey(value: string): string {
  const month = new Date(value).getMonth() + 1;
  if (month <= 2 || month === 12) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

async function collectCandidates(db: SQLiteDatabase, now: Date): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const add = (candidate: Candidate | null) => {
    if (candidate) candidates.push(candidate);
  };

  const firstAsset = await db.getFirstAsync<{ id: number; createdAt: string }>(
    `SELECT id, createdAt FROM image_assets
     WHERE deletedAt IS NULL
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstAsset && {
    achievementId: 'first-light',
    occurredAt: firstAsset.createdAt,
    sourceType: 'asset',
    sourceId: firstAsset.id,
  });

  const firstVideo = await db.getFirstAsync<{ id: number; createdAt: string }>(
    `SELECT id, createdAt FROM image_assets
     WHERE deletedAt IS NULL AND mediaType = 'video'
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstVideo && {
    achievementId: 'first-moving-image',
    occurredAt: firstVideo.createdAt,
    sourceType: 'asset',
    sourceId: firstVideo.id,
  });

  const firstFavorite = await db.getFirstAsync<{ id: number; updatedAt: string }>(
    `SELECT id, updatedAt FROM image_assets
     WHERE deletedAt IS NULL AND isFavorite = 1
     ORDER BY updatedAt ASC, id ASC LIMIT 1`,
  );
  add(firstFavorite && {
    achievementId: 'kept-treasure',
    occurredAt: firstFavorite.updatedAt,
    sourceType: 'asset',
    sourceId: firstFavorite.id,
  });

  const firstThread = await db.getFirstAsync<{ id: string; createdAt: string }>(
    `SELECT t.id, MIN(m.createdAt) AS createdAt
     FROM ai_threads t
     JOIN ai_messages m ON m.threadId = t.id
     WHERE t.archivedAt IS NULL AND m.status = 'completed' AND m.role != 'system'
     GROUP BY t.id
     ORDER BY createdAt ASC, t.id ASC LIMIT 1`,
  );
  const firstMessage = firstThread
    ? await db.getFirstAsync<{ id: string; createdAt: string }>(
      `SELECT id, createdAt FROM ai_messages
       WHERE threadId = ? AND status = 'completed' AND role != 'system'
       ORDER BY createdAt ASC, id ASC LIMIT 1`,
      [firstThread.id],
    )
    : null;
  add(firstThread && firstMessage && {
    achievementId: 'first-conversation',
    occurredAt: firstMessage.createdAt,
    sourceType: 'thread',
    sourceId: firstThread.id,
    sourcePayload: { messageId: firstMessage.id },
  });

  const threadRows = await db.getAllAsync<{ id: string; createdAt: string }>(
    `SELECT id, createdAt FROM ai_threads
     WHERE archivedAt IS NULL
     ORDER BY createdAt ASC, id ASC`,
  );
  const messageRows = await db.getAllAsync<{ id: string; threadId: string; role: 'user' | 'assistant' | 'system'; status: string; createdAt: string }>(
    `SELECT id, threadId, role, status, createdAt FROM ai_messages
     WHERE status = 'completed' AND role != 'system'
     ORDER BY createdAt ASC, id ASC`,
  );
  const rounds: JournalRound[] = [];
  const roundsByThread = new Map<string, JournalRound[]>();
  for (const thread of threadRows) {
    const messages = messageRows.filter((message) => message.threadId === thread.id);
    for (let index = 0; index < messages.length - 1; index += 1) {
      const user = messages[index];
      const assistant = messages[index + 1];
      if (user.role !== 'user' || assistant.role !== 'assistant') continue;
      const round = {
        userCreatedAt: user.createdAt,
        assistantCreatedAt: assistant.createdAt,
        userStatus: user.status,
        assistantStatus: assistant.status,
      };
      rounds.push(round);
      const threadRounds = roundsByThread.get(thread.id) ?? [];
      threadRounds.push(round);
      roundsByThread.set(thread.id, threadRounds);
    }
  }
  const firstRoundThread = threadRows.find((thread) => (roundsByThread.get(thread.id)?.length ?? 0) > 0);
  const addThreadCondition = (
    achievementId: string,
    predicate: (threadRounds: JournalRound[]) => boolean,
    sourcePayload?: Record<string, unknown>,
  ) => {
    const source = [...roundsByThread.entries()]
      .find(([, threadRounds]) => predicate(threadRounds));
    if (source) {
      add({
        achievementId,
        occurredAt: source[1][0].userCreatedAt,
        sourceType: 'thread',
        sourceId: source[0],
        sourcePayload,
      });
    }
  };
  addThreadCondition('deep-night-light', (threadRounds) =>
    threadRounds.filter((round) => hasDateInLocalHour(round.userCreatedAt, 1, 4)).length >= 20,
  );
  addThreadCondition('long-conversation', (threadRounds) => hasContinuousRounds(threadRounds, 25));
  addThreadCondition('between-two-days', (threadRounds) => hasCrossDateContinuousRounds(threadRounds));
  const roundsByLocalDate = new Map<string, number>();
  for (const round of rounds) {
    const local = new Date(new Date(round.userCreatedAt).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    roundsByLocalDate.set(local, (roundsByLocalDate.get(local) ?? 0) + 1);
  }
  if (hasSevenConsecutiveDates(roundsByLocalDate)) {
    add({ achievementId: 'week-has-voice', occurredAt: now.toISOString(), sourceType: 'thread', sourceId: firstRoundThread?.id, sourcePayload: { dates: roundsByLocalDate.size } });
  }

  const firstMemory = await db.getFirstAsync<{ id: string; createdAt: string; threadId: string | null }>(
    `SELECT m.id, m.createdAt, source.threadId
     FROM ai_memories m
     LEFT JOIN ai_messages source ON source.id = m.sourceMessageId
     WHERE m.status IN ('active', 'stale') AND m.deletedAt IS NULL
     ORDER BY m.createdAt ASC, m.id ASC LIMIT 1`,
  );
  add(firstMemory && {
    achievementId: 'memory-note',
    occurredAt: firstMemory.createdAt,
    sourceType: 'memory',
    sourceId: firstMemory.id,
    sourcePayload: firstMemory.threadId ? { threadId: firstMemory.threadId } : undefined,
  });

  const memoryCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ai_memories
     WHERE status IN (${ACTIVE_MEMORY_STATUSES.map(() => '?').join(',')}) AND deletedAt IS NULL`,
    ACTIVE_MEMORY_STATUSES,
  );
  if ((memoryCount?.count ?? 0) >= 30) {
    add({
      achievementId: 'memory-grove',
      occurredAt: now.toISOString(),
      sourceType: 'memory',
      sourcePayload: { count: memoryCount?.count ?? 0 },
    });
  }

  const firstDiary = await db.getFirstAsync<{ id: string; createdAt: string }>(
    `SELECT id, createdAt FROM companion_diaries
     WHERE status IN ('ready', 'ready_pending_presentation')
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstDiary && {
    achievementId: 'private-words',
    occurredAt: firstDiary.createdAt,
    sourceType: 'diary',
    sourceId: firstDiary.id,
  });

  const firstDream = await db.getFirstAsync<{ id: string; displayAt: string }>(
    `SELECT id, displayAt FROM companion_dreams
     WHERE status = 'active' AND deletedAt IS NULL AND contextOptIn = 1
     ORDER BY displayAt ASC, id ASC LIMIT 1`,
  );
  add(firstDream && {
    achievementId: 'dream-letter',
    occurredAt: firstDream.displayAt,
    sourceType: 'dream',
    sourceId: firstDream.id,
  });

  const firstDocument = await db.getFirstAsync<{ id: string; createdAt: string }>(
    `SELECT id, createdAt FROM ai_documents
     WHERE parserStatus IN ('parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready')
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstDocument && {
    achievementId: 'paper-sets-sail',
    occurredAt: firstDocument.createdAt,
    sourceType: 'document',
    sourceId: firstDocument.id,
  });

  const firstRole = await db.getFirstAsync<{ id: string; createdAt: string }>(
    `SELECT id, createdAt FROM ai_role_cards
     WHERE archivedAt IS NULL AND (length(trim(prompt)) > 0 OR length(trim(COALESCE(firstMessage, ''))) > 0)
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstRole && {
    achievementId: 'role-awakens',
    occurredAt: firstRole.createdAt,
    sourceType: 'role',
    sourceId: firstRole.id,
  });

  const firstThreadDocument = await db.getFirstAsync<{ id: string; createdAt: string; ownerId: string }>(
    `SELECT id, createdAt, ownerId FROM ai_documents
     WHERE ownerType = 'thread' AND parserStatus IN ('parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready')
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstThreadDocument && {
    achievementId: 'material-enters',
    occurredAt: firstThreadDocument.createdAt,
    sourceType: 'material',
    sourceId: firstThreadDocument.ownerId,
    sourcePayload: { threadId: firstThreadDocument.ownerId },
  });

  const firstBranch = await db.getFirstAsync<{ threadId: string; createdAt: string }>(
    `SELECT threadId, createdAt FROM ai_branch_route_metadata
     WHERE status != 'abandoned'
     ORDER BY createdAt ASC, id ASC LIMIT 1`,
  );
  add(firstBranch && {
    achievementId: 'parallel-time',
    occurredAt: firstBranch.createdAt,
    sourceType: 'branch',
    sourceId: firstBranch.threadId,
  });
  const threeBranches = await db.getFirstAsync<{ threadId: string; count: number }>(
    `SELECT threadId, COUNT(*) AS count FROM ai_branch_route_metadata
     WHERE status != 'abandoned' GROUP BY threadId HAVING COUNT(*) >= 3
     ORDER BY threadId ASC LIMIT 1`,
  );
  add(threeBranches && {
    achievementId: 'three-way-crossing',
    occurredAt: now.toISOString(),
    sourceType: 'branch',
    sourceId: threeBranches.threadId,
    sourcePayload: { count: threeBranches.count },
  });

  const firstCitation = await db.getFirstAsync<{ messageId: string; createdAt: string }>(
    `SELECT c.messageId, c.createdAt FROM ai_message_citations c
     JOIN ai_messages m ON m.id = c.messageId
     WHERE c.validationStatus = 'valid' AND m.status = 'completed'
     ORDER BY c.createdAt ASC, c.id ASC LIMIT 1`,
  );
  add(firstCitation && {
    achievementId: 'words-echo',
    occurredAt: firstCitation.createdAt,
    sourceType: 'message',
    sourceId: firstCitation.messageId,
  });

  const firstIp = await db.getFirstAsync<{ id: number; createdAt: string; assetCount: number }>(
    `SELECT ip.id, ip.createdAt, COUNT(a.id) AS assetCount
     FROM ips ip
     LEFT JOIN image_assets a ON a.ipId = ip.id AND a.deletedAt IS NULL
     WHERE ip.deletedAt IS NULL
     GROUP BY ip.id
     HAVING COUNT(a.id) >= 30
     ORDER BY ip.createdAt ASC, ip.id ASC LIMIT 1`,
  );
  if (firstIp) {
    add({
      achievementId: 'world-grows',
      occurredAt: firstIp.createdAt,
      sourceType: 'ip',
      sourceId: firstIp.id,
      sourcePayload: { count: firstIp.assetCount },
    });
  }

  const ipCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ips WHERE deletedAt IS NULL`,
  );
  if ((ipCount?.count ?? 0) >= 3) {
    add({
      achievementId: 'three-realms',
      occurredAt: now.toISOString(),
      sourceType: 'ip',
      sourcePayload: { count: ipCount?.count ?? 0 },
    });
  }

  const firstGroup = await db.getFirstAsync<{ id: number; ipId: number; updatedAt: string }>(
    `SELECT g.id, g.ipId, g.updatedAt FROM groups g
     JOIN image_assets a ON a.groupId = g.id AND a.deletedAt IS NULL
     GROUP BY g.id
     ORDER BY g.updatedAt ASC, g.id ASC LIMIT 1`,
  );
  add(firstGroup && {
    achievementId: 'objects-in-chapter',
    occurredAt: firstGroup.updatedAt,
    sourceType: 'group',
    sourceId: firstGroup.id,
    sourcePayload: { ipId: firstGroup.ipId },
  });

  const firstTag = await db.getFirstAsync<{ id: number; createdAt: string }>(
    `SELECT t.id, t.createdAt FROM tags t
     JOIN image_tags it ON it.tagId = t.id
     JOIN image_assets a ON a.id = it.imageAssetId AND a.deletedAt IS NULL
     ORDER BY t.createdAt ASC, t.id ASC LIMIT 1`,
  );
  add(firstTag && {
    achievementId: 'first-name-tag',
    occurredAt: firstTag.createdAt,
    sourceType: 'tag',
    sourceId: firstTag.id,
  });

  const groupedAssetCounts = await db.getAllAsync<{ groupId: number; count: number }>(
    `SELECT groupId, COUNT(*) AS count FROM image_assets
     WHERE groupId IS NOT NULL AND deletedAt IS NULL
     GROUP BY groupId HAVING COUNT(*) >= 10
     ORDER BY count DESC, groupId ASC LIMIT 1`,
  );
  if (groupedAssetCounts[0]) {
    add({
      achievementId: 'ten-in-one-group',
      occurredAt: now.toISOString(),
      sourceType: 'group',
      sourceId: groupedAssetCounts[0].groupId,
      sourcePayload: { count: groupedAssetCounts[0].count },
    });
  }

  const assetCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM image_assets WHERE deletedAt IS NULL`,
  );
  if ((assetCount?.count ?? 0) >= 100) {
    add({
      achievementId: 'hundred-images-scroll',
      occurredAt: now.toISOString(),
      sourceType: 'asset',
      sourcePayload: { count: assetCount?.count ?? 0 },
    });
  }

    const installSetting = await db.getFirstAsync<{ value: string | null }>(
      `SELECT value FROM app_settings WHERE key = 'app_install_date' LIMIT 1`,
    );
    const installDate = installSetting?.value
      ? new Date(Number(installSetting.value)).toISOString()
      : firstThread?.createdAt ?? firstAsset?.createdAt;
  if (installDate) {
    const start = new Date(installDate);
    const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
    const addTime = (achievementId: string, condition: boolean) => {
      if (condition) {
        add({
          achievementId,
          occurredAt: now.toISOString(),
          sourceType: 'system',
          sourcePayload: { startDate: start.toISOString(), days },
        });
      }
    };
    addTime('seven-days-poem', days >= 7);
    addTime('hundred-day-promise', days >= 100);
    addTime('half-year-date', now.getTime() >= new Date(start.getFullYear(), start.getMonth() + 6, start.getDate()).getTime());
    addTime('one-year-chapter', now.getTime() >= new Date(start.getFullYear() + 1, start.getMonth(), start.getDate()).getTime());
    const months = new Set<string>([
      ...messageRows.map((message) => monthKey(message.createdAt)),
      ...(firstAsset ? [monthKey(firstAsset.createdAt)] : []),
    ]);
    months.add(monthKey(now.toISOString()));
    addTime('moon-trace', months.size >= 3);
    const seasons = new Set<string>();
    messageRows.forEach((message) => seasons.add(seasonKey(message.createdAt)));
    if (firstAsset) seasons.add(seasonKey(firstAsset.createdAt));
    seasons.add(seasonKey(start.toISOString()));
    seasons.add(seasonKey(now.toISOString()));
    addTime('four-seasons', seasons.size >= 4);
  }

  return candidates;
}

async function projectInDatabase(db: SQLiteDatabase, space: PixorySpace): Promise<JournalAchievementProjection> {
  const now = new Date();
  const candidates = await collectCandidates(db, now);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.achievementId, candidate]));
  const existingRows = await db.getAllAsync<StoredAchievementRow>(
    `SELECT * FROM journal_achievements WHERE space = ?`,
    [space],
  );
  const existingById = new Map(existingRows.map((row) => [row.achievementId, row]));

  for (const candidate of candidates) {
    const definition = JOURNAL_ACHIEVEMENT_DEFINITION_BY_ID.get(candidate.achievementId);
    if (!definition) continue;
    const existing = existingById.get(candidate.achievementId);
    const occurredAt = candidate.occurredAt;
    const sourceId = candidate.sourceId == null ? null : String(candidate.sourceId);
    const sourceChanged = existing && (existing.sourceId ?? null) !== sourceId;
    await db.runAsync(
      `INSERT INTO journal_achievements
       (space, achievementId, category, occurredAt, unlockedAt, readAt, sourceType, sourceId, sourcePayload, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
       ON CONFLICT(space, achievementId) DO UPDATE SET
         category = excluded.category,
         occurredAt = excluded.occurredAt,
         sourceType = excluded.sourceType,
         sourceId = excluded.sourceId,
         sourcePayload = excluded.sourcePayload,
         readAt = CASE WHEN ? = 1 THEN NULL ELSE journal_achievements.readAt END,
         updatedAt = excluded.updatedAt`,
      space,
      candidate.achievementId,
      definition.category,
      occurredAt,
      existing?.unlockedAt ?? now.toISOString(),
      candidate.sourceType,
      sourceId,
      JSON.stringify(candidate.sourcePayload ?? {}),
      existing?.createdAt ?? now.toISOString(),
      now.toISOString(),
      sourceChanged ? 1 : 0,
    );
  }

  const rows = await db.getAllAsync<StoredAchievementRow>(
    `SELECT * FROM journal_achievements
     WHERE space = ? AND achievementId IN (${JOURNAL_ACHIEVEMENT_DEFINITIONS.map(() => '?').join(',')})
     ORDER BY category, occurredAt ASC, achievementId ASC`,
    [space, ...JOURNAL_ACHIEVEMENT_DEFINITIONS.map((definition) => definition.id)],
  );
  const visible = rows
    .filter((row) => candidatesById.has(row.achievementId))
    .map(toStoredRecord)
    .filter((row): row is JournalAchievementRecord => Boolean(row));
  const categoryMap = new Map<JournalAchievementCategory, JournalAchievementRecord[]>();
  for (const item of visible) {
    const items = categoryMap.get(item.category) ?? [];
    items.push(item);
    categoryMap.set(item.category, items);
  }
  const categories = (Object.keys(CATEGORY_TITLES) as JournalAchievementCategory[])
    .map((id) => {
      const achievements = categoryMap.get(id) ?? [];
      return {
        id,
        title: CATEGORY_TITLES[id],
        achievements,
        hasUnread: achievements.some((achievement) => achievement.readAt === null),
      };
    })
    .filter((category) => category.achievements.length > 0);

  return {
    categories,
    unreadCategoryIds: categories.filter((category) => category.hasUnread).map((category) => category.id),
    generatedAt: now.getTime(),
  };
}

export async function getJournalAchievementProjection(
  space: PixorySpace,
): Promise<JournalAchievementProjection> {
  return runWithDatabaseSpace(space, (db) => projectInDatabase(db, space));
}

export async function markJournalAchievementRead(
  space: PixorySpace,
  achievementId: string,
): Promise<void> {
  await runWithDatabaseSpace(space, async (db) => {
    await db.runAsync(
      `UPDATE journal_achievements SET readAt = ?, updatedAt = ?
       WHERE space = ? AND achievementId = ?`,
      new Date().toISOString(),
      new Date().toISOString(),
      space,
      achievementId,
    );
  });
}
