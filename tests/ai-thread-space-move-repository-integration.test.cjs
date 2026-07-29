const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');

function loadRepository() {
  const filename = path.join(root, 'src/database/repositories/aiThreadRepository.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiThreadRepository;
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function loadRoleCardRepository() {
  const filename = path.join(root, 'src/database/repositories/aiRoleCardRepository.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename).aiRoleCardRepository;
  } finally {
    if (originalExtension) {
      require.extensions['.ts'] = originalExtension;
    } else {
      delete require.extensions['.ts'];
    }
  }
}

function loadSchemaModule() {
  const filename = path.join(root, 'src/database/schema.ts');
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, sourcePath) {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try { delete require.cache[require.resolve(filename)]; return require(filename); }
  finally {
    if (originalExtension) require.extensions['.ts'] = originalExtension;
    else delete require.extensions['.ts'];
  }
}

class AsyncDatabase {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }

  exec(sql) {
    this.db.exec(sql);
  }

  async runAsync(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  async getFirstAsync(sql, ...params) {
    return this.db.prepare(sql).get(...params) ?? null;
  }

  async getAllAsync(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  close() {
    this.db.close();
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE ai_role_cards (
      id TEXT PRIMARY KEY, space TEXT, name TEXT, description TEXT, prompt TEXT,
      firstMessage TEXT, alternateGreetingsJson TEXT, sourceType TEXT, sourceJson TEXT,
      defaultLanguage TEXT, defaultModelId TEXT, boundaryMode TEXT, avatarEnabled INTEGER,
      avatarUri TEXT, tagsJson TEXT, createdAt TEXT, updatedAt TEXT, archivedAt TEXT
    );
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY, space TEXT, contextType TEXT, boundIpId INTEGER,
      boundKnowledgeBaseId TEXT, includeIpDocuments INTEGER, title TEXT, titleStatus TEXT,
      modelTitleGeneratedAt TEXT, providerId TEXT, modelId TEXT, sessionBaseUrl TEXT,
      sessionApiKeyRef TEXT, modelSnapshotJson TEXT, roleCardId TEXT, roleSnapshotJson TEXT,
      roleInstructionWeight TEXT, replyPreference TEXT, contextHistoryRoundLimit INTEGER DEFAULT 30, thinkingDisabled INTEGER,
      systemPrompt TEXT, materialRulesSnapshot TEXT, boundaryMode TEXT, summary TEXT,
      lastMessagePreview TEXT, currentBranchRootMessageId TEXT, currentBranchVersionIndex INTEGER,
      createdAt TEXT, updatedAt TEXT, archivedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT, branchRootMessageId TEXT, branchVersionIndex INTEGER,
      role TEXT, status TEXT, content TEXT, reasoningText TEXT, errorMessage TEXT,
      providerId TEXT, modelId TEXT, modelSnapshotJson TEXT, promptSnapshotJson TEXT,
      continuityImportSessionId TEXT, continuitySyntheticKind TEXT, createdAt TEXT,
      updatedAt TEXT, completedAt TEXT
    );
    CREATE TABLE ai_message_citations (
      id TEXT PRIMARY KEY, messageId TEXT, sourceType TEXT, sourceId TEXT, label TEXT,
      locatorJson TEXT, refId TEXT, claimStart INTEGER, claimEnd INTEGER,
      sourceExcerptHash TEXT, documentVersion TEXT, validationStatus TEXT DEFAULT 'valid',
      validationReason TEXT, usedAt TEXT, createdAt TEXT
    );
    CREATE TABLE ai_message_attachments (
      id TEXT PRIMARY KEY, messageId TEXT, threadId TEXT, kind TEXT, name TEXT,
      localUri TEXT, documentId TEXT, mimeType TEXT, fileSize INTEGER, createdAt TEXT
    );
    CREATE TABLE ai_message_versions (
      id TEXT PRIMARY KEY, originalMessageId TEXT, threadId TEXT, versionIndex INTEGER,
      role TEXT, status TEXT, content TEXT, reasoningText TEXT, errorMessage TEXT,
      providerId TEXT, modelId TEXT, modelSnapshotJson TEXT, promptSnapshotJson TEXT,
      citationsJson TEXT, messageCreatedAt TEXT, messageUpdatedAt TEXT,
      messageCompletedAt TEXT, createdAt TEXT
    );
    CREATE TABLE ai_message_favorites (
      id TEXT PRIMARY KEY, space TEXT, threadId TEXT, messageId TEXT, favoriteKey TEXT,
      branchRootMessageId TEXT, branchVersionIndex INTEGER, branchScopesJson TEXT,
      messageVersionIndex INTEGER, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_thread_memory_settings (
      threadId TEXT PRIMARY KEY, deepMemoryEnabled INTEGER, updatedAt TEXT
    );
    CREATE TABLE ai_thread_summaries (
      threadId TEXT PRIMARY KEY, summary TEXT, decisions TEXT, openQuestions TEXT,
      lastMessageId TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_memories (
      id TEXT PRIMARY KEY, space TEXT, scope TEXT, scopeId TEXT, type TEXT, content TEXT,
      normalizedContent TEXT, sourceMessageId TEXT, confidence REAL, importance INTEGER,
      status TEXT, lastUsedAt TEXT, ipId INTEGER, groupId INTEGER, imageAssetId INTEGER,
      assetSnapshotJson TEXT, sourceKind TEXT, supersededByMemoryId TEXT, mergeReason TEXT,
      mergedAt TEXT, lastReconciledAt TEXT, reconcileSourceMessageId TEXT,
      createdAt TEXT, updatedAt TEXT, deletedAt TEXT
    );
    CREATE TABLE ai_thread_memory_jobs (
      threadId TEXT PRIMARY KEY, pendingTurnCount INTEGER, lastConsolidatedMessageId TEXT,
      lastCaptureNoticeJson TEXT, lastCompressedMessageId TEXT, uncompressedRoundCount INTEGER,
      completedMessageCountAtProfileUpdate INTEGER, lastProfileUpdatedAt TEXT,
      profileUpdateCooldownUntil TEXT, lastMaintenanceError TEXT,
      lastMaintenanceModelProviderId TEXT, lastMaintenanceModelId TEXT,
      lastMaintenanceCompletedAt TEXT, lastMaintenanceUsedFallback INTEGER, updatedAt TEXT
    );
    CREATE TABLE ai_thread_summary_segments (
      id TEXT PRIMARY KEY, threadId TEXT, space TEXT, kind TEXT, summaryText TEXT,
      startMessageId TEXT, endMessageId TEXT, startAt TEXT, endAt TEXT, roundCount INTEGER,
      sourceSegmentIdsJson TEXT, continuityImportSessionId TEXT,
      sourceMessageIdsJson TEXT NOT NULL DEFAULT '[]', branchRouteHash TEXT NOT NULL DEFAULT '',
      lineageVersion INTEGER NOT NULL DEFAULT 0, sourceMessageVersionHash TEXT NOT NULL DEFAULT '',
      quality TEXT NOT NULL DEFAULT 'legacy', status TEXT NOT NULL DEFAULT 'stale',
      createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_continuity_import_sessions (
      id TEXT PRIMARY KEY, threadId TEXT, space TEXT, sourceKind TEXT, sourcePlatform TEXT,
      formatVersion TEXT, status TEXT, rollbackState TEXT, rollbackRoundsRemaining INTEGER,
      reviewGateState TEXT, preImportBranchRootMessageId TEXT, preImportBranchVersionIndex INTEGER,
      importedBranchRootMessageId TEXT, importedBranchVersionIndex INTEGER,
      importAnchorMessageId TEXT, importAnchorMessageRole TEXT, importBranchRootKind TEXT,
      rawDocumentText TEXT, rawDocumentHash TEXT, parsedMessageCount INTEGER,
      containsCompressedContinuity INTEGER, memoryReviewStatus TEXT, memoryReviewError TEXT,
      createdAt TEXT, updatedAt TEXT, rolledBackAt TEXT, stabilizedAt TEXT
    );
    CREATE TABLE ai_continuity_import_blocks (
      id TEXT PRIMARY KEY, importSessionId TEXT, kind TEXT, title TEXT, content TEXT, createdAt TEXT
    );
    CREATE TABLE ai_branch_route_metadata (
      id TEXT PRIMARY KEY, threadId TEXT, branchRootMessageId TEXT, branchVersionIndex INTEGER,
      name TEXT, status TEXT, note TEXT, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_user_profiles (
      id TEXT PRIMARY KEY, space TEXT, boundIpId INTEGER, boundThreadId TEXT, profileJson TEXT,
      profileText TEXT, version INTEGER, sourceThreadId TEXT, sourceStartMessageId TEXT,
      sourceEndMessageId TEXT, messageCountAtUpdate INTEGER, lastUpdatedAt TEXT,
      createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_documents (id TEXT PRIMARY KEY, localUri TEXT);
    CREATE TABLE ai_message_fts (id TEXT, threadId TEXT, role TEXT, content TEXT, updatedAt TEXT);
    CREATE TABLE ai_message_version_fts (
      id TEXT, originalMessageId TEXT, threadId TEXT, role TEXT, content TEXT, updatedAt TEXT
    );
    CREATE TABLE ai_memory_fts (
      id TEXT, space TEXT, scope TEXT, scopeId TEXT, content TEXT,
      normalizedContent TEXT, assetSnapshotJson TEXT, updatedAt TEXT
    );
  `);
  const schema = loadSchemaModule();
  db.exec(schema.MIGRATION_STATEMENTS_V52);
  db.exec(schema.MIGRATION_STATEMENTS_V53);
}

function makeSnapshot(space) {
  const now = '2026-07-23T10:00:00.000Z';
  return {
    thread: {
      id: 'thread-1', space, contextType: 'normal', boundIpId: null, boundKnowledgeBaseId: null,
      includeIpDocuments: 0, title: '聊天', titleStatus: 'custom', modelTitleGeneratedAt: now,
      providerId: 'provider-1', modelId: 'model-1', sessionBaseUrl: null, sessionApiKeyRef: null,
      modelSnapshotJson: '{}', roleCardId: 'role-1', roleSnapshotJson: '{"id":"role-1"}',
      roleInstructionWeight: 'default', replyPreference: 'auto', contextHistoryRoundLimit: 30, thinkingDisabled: 0,
      systemPrompt: '', materialRulesSnapshot: null, boundaryMode: 'free', summary: '摘要',
      lastMessagePreview: '你好', currentBranchRootMessageId: null, currentBranchVersionIndex: null,
      createdAt: now, updatedAt: now, archivedAt: null,
    },
    messages: [{
      id: 'message-1', threadId: 'thread-1', branchRootMessageId: null, branchVersionIndex: null,
      role: 'assistant', status: 'completed', content: '你好', reasoningText: '思考',
      errorMessage: null, providerId: 'provider-1', modelId: 'model-1',
      modelSnapshotJson: '{}', promptSnapshotJson: '{}', continuityImportSessionId: null,
      continuitySyntheticKind: null, createdAt: now, updatedAt: now, completedAt: now,
    }],
    attachments: [{
      id: 'attachment-1', messageId: 'message-1', threadId: 'thread-1', kind: 'image',
      name: 'image.jpg', localUri: 'file:///attachment.jpg', documentId: null,
      mimeType: 'image/jpeg', fileSize: 12, createdAt: now,
    }],
    citations: [],
    versions: [{
      id: 'version-1', originalMessageId: 'message-1', threadId: 'thread-1', versionIndex: 1,
      role: 'assistant', status: 'completed', content: '旧回答', reasoningText: null,
      errorMessage: null, providerId: 'provider-1', modelId: 'model-1',
      modelSnapshotJson: '{}', promptSnapshotJson: '{}', citationsJson: '[]',
      messageCreatedAt: now, messageUpdatedAt: now, messageCompletedAt: now, createdAt: now,
    }],
    favorites: [{
      id: 'favorite-1', space, threadId: 'thread-1', messageId: 'message-1',
      favoriteKey: `${space}|message-1|[]|current`, branchRootMessageId: null,
      branchVersionIndex: null, branchScopesJson: '[]', messageVersionIndex: null,
      createdAt: now, updatedAt: now,
    }],
    memorySettings: { threadId: 'thread-1', deepMemoryEnabled: false, updatedAt: now },
    summary: {
      threadId: 'thread-1', summary: '完整摘要', decisions: '决定', openQuestions: '问题',
      lastMessageId: 'message-1', updatedAt: now,
    },
    threadMemories: [{
      id: 'memory-1', space, scope: 'thread', scopeId: 'thread-1', type: 'fact',
      content: '事实', normalizedContent: '事实', sourceMessageId: 'message-1',
      confidence: 0.9, importance: 3, status: 'active', lastUsedAt: null,
      ipId: 12, groupId: 34, imageAssetId: 56, assetSnapshotJson: '{"label":"原素材"}',
      sourceKind: 'auto', supersededByMemoryId: null, mergeReason: null, mergedAt: null,
      lastReconciledAt: null, reconcileSourceMessageId: null, createdAt: now,
      updatedAt: now, deletedAt: null,
    }],
    memoryJob: {
      threadId: 'thread-1', pendingTurnCount: 2, lastConsolidatedMessageId: 'message-1',
      lastCaptureNoticeJson: '[]', lastCompressedMessageId: 'message-1',
      uncompressedRoundCount: 1, completedMessageCountAtProfileUpdate: 1,
      lastProfileUpdatedAt: now, profileUpdateCooldownUntil: null, lastMaintenanceError: null,
      lastMaintenanceModelProviderId: 'provider-1', lastMaintenanceModelId: 'model-1',
      lastMaintenanceCompletedAt: now, lastMaintenanceUsedFallback: 0, updatedAt: now,
    },
    summarySegments: [{
      id: 'segment-1', threadId: 'thread-1', space, kind: 'compressed',
      summaryText: '压缩摘要', startMessageId: 'message-1', endMessageId: 'message-1',
      startAt: now, endAt: now, roundCount: 1, sourceSegmentIdsJson: '[]',
      sourceMessageIdsJson: '["message-1"]', branchRouteHash: 'route-main',
      lineageVersion: 0, sourceMessageVersionHash: 'version-hash', quality: 'model', status: 'active',
      continuityImportSessionId: null, createdAt: now, updatedAt: now,
    }],
    branchRouteMetadata: [],
    continuityImportSessions: [],
    continuityImportBlocks: [],
    userProfile: null,
    companionEvents: [{
      id: 'event-1', space, subjectType: 'thread', subjectId: 'thread-1', roleCardId: null,
      threadId: 'thread-1', branchRootMessageId: null, branchVersionIndex: null,
      branchRouteHash: 'route-main', lineageVersion: 0, sourceMessageId: 'message-1',
      sourceMessageVersionHash: 'hash-1', category: 'interaction', subtype: 'gratitude',
      speechMode: 'asserted', confidence: 0.8, intensity: 0.5, sincerity: 1,
      payloadJson: '{}', evidenceSpanJson: '{}', extractorVersion: 'companion-observer-v1',
      provenanceJson: '[]', idempotencyKey: 'event-idem-1', status: 'active', eventSequence: 1, createdAt: now,
    }],
    companionTemporalAnchors: [{
      id: 'anchor-1', space, roleCardId: null, threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sourceEventId: 'event-1', sourceMessageId: 'message-1', rawText: '明天',
      startAtUtc: now, endAtUtc: now, parseTimeZone: 'Asia/Shanghai', localDateKey: '2026-07-24',
      precision: 'day', anchorType: 'point', recurrenceRule: null, status: 'active', confidence: 0.9,
      parserVersion: 'companion-temporal-v1', idempotencyKey: 'anchor-idem-1', createdAt: now, updatedAt: now,
    }],
    companionOpenLoops: [{
      id: 'loop-1', space, roleCardId: null, threadId: 'thread-1', branchRouteHash: 'route-main',
      lineageVersion: 0, sourceEventId: 'event-1', sourceMessageId: 'message-1', temporalAnchorId: 'anchor-1',
      kind: 'deadline', topicText: '明天的结果', status: 'open', priority: 70, earliestMentionAt: now,
      expiresAt: null, mentionCount: 0, lastMentionedAt: null, lastMentionedRound: null,
      recurrenceRule: null, resolutionEvidenceMessageId: null, idempotencyKey: 'loop-idem-1', createdAt: now, updatedAt: now,
    }],
    companionRuntimeJobs: [{
      id: 'job-1', space, threadId: 'thread-1', branchRouteHash: 'route-main', lineageVersion: 0,
      sourceMessageId: 'message-1', jobType: 'event_enrichment', status: 'running', payloadJson: '{}',
      idempotencyKey: 'job-idem-1', attemptCount: 1, nextRunAt: now, leaseOwner: 'old-worker', leaseUntil: now,
      lastErrorCode: null, createdAt: now, updatedAt: now, completedAt: null,
    }],
    companionContextTraces: [{
      id: 'trace-1', space, threadId: 'thread-1', sourceMessageId: 'message-1', branchRouteHash: 'route-main',
      lineageVersion: 0, policyVersion: 'companion-event-policy-v1', eventCount: 1,
      diagnosticCandidateCount: 0, optionalCandidateCount: 1, selectedTopicType: 'open_loop',
      observerDurationMs: 1, compilerDurationMs: 1, reasonCodesJson: '[]', createdAt: now,
    }],
    companionProjectionSnapshots: [{
      id: 'projection-1', space, scopeType: 'thread', roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, basedOnEventSequence: 1,
      affection: 0.2, security: 0.1, arousal: 0.3, agency: 0.4,
      relationshipJson: '{}', stanceJson: '{}', policyVersion: 'projection-v1',
      status: 'active', createdAt: now, updatedAt: now,
    }],
    companionAffectiveObservations: [{
      id: 'affect-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sourceEventId: 'event-1',
      sourceMessageId: 'message-1', sourceMessageVersionHash: 'hash-1', label: 'warmth',
      confidence: 0.8, expiresAt: now, expiresAfterRound: 8, status: 'active',
      createdAt: now, updatedAt: now,
    }],
    companionRepairs: [{
      id: 'repair-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sourceEventId: 'event-1',
      sourceMessageId: 'message-1', sourceMessageVersionHash: 'hash-1', category: 'correction',
      subtype: 'style', constraintText: '不要复述', forbiddenTermsJson: '[]', state: 'constrained',
      passedRelevantTurns: 0, violationCount: 0, semanticReviewRequired: 0,
      lastCheckedAssistantMessageId: null, resolutionEvidenceMessageId: null,
      policyVersion: 'repair-v1', createdAt: now, updatedAt: now,
    }],
    companionDreamScenes: [{
      id: 'dream-scene-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, semanticState: 'closed',
      participantsJson: '[]', evidenceMessageIdsJson: '["message-1"]', sourceSnapshotHash: 'dream-hash',
      status: 'closed', openedAt: now, closedAt: now, updatedAt: now,
    }],
    companionDreamSeeds: [{
      id: 'dream-seed-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sceneId: 'dream-scene-1',
      sourceMessageIdsJson: '["message-1"]', sourceMessageVersionHashesJson: '["hash-1"]',
      sourceSnapshotHash: 'dream-hash', roll: 0.1, classificationJson: null,
      classifiedProbability: null, decision: 'classifying', manual: 0,
      policyVersion: 'dream-v1', idempotencyKey: 'dream-seed-idem-1', createdAt: now, updatedAt: now,
    }],
    companionDreamJobs: [{
      id: 'dream-job-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sceneId: 'dream-scene-1', seedId: 'dream-seed-1',
      phase: 'classifying', status: 'running', sourceSnapshotHash: 'dream-hash',
      sourceMessageIdsJson: '["message-1"]', attemptCount: 1, maxAttempts: 3,
      cancelRequested: 0, quotaReserved: 1, nextRunAt: now, leaseOwner: 'old-worker',
      leaseUntil: now, lastErrorCode: null, idempotencyKey: 'dream-job-idem-1',
      createdAt: now, updatedAt: now, completedAt: null,
    }],
    companionDreams: [],
    companionRoleRoundReceipts: [{
      id: 'round-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', userMessageId: 'message-1', assistantMessageId: 'message-1',
      userMessageVersionHash: 'hash-1', assistantMessageVersionHash: 'hash-1', roundNumber: 1,
      idempotencyKey: 'round-idem-1', createdAt: now,
    }],
    companionThoughtEvents: [{
      id: 'thought-event-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sessionKey: 'session-1', eventType: 'praise',
      priority: 70, userMessageId: 'message-1', assistantMessageId: 'message-1',
      userMessageVersionHash: 'hash-1', assistantMessageVersionHash: 'hash-1',
      sourceSnapshotHash: 'thought-hash', evidenceJson: '{}', status: 'batched',
      idempotencyKey: 'thought-event-idem-1', createdAt: now, updatedAt: now,
    }],
    companionThoughtJobs: [{
      id: 'thought-job-1', space, roleCardId: 'role-1', threadId: 'thread-1',
      branchRouteHash: 'route-main', lineageVersion: 0, sessionKey: 'session-1',
      eventIdsJson: '["thought-event-1"]', sourceSnapshotHash: 'thought-hash', roleSnapshotJson: '{}',
      scheduledFor: now, status: 'running', attemptCount: 1, maxAttempts: 3,
      quotaReservedCount: 1, nextRunAt: now, leaseOwner: 'old-worker', leaseUntil: now,
      lastErrorCode: null, idempotencyKey: 'thought-job-idem-1', createdAt: now,
      updatedAt: now, completedAt: null,
    }],
    companionThoughts: [{
      id: 'thought-1', space, roleCardId: 'role-1', sourceThreadId: 'thread-1',
      sourceBranchRouteHash: 'route-main', lineageVersion: 0, jobId: 'thought-job-1',
      eventIdsJson: '["thought-event-1"]', sourceMessageIdsJson: '["message-1"]',
      sourceSnapshotHash: 'thought-hash', priority: 70, body: '被夸奖以后，心里还暖着。',
      status: 'active', deliveryStatus: 'reserved', reservationId: 'reservation-1',
      reservationMessageId: 'message-1', reservedAt: now, deliveredAt: null,
      deliveredMessageId: null, deletedAt: null, idempotencyKey: 'thought-idem-1',
      createdAt: now, updatedAt: now,
    }],
  };
}

test('repository round-trip preserves thread-owned records and rebuilds searchable rows', async () => {
  const repository = loadRepository();
  const source = new AsyncDatabase();
  const target = new AsyncDatabase();
  createSchema(source);
  createSchema(target);

  try {
    await repository.importThread(source, makeSnapshot('normal'), 'normal');
    const exported = await repository.exportThread(source, 'thread-1');
    assert.ok(exported);
    assert.equal(exported.attachments.length, 1);
    assert.equal(exported.favorites.length, 1);
    assert.equal(exported.threadMemories.length, 1);
    assert.equal(exported.summarySegments.length, 1);
    assert.equal(exported.companionEvents.length, 1);
    assert.equal(exported.companionOpenLoops.length, 1);
    assert.equal(exported.companionProjectionSnapshots.length, 1);
    assert.equal(exported.companionDreamJobs.length, 1);
    assert.equal(exported.companionThoughts.length, 1);

    await repository.importThread(target, exported, 'personal');
    assert.equal((await target.getFirstAsync('SELECT space FROM ai_threads WHERE id = ?', 'thread-1')).space, 'personal');
    assert.equal((await target.getFirstAsync('SELECT favoriteKey FROM ai_message_favorites')).favoriteKey, 'personal|message-1|[]|current');
    assert.equal((await target.getFirstAsync('SELECT space FROM ai_memories')).space, 'personal');
    assert.equal((await target.getFirstAsync('SELECT ipId FROM ai_memories')).ipId, null);
    assert.equal((await target.getFirstAsync('SELECT groupId FROM ai_memories')).groupId, null);
    assert.equal((await target.getFirstAsync('SELECT imageAssetId FROM ai_memories')).imageAssetId, null);
    assert.equal((await target.getFirstAsync('SELECT deepMemoryEnabled FROM ai_thread_memory_settings')).deepMemoryEnabled, 0);
    assert.equal((await target.getFirstAsync('SELECT COUNT(*) AS count FROM ai_message_fts')).count, 1);
    assert.equal((await target.getFirstAsync('SELECT COUNT(*) AS count FROM ai_message_version_fts')).count, 1);
    assert.equal((await target.getFirstAsync('SELECT COUNT(*) AS count FROM ai_memory_fts')).count, 1);
    assert.equal((await target.getFirstAsync('SELECT space FROM companion_events')).space, 'personal');
    assert.equal((await target.getFirstAsync('SELECT space FROM companion_open_loops')).space, 'personal');
    const movedJob = await target.getFirstAsync('SELECT space, status, leaseOwner FROM companion_runtime_jobs');
    assert.equal(movedJob.space, 'personal');
    assert.equal(movedJob.status, 'retry');
    assert.equal(movedJob.leaseOwner, null);
    const movedDreamJob = await target.getFirstAsync('SELECT space, status, leaseOwner, quotaReserved FROM companion_dream_jobs');
    assert.deepEqual({ ...movedDreamJob }, { space: 'personal', status: 'retry', leaseOwner: null, quotaReserved: 0 });
    const movedThoughtJob = await target.getFirstAsync('SELECT space, status, leaseOwner, quotaReservedCount FROM companion_thought_jobs');
    assert.deepEqual({ ...movedThoughtJob }, { space: 'personal', status: 'retry', leaseOwner: null, quotaReservedCount: 0 });
    const movedThought = await target.getFirstAsync('SELECT space, deliveryStatus, reservationId, reservationMessageId FROM companion_thoughts');
    assert.deepEqual({ ...movedThought }, { space: 'personal', deliveryStatus: 'pending', reservationId: null, reservationMessageId: null });
    assert.equal((await target.getFirstAsync('SELECT space FROM companion_repairs')).space, 'personal');
    assert.equal((await target.getFirstAsync('SELECT space FROM companion_role_round_receipts')).space, 'personal');

    await target.runAsync(
      'INSERT INTO ai_documents (id, localUri) VALUES (?, ?)',
      'document-1',
      'file:///personal/thread-1/document.txt'
    );
    await repository.restoreMessageAttachmentDocumentLinks(target, [{
      ...exported.attachments[0],
      documentId: 'document-1',
      localUri: 'file:///normal/thread-1/document.txt',
    }]);
    const restoredAttachment = await target.getFirstAsync(
      'SELECT documentId, localUri FROM ai_message_attachments WHERE id = ?',
      'attachment-1'
    );
    assert.equal(restoredAttachment.documentId, 'document-1');
    assert.equal(restoredAttachment.localUri, 'file:///personal/thread-1/document.txt');

    await repository.deleteThreads(source, ['thread-1']);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_message_fts')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_message_version_fts')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_memory_fts')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_memories')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM companion_dream_jobs')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM companion_thoughts')).count, 0);
  } finally {
    source.close();
    target.close();
  }
});

test('role-card space move preserves configuration and role memory while source cleanup respects references', async () => {
  const threadRepository = loadRepository();
  const roleRepository = loadRoleCardRepository();
  const source = new AsyncDatabase();
  const target = new AsyncDatabase();
  createSchema(source);
  createSchema(target);
  const now = '2026-07-23T10:00:00.000Z';
  const roleCard = {
    id: 'role-1',
    space: 'normal',
    name: '阿岚',
    description: '长期陪伴角色',
    prompt: '保持克制、温柔且诚实。',
    firstMessage: '今天想聊什么？',
    alternateGreetings: ['我在。', '慢慢说。'],
    sourceType: 'pixory_manual',
    sourceJson: '{"character":"阿岚"}',
    defaultLanguage: 'zh-CN',
    defaultModelId: 'model-1',
    boundaryMode: 'prefer_material',
    avatarEnabled: true,
    avatarUri: 'file:///normal/ai_role_avatars/role-1.png',
    tags: ['陪伴', '中文'],
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  const movedMemory = {
    id: 'memory-role-target',
    space: 'personal',
    scope: 'role',
    scopeId: 'role-1',
    type: 'fact',
    content: '用户喜欢傍晚散步',
    normalizedContent: '用户喜欢傍晚散步',
    sourceMessageId: null,
    confidence: 0.9,
    importance: 4,
    status: 'active',
    lastUsedAt: null,
    ipId: null,
    groupId: null,
    imageAssetId: null,
    assetSnapshotJson: '{}',
    sourceKind: 'auto',
    supersededByMemoryId: null,
    mergeReason: null,
    mergedAt: null,
    lastReconciledAt: null,
    reconcileSourceMessageId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  try {
    await roleRepository.importRoleCardForSpaceMove(
      source,
      roleCard,
      'normal',
      roleCard.id,
      roleCard.avatarUri
    );
    await source.runAsync(
      `INSERT INTO ai_threads (
        id, space, contextType, includeIpDocuments, title, titleStatus, modelSnapshotJson,
        roleCardId, roleSnapshotJson, roleInstructionWeight, replyPreference, thinkingDisabled,
        systemPrompt, boundaryMode, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'thread-role-source', 'normal', 'normal', 0, '阿岚', 'custom', '{}',
      roleCard.id, JSON.stringify(roleCard), 'default', 'auto', 0, '', 'prefer_material',
      now, now
    );
    await source.runAsync(
      `INSERT INTO ai_memories (
        id, space, scope, scopeId, type, content, normalizedContent, confidence, importance,
        status, assetSnapshotJson, sourceKind, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'memory-role-source', 'normal', 'role', roleCard.id, 'fact',
      movedMemory.content, movedMemory.normalizedContent, 0.9, 4, 'active', '{}', 'auto',
      now, now
    );

    assert.deepEqual(
      await roleRepository.deleteUnreferencedRoleCardsAfterThreadMove(
        source,
        'normal',
        [roleCard.id]
      ),
      []
    );

    await roleRepository.importRoleCardForSpaceMove(
      target,
      roleCard,
      'personal',
      roleCard.id,
      'file:///personal/ai_role_avatars/role-1.png'
    );
    await threadRepository.importRoleMemoriesForSpaceMove(target, [movedMemory]);
    const importedRole = await roleRepository.findById(target, roleCard.id);
    assert.equal(importedRole.space, 'personal');
    assert.equal(importedRole.prompt, roleCard.prompt);
    assert.deepEqual(importedRole.alternateGreetings, roleCard.alternateGreetings);
    assert.deepEqual(importedRole.tags, roleCard.tags);
    assert.equal(importedRole.avatarUri, 'file:///personal/ai_role_avatars/role-1.png');
    assert.equal((await target.getFirstAsync('SELECT scopeId FROM ai_memories')).scopeId, roleCard.id);
    assert.equal((await target.getFirstAsync('SELECT COUNT(*) AS count FROM ai_memory_fts')).count, 1);

    await source.runAsync('DELETE FROM ai_threads WHERE id = ?', 'thread-role-source');
    const deleted = await roleRepository.deleteUnreferencedRoleCardsAfterThreadMove(
      source,
      'normal',
      [roleCard.id]
    );
    assert.equal(deleted.length, 1);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_role_cards')).count, 0);
    assert.equal((await source.getFirstAsync('SELECT COUNT(*) AS count FROM ai_memories')).count, 0);
  } finally {
    source.close();
    target.close();
  }
});
