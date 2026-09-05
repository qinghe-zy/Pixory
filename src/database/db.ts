import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { markInterruptedGenerationJobs } from '../ai/generation/aiGenerationRepository';
import { registerDatabaseSpace } from './databaseSpaceRegistry';

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
  MIGRATION_STATEMENTS_V38,
  MIGRATION_STATEMENTS_V39,
  MIGRATION_STATEMENTS_V40,
  MIGRATION_STATEMENTS_V41,
  MIGRATION_STATEMENTS_V42,
  MIGRATION_STATEMENTS_V43,
  MIGRATION_STATEMENTS_V44,
  MIGRATION_STATEMENTS_V45,
  MIGRATION_STATEMENTS_V46,
  MIGRATION_STATEMENTS_V47,
  MIGRATION_STATEMENTS_V47_ADD_LINEAGE_COLUMN,
  MIGRATION_STATEMENTS_V48,
  MIGRATION_STATEMENTS_V49,
  MIGRATION_STATEMENTS_V50,
  MIGRATION_STATEMENTS_V51,
  MIGRATION_STATEMENTS_V52,
  MIGRATION_STATEMENTS_V53,
  MIGRATION_STATEMENTS_V54,
  MIGRATION_STATEMENTS_V55,
  MIGRATION_STATEMENTS_V56,
  MIGRATION_STATEMENTS_V57,
  MIGRATION_STATEMENTS_V58,
  MIGRATION_STATEMENTS_V59,
  MIGRATION_STATEMENTS_V60,
  MIGRATION_STATEMENTS_V61,
  PERSONAL_DATABASE_NAME,
} from './schema';

export type PixorySpace = 'normal' | 'personal';

const databasePromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};
const initializationPromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};
const MEMORY_SCOPE_GOVERNANCE_SETTING_KEY = 'ai_memory_scope_governance_applied';
const MEDIA_PERFORMANCE_INDEX_STATEMENTS = `
  CREATE INDEX IF NOT EXISTS idx_image_assets_ip_media_live_created
    ON image_assets(ipId, mediaType, deletedAt, createdAt DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_image_assets_media_live_viewed
    ON image_assets(mediaType, deletedAt, lastViewedAt DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created_id
    ON ai_messages(threadId, createdAt DESC, id DESC);
`;

function getDatabaseNameForSpace(space: PixorySpace): string {
  return space === 'personal' ? PERSONAL_DATABASE_NAME : DATABASE_NAME;
}

