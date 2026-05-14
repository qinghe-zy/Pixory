import type { SQLiteDatabase } from 'expo-sqlite';

import type { AiProviderModelRecord, AiProviderRecord } from '../types';
import { booleanToSqlite, createTimestamp, sqliteToBoolean } from '../utils';

type AiProviderRow = Omit<
  AiProviderRecord,
  'chatEnabled' | 'embeddingEnabled' | 'visionEnabled'
> & {
  chatEnabled: number;
  embeddingEnabled: number;
  visionEnabled: number;
};

type AiProviderModelRow = Omit<
  AiProviderModelRecord,
  'supportsChat' | 'supportsEmbedding' | 'supportsThinking' | 'supportsVision' | 'supportsTools' | 'labels'
> & {
  supportsChat: number;
  supportsEmbedding: number;
  supportsThinking: number;
  supportsVision: number;
  supportsTools: number;
  capabilityJson: string;
};

function mapProviderRow(row: AiProviderRow): AiProviderRecord {
  return {
    ...row,
    baseUrl: row.baseUrl ?? null,
    chatEnabled: sqliteToBoolean(row.chatEnabled),
    embeddingEnabled: sqliteToBoolean(row.embeddingEnabled),
    visionEnabled: sqliteToBoolean(row.visionEnabled),
    defaultChatModelId: row.defaultChatModelId ?? null,
    defaultEmbeddingModelId: row.defaultEmbeddingModelId ?? null,
  };
}

function parseCapabilityLabels(capabilityJson: string): string[] {
  try {
    const parsed = JSON.parse(capabilityJson);
    return Array.isArray(parsed.labels) ? parsed.labels.filter((label: unknown): label is string => typeof label === 'string') : [];
  } catch {
    return [];
  }
}

function mapModelRow(row: AiProviderModelRow): AiProviderModelRecord {
  return {
    ...row,
    supportsChat: sqliteToBoolean(row.supportsChat),
    supportsEmbedding: sqliteToBoolean(row.supportsEmbedding),
    supportsThinking: sqliteToBoolean(row.supportsThinking),
    supportsVision: sqliteToBoolean(row.supportsVision),
    supportsTools: sqliteToBoolean(row.supportsTools),
    contextWindowTokens: row.contextWindowTokens ?? undefined,
    labels: parseCapabilityLabels(row.capabilityJson),
  };
}

