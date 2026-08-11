const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const repositoryPath = path.join(__dirname, '..', 'src/database/repositories/aiThreadRepository.ts');
const source = fs.readFileSync(repositoryPath, 'utf8');

function loadRepository() {
  const originalExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function compileTypeScript(module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
  try {
    delete require.cache[require.resolve(repositoryPath)];
    return require(repositoryPath).aiThreadRepository;
  } finally {
    if (originalExtension) require.extensions['.ts'] = originalExtension;
    else delete require.extensions['.ts'];
  }
}

class AsyncDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  close() { this.db.close(); }
}

function createHistorySchema(db) {
  db.db.exec(`
    CREATE TABLE ai_threads (
      id TEXT PRIMARY KEY, space TEXT, contextType TEXT, boundIpId INTEGER, boundKnowledgeBaseId TEXT,
      includeIpDocuments INTEGER, title TEXT, titleStatus TEXT, modelTitleGeneratedAt TEXT,
      providerId TEXT, modelId TEXT, sessionBaseUrl TEXT, sessionApiKeyRef TEXT, modelSnapshotJson TEXT,
      roleCardId TEXT, roleSnapshotJson TEXT, roleInstructionWeight TEXT, replyPreference TEXT,
      contextHistoryRoundLimit INTEGER, thinkingDisabled INTEGER, boundaryMode TEXT, systemPrompt TEXT,
      materialRulesSnapshot TEXT, summary TEXT, lastMessagePreview TEXT, currentBranchRootMessageId TEXT,
      currentBranchVersionIndex INTEGER, lineageVersion INTEGER, createdAt TEXT, updatedAt TEXT, archivedAt TEXT
    );
    CREATE TABLE ai_messages (
      id TEXT PRIMARY KEY, threadId TEXT, branchRootMessageId TEXT, branchVersionIndex INTEGER,
      role TEXT, status TEXT, content TEXT, reasoningText TEXT, errorMessage TEXT, providerId TEXT,
      modelId TEXT, modelSnapshotJson TEXT, promptSnapshotJson TEXT, continuityImportSessionId TEXT,
      continuitySyntheticKind TEXT, createdAt TEXT, updatedAt TEXT, completedAt TEXT
    );
    CREATE TABLE ai_message_versions (
      id TEXT PRIMARY KEY, originalMessageId TEXT, versionIndex INTEGER, role TEXT, status TEXT, content TEXT,
      reasoningText TEXT, errorMessage TEXT, providerId TEXT, modelId TEXT, modelSnapshotJson TEXT,
      promptSnapshotJson TEXT, citationsJson TEXT, messageCreatedAt TEXT, messageUpdatedAt TEXT,
      messageCompletedAt TEXT, createdAt TEXT
    );
    CREATE TABLE ai_knowledge_bases (id TEXT PRIMARY KEY, category TEXT);
    CREATE TABLE ai_continuity_import_sessions (id TEXT PRIMARY KEY, reviewGateState TEXT);
  `);
}

function insertThread(db, id, patch = {}) {
  db.db.prepare(`INSERT INTO ai_threads VALUES (?, 'normal', 'normal', NULL, NULL, 0, ?, 'fallback', NULL, NULL, NULL, NULL, NULL, '{}', NULL, '{}', 'default', 'auto', 30, 0, 'balanced', '', NULL, NULL, '', ?, ?, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`)
    .run(id, patch.title ?? id, patch.root ?? null, patch.version ?? null);
}

function insertMessage(db, input) {
  const time = input.createdAt;
  db.db.prepare(`INSERT INTO ai_messages VALUES (?, ?, ?, ?, ?, 'completed', ?, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL, ?, ?, ?)`)
    .run(input.id, input.threadId, input.root ?? null, input.version ?? null, input.role, input.content, time, time, time);
}