async function openPixoryDatabase(space: PixorySpace = 'normal'): Promise<SQLiteDatabase> {
  if (!databasePromises[space]) {
    databasePromises[space] = openDatabaseAsync(getDatabaseNameForSpace(space)).then((database) => {
      registerDatabaseSpace(database, space);
      return database;
    });
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

async function ensureAiMemoryLineageSchema(db: SQLiteDatabase): Promise<void> {
  if (!(await hasTable(db, 'ai_threads'))) {
    return;
  }
  if (!(await hasColumn(db, 'ai_threads', 'lineageVersion'))) {
    await db.execAsync(MIGRATION_STATEMENTS_V47_ADD_LINEAGE_COLUMN);
  }
}

async function ensureAiContinuityImportConsentSchema(db: SQLiteDatabase): Promise<void> {
  if (!(await hasTable(db, 'ai_continuity_import_sessions'))) {
    return;
  }
  if (!(await hasColumn(db, 'ai_continuity_import_sessions', 'remoteModelConsent'))) {
    await db.execAsync(
      'ALTER TABLE ai_continuity_import_sessions ADD COLUMN remoteModelConsent INTEGER NOT NULL DEFAULT 0;'
    );
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      appliedAt TEXT NOT NULL
    );
  `);
}

async function ensureAiPerformanceIndexes(db: SQLiteDatabase): Promise<void> {
  if (!(await hasTable(db, 'ai_threads'))) {
    return;
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_ai_threads_role_card_activity
      ON ai_threads(space, archivedAt, roleCardId, updatedAt);
    CREATE INDEX IF NOT EXISTS idx_ai_documents_owner_updated_id
      ON ai_documents(space, ownerType, ownerId, updatedAt DESC, id DESC);
  `);
}

async function ensureMediaPerformanceIndexes(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(MEDIA_PERFORMANCE_INDEX_STATEMENTS);
}

/**
 * memory_episodes / memory_relational_states / memory_profiles were added to
 * MIGRATION_STATEMENTS_V47 after some devices had already applied that
 * migration version.  Create the tables if absent and add the scopeType column
 * if it is missing so that export / package queries don't crash.
 */
async function ensureMemoryAggregateSchema(db: SQLiteDatabase): Promise<void> {
  // memory_episodes
  if (!(await hasTable(db, 'memory_episodes'))) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memory_episodes (
        id TEXT PRIMARY KEY NOT NULL,
        space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
        scopeType TEXT NOT NULL,
        scopeId TEXT,
        lane TEXT NOT NULL CHECK (lane IN ('confirmed', 'working', 'archive')),
        status TEXT NOT NULL CHECK (status IN ('active', 'closed', 'archived', 'deleted')),
        title TEXT NOT NULL,
        summaryText TEXT NOT NULL,
        startMessageId TEXT,
        endMessageId TEXT,
        validFrom TEXT,
        validTo TEXT,
        sourceClaimIdsJson TEXT NOT NULL DEFAULT '[]',
        sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
        branchRootMessageId TEXT,
        branchVersionIndex INTEGER,
        confidenceBand TEXT NOT NULL CHECK (confidenceBand IN ('high', 'medium', 'low')),
        importance INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
        projectionVersion INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        archivedAt TEXT,
        deletedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_episodes_scope
        ON memory_episodes(space, scopeType, scopeId, lane, status, updatedAt);
    `);
  } else if (!(await hasColumn(db, 'memory_episodes', 'scopeType'))) {
    await db.execAsync(`ALTER TABLE memory_episodes ADD COLUMN scopeType TEXT NOT NULL DEFAULT 'thread';`);
  }

  // memory_relational_states
  if (!(await hasTable(db, 'memory_relational_states'))) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memory_relational_states (
        id TEXT PRIMARY KEY NOT NULL,
        space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
        scopeType TEXT NOT NULL,
        scopeId TEXT,
        subjectEntityId TEXT NOT NULL,
        metric TEXT NOT NULL CHECK (metric IN ('affinity', 'trust', 'tension', 'familiarity')),
        value REAL NOT NULL CHECK (value BETWEEN -1.0 AND 1.0),
        signalWeight REAL NOT NULL CHECK (signalWeight >= 0),
        decayHalfLifeDays REAL NOT NULL CHECK (decayHalfLifeDays > 0),
        lastEvidenceAt TEXT,
        evidenceIdsJson TEXT NOT NULL DEFAULT '[]',
        projectionVersion INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(space, scopeType, scopeId, subjectEntityId, metric)
      );
    `);
  } else if (!(await hasColumn(db, 'memory_relational_states', 'scopeType'))) {
    await db.execAsync(`ALTER TABLE memory_relational_states ADD COLUMN scopeType TEXT NOT NULL DEFAULT 'thread';`);
  }

  // memory_profiles
  if (!(await hasTable(db, 'memory_profiles'))) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS memory_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
        scopeType TEXT NOT NULL,
        scopeId TEXT,
        profileJson TEXT NOT NULL,
        profileText TEXT NOT NULL,
        sourceClaimIdsJson TEXT NOT NULL DEFAULT '[]',
        sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        projectionVersion INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(space, scopeType, scopeId)
      );
    `);
  } else if (!(await hasColumn(db, 'memory_profiles', 'scopeType'))) {
    await db.execAsync(`ALTER TABLE memory_profiles ADD COLUMN scopeType TEXT NOT NULL DEFAULT 'thread';`);
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

async function cleanupInterruptedAiGenerations(db: SQLiteDatabase, space: PixorySpace): Promise<void> {
  const now = new Date().toISOString();
  await markInterruptedGenerationJobs(db, { now, space });
  await db.runAsync(
    `UPDATE ai_messages
     SET status = 'stopped',
         completedAt = ?,
         errorMessage = '生成被系统中断。'
     WHERE status = 'generating'
       AND NOT EXISTS (
         SELECT 1 FROM ai_generation_jobs j
          WHERE j.assistantMessageId = ai_messages.id
            AND j.state NOT IN ('completed', 'failed', 'stopped')
       )`,
    now
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

    if (currentVersion >= 19 && currentVersion < 38) {
      await database.execAsync(MIGRATION_STATEMENTS_V38);
    }

    if (currentVersion >= 19 && currentVersion < 39) {
      await database.execAsync(MIGRATION_STATEMENTS_V39);
    }

    if (currentVersion >= 19 && currentVersion < 40) {
      await database.execAsync(MIGRATION_STATEMENTS_V40);
    }

    if (currentVersion < 41) {
      await database.execAsync(MIGRATION_STATEMENTS_V41);
    }

    if (currentVersion < 42) {
      await database.execAsync(MIGRATION_STATEMENTS_V42);
    }

    if (currentVersion < 43) {
      await database.execAsync(MIGRATION_STATEMENTS_V43);
    }

    if (currentVersion >= 25 && currentVersion < 44) {
      await database.execAsync(MIGRATION_STATEMENTS_V44);
    }

    if (currentVersion < 45) {
      await database.execAsync(MIGRATION_STATEMENTS_V45);
    }

    if (currentVersion < 46) {
      await database.execAsync(MIGRATION_STATEMENTS_V46);
    }

    if (currentVersion < 47) {
      await database.execAsync(MIGRATION_STATEMENTS_V47);
    }

    if (currentVersion < 48) {
      await database.execAsync(MIGRATION_STATEMENTS_V48);
    }

    if (currentVersion < 49) {
      await database.execAsync(MIGRATION_STATEMENTS_V49);
    }

    if (currentVersion < 50) {
      await database.execAsync(MIGRATION_STATEMENTS_V50);
    }

    if (currentVersion < 51) {
      await database.execAsync(MIGRATION_STATEMENTS_V51);
    }

    if (currentVersion < 52) {
      await database.execAsync(MIGRATION_STATEMENTS_V52);
    }

    if (currentVersion < 53) {
      await database.execAsync(MIGRATION_STATEMENTS_V53);
    }
    if (currentVersion < 54) {
      await database.execAsync(MIGRATION_STATEMENTS_V54);
    }
    if (currentVersion < 55) {
      await database.execAsync(MIGRATION_STATEMENTS_V55);
    }
    if (currentVersion < 56) {
      await database.execAsync(MIGRATION_STATEMENTS_V56);
    }
    if (currentVersion < 57) {
      await database.execAsync(MIGRATION_STATEMENTS_V57);
    }
    if (currentVersion < 58) {
      await database.execAsync(MIGRATION_STATEMENTS_V58);
    }
    if (currentVersion < 59) {
      await database.execAsync(MIGRATION_STATEMENTS_V59);
    }
    if (currentVersion < 60) {
      await database.execAsync(MIGRATION_STATEMENTS_V60);
    }
    if (currentVersion < 61) {
      await database.execAsync(MIGRATION_STATEMENTS_V61);
    }

    await ensureImportTemplatesSchema(database);
    await ensureAiBranchSchema(database);
    await ensureAiMemoryLineageSchema(database);
    await ensureAiContinuityImportConsentSchema(database);
    await ensureAiPerformanceIndexes(database);
    await ensureMediaPerformanceIndexes(database);
    await ensureMemoryAggregateSchema(database);
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
      await cleanupInterruptedAiGenerations(db, space);
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
