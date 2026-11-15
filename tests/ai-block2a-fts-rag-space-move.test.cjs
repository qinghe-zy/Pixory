const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadTsModule(relativePath, customMocks = {}) {
  const fullPath = path.join(root, relativePath);
  const visitedCache = new Map();

  function compileAndLoad(targetPath) {
    if (visitedCache.has(targetPath)) {
      return visitedCache.get(targetPath);
    }
    const source = fs.readFileSync(targetPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: targetPath,
    }).outputText;

    const mod = { exports: {} };
    visitedCache.set(targetPath, mod.exports);

    const localRequire = (reqPath) => {
      if (Object.prototype.hasOwnProperty.call(customMocks, reqPath)) {
        return customMocks[reqPath];
      }
      if (reqPath.startsWith('.')) {
        const base = path.resolve(path.dirname(targetPath), reqPath);
        for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
          const candidate = base + ext;
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            const candidateRel = path.relative(root, candidate).replace(/\\/g, '/');
            if (Object.prototype.hasOwnProperty.call(customMocks, candidateRel)) {
              return customMocks[candidateRel];
            }
            return compileAndLoad(candidate);
          }
        }
      }
      return require(reqPath);
    };

    const fn = new Function('exports', 'module', 'require', '__filename', '__dirname', transpiled);
    fn(mod.exports, mod, localRequire, targetPath, path.dirname(targetPath));
    visitedCache.set(targetPath, mod.exports);
    return mod.exports;
  }

  return compileAndLoad(fullPath);
}

function wrapSqlite(nativeDb) {
  let txDepth = 0;
  return {
    nativeDb,
    async execAsync(sql) {
      nativeDb.exec(sql);
    },
    async runAsync(sql, ...params) {
      const result = nativeDb.prepare(sql).run(...params);
      return {
        changes: Number(result.changes ?? 0),
        lastInsertRowId: Number(result.lastInsertRowid ?? 0),
      };
    },
    async getFirstAsync(sql, ...params) {
      const row = nativeDb.prepare(sql).get(...params);
      return row ?? null;
    },
    async getAllAsync(sql, ...params) {
      return nativeDb.prepare(sql).all(...params);
    },
    async withTransactionAsync(task) {
      const savepointName = `sp_${++txDepth}`;
      if (txDepth === 1) {
        nativeDb.exec('BEGIN IMMEDIATE');
      } else {
        nativeDb.exec(`SAVEPOINT ${savepointName}`);
      }
      try {
        const res = await task();
        if (txDepth === 1) {
          nativeDb.exec('COMMIT');
        } else {
          nativeDb.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }
        txDepth -= 1;
        return res;
      } catch (error) {
        if (txDepth === 1) {
          nativeDb.exec('ROLLBACK');
        } else {
          nativeDb.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          nativeDb.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }
        txDepth -= 1;
        throw error;
      }
    },
    async closeAsync() {
      nativeDb.close();
    },
  };
}