export const aiProviderRepository = {
  async upsertProvider(db: SQLiteDatabase, provider: AiProviderRecord): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO ai_providers (
        id,
        providerType,
        displayName,
        baseUrl,
        protocol,
        chatEnabled,
        embeddingEnabled,
        visionEnabled,
        defaultChatModelId,
        defaultEmbeddingModelId,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        providerType = excluded.providerType,
        displayName = excluded.displayName,
        baseUrl = COALESCE(NULLIF(ai_providers.baseUrl, ''), excluded.baseUrl),
        protocol = excluded.protocol,
        chatEnabled = excluded.chatEnabled,
        embeddingEnabled = excluded.embeddingEnabled,
        visionEnabled = excluded.visionEnabled,
        defaultChatModelId = COALESCE(ai_providers.defaultChatModelId, excluded.defaultChatModelId),
        defaultEmbeddingModelId = COALESCE(ai_providers.defaultEmbeddingModelId, excluded.defaultEmbeddingModelId),
        updatedAt = ai_providers.updatedAt`,
      provider.id,
      provider.providerType,
      provider.displayName,
      provider.baseUrl,
      provider.protocol,
      booleanToSqlite(provider.chatEnabled),
      booleanToSqlite(provider.embeddingEnabled),
      booleanToSqlite(provider.visionEnabled),
      provider.defaultChatModelId,
      provider.defaultEmbeddingModelId,
      provider.createdAt || now,
      now
    );
  },

  async listProviders(db: SQLiteDatabase): Promise<AiProviderRecord[]> {
    const rows = await db.getAllAsync<AiProviderRow>('SELECT * FROM ai_providers ORDER BY updatedAt DESC, displayName ASC');
    return rows.map(mapProviderRow);
  },

  async findProviderById(db: SQLiteDatabase, providerId: string): Promise<AiProviderRecord | null> {
    const row = await db.getFirstAsync<AiProviderRow>('SELECT * FROM ai_providers WHERE id = ?', providerId);
    return row ? mapProviderRow(row) : null;
  },

  async updateProviderBaseUrl(db: SQLiteDatabase, providerId: string, baseUrl: string | null): Promise<void> {
    await db.runAsync(
      `UPDATE ai_providers
       SET baseUrl = ?, updatedAt = ?
       WHERE id = ?`,
      baseUrl,
      createTimestamp(),
      providerId
    );
  },

  async updateProviderDefaults(
    db: SQLiteDatabase,
    providerId: string,
    defaults: { defaultChatModelId?: string | null; defaultEmbeddingModelId?: string | null }
  ): Promise<void> {
    const current = await aiProviderRepository.findProviderById(db, providerId);
    if (!current) {
      return;
    }
    await db.runAsync(
      `UPDATE ai_providers
       SET defaultChatModelId = ?, defaultEmbeddingModelId = ?, updatedAt = ?
       WHERE id = ?`,
      defaults.defaultChatModelId ?? current.defaultChatModelId,
      defaults.defaultEmbeddingModelId ?? current.defaultEmbeddingModelId,
      createTimestamp(),
      providerId
    );
  },

  async upsertModels(db: SQLiteDatabase, providerId: string, models: AiProviderModelRecord[]): Promise<void> {
    const now = createTimestamp();
    for (const model of models) {
      await db.runAsync(
        `INSERT INTO ai_provider_models (
          id,
          providerId,
          modelId,
          displayName,
          supportsChat,
          supportsEmbedding,
          supportsThinking,
          supportsVision,
          supportsTools,
          contextWindowTokens,
          capabilityJson,
          source,
          createdAt,
          updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(providerId, modelId) DO UPDATE SET
          displayName = excluded.displayName,
          supportsChat = excluded.supportsChat,
          supportsEmbedding = excluded.supportsEmbedding,
          supportsThinking = excluded.supportsThinking,
          supportsVision = excluded.supportsVision,
          supportsTools = excluded.supportsTools,
          contextWindowTokens = excluded.contextWindowTokens,
          capabilityJson = excluded.capabilityJson,
          source = excluded.source,
          updatedAt = excluded.updatedAt`,
        model.id,
        providerId,
        model.modelId,
        model.displayName,
        booleanToSqlite(model.supportsChat),
        booleanToSqlite(model.supportsEmbedding),
        booleanToSqlite(model.supportsThinking),
        booleanToSqlite(model.supportsVision),
        booleanToSqlite(model.supportsTools),
        model.contextWindowTokens ?? null,
        JSON.stringify({ labels: model.labels }),
        model.source,
        model.createdAt || now,
        now
      );
    }
  },

  async listModels(db: SQLiteDatabase, providerId: string): Promise<AiProviderModelRecord[]> {
    const rows = await db.getAllAsync<AiProviderModelRow>(
      `SELECT * FROM ai_provider_models
       WHERE providerId = ?
       ORDER BY supportsChat DESC, supportsEmbedding ASC, displayName ASC`,
      providerId
    );
    return rows.map(mapModelRow);
  },

  async findModel(db: SQLiteDatabase, providerId: string, modelId: string): Promise<AiProviderModelRecord | null> {
    const row = await db.getFirstAsync<AiProviderModelRow>(
      'SELECT * FROM ai_provider_models WHERE providerId = ? AND modelId = ?',
      providerId,
      modelId
    );
    return row ? mapModelRow(row) : null;
  },
};

export default aiProviderRepository;
