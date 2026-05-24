import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  DATABASE_NAME,
  DATABASE_VERSION,
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
  PERSONAL_DATABASE_NAME,
} from './schema';

export type PixorySpace = 'normal' | 'personal';

const databasePromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};
const initializationPromises: Partial<Record<PixorySpace, Promise<SQLiteDatabase>>> = {};

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

    await ensureImportTemplatesSchema(database);

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
