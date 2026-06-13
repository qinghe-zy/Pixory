import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  MEMORY_SCOPE_GOVERNANCE_STATEMENTS,
  MIGRATION_STATEMENTS_V1,
  MIGRATION_STATEMENTS_V2,
  MIGRATION_STATEMENTS_V3,
  MIGRATION_STATEMENTS_V4,
  MIGRATION_STATEMENTS_V5,
  MIGRATION_STATEMENTS_V6,
  MIGRATION_STATEMENTS_V7,
  MIGRATION_STATEMENTS_V8,
  MIGRATION_STATEMENTS_V9,
  MIGRATION_STATEMENTS_V10,
  MIGRATION_STATEMENTS_V11,
  MIGRATION_STATEMENTS_V12,
  MIGRATION_STATEMENTS_V13,
  MIGRATION_STATEMENTS_V14,
  MIGRATION_STATEMENTS_V15,
  MIGRATION_STATEMENTS_V16,
  MIGRATION_STATEMENTS_V17,
  MIGRATION_STATEMENTS_V18,
  MIGRATION_STATEMENTS_V19,
  MIGRATION_STATEMENTS_V20,
  MIGRATION_STATEMENTS_V21,
  MIGRATION_STATEMENTS_V22,
  MIGRATION_STATEMENTS_V23,
  MIGRATION_STATEMENTS_V24,
  MIGRATION_STATEMENTS_V25,
  MIGRATION_STATEMENTS_V26,
  MIGRATION_STATEMENTS_V27,
  MIGRATION_STATEMENTS_V28,
  MIGRATION_STATEMENTS_V29,
  MIGRATION_STATEMENTS_V30,
  MIGRATION_STATEMENTS_V31,
  MIGRATION_STATEMENTS_V32,
  MIGRATION_STATEMENTS_V33,
  MIGRATION_STATEMENTS_V34,
  MIGRATION_STATEMENTS_V35,
  MIGRATION_STATEMENTS_V36,
  MIGRATION_STATEMENTS_V37,
  PERSONAL_DATABASE_NAME,
} from './schema';

export type PixorySpace = 'normal' | 'personal';

const databasePromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};
const initializationPromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};
const MEMORY_SCOPE_GOVERNANCE_SETTING_KEY = 'ai_memory_scope_governance_applied';

function getDatabaseNameForSpace(space: PixorySpace): string {
  return space === 'personal' ? PERSONAL_DATABASE_NAME : DATABASE_NAME;
}

async function openPixoryDatabase(space: PixorySpace = 'normal'): Promise<SQLiteDatabase> {
  if (!databasePromises[space]) {
    databasePromises[space] = openDatabaseAsync(getDatabaseNameForSpace(space));
  }

  return databasePromises[space];
}

async function configureDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

async function ensureImportTemplatesSchema(db: SQLiteDatabase): Promise<void> {
  const table = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'import_templates'"
  );

  if (!table) {
    await db.execAsync(MIGRATION_STATEMENTS_V9);
  }
}

async function hasTable(db: SQLiteDatabase, tableName: string): Promise<boolean> {
  const table = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return Boolean(table);
}

async function hasColumn(db: SQLiteDatabase, tableName: string, columnName: string): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function ensureAiBranchSchema(db: SQLiteDatabase): Promise<void> {
  if (await hasTable(db, 'ai_threads')) {
    if (!(await hasColumn(db, 'ai_threads', 'currentBranchRootMessageId'))) {
      await db.execAsync('ALTER TABLE ai_threads ADD COLUMN currentBranchRootMessageId TEXT;');
    }
    if (!(await hasColumn(db, 'ai_threads', 'currentBranchVersionIndex'))) {
      await db.execAsync('ALTER TABLE ai_threads ADD COLUMN currentBranchVersionIndex INTEGER;');
    }
  }

  if (!(await hasTable(db, 'ai_branch_route_metadata'))) {
    await db.execAsync(MIGRATION_STATEMENTS_V35);
  }
}

async function ensureMemoryScopeGovernance(db: SQLiteDatabase): Promise<void> {
  const applied = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?',
    MEMORY_SCOPE_GOVERNANCE_SETTING_KEY
  );

  if (applied?.value === '1') {
    return;
  }

  await db.execAsync(MEMORY_SCOPE_GOVERNANCE_STATEMENTS);
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updatedAt)
     VALUES (?, '1', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    MEMORY_SCOPE_GOVERNANCE_SETTING_KEY,
    new Date().toISOString()
  );
}

async function cleanupInterruptedAiGenerations(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `UPDATE ai_messages
     SET status = 'stopped',
         completedAt = ?,
         errorMessage = '生成被系统中断。'
     WHERE status = 'generating'`,
    new Date().toISOString()
  );
}

