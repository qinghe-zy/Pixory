import type { SQLiteDatabase } from 'expo-sqlite';

import {
  REBUILD_AI_MEMORY_FTS_V1_SQL,
  REBUILD_AI_MEMORY_FTS_V2_SQL,
} from './schema';

async function hasSqliteTable(db: SQLiteDatabase, tableName: string): Promise<boolean> {
  const table = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return Boolean(table);
}

/**
 * Rebuild ai_memory_fts across both legacy V1 ai_memories and V2 memory_claims
 * so FTS maintenance or backup restores never drop V2 claims.
 */
export async function rebuildAiMemoryFtsIndex(
  db: SQLiteDatabase,
  options: { checkIntegrity?: boolean } = {}
): Promise<void> {
  if (!(await hasSqliteTable(db, 'ai_memory_fts'))) {
    return;
  }
  const hasMemories = await hasSqliteTable(db, 'ai_memories');
  const hasClaims = await hasSqliteTable(db, 'memory_claims');
  if (!hasMemories && !hasClaims) {
    return;
  }

  await db.execAsync('DELETE FROM ai_memory_fts;');
  if (hasMemories) {
    await db.execAsync(REBUILD_AI_MEMORY_FTS_V1_SQL);
  }
  if (hasClaims) {
    await db.execAsync(REBUILD_AI_MEMORY_FTS_V2_SQL);
  }
  if (options.checkIntegrity) {
    await db.runAsync("INSERT INTO ai_memory_fts(ai_memory_fts) VALUES('integrity-check')");
  }
}