test('recent-chat history is projected from each thread’s adopted route', () => {
  const historyBody = source.slice(source.indexOf('async listHistoryItems('), source.indexOf('async createMessage('));
  assert.match(historyBody, /WITH RECURSIVE adopted_scopes/);
  assert.match(historyBody, /ranked_visible_messages/);
  assert.match(historyBody, /projected_history/);
  assert.match(historyBody, /selected_version\.content/);
  assert.match(historyBody, /projectedLastMessagePreview/);
  assert.doesNotMatch(historyBody, /for \(const row of rows\)/);
  assert.doesNotMatch(historyBody, /MAX\(COALESCE\(completedAt, updatedAt, createdAt\)\)/);
  assert.doesNotMatch(historyBody, /LIMIT \?/, 'the final visible-route ordering must happen after route projection');
});

test('branch tree does not synthesize a different route when no route was supplied', () => {
  const treePath = path.join(__dirname, '..', 'src/ai/aiBranchTreeService.ts');
  const treeSource = fs.readFileSync(treePath, 'utf8');
  assert.doesNotMatch(treeSource, /function resolveDefaultCurrentScopes/);
  assert.match(treeSource, /currentThread:\s*AiThreadRecord \| null/);
  assert.match(treeSource, /return \[\];/);
});

test('adopting a route persists its pointer and metadata atomically', () => {
  const treePath = path.join(__dirname, '..', 'src/ai/aiBranchTreeService.ts');
  const treeSource = fs.readFileSync(treePath, 'utf8');
  const adoptionBody = treeSource.slice(treeSource.indexOf('export async function adoptBranchSelection'), treeSource.indexOf('async function buildBranchTreeFromDatabase'));
  assert.match(adoptionBody, /db\.withTransactionAsync/);
  assert.match(adoptionBody, /setThreadCurrentBranch[\s\S]*upsertBranchRouteMetadata/);
});

test('limited message paging keeps the row-order tie breaker visible to the outer query', async () => {
  const db = new AsyncDatabase();
  createHistorySchema(db);
  insertThread(db, 'paged-thread');
  insertMessage(db, { id: 'message-a', threadId: 'paged-thread', role: 'user', content: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
  insertMessage(db, { id: 'message-b', threadId: 'paged-thread', role: 'assistant', content: 'b', createdAt: '2026-01-01T00:00:00.000Z' });
  insertMessage(db, { id: 'message-c', threadId: 'paged-thread', role: 'assistant', content: 'c', createdAt: '2026-01-01T00:00:00.000Z' });

  const repository = loadRepository();
  const messages = await repository.listMessagesBase(db, 'paged-thread', 2, []);

  assert.deepEqual(messages.map((message) => message.id), ['message-b', 'message-c']);
  db.close();
});

test('history ignores a newer sibling and previews the newest message on the adopted route', async () => {
  const db = new AsyncDatabase();
  createHistorySchema(db);
  insertThread(db, 'adopted-thread', { root: 'branch-root', version: 2 });
  insertThread(db, 'other-thread');
  insertThread(db, 'empty-thread');
  insertMessage(db, { id: 'main-user', threadId: 'adopted-thread', role: 'user', content: 'main user', createdAt: '2026-01-01T00:00:00.000Z' });
  insertMessage(db, { id: 'branch-root', threadId: 'adopted-thread', role: 'assistant', content: 'base branch text', createdAt: '2026-01-02T00:00:00.000Z' });
  insertMessage(db, { id: 'hidden-sibling', threadId: 'adopted-thread', root: 'branch-root', version: 1, role: 'assistant', content: 'hidden newer sibling', createdAt: '2099-01-01T00:00:00.000Z' });
  insertMessage(db, { id: 'other-latest', threadId: 'other-thread', role: 'assistant', content: 'other latest', createdAt: '2027-01-01T00:00:00.000Z' });
  db.db.prepare(`INSERT INTO ai_message_versions VALUES ('branch-root-v2', 'branch-root', 2, 'assistant', 'completed', 'adopted route latest', NULL, NULL, NULL, NULL, '{}', '{}', '[]', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z')`).run();

  const repository = loadRepository();
  const items = await repository.listHistoryItems(db, 'normal');
  assert.deepEqual(items.map((item) => item.id), ['other-thread', 'adopted-thread']);
  assert.equal(items[1].lastMessagePreview, 'adopted route latest');
  assert.equal(items.some((item) => item.id === 'empty-thread'), false);
  db.close();
});