export async function runMigrations(db?: SQLiteDatabase, space: PixorySpace = 'normal'): Promise<void> {
  const database = db ?? (await openPixoryDatabase(space));

  await database.withTransactionAsync(async () => {
    const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const currentVersion = versionRow?.user_version ?? 0;

    if (currentVersion < 1) {
      await database.execAsync(MIGRATION_STATEMENTS_V1);
    }

    if (currentVersion < 2) {
      await database.execAsync(MIGRATION_STATEMENTS_V2);
    }

    if (currentVersion < 3) {
      await database.execAsync(MIGRATION_STATEMENTS_V3);
    }

    if (currentVersion < 4) {
      await database.execAsync(MIGRATION_STATEMENTS_V4);
    }

    if (currentVersion < 5) {
      await database.execAsync(MIGRATION_STATEMENTS_V5);
    }

    if (currentVersion < 6) {
      await database.execAsync(MIGRATION_STATEMENTS_V6);
    }

    if (currentVersion < 7) {
      await database.execAsync(MIGRATION_STATEMENTS_V7);
    }

    if (currentVersion < 8) {
      await database.execAsync(MIGRATION_STATEMENTS_V8);
    }

    if (currentVersion < 9) {
      await database.execAsync(MIGRATION_STATEMENTS_V9);
    }

    if (currentVersion < 10) {
      await database.execAsync(MIGRATION_STATEMENTS_V10);
    }

    if (currentVersion < 11) {
      await database.execAsync(MIGRATION_STATEMENTS_V11);
    }

    if (currentVersion < 12) {
      await database.execAsync(MIGRATION_STATEMENTS_V12);
    }

    if (currentVersion < 13) {
      await database.execAsync(MIGRATION_STATEMENTS_V13);
    }

    if (currentVersion < 14) {
      await database.execAsync(MIGRATION_STATEMENTS_V14);
    }

    if (currentVersion < 15) {
      await database.execAsync(MIGRATION_STATEMENTS_V15);
    }

    if (currentVersion < 16) {
      await database.execAsync(MIGRATION_STATEMENTS_V16);
    }

    if (currentVersion < 17) {
      await database.execAsync(MIGRATION_STATEMENTS_V17);
    }

    if (currentVersion < 18) {
      await database.execAsync(MIGRATION_STATEMENTS_V18);
    }

    if (currentVersion < 19) {
      await database.execAsync(MIGRATION_STATEMENTS_V19);
    }

    if (currentVersion < 20) {
      await database.execAsync(MIGRATION_STATEMENTS_V20);
    }

    if (currentVersion < 21) {
      await database.execAsync(MIGRATION_STATEMENTS_V21);
    }

    if (currentVersion < 22) {
      await database.execAsync(MIGRATION_STATEMENTS_V22);
    }

    if (currentVersion < 23) {
      await database.execAsync(MIGRATION_STATEMENTS_V23);
    }

    if (currentVersion < 24) {
      await database.execAsync(MIGRATION_STATEMENTS_V24);
    }

    if (currentVersion < 25) {
      await database.execAsync(MIGRATION_STATEMENTS_V25);
    }

    if (currentVersion < 26) {
      await database.execAsync(MIGRATION_STATEMENTS_V26);
    }

    if (currentVersion < 27) {
      await database.execAsync(MIGRATION_STATEMENTS_V27);
    }

    if (currentVersion < 28) {
      await database.execAsync(MIGRATION_STATEMENTS_V28);
    }

    if (currentVersion < 29) {
      await database.execAsync(MIGRATION_STATEMENTS_V29);
    }

    if (currentVersion >= 17 && currentVersion < 30) {
      await database.execAsync(MIGRATION_STATEMENTS_V30);
    }

    if (currentVersion >= 17 && currentVersion < 31) {
      await database.execAsync(MIGRATION_STATEMENTS_V31);
    }

    if (currentVersion < 32) {
      await database.execAsync(MIGRATION_STATEMENTS_V32);
    }

    if (currentVersion < 33) {
      await database.execAsync(MIGRATION_STATEMENTS_V33);
    }

    if (currentVersion < 34) {
      await database.execAsync(MIGRATION_STATEMENTS_V34);
    }

    if (currentVersion < 35) {
      await database.execAsync(MIGRATION_STATEMENTS_V35);
    }

    if (currentVersion >= 17 && currentVersion < 36) {
      await database.execAsync(MIGRATION_STATEMENTS_V36);
    }

    if (currentVersion < 37) {
      await database.execAsync(MIGRATION_STATEMENTS_V37);
    }

    await ensureImportTemplatesSchema(database);
    await ensureAiBranchSchema(database);
    await ensureMemoryScopeGovernance(database);

    if (currentVersion !== DATABASE_VERSION) {
      await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    }
  });
}

export async function initDatabase(space: PixorySpace = 'normal'): Promise<SQLiteDatabase> {
  if (!initializationPromises[space]) {
    initializationPromises[space] = (async () => {
      const db = await openPixoryDatabase(space);
      await configureDatabase(db);
      await runMigrations(db, space);
      await cleanupInterruptedAiGenerations(db);
      return db;
    })().catch((error) => {
      initializationPromises[space] = undefined;
      throw error;
    });
  }

  return initializationPromises[space];
}

export async function getDatabase(space: PixorySpace): Promise<SQLiteDatabase> {
  return initDatabase(space);
}

export async function runWithDatabaseSpace<T>(
  space: PixorySpace,
  task: (db: SQLiteDatabase) => Promise<T>
): Promise<T> {
  const db = await getDatabase(space);
  return task(db);
}

export async function checkpointDatabase(space: PixorySpace): Promise<void> {
  const database = await databasePromises[space]?.catch(() => null);
  if (!database) {
    return;
  }

  await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}

export async function resetDatabaseSpaceCache(space: PixorySpace): Promise<void> {
  const database = await databasePromises[space]?.catch(() => null);
  if (database) {
    await checkpointDatabase(space);
    await database.closeAsync();
  }
  databasePromises[space] = undefined;
  initializationPromises[space] = undefined;
}
