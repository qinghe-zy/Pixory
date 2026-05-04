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
} from './schema';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let initializationPromise: Promise<SQLiteDatabase> | null = null;

async function openPixoryDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

async function configureDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

export async function runMigrations(db?: SQLiteDatabase): Promise<void> {
  const database = db ?? (await openPixoryDatabase());

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

    if (currentVersion !== DATABASE_VERSION) {
      await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    }
  });
}

export async function initDatabase(): Promise<SQLiteDatabase> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const db = await openPixoryDatabase();
      await configureDatabase(db);
      await runMigrations(db);
      return db;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export async function getDatabase(): Promise<SQLiteDatabase> {
  return initDatabase();
}