function createV2TestDb() {
  const nativeDb = new DatabaseSync(':memory:');
  nativeDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_role_cards (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      firstMessage TEXT,
      alternateGreetingsJson TEXT NOT NULL DEFAULT '[]',
      sourceType TEXT,
      sourceJson TEXT,
      defaultLanguage TEXT,
      defaultModelId TEXT,
      boundaryMode TEXT NOT NULL DEFAULT 'free',
      avatarEnabled INTEGER NOT NULL DEFAULT 0,
      avatarUri TEXT,
      tagsJson TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT
    );
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
      contextType TEXT NOT NULL,
      boundIpId INTEGER,
      boundKnowledgeBaseId TEXT,
      includeIpDocuments INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      titleStatus TEXT NOT NULL DEFAULT 'fallback',
      modelTitleGeneratedAt TEXT,
      providerId TEXT,
      modelId TEXT,
      sessionBaseUrl TEXT,
      modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
      roleCardId TEXT,
      roleSnapshotJson TEXT NOT NULL DEFAULT '{}',
      roleInstructionWeight TEXT NOT NULL DEFAULT 'default',
      replyPreference TEXT NOT NULL DEFAULT 'auto',
      contextHistoryRoundLimit INTEGER NOT NULL DEFAULT 30,
      thinkingDisabled INTEGER NOT NULL DEFAULT 0,
      systemPrompt TEXT NOT NULL DEFAULT '',
      materialRulesSnapshot TEXT,
      pinnedLoreSnapshot TEXT,
      boundaryMode TEXT NOT NULL DEFAULT 'free',
      summary TEXT,
      lastMessagePreview TEXT,
      currentBranchRootMessageId TEXT,
      currentBranchVersionIndex INTEGER,
      lineageVersion INTEGER NOT NULL DEFAULT 0,
      chat_mode TEXT,
      isPinned INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoningText TEXT,
      errorMessage TEXT,
      providerId TEXT,
      modelId TEXT,
      modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
      promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
      continuityImportSessionId TEXT,
      continuitySyntheticKind TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_message_attachments (
      id TEXT PRIMARY KEY NOT NULL,
      messageId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      localUri TEXT NOT NULL,
      documentId TEXT,
      mimeType TEXT,
      fileSize INTEGER,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_message_citations (
      id TEXT PRIMARY KEY NOT NULL,
      messageId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      label TEXT NOT NULL,
      locatorJson TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_message_versions (
      id TEXT PRIMARY KEY NOT NULL,
      originalMessageId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      versionIndex INTEGER NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoningText TEXT,
      errorMessage TEXT,
      providerId TEXT,
      modelId TEXT,
      modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
      promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
      citationsJson TEXT NOT NULL DEFAULT '[]',
      messageCreatedAt TEXT NOT NULL,
      messageUpdatedAt TEXT NOT NULL,
      messageCompletedAt TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE ai_branch_route_metadata (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT NOT NULL,
      branchVersionIndex INTEGER NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_continuity_import_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      space TEXT NOT NULL,
      sourceKind TEXT NOT NULL,
      sourcePlatform TEXT,
      formatVersion TEXT,
      originalCharacterName TEXT,
      parsedMessageCount INTEGER NOT NULL DEFAULT 0,
      containsCompressedContinuity INTEGER NOT NULL DEFAULT 0,
      importMode TEXT NOT NULL,
      rollbackState TEXT NOT NULL,
      rollbackRoundsRemaining INTEGER NOT NULL DEFAULT 0,
      reviewGateState TEXT NOT NULL,
      memoryReviewStatus TEXT,
      baselineRoundCount INTEGER NOT NULL DEFAULT 0,
      remoteModelConsent INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_continuity_import_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      importSessionId TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE ai_message_favorites (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      threadId TEXT NOT NULL,
      messageId TEXT NOT NULL,
      favoriteKey TEXT NOT NULL UNIQUE,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      branchScopesJson TEXT NOT NULL DEFAULT '[]',
      messageVersionIndex INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_memory_settings (
      threadId TEXT PRIMARY KEY NOT NULL,
      deepMemoryEnabled INTEGER NOT NULL DEFAULT 1,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_summaries (
      threadId TEXT PRIMARY KEY NOT NULL,
      summary TEXT NOT NULL,
      decisions TEXT NOT NULL,
      openQuestions TEXT NOT NULL,
      lastMessageId TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_memory_jobs (
      threadId TEXT PRIMARY KEY NOT NULL,
      pendingTurnCount INTEGER NOT NULL DEFAULT 0,
      lastConsolidatedMessageId TEXT,
      lastCaptureNoticeJson TEXT NOT NULL DEFAULT '{}',
      lastCompressedMessageId TEXT,
      uncompressedRoundCount INTEGER NOT NULL DEFAULT 0,
      completedMessageCountAtProfileUpdate INTEGER NOT NULL DEFAULT 0,
      lastProfileUpdatedAt TEXT,
      profileUpdateCooldownUntil TEXT,
      lastMaintenanceError TEXT,
      lastMaintenanceModelProviderId TEXT,
      lastMaintenanceModelId TEXT,
      lastMaintenanceCompletedAt TEXT,
      lastMaintenanceUsedFallback INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_thread_summary_segments (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      space TEXT NOT NULL,
      kind TEXT NOT NULL,
      summaryText TEXT NOT NULL,
      startMessageId TEXT,
      endMessageId TEXT,
      startAt TEXT,
      endAt TEXT,
      roundCount INTEGER NOT NULL DEFAULT 0,
      sourceSegmentIdsJson TEXT NOT NULL DEFAULT '[]',
      sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]',
      branchRouteHash TEXT NOT NULL DEFAULT '',
      lineageVersion INTEGER NOT NULL DEFAULT 0,
      sourceMessageVersionHash TEXT NOT NULL DEFAULT '',
      quality TEXT NOT NULL DEFAULT 'legacy',
      status TEXT NOT NULL DEFAULT 'stale',
      continuityImportSessionId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      boundIpId INTEGER,
      boundThreadId TEXT REFERENCES ai_threads(id) ON DELETE CASCADE,
      profileJson TEXT NOT NULL,
      profileText TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      sourceThreadId TEXT,
      sourceStartMessageId TEXT,
      sourceEndMessageId TEXT,
      messageCountAtUpdate INTEGER NOT NULL DEFAULT 0,
      lastUpdatedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_memories (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      scope TEXT NOT NULL,
      scopeId TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      normalizedContent TEXT NOT NULL,
      sourceMessageId TEXT,
      confidence REAL NOT NULL,
      importance INTEGER NOT NULL,
      status TEXT NOT NULL,
      lastUsedAt TEXT,
      ipId INTEGER,
      groupId INTEGER,
      imageAssetId INTEGER,
      assetSnapshotJson TEXT NOT NULL DEFAULT '{}',
      sourceKind TEXT NOT NULL DEFAULT 'auto',
      supersededByMemoryId TEXT,
      mergeReason TEXT,
      mergedAt TEXT,
      lastReconciledAt TEXT,
      reconcileSourceMessageId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT
    );
    CREATE VIRTUAL TABLE ai_message_fts USING fts5(id UNINDEXED, threadId UNINDEXED, role UNINDEXED, content, updatedAt UNINDEXED);
    CREATE VIRTUAL TABLE ai_message_version_fts USING fts5(id UNINDEXED, originalMessageId UNINDEXED, threadId UNINDEXED, role UNINDEXED, content, updatedAt UNINDEXED);
    CREATE VIRTUAL TABLE ai_memory_fts USING fts5(id UNINDEXED, space UNINDEXED, scope UNINDEXED, scopeId UNINDEXED, content, normalizedContent, assetSnapshotJson, updatedAt UNINDEXED);
    CREATE TABLE memory_claims (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
      schemaVersion INTEGER NOT NULL DEFAULT 1,
      canonicalClaimId TEXT NOT NULL,
      relatedClaimGroupId TEXT,
      lane TEXT NOT NULL CHECK (lane IN ('confirmed', 'working', 'archive')),
      status TEXT NOT NULL CHECK (status IN ('tentative', 'committed', 'confirmed', 'stale', 'superseded', 'conflicted', 'suppressed', 'deleted')),
      kind TEXT NOT NULL CHECK (kind IN ('state', 'episode', 'task', 'commitment', 'relational_signal')),
      actor TEXT NOT NULL CHECK (actor IN ('user', 'companion', 'joint')),
      subjectEntityId TEXT NOT NULL,
      subjectDisplay TEXT NOT NULL,
      scopeType TEXT NOT NULL CHECK (scopeType IN ('global', 'role', 'ip', 'knowledge_base', 'thread', 'branch')),
      scopeId TEXT,
      predicate TEXT NOT NULL,
      valueNormalized TEXT NOT NULL,
      valueDisplay TEXT NOT NULL,
      polarity TEXT NOT NULL CHECK (polarity IN ('positive', 'negative', 'unknown')),
      speechMode TEXT NOT NULL CHECK (speechMode IN ('asserted', 'corrected', 'negated', 'hypothetical', 'joke', 'quoted', 'roleplay', 'uncertain')),
      rawTimePhrase TEXT,
      validFrom TEXT,
      validTo TEXT,
      validPrecision TEXT NOT NULL CHECK (validPrecision IN ('exact', 'day', 'month', 'relative', 'unknown')),
      confidenceRaw REAL NOT NULL CHECK (confidenceRaw >= 0 AND confidenceRaw <= 1),
      confidenceCalibrated REAL CHECK (confidenceCalibrated IS NULL OR (confidenceCalibrated >= 0 AND confidenceCalibrated <= 1)),
      confidenceBand TEXT NOT NULL CHECK (confidenceBand IN ('high', 'medium', 'low')),
      importance INTEGER NOT NULL CHECK (importance BETWEEN 0 AND 100),
      stability TEXT NOT NULL CHECK (stability IN ('ephemeral', 'short', 'long', 'permanent')),
      manualLocked INTEGER NOT NULL DEFAULT 0 CHECK (manualLocked IN (0, 1)),
      safetyState TEXT NOT NULL DEFAULT 'none' CHECK (safetyState IN ('none', 'safety_pending', 'safety_confirmed')),
      sourceKind TEXT NOT NULL CHECK (sourceKind IN ('message', 'summary', 'import', 'manual', 'assistant_commitment')),
      sourceMessageId TEXT,
      extractorVersion TEXT NOT NULL,
      ontologyVersion TEXT NOT NULL,
      projectionVersion INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastUsedAt TEXT,
      supersededByClaimId TEXT,
      deletedAt TEXT,
      FOREIGN KEY (sourceMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (supersededByClaimId) REFERENCES memory_claims(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX uq_memory_claims_active_canonical
      ON memory_claims(space, canonicalClaimId, scopeType, COALESCE(scopeId, '∅'))
      WHERE status IN ('tentative', 'committed', 'confirmed', 'conflicted') AND deletedAt IS NULL;
    CREATE TABLE memory_events (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
      aggregateType TEXT NOT NULL CHECK (aggregateType IN ('claim', 'episode', 'relation', 'import')),
      aggregateId TEXT NOT NULL,
      eventType TEXT NOT NULL,
      eventVersion INTEGER NOT NULL,
      commandId TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL UNIQUE,
      actorType TEXT NOT NULL CHECK (actorType IN ('user', 'system', 'model', 'import')),
      actorId TEXT,
      source TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      evidenceIdsJson TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      projectionVersion INTEGER NOT NULL
    );
    CREATE TABLE memory_evidence (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
      sourceType TEXT NOT NULL CHECK (sourceType IN ('message', 'summary', 'import', 'attachment')),
      sourceId TEXT NOT NULL,
      messageId TEXT,
      role TEXT,
      quote TEXT,
      quoteHash TEXT NOT NULL,
      charStart INTEGER,
      charEnd INTEGER,
      sourceRevision TEXT,
      createdAt TEXT NOT NULL,
      deletedAt TEXT,
      FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE SET NULL
    );
    CREATE TABLE memory_episodes (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      scopeType TEXT NOT NULL,
      scopeId TEXT,
      lane TEXT NOT NULL,
      status TEXT NOT NULL,
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
      confidenceBand TEXT NOT NULL,
      importance INTEGER NOT NULL,
      projectionVersion INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT,
      deletedAt TEXT,
      FOREIGN KEY (startMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (endMessageId) REFERENCES ai_messages(id) ON DELETE SET NULL
    );
    CREATE TABLE memory_relational_states (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      scopeType TEXT NOT NULL,
      scopeId TEXT,
      subjectEntityId TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      signalWeight REAL NOT NULL,
      decayHalfLifeDays REAL NOT NULL,
      lastEvidenceAt TEXT,
      evidenceIdsJson TEXT NOT NULL DEFAULT '[]',
      projectionVersion INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(space, scopeType, scopeId, subjectEntityId, metric)
    );
    CREATE TABLE memory_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
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
    CREATE TABLE memory_board_projection (
      claimId TEXT NOT NULL,
      space TEXT NOT NULL,
      displayContent TEXT NOT NULL,
      lane TEXT NOT NULL,
      scopeLabel TEXT NOT NULL,
      sourceLabel TEXT NOT NULL,
      needsReview INTEGER NOT NULL DEFAULT 0,
      hasConflict INTEGER NOT NULL DEFAULT 0,
      sortKey REAL NOT NULL,
      projectionVersion INTEGER NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (claimId, space),
      FOREIGN KEY (claimId) REFERENCES memory_claims(id) ON DELETE CASCADE
    );
    CREATE TABLE memory_claim_feedback (
      claimId TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      injectedCount INTEGER NOT NULL DEFAULT 0,
      usedCount INTEGER NOT NULL DEFAULT 0,
      lastInjectedAt TEXT,
      lastUsedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (claimId) REFERENCES memory_claims(id) ON DELETE CASCADE
    );
    CREATE TABLE memory_embeddings (
      claimId TEXT NOT NULL,
      space TEXT NOT NULL,
      providerId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vectorJson TEXT NOT NULL,
      sourceTextHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (claimId, space, modelId),
      FOREIGN KEY (claimId) REFERENCES memory_claims(id) ON DELETE CASCADE
    );
    CREATE TABLE memory_current_turn_observations (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      threadId TEXT NOT NULL,
      branchRootMessageId TEXT,
      branchVersionIndex INTEGER,
      messageId TEXT NOT NULL,
      intent TEXT NOT NULL,
      explicitUserAction INTEGER NOT NULL DEFAULT 0,
      payloadJson TEXT NOT NULL,
      status TEXT NOT NULL,
      extractorVersion TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      consumedAt TEXT,
      deletedAt TEXT,
      FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
      FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
    );
    CREATE TABLE ai_generation_jobs (id TEXT PRIMARY KEY, space TEXT, threadId TEXT, state TEXT, leaseOwner TEXT, leaseExpiresAt TEXT, remoteOutcomeUnknown INTEGER DEFAULT 0, createdAt TEXT);
    CREATE TABLE ai_generation_events (id TEXT PRIMARY KEY, jobId TEXT, sequence INTEGER);
    CREATE TABLE companion_events (id TEXT PRIMARY KEY, space TEXT, subjectType TEXT, subjectId TEXT, roleCardId TEXT, threadId TEXT, branchRootMessageId TEXT, branchVersionIndex INTEGER, branchRouteHash TEXT, lineageVersion INTEGER, sourceMessageId TEXT, sourceMessageVersionHash TEXT, category TEXT, subtype TEXT, speechMode TEXT, confidence REAL, intensity REAL, sincerity REAL, payloadJson TEXT, evidenceSpanJson TEXT, extractorVersion TEXT, provenanceJson TEXT, idempotencyKey TEXT, status TEXT, eventSequence INTEGER, createdAt TEXT);
    CREATE TABLE companion_temporal_anchors (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, lineageVersion INTEGER, sourceEventId TEXT, sourceMessageId TEXT, rawText TEXT, startAtUtc TEXT, endAtUtc TEXT, parseTimeZone TEXT, localDateKey TEXT, precision TEXT, anchorType TEXT, recurrenceRule TEXT, mentionCount INTEGER, lastMentionedAt TEXT, status TEXT, confidence REAL, parserVersion TEXT, idempotencyKey TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_open_loops (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, lineageVersion INTEGER, sourceEventId TEXT, sourceMessageId TEXT, kind TEXT, summary TEXT, normalizedSummary TEXT, dueAtUtc TEXT, expiresAtUtc TEXT, salience REAL, status TEXT, resolvedAt TEXT, resolutionNote TEXT, idempotencyKey TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_runtime_jobs (id TEXT PRIMARY KEY, threadId TEXT, space TEXT, lastEventMessageId TEXT, lastProcessedSequence INTEGER, projectionVersion INTEGER, pendingTurnCount INTEGER, lastMaintenanceAt TEXT, lastError TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_context_traces (id TEXT PRIMARY KEY, space TEXT, threadId TEXT, branchRootMessageId TEXT, branchVersionIndex INTEGER, branchRouteHash TEXT, lineageVersion INTEGER, turnMessageId TEXT, traceJson TEXT, createdAt TEXT);
    CREATE TABLE companion_projection_snapshots (id TEXT PRIMARY KEY, space TEXT, scopeType TEXT, scopeKey TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, lineageVersion INTEGER, stateJson TEXT, stateText TEXT, projectionVersion INTEGER, sourceEventSequence INTEGER, expiresAtUtc TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_affective_observations (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, lineageVersion INTEGER, sourceMessageId TEXT, emotion TEXT, valence REAL, arousal REAL, intensity REAL, warmth REAL, stability REAL, attachmentSignal TEXT, summary TEXT, confidence REAL, idempotencyKey TEXT, createdAt TEXT);
    CREATE TABLE companion_repairs (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, lineageVersion INTEGER, sourceMessageId TEXT, reason TEXT, stage TEXT, userPreferenceHint TEXT, avoidanceConstraint TEXT, repairSummary TEXT, resolvedAt TEXT, idempotencyKey TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_dream_scenes (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, sceneKey TEXT, theme TEXT, narrativeHint TEXT, intensity REAL, status TEXT, openedAt TEXT, updatedAt TEXT, closedAt TEXT);
    CREATE TABLE companion_dream_seeds (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, sourceMessageId TEXT, seedType TEXT, content TEXT, salience REAL, usedCount INTEGER, status TEXT, idempotencyKey TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_dream_jobs (id TEXT PRIMARY KEY, threadId TEXT, space TEXT, lastProcessedMessageId TEXT, pendingRoundCount INTEGER, lastDreamAt TEXT, cooldownUntil TEXT, lastError TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_dreams (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, sourceThreadId TEXT, sourceBranchRouteHash TEXT, title TEXT, dreamText TEXT, shortTeaser TEXT, dreamCategory TEXT, mood TEXT, recallHint TEXT, sourceMessageIdsJson TEXT, sourceSeedIdsJson TEXT, dreamStatus TEXT, salience REAL, triggeredAt TEXT, surfacedAt TEXT, deliveredAt TEXT, expiredAt TEXT, generationMode TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_role_round_receipts (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, assistantMessageId TEXT, roundNumber INTEGER, status TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_role_round_counters (space TEXT, roleCardId TEXT, totalRounds INTEGER, updatedAt TEXT, PRIMARY KEY (space, roleCardId));
    CREATE TABLE companion_thought_events (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, threadId TEXT, branchRouteHash TEXT, eventType TEXT, topic TEXT, summary TEXT, salience REAL, sourceMessageId TEXT, idempotencyKey TEXT, createdAt TEXT);
    CREATE TABLE companion_thought_jobs (id TEXT PRIMARY KEY, threadId TEXT, space TEXT, lastProcessedMessageId TEXT, lastThoughtAt TEXT, cooldownUntil TEXT, lastError TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE companion_thoughts (id TEXT PRIMARY KEY, space TEXT, roleCardId TEXT, sourceThreadId TEXT, topic TEXT, thoughtText TEXT, mood TEXT, status TEXT, surfacedAt TEXT, deliveredAt TEXT, expiredAt TEXT, generationMode TEXT, createdAt TEXT, updatedAt TEXT);
  `);
  return wrapSqlite(nativeDb);
}

test('AI P0 #1: ai_memory_fts rebuild and migration v74 preserve both V1 and V2 memories', async () => {
  const schema = loadTsModule('src/database/schema.ts');
  const dbModule = loadTsModule('src/database/db.ts', {
    'expo-sqlite': { openDatabaseAsync: async () => null },
    '../ai/generation/aiGenerationRepository': { markInterruptedGenerationJobs: async () => {} },
  });

  assert.ok(schema.DATABASE_VERSION >= 74);

  const db = createV2TestDb();
  const now = '2026-11-14T10:00:00.000Z';

  await db.runAsync(
    `INSERT INTO ai_memories (
      id, space, scope, scopeId, type, content, normalizedContent, confidence, importance, status, sourceKind, createdAt, updatedAt
    ) VALUES (?, 'normal', 'global', NULL, 'preference', ?, ?, 0.9, 90, 'active', 'manual', ?, ?)`,
    'v1-active',
    '喜欢 乌龙茶 微糖',
    '喜欢 乌龙茶 微糖',
    now,
    now
  );
  await db.runAsync(
    `INSERT INTO ai_memories (
      id, space, scope, scopeId, type, content, normalizedContent, confidence, importance, status, supersededByMemoryId, sourceKind, createdAt, updatedAt
    ) VALUES (?, 'normal', 'global', NULL, 'preference', ?, ?, 0.8, 50, 'superseded', 'v1-active', 'manual', ?, ?)`,
    'v1-superseded',
    '喜欢 可乐',
    '喜欢 可乐',
    now,
    now
  );

  const insertClaim = `INSERT INTO memory_claims (
    id, space, canonicalClaimId, lane, status, kind, actor, subjectEntityId, subjectDisplay,
    scopeType, scopeId, predicate, valueNormalized, valueDisplay, polarity, speechMode,
    validPrecision, confidenceRaw, confidenceCalibrated, confidenceBand, importance, stability,
    manualLocked, safetyState, sourceKind, extractorVersion, ontologyVersion, projectionVersion,
    version, createdAt, updatedAt, deletedAt
  ) VALUES (?, 'normal', ?, 'confirmed', ?, 'state', 'user', 'user', '用户', 'global', NULL, 'fact.health', ?, ?, 'positive', 'asserted', 'unknown', 0.95, 0.95, 'high', 95, 'permanent', 1, 'none', 'manual', 'v2', 'ontology-v1', 1, 1, ?, ?, ?)`;

  await db.runAsync(insertClaim, 'v2-active', 'health:allergy', 'confirmed', '芒果 过敏 严重忌口', '芒果 过敏 严重忌口', now, now, null);
  await db.runAsync(insertClaim, 'v2-deleted', 'health:old', 'deleted', '青霉素 失效纪录', '青霉素 失效纪录', now, now, now);
  await db.runAsync(insertClaim, 'v2-suppressed', 'health:sup', 'suppressed', '花生 屏蔽纪录', '花生 屏蔽纪录', now, now, null);
  await db.runAsync(insertClaim, 'v2-superseded', 'health:prev', 'superseded', '草莓 旧纪录', '草莓 旧纪录', now, now, null);

  // 1) Simulate MIGRATION_STATEMENTS_V74 fixing an empty/stale FTS table
  await db.execAsync(schema.MIGRATION_STATEMENTS_V74);
  const v74Rows = await db.getAllAsync('SELECT id, content, assetSnapshotJson FROM ai_memory_fts ORDER BY id ASC');
  assert.deepEqual(
    v74Rows.map((r) => r.id),
    ['v1-active', 'v2-active']
  );
  const v2Meta = JSON.parse(v74Rows[1].assetSnapshotJson);
  assert.equal(v2Meta.predicate, 'fact.health');
  assert.equal(v2Meta.lane, 'confirmed');
  assert.equal(v2Meta.status, 'confirmed');

  // 2) Simulate managed backup rebuild via rebuildAiMemoryFtsIndex
  await db.execAsync('DELETE FROM ai_memory_fts;');
  await dbModule.rebuildAiMemoryFtsIndex(db, { checkIntegrity: true });

  const searchV2 = await db.getAllAsync(
    "SELECT id FROM ai_memory_fts WHERE ai_memory_fts MATCH '芒果'"
  );
  const searchV1 = await db.getAllAsync(
    "SELECT id FROM ai_memory_fts WHERE ai_memory_fts MATCH '乌龙茶'"
  );
  const searchDeleted = await db.getAllAsync(
    "SELECT id FROM ai_memory_fts WHERE ai_memory_fts MATCH '青霉素'"
  );
  assert.deepEqual(searchV2.map((r) => r.id), ['v2-active']);
  assert.deepEqual(searchV1.map((r) => r.id), ['v1-active']);
  assert.deepEqual(searchDeleted, []);

  // 3) Partial legacy backup schema without memory_claims must not throw
  const legacyOnlyDb = wrapSqlite(new DatabaseSync(':memory:'));
  await legacyOnlyDb.execAsync(`
    CREATE TABLE ai_memories (
      id TEXT PRIMARY KEY, space TEXT, scope TEXT, scopeId TEXT, content TEXT,
      normalizedContent TEXT, assetSnapshotJson TEXT, status TEXT, supersededByMemoryId TEXT, updatedAt TEXT
    );
    CREATE VIRTUAL TABLE ai_memory_fts USING fts5(
      id UNINDEXED, space UNINDEXED, scope UNINDEXED, scopeId UNINDEXED,
      content, normalizedContent, assetSnapshotJson, updatedAt UNINDEXED
    );
    INSERT INTO ai_memories VALUES ('m1', 'normal', 'global', NULL, '复古相机', '复古相机', '{}', 'active', NULL, '2026-11-14T10:00:00Z');
  `);
  await dbModule.rebuildAiMemoryFtsIndex(legacyOnlyDb, { checkIntegrity: true });
  const legacyFts = await legacyOnlyDb.getAllAsync('SELECT id FROM ai_memory_fts');
  assert.deepEqual(legacyFts.map((r) => r.id), ['m1']);

  await db.closeAsync();
  await legacyOnlyDb.closeAsync();
});

test('AI P0 #2: pixoryRagBridge queries camelCase columns, avoids cache poisoning, dedupes concurrent backfills, and invalidates cleanly', async () => {
  const sourceText = fs.readFileSync(path.join(root, 'src/ai/rag/pixoryRagBridge.ts'), 'utf8');
  for (const wrongCol of ['updated_at', 'owner_type', 'owner_id', 'parser_status', 'document_id', 'chunk_index']) {
    assert.equal(sourceText.includes(wrongCol), false, `Expected camelCase SQL, found ${wrongCol}`);
  }

  const nativeDb = new DatabaseSync(':memory:');
  nativeDb.exec(`
    CREATE TABLE ai_documents (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      ownerType TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      title TEXT NOT NULL,
      parserStatus TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE ai_chunks (
      id TEXT PRIMARY KEY NOT NULL,
      space TEXT NOT NULL,
      documentId TEXT NOT NULL,
      ownerType TEXT NOT NULL DEFAULT 'thread',
      ownerId TEXT NOT NULL DEFAULT '',
      chunkIndex INTEGER NOT NULL,
      text TEXT NOT NULL,
      normalizedText TEXT NOT NULL DEFAULT '',
      sourceLabel TEXT NOT NULL DEFAULT '',
      locatorJson TEXT NOT NULL DEFAULT '{}',
      tokenEstimate INTEGER
    );
    CREATE TABLE ai_embeddings (
      id TEXT PRIMARY KEY NOT NULL,
      chunkId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vectorJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    INSERT INTO ai_documents (id, space, ownerType, ownerId, title, parserStatus, updatedAt)
    VALUES ('doc-rag-1', 'normal', 'thread', 'thread-rag-1', '星空设定集', 'searchable', '2026-11-14T11:00:00Z');
    INSERT INTO ai_chunks (id, space, documentId, ownerType, ownerId, chunkIndex, text, normalizedText, sourceLabel, locatorJson, tokenEstimate)
    VALUES ('chunk-1', 'normal', 'doc-rag-1', 'thread', 'thread-rag-1', 0, '星港一号反应堆的核心燃料是氦三同位素。', '星港一号反应堆的核心燃料是氦三同位素。', '星空设定集 · 第 1 段', '{"paragraph":1}', 18);
  `);
  const sqliteDb = wrapSqlite(nativeDb);

  let failNextQuery = true;
  let dbCalls = 0;

  const bridge = loadTsModule('src/ai/rag/pixoryRagBridge.ts', {
    '../../database': {
      runWithDatabaseSpace: async (_space, task) => {
        dbCalls += 1;
        if (failNextQuery) {
          throw new Error('transient sqlite busy');
        }
        return task(sqliteDb);
      },
    },
    './pixoryRagEmbedder': {
      resolvePixoryEmbedder: async () => undefined,
    },
  });

  bridge.invalidateRagEngineCache();

  // Attempt 1 throws -> must NOT poison syncedOwnerCache
  const failedCount = await bridge.backfillOwnerDocumentsToRag('normal', 'thread', 'thread-rag-1');
  assert.equal(failedCount, 0);

  // Attempt 2 & 3 concurrent -> deduped via inflightBackfills, succeeds with 1 synced doc
  failNextQuery = false;
  const callsBeforeRetry = dbCalls;
  const [countA, countB] = await Promise.all([
    bridge.backfillOwnerDocumentsToRag('normal', 'thread', 'thread-rag-1'),
    bridge.backfillOwnerDocumentsToRag('normal', 'thread', 'thread-rag-1'),
  ]);
  assert.equal(countA, 1);
  assert.equal(countB, 1);
  // One runWithDatabaseSpace for document/chunk load plus RAG engine SQL calls from single execution
  assert.ok(dbCalls > callsBeforeRetry);

  // Cached hit now returns 0 immediately without hitting DB again
  const callsAfterSync = dbCalls;
  const cachedCount = await bridge.backfillOwnerDocumentsToRag('normal', 'thread', 'thread-rag-1');
  assert.equal(cachedCount, 0);
  assert.equal(dbCalls, callsAfterSync);

  // Verify retrieval finds the backfilled camelCase document
  const retrieved = await bridge.retrieveForThreadWithRag({
    space: 'normal',
    ownerType: 'thread',
    ownerId: 'thread-rag-1',
    query: '反应堆 燃料',
    limit: 3,
  });
  assert.ok(retrieved !== null);
  assert.equal(retrieved.snippets.length, 1);
  assert.equal(retrieved.snippets[0].sourceId, 'doc-rag-1');

  // Add second document and call invalidateOwnerRagCache -> re-backfills cleanly
  await sqliteDb.runAsync(
    `INSERT INTO ai_documents (id, space, ownerType, ownerId, title, parserStatus, updatedAt)
     VALUES ('doc-rag-2', 'normal', 'thread', 'thread-rag-1', '星港二期', 'searchable', '2026-11-14T12:00:00Z')`
  );
  await sqliteDb.runAsync(
    `INSERT INTO ai_chunks (id, space, documentId, ownerType, ownerId, chunkIndex, text, normalizedText, sourceLabel, locatorJson, tokenEstimate)
     VALUES ('chunk-2', 'normal', 'doc-rag-2', 'thread', 'thread-rag-1', 0, '二期码头停泊了三艘科考船。', '二期码头停泊了三艘科考船。', '星港二期 · 第 1 段', '{"paragraph":1}', 14)`
  );
  bridge.invalidateOwnerRagCache('normal', 'thread', 'thread-rag-1');
  const recount = await bridge.backfillOwnerDocumentsToRag('normal', 'thread', 'thread-rag-1');
  assert.equal(recount, 2);

  await sqliteDb.closeAsync();
});

test('AI P0 #3: cross-space move migrates thread/branch/role V2 memory completely, avoids shared-role canonical collision, cleans source, and supports clean rollback', async () => {
  const normalDb = createV2TestDb();
  const personalDb = createV2TestDb();
  const threadRepo = loadTsModule('src/database/repositories/aiThreadRepository.ts').aiThreadRepository;
  const roleRepo = loadTsModule('src/database/repositories/aiRoleCardRepository.ts').aiRoleCardRepository;
  const v2Helper = loadTsModule('src/database/repositories/memoryV2SpaceMoveHelper.ts');

  const tsNow = '2026-11-14T09:00:00.000Z';

  // Seed source normalDb with role_1 shared by thread-1 and thread-2
  await normalDb.runAsync(
    `INSERT INTO ai_role_cards (id, space, name, description, prompt, createdAt, updatedAt)
     VALUES ('role-1', 'normal', '沈墨', '温柔陪伴', '你是沈墨', ?, ?)`,
    tsNow,
    tsNow
  );
  for (const tid of ['thread-1', 'thread-2']) {
    await normalDb.runAsync(
      `INSERT INTO ai_threads (id, space, contextType, title, roleCardId, roleSnapshotJson, boundaryMode, systemPrompt, createdAt, updatedAt)
       VALUES (?, 'normal', 'normal', ?, 'role-1', '{}', 'free', '你是沈墨', ?, ?)`,
      tid,
      `会话 ${tid}`,
      tsNow,
      tsNow
    );
  }
  await normalDb.runAsync(
    `INSERT INTO ai_messages (id, threadId, role, status, content, createdAt, updatedAt)
     VALUES ('msg-t1-1', 'thread-1', 'user', 'completed', '我换到分支2试试，我最近住杭州，还记得我不吃香菜吗', ?, ?)`,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO ai_messages (id, threadId, role, status, content, createdAt, updatedAt)
     VALUES ('msg-t2-1', 'thread-2', 'user', 'completed', '记住我喜欢红茶', ?, ?)`,
    tsNow,
    tsNow
  );

  // V2 claims for thread-1: superseded thread claim + active thread claim + branch claim
  const baseClaimInsert = `INSERT INTO memory_claims (
    id, space, schemaVersion, canonicalClaimId, relatedClaimGroupId, lane, status, kind, actor,
    subjectEntityId, subjectDisplay, scopeType, scopeId, predicate, valueNormalized, valueDisplay,
    polarity, speechMode, validPrecision, confidenceRaw, confidenceCalibrated, confidenceBand,
    importance, stability, manualLocked, safetyState, sourceKind, sourceMessageId, extractorVersion,
    ontologyVersion, projectionVersion, version, createdAt, updatedAt, supersededByClaimId, deletedAt
  ) VALUES (?, 'normal', 1, ?, NULL, ?, ?, 'state', 'user', 'user', '用户', ?, ?, 'preference.food', ?, ?, 'positive', 'asserted', 'exact', 0.9, 0.9, 'high', 85, 'long', 0, 'none', 'message', ?, 'v2', 'ontology-v1', 1, 1, ?, ?, ?, NULL)`;

  await normalDb.runAsync(
    baseClaimInsert,
    'claim-t1-new',
    'food:coriander',
    'confirmed',
    'confirmed',
    'thread',
    'thread-1',
    '不吃 香菜',
    '不吃 香菜',
    'msg-t1-1',
    tsNow,
    tsNow,
    null
  );
  await normalDb.runAsync(
    baseClaimInsert,
    'claim-t1-old',
    'food:coriander_old',
    'archive',
    'superseded',
    'thread',
    'thread-1',
    '少放 香菜',
    '少放 香菜',
    'msg-t1-1',
    tsNow,
    tsNow,
    'claim-t1-new'
  );
  await normalDb.runAsync(
    baseClaimInsert,
    'claim-t1-branch',
    'city:current',
    'confirmed',
    'committed',
    'branch',
    'msg-t1-1:2',
    '最近住 杭州',
    '最近住 杭州',
    'msg-t1-1',
    tsNow,
    tsNow,
    null
  );
  // Shared role V2 claim created from thread-2 (references msg-t2-1 which won't move when only thread-1 moves!)
  await normalDb.runAsync(
    baseClaimInsert,
    'claim-role-tea',
    'pref:tea',
    'confirmed',
    'confirmed',
    'role',
    'role-1',
    '喜欢 红茶',
    '喜欢 红茶',
    'msg-t2-1',
    tsNow,
    tsNow,
    null
  );

  // Events, evidence, feedback, current-turn observations, episodes, profiles, relational states
  await normalDb.runAsync(
    `INSERT INTO memory_evidence (id, space, sourceType, sourceId, messageId, role, quote, quoteHash, createdAt)
     VALUES ('ev-t1', 'normal', 'message', 'msg-t1-1', 'msg-t1-1', 'user', '不吃香菜', 'h1', ?),
            ('ev-role-from-t2', 'normal', 'message', 'msg-t2-1', 'msg-t2-1', 'user', '喜欢红茶', 'h2', ?)`,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_events (id, space, aggregateType, aggregateId, eventType, eventVersion, commandId, idempotencyKey, actorType, source, payloadJson, evidenceIdsJson, createdAt, projectionVersion)
     VALUES ('evt-1', 'normal', 'claim', 'claim-t1-new', 'claim_created', 1, 'cmd-1', 'idem-1', 'system', 'chat', '{}', '["ev-t1"]', ?, 1),
            ('evt-role', 'normal', 'claim', 'claim-role-tea', 'claim_created', 1, 'cmd-2', 'idem-role', 'system', 'chat', '{}', '["ev-role-from-t2"]', ?, 1)`,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_claim_feedback (claimId, space, injectedCount, usedCount, createdAt, updatedAt)
     VALUES ('claim-t1-new', 'normal', 2, 1, ?, ?),
            ('claim-role-tea', 'normal', 4, 3, ?, ?)`,
    tsNow,
    tsNow,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_embeddings (claimId, space, providerId, modelId, dimensions, vectorJson, sourceTextHash, createdAt, updatedAt)
     VALUES ('claim-t1-new', 'normal', 'openai', 'embed-3', 3, '[0.1,0.2,0.3]', 'hash1', ?, ?)`,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_current_turn_observations (id, space, threadId, branchRootMessageId, branchVersionIndex, messageId, intent, explicitUserAction, payloadJson, status, extractorVersion, idempotencyKey, createdAt, expiresAt)
     VALUES ('obs-t1', 'normal', 'thread-1', 'msg-t1-1', 2, 'msg-t1-1', 'correction', 1, '{}', 'consumed', 'v2', 'obs-idem-1', ?, '2026-12-01T00:00:00.000Z')`,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_episodes (id, space, scopeType, scopeId, lane, status, title, summaryText, startMessageId, endMessageId, confidenceBand, importance, projectionVersion, createdAt, updatedAt)
     VALUES ('ep-t1', 'normal', 'thread', 'thread-1', 'working', 'active', '饮食沟通', '确定忌口', 'msg-t1-1', 'msg-t1-1', 'high', 70, 1, ?, ?),
            ('ep-role-1', 'normal', 'role', 'role-1', 'confirmed', 'active', '初始约定', '喜欢红茶', 'msg-t2-1', 'msg-t2-1', 'high', 80, 1, ?, ?)`,
    tsNow,
    tsNow,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_relational_states (id, space, scopeType, scopeId, subjectEntityId, metric, value, signalWeight, decayHalfLifeDays, evidenceIdsJson, projectionVersion, version, createdAt, updatedAt)
     VALUES ('rel-t1', 'normal', 'thread', 'thread-1', 'user', 'trust', 0.6, 1.0, 30, '["ev-t1"]', 1, 1, ?, ?),
            ('rel-role-1', 'normal', 'role', 'role-1', 'user', 'affinity', 0.8, 1.5, 45, '["ev-role-from-t2"]', 1, 1, ?, ?)`,
    tsNow,
    tsNow,
    tsNow,
    tsNow
  );
  await normalDb.runAsync(
    `INSERT INTO memory_profiles (id, space, scopeType, scopeId, profileJson, profileText, version, projectionVersion, createdAt, updatedAt)
     VALUES ('prof-t1', 'normal', 'thread', 'thread-1', '{}', '偏好清淡', 1, 1, ?, ?),
            ('prof-role-1', 'normal', 'role', 'role-1', '{}', '熟络陪伴', 1, 1, ?, ?)`,
    tsNow,
    tsNow,
    tsNow,
    tsNow
  );

  // --- MOVE 1: Move thread-1 from normal -> personal (while thread-2 remains in normal sharing role-1) ---
  const snapshotT1 = await threadRepo.exportThread(normalDb, 'thread-1');
  assert.equal(snapshotT1.v2Claims.length, 3);
  assert.equal(snapshotT1.v2CurrentTurnObservations.length, 1);
  assert.equal(snapshotT1.v2Episodes.length, 1);
  assert.equal(snapshotT1.v2RelationalStates.length, 1);
  assert.equal(snapshotT1.v2Profiles.length, 1);

  const roleV2Move1 = await threadRepo.listRoleV2MemoryForSpaceMove(normalDb, 'normal', ['role-1']);
  const roleCard1 = await roleRepo.findAnyById(normalDb, 'role-1');
  const roleIdMap = new Map([['role-1', 'role-1']]);
  const plan1 = await v2Helper.planRoleV2SpaceMove(personalDb, {
    targetSpace: 'personal',
    roleIdMap,
    roleV2Memory: roleV2Move1,
  });
  const movedMsgSet1 = new Set(snapshotT1.messages.map((m) => m.id));
  const targetBundle1 = v2Helper.buildTargetRoleV2MemoryBundle({
    movedMessageIds: movedMsgSet1,
    plan: plan1,
    roleIdMap,
    source: roleV2Move1,
    targetSpace: 'personal',
  });

  await roleRepo.importRoleCardForSpaceMove(personalDb, roleCard1, 'personal', 'role-1', null);
  await threadRepo.importThread(personalDb, snapshotT1, 'personal');
  await threadRepo.importRoleV2MemoryForSpaceMove(personalDb, 'personal', targetBundle1, movedMsgSet1);

  // Verify personalDb has all V2 thread, branch, and role claims + projections + FTS + restored self-FK
  const personalClaims = await personalDb.getAllAsync('SELECT id, space, scopeType, sourceMessageId, supersededByClaimId FROM memory_claims ORDER BY id ASC');
  assert.equal(personalClaims.length, 4);
  const movedOldClaim = personalClaims.find((c) => c.id === 'claim-t1-old');
  assert.equal(movedOldClaim.supersededByClaimId, 'claim-t1-new');
  const movedRoleClaim = personalClaims.find((c) => c.id === 'claim-role-tea');
  assert.equal(movedRoleClaim.sourceMessageId, null, 'Unmoved message ref cleared safely instead of FK failure');

  const personalFts = await personalDb.getAllAsync("SELECT id FROM ai_memory_fts WHERE ai_memory_fts MATCH '红茶 OR 香菜 OR 杭州' ORDER BY id ASC");
  assert.deepEqual(personalFts.map((r) => r.id), ['claim-role-tea', 'claim-t1-branch', 'claim-t1-new']);
  const personalBoard = await personalDb.getAllAsync('SELECT claimId, space FROM memory_board_projection ORDER BY claimId ASC');
  assert.equal(personalBoard.length, 4);
  assert.ok(personalBoard.every((b) => b.space === 'personal'));

  // Clean up thread-1 in source normalDb; keep role-1 because thread-2 still uses it
  await threadRepo.deleteThreads(normalDb, ['thread-1']);
  const deletedAfterMove1 = await roleRepo.deleteUnreferencedRoleCardsAfterThreadMove(normalDb, 'normal', ['role-1']);
  assert.equal(deletedAfterMove1.length, 0);

  // Source normalDb still keeps claim-role-tea and thread-2 intact, zero residue from thread-1!
  assert.equal((await normalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_claims WHERE id IN ('claim-t1-new', 'claim-t1-old', 'claim-t1-branch')")).count, 0);
  assert.equal((await normalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_current_turn_observations WHERE threadId = 'thread-1'")).count, 0);
  assert.equal((await normalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_claims WHERE id = 'claim-role-tea'")).count, 1);
  assert.equal((await normalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_evidence WHERE id = 'ev-t1'")).count, 0);

  // --- MOVE 2: Now source normalDb supersedes claim-role-tea with claim-role-tea-v2 AND adds a brand-new active role claim before moving thread-2 ---
  await normalDb.runAsync(
    `UPDATE memory_claims SET status = 'superseded', lane = 'archive', supersededByClaimId = NULL WHERE id = 'claim-role-tea'`
  );
  await normalDb.runAsync(
    baseClaimInsert,
    'claim-role-tea-v2',
    'pref:tea',
    'confirmed',
    'confirmed',
    'role',
    'role-1',
    '喜欢 乌龙茶',
    '喜欢 乌龙茶',
    'msg-t2-1',
    tsNow,
    tsNow,
    null
  );
  await normalDb.runAsync(
    `UPDATE memory_claims SET supersededByClaimId = 'claim-role-tea-v2' WHERE id = 'claim-role-tea'`
  );
  await normalDb.runAsync(
    baseClaimInsert,
    'claim-role-coffee',
    'pref:coffee',
    'confirmed',
    'confirmed',
    'role',
    'role-1',
    '不加糖 黑咖啡',
    '不加糖 黑咖啡',
    'msg-t2-1',
    tsNow,
    tsNow,
    null
  );

  const snapshotT2 = await threadRepo.exportThread(normalDb, 'thread-2');
  const roleV2Move2 = await threadRepo.listRoleV2MemoryForSpaceMove(normalDb, 'normal', ['role-1']);
  const plan2 = await v2Helper.planRoleV2SpaceMove(personalDb, {
    targetSpace: 'personal',
    roleIdMap,
    roleV2Memory: roleV2Move2,
  });
  // pref:tea canonical key must be skipped so uq_memory_claims_active_canonical never throws, while pref:coffee is imported!
  assert.equal(plan2.skippedClaimIds.has('claim-role-tea-v2'), true);
  assert.equal(plan2.skippedClaimIds.has('claim-role-coffee'), false);

  const movedMsgSet2 = new Set(snapshotT2.messages.map((m) => m.id));
  const targetBundle2 = v2Helper.buildTargetRoleV2MemoryBundle({
    movedMessageIds: movedMsgSet2,
    plan: plan2,
    roleIdMap,
    source: roleV2Move2,
    targetSpace: 'personal',
  });
  await threadRepo.importThread(personalDb, snapshotT2, 'personal');
  await threadRepo.importRoleV2MemoryForSpaceMove(personalDb, 'personal', targetBundle2, movedMsgSet2);

  // Simulate rollback of Move 2: must remove thread-2 and claim-role-coffee WITHOUT disturbing Move 1's claim-role-tea!
  await threadRepo.deleteThreads(personalDb, ['thread-2']);
  await threadRepo.deleteRoleV2MemoryForSpaceMove(
    personalDb,
    'personal',
    targetBundle2.claims.map((c) => c.id),
    {
      episodeIds: targetBundle2.episodes.map((e) => e.id),
      profileIds: targetBundle2.profiles.map((p) => p.id),
      relationalStateIds: targetBundle2.relationalStates.map((r) => r.id),
    }
  );
  assert.equal((await personalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_claims WHERE id = 'claim-role-coffee'")).count, 0);
  assert.equal((await personalDb.getFirstAsync("SELECT COUNT(*) AS count FROM memory_claims WHERE id = 'claim-role-tea'")).count, 1);

  // Finalize source cleanup for thread-2 + unreferenced role-1
  await threadRepo.deleteThreads(normalDb, ['thread-2']);
  const deletedFinalRoles = await roleRepo.deleteUnreferencedRoleCardsAfterThreadMove(normalDb, 'normal', ['role-1']);
  assert.equal(deletedFinalRoles.length, 1);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_claims')).count, 0);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_events')).count, 0);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_evidence')).count, 0);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_episodes')).count, 0);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_relational_states')).count, 0);
  assert.equal((await normalDb.getFirstAsync('SELECT COUNT(*) AS count FROM memory_profiles')).count, 0);

  await normalDb.closeAsync();
  await personalDb.closeAsync();
});
