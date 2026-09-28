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
    embeddingBaseUrl: row.embeddingBaseUrl ?? null,
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
        embeddingBaseUrl,
        protocol,
        chatEnabled,
        embeddingEnabled,
        visionEnabled,
        defaultChatModelId,
        defaultEmbeddingModelId,
        keyUpdatedAt,
        lastVerifiedAt,
        lastVerifyStatus,
        lastVerifyMessage,
        verifyFingerprint,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        providerType = excluded.providerType,
        displayName = excluded.displayName,
        baseUrl = COALESCE(NULLIF(ai_providers.baseUrl, ''), excluded.baseUrl),
        embeddingBaseUrl = COALESCE(NULLIF(ai_providers.embeddingBaseUrl, ''), excluded.embeddingBaseUrl),
        protocol = excluded.protocol,
        chatEnabled = excluded.chatEnabled,
        embeddingEnabled = excluded.embeddingEnabled,
        visionEnabled = excluded.visionEnabled,
        defaultChatModelId = COALESCE(ai_providers.defaultChatModelId, excluded.defaultChatModelId),
        defaultEmbeddingModelId = COALESCE(ai_providers.defaultEmbeddingModelId, excluded.defaultEmbeddingModelId),
        keyUpdatedAt = ai_providers.keyUpdatedAt,
        lastVerifiedAt = ai_providers.lastVerifiedAt,
        lastVerifyStatus = ai_providers.lastVerifyStatus,
        lastVerifyMessage = ai_providers.lastVerifyMessage,
        verifyFingerprint = ai_providers.verifyFingerprint,
        updatedAt = ai_providers.updatedAt`,
      provider.id,
      provider.providerType,
      provider.displayName,
      provider.baseUrl,
      provider.embeddingBaseUrl,
      provider.protocol,
      booleanToSqlite(provider.chatEnabled),
      booleanToSqlite(provider.embeddingEnabled),
      booleanToSqlite(provider.visionEnabled),
      provider.defaultChatModelId,
      provider.defaultEmbeddingModelId,
      provider.keyUpdatedAt,
      provider.lastVerifiedAt,
      provider.lastVerifyStatus,
      provider.lastVerifyMessage,
      provider.verifyFingerprint,
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

  async updateProviderEmbeddingBaseUrl(db: SQLiteDatabase, providerId: string, embeddingBaseUrl: string | null): Promise<void> {
    await db.runAsync(
      `UPDATE ai_providers
       SET embeddingBaseUrl = ?, updatedAt = ?
       WHERE id = ?`,
      embeddingBaseUrl,
      createTimestamp(),
      providerId
    );
  },

  async updateProviderKeyUpdatedAt(db: SQLiteDatabase, providerId: string, keyUpdatedAt: string): Promise<void> {
    await db.runAsync(
      `UPDATE ai_providers
       SET keyUpdatedAt = ?, updatedAt = ?
       WHERE id = ?`,
      keyUpdatedAt,
      createTimestamp(),
      providerId
    );
  },

  async updateProviderVerification(
    db: SQLiteDatabase,
    providerId: string,
    verification: {
      lastVerifiedAt?: string | null;
      lastVerifyMessage?: string | null;
      lastVerifyStatus?: AiProviderRecord['lastVerifyStatus'];
      verifyFingerprint?: string | null;
    }
  ): Promise<void> {
    const current = await aiProviderRepository.findProviderById(db, providerId);
    if (!current) {
      return;
    }
    await db.runAsync(
      `UPDATE ai_providers
       SET lastVerifiedAt = ?,
           lastVerifyStatus = ?,
           lastVerifyMessage = ?,
           verifyFingerprint = ?,
           updatedAt = ?
       WHERE id = ?`,
      verification.lastVerifiedAt === undefined ? current.lastVerifiedAt : verification.lastVerifiedAt,
      verification.lastVerifyStatus === undefined ? current.lastVerifyStatus : verification.lastVerifyStatus,
      verification.lastVerifyMessage === undefined ? current.lastVerifyMessage : verification.lastVerifyMessage,
      verification.verifyFingerprint === undefined ? current.verifyFingerprint : verification.verifyFingerprint,
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
          displayName = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.displayName ELSE excluded.displayName END,
          supportsChat = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.supportsChat ELSE excluded.supportsChat END,
          supportsEmbedding = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.supportsEmbedding ELSE excluded.supportsEmbedding END,
          supportsThinking = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.supportsThinking ELSE excluded.supportsThinking END,
          supportsVision = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.supportsVision ELSE excluded.supportsVision END,
          supportsTools = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.supportsTools ELSE excluded.supportsTools END,
          contextWindowTokens = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.contextWindowTokens ELSE excluded.contextWindowTokens END,
          capabilityJson = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.capabilityJson ELSE excluded.capabilityJson END,
          source = CASE WHEN ai_provider_models.source = 'manual' AND excluded.source <> 'manual' THEN ai_provider_models.source ELSE excluded.source END,
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

  async deleteProviderModelAndCleanup(
    db: SQLiteDatabase,
    providerId: string,
    modelId: string
  ): Promise<void> {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE ai_providers
         SET defaultChatModelId = CASE WHEN defaultChatModelId = ? THEN NULL ELSE defaultChatModelId END,
             defaultEmbeddingModelId = CASE WHEN defaultEmbeddingModelId = ? THEN NULL ELSE defaultEmbeddingModelId END,
             updatedAt = ?
         WHERE id = ?`,
        modelId,
        modelId,
        createTimestamp(),
        providerId
      );
      await db.runAsync(
        `UPDATE ai_threads
         SET providerId = CASE WHEN providerId = ? AND modelId = ? THEN NULL ELSE providerId END,
             modelId = CASE WHEN providerId = ? AND modelId = ? THEN NULL ELSE modelId END,
             sessionBaseUrl = CASE WHEN providerId = ? AND modelId = ? THEN NULL ELSE sessionBaseUrl END,
             sessionApiKeyRef = CASE WHEN providerId = ? AND modelId = ? THEN NULL ELSE sessionApiKeyRef END,
             updatedAt = ?
         WHERE providerId = ? AND modelId = ?`,
        providerId,
        modelId,
        providerId,
        modelId,
        providerId,
        modelId,
        providerId,
        modelId,
        createTimestamp(),
        providerId,
        modelId
      );
      await db.runAsync(
        'DELETE FROM ai_provider_models WHERE providerId = ? AND modelId = ?',
        providerId,
        modelId
      );
    });
  },
};

export default aiProviderRepository;
