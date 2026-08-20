import type { SQLiteDatabase } from 'expo-sqlite';

export type RegisteredDatabaseSpace = 'normal' | 'personal';

const databaseSpaces = new WeakMap<object, RegisteredDatabaseSpace>();

export function registerDatabaseSpace(
  database: SQLiteDatabase | object,
  space: RegisteredDatabaseSpace,
): void {
  databaseSpaces.set(database, space);
}

export function getRegisteredDatabaseSpace(
  database: SQLiteDatabase | object,
): RegisteredDatabaseSpace | undefined {
  return databaseSpaces.get(database);
}
