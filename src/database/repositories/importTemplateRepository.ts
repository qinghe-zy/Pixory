import { getDatabase } from '../db';
import type {
  CountRow,
  CreateImportTemplateInput,
  ImportTemplateRecord,
  ImportTemplateRow,
  UpdateImportTemplateInput,
} from '../types';
import { booleanToSqlite, createTimestamp, requireNonEmptyText, sqliteToBoolean } from '../utils';

function normalizeTagNames(tagNames: string[] | undefined): string[] {
  const deduped = new Map<string, string>();

  for (const rawTagName of tagNames ?? []) {
    const tagName = rawTagName.trim();
    if (!tagName) {
      continue;
    }

    const key = tagName.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, tagName);
    }
  }

  return [...deduped.values()];
}

function parseTagsJson(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? normalizeTagNames(parsed.filter((item): item is string => typeof item === 'string')) : [];
  } catch {
    return [];
  }
}

function mapImportTemplateRow(row: ImportTemplateRow): ImportTemplateRecord {
  return {
    key: row.key,
    name: row.name,
    groupName: row.groupName,
    tags: parseTagsJson(row.tagsJson),
    note: row.note,
    isFavorite: sqliteToBoolean(row.isFavorite),
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function createTemplateKey(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10000).toString(36)}`;
  return `custom-${stem || 'template'}-${suffix}`;
}

export const importTemplateRepository = {
  async findAll(): Promise<ImportTemplateRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ImportTemplateRow>(
      `SELECT *
       FROM import_templates
       ORDER BY sortOrder ASC, updatedAt DESC, name COLLATE NOCASE ASC`
    );

    return rows.map(mapImportTemplateRow);
  },

  async findByKey(key: string): Promise<ImportTemplateRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ImportTemplateRow>('SELECT * FROM import_templates WHERE key = ?', key);
    return row ? mapImportTemplateRow(row) : null;
  },

  async create(input: CreateImportTemplateInput): Promise<ImportTemplateRecord> {
    const db = await getDatabase();
    const now = createTimestamp();
    const name = requireNonEmptyText(input.name, 'Template name');
    const groupName = requireNonEmptyText(input.groupName, 'Template group name');
    const tags = normalizeTagNames(input.tags);
    const countRow = await db.getFirstAsync<CountRow>('SELECT COUNT(*) AS count FROM import_templates');
    const key = createTemplateKey(name);

    await db.runAsync(
      `INSERT INTO import_templates (
        key,
        name,
        groupName,
        tagsJson,
        note,
        isFavorite,
        sortOrder,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      key,
      name,
      groupName,
      JSON.stringify(tags),
      input.note?.trim() ?? '',
      booleanToSqlite(input.isFavorite ?? false),
      ((countRow?.count ?? 0) + 1) * 10,
      now,
      now
    );

    const created = await this.findByKey(key);
    if (!created) {
      throw new Error(`Import template ${key} was created but could not be reloaded.`);
    }

    return created;
  },

  async update(key: string, input: UpdateImportTemplateInput): Promise<ImportTemplateRecord | null> {
    const current = await this.findByKey(key);
    if (!current) {
      return null;
    }

    const db = await getDatabase();
    await db.runAsync(
      `UPDATE import_templates
       SET name = ?,
           groupName = ?,
           tagsJson = ?,
           note = ?,
           isFavorite = ?,
           updatedAt = ?
       WHERE key = ?`,
      input.name !== undefined ? requireNonEmptyText(input.name, 'Template name') : current.name,
      input.groupName !== undefined ? requireNonEmptyText(input.groupName, 'Template group name') : current.groupName,
      JSON.stringify(input.tags !== undefined ? normalizeTagNames(input.tags) : current.tags),
      input.note !== undefined ? input.note.trim() : current.note,
      booleanToSqlite(input.isFavorite ?? current.isFavorite),
      createTimestamp(),
      key
    );

    return this.findByKey(key);
  },

  async deleteByKey(key: string): Promise<number> {
    const db = await getDatabase();
    const result = await db.runAsync('DELETE FROM import_templates WHERE key = ?', key);
    return result.changes;
  },
};

export default importTemplateRepository;
