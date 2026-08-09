const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTsModule(filename) {
  const previousExtension = require.extensions['.ts'];
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  try {
    delete require.cache[require.resolve(filename)];
    return require(filename);
  } finally {
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  }
}

class TestDb {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  exec(sql) { this.db.exec(sql); }
  async runAsync(sql, ...params) { return this.db.prepare(sql).run(...params); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(sql).all(...params); }
  async withTransactionAsync(task) { this.db.exec('BEGIN'); try { const value = await task(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  close() { this.db.close(); }
}

test('retry accepts failed and waiting-model jobs, re-reserves automatic quota, and reports frequency blocking', () => {
  const worker = fs.readFileSync(path.join(root, 'src/ai/dream/dreamWorker.ts'), 'utf8');

  assert.match(worker, /DreamRetryResult/);
  assert.match(worker, /status !== 'failed'.*status !== 'waiting_model'/s);
  assert.match(worker, /reserveQuota/);
  assert.match(worker, /frequency_blocked/);
  assert.match(worker, /scheduleCompanionMaintenance/);
});

function loadWorker(capture) {
  const filename = path.join(root, 'src/ai/dream/dreamWorker.ts');
  const previousExtension = require.extensions['.ts'];
  const previousLoad = Module._load;
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, sourcePath);
  };
  const repo = {
    findJob: async () => capture.job,
    findSeed: async () => capture.seed,
    reserveQuota: async () => { capture.reserveCalls += 1; return capture.reserveAllowed; },
    transitionJob: async (_db, input) => { capture.transitions.push(input); },
    updateSeed: async (_db, input) => { capture.seedUpdates.push(input); },
  };
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === filename && request === '../../database') {
      return {
        aiRoleCardRepository: {},
        aiThreadRepository: {},
        runWithDatabaseSpace: async (_space, callback) => callback({
          runAsync: async (...args) => { capture.sql.push(args); return { changes: 1 }; },
        }),
      };
    }
    if (parent?.filename === filename && request === './dreamRepository') return { dreamRepository: repo };
    if (parent?.filename === filename && request === './dreamRuntimeEvents') return { emitDreamRuntimeNotice: (notice) => capture.notices.push(notice) };
    if (parent?.filename === filename && request === '../companion/companionMaintenanceQueue') return { scheduleCompanionMaintenance: (input) => capture.schedules.push(input) };
    if (parent?.filename === filename && request === '../aiMemoryMaintenanceModelService') return { callMemoryMaintenanceModel: async () => ({}) };
    if (parent?.filename === filename && request === '../aiProviderUsage') return { normalizeProviderUsage: () => ({}) };
    if (parent?.filename === filename && request === '../companion/companionRuntimeValidation') return { hashCompanionMessageVersion: () => 'hash', hashCompanionText: () => 'hash' };
    if (parent?.filename === filename && request === '../context/conversationCoverage') return { hashBranchRoute: () => 'route' };
    if (parent?.filename === filename && request === './dreamPolicy') return { DREAM_CLASSIFICATION_JSON_SCHEMA: {}, DREAM_GENERATION_JSON_SCHEMA: {}, dreamIntentProbability: {}, parseDreamClassification: () => null, parseDreamGeneration: () => null, shouldSelectDream: () => false };
    if (parent?.filename === filename && request === '../companion/companionConversationSnapshotService') return { buildDreamConversationSnapshot: () => ({ focusMessages: [] }) };
    if (parent?.filename === filename && request === './dreamPromptService') return { buildDreamClassificationPrompt: () => ({}), buildDreamGenerationPrompt: () => ({}) };
    return previousLoad(request, parent, isMain);
  };
  const restore = () => {
    Module._load = previousLoad;
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  };
  try {
    delete require.cache[require.resolve(filename)];
    return { restore, worker: require(filename) };
  } catch (error) {
    restore();
    throw error;
  }
}

function retryCapture(overrides = {}) {
  return {
    job: { id:'job-a',threadId:'thread-a',seedId:'seed-a',phase:'generating',status:'failed',quotaReserved:false },
    seed: { id:'seed-a',manual:false },
    reserveAllowed: true,
    reserveCalls: 0,
    notices: [],
    schedules: [],
    seedUpdates: [],
    sql: [],
    transitions: [],
    ...overrides,
  };
}

test('automatic generation retry durably re-reserves quota before it is scheduled', async () => {
  const capture = retryCapture();
  const loaded = loadWorker(capture);
  const result = await loaded.worker.retryDreamGeneration('normal', 'job-a');
  loaded.restore();

  assert.deepEqual(result, { jobId: 'job-a', status: 'scheduled' });
  assert.equal(capture.reserveCalls, 1);
  assert.equal(capture.sql.length, 1);
  assert.equal(capture.notices.at(-1).type, 'generating');
  assert.equal(capture.schedules.length, 1);
});

test('waiting-model manual retry bypasses automatic quota and frequency block remains failed', async () => {
  const manual = retryCapture({
    job: { id:'job-a',threadId:'thread-a',seedId:'seed-a',phase:'generating',status:'waiting_model',quotaReserved:false },
    seed: { id:'seed-a',manual:true },
  });
  let loaded = loadWorker(manual);
  assert.deepEqual(await loaded.worker.retryDreamGeneration('normal', 'job-a'), { jobId: 'job-a', status: 'scheduled' });
  loaded.restore();
  assert.equal(manual.reserveCalls, 0);

  const blocked = retryCapture({ reserveAllowed: false });
  loaded = loadWorker(blocked);
  assert.deepEqual(await loaded.worker.retryDreamGeneration('normal', 'job-a'), { status: 'frequency_blocked' });
  loaded.restore();
  assert.equal(blocked.sql.length, 0);
  assert.equal(blocked.notices.length, 0);
  assert.equal(blocked.schedules.length, 0);
  assert.equal(blocked.transitions.at(-1).errorCode, 'frequency_blocked');
});

test('source-changed recovery freezes current complete rounds into a manual idempotent replacement job', () => {
  const service = fs.readFileSync(path.join(root, 'src/ai/dream/dreamService.ts'), 'utf8');

  assert.match(service, /regenerateDreamFromCurrentConversation/);
  assert.match(service, /listSnapshotCandidateMessages/);
  assert.match(service, /buildDreamConversationSnapshot/);
  assert.match(service, /dream-recover:/);
  assert.match(service, /manual: true/);
  assert.match(service, /closeScene/);
});

test('source-changed recovery creates a real manual replacement job and retires the stale job', async () => {
  const schema = loadTsModule(path.join(root, 'src/database/schema.ts'));
  const repository = loadTsModule(path.join(root, 'src/ai/dream/dreamRepository.ts'));
  const db = new TestDb();
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT NOT NULL);
    CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE);
    INSERT INTO ai_threads VALUES('thread-a','normal');
    INSERT INTO ai_messages VALUES('user-a','thread-a');
    INSERT INTO ai_messages VALUES('assistant-a','thread-a');`);
  db.exec(schema.MIGRATION_STATEMENTS_V53);
  const now = '2026-08-08T14:00:00.000Z';
  const scene = await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'old-route',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'old',now});
  const seed = await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'old-route',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['old-u','old-a'],sourceSnapshotHash:'old',roll:0.01,decision:'failed',manual:false,policyVersion:'v',idempotencyKey:'stale-seed',now});
  const stale = await repository.createDreamJob(db,{seed,phase:'generating',now});
  await db.runAsync("UPDATE companion_dream_jobs SET status='failed',lastErrorCode='source_changed',completedAt=? WHERE id=?",now,stale.id);

  const messages = [
    {id:'user-a',threadId:'thread-a',branchRootMessageId:null,branchVersionIndex:null,role:'user',status:'completed',content:'我们在月光下睡着',reasoningText:null,errorMessage:null,providerId:null,modelId:null,modelSnapshotJson:'{}',promptSnapshotJson:'{}',continuityImportSessionId:null,continuitySyntheticKind:null,createdAt:now,updatedAt:now,completedAt:now},
    {id:'assistant-a',threadId:'thread-a',branchRootMessageId:null,branchVersionIndex:null,role:'assistant',status:'completed',content:'我轻轻闭上眼',reasoningText:null,errorMessage:null,providerId:null,modelId:null,modelSnapshotJson:'{}',promptSnapshotJson:'{}',continuityImportSessionId:null,continuitySyntheticKind:null,createdAt:'2026-08-08T14:01:00.000Z',updatedAt:'2026-08-08T14:01:00.000Z',completedAt:'2026-08-08T14:01:00.000Z'},
  ];
  const serviceFile = path.join(root, 'src/ai/dream/dreamService.ts');
  const previousExtension = require.extensions['.ts'];
  const previousLoad = Module._load;
  const capture = { notices: [], schedules: [] };
  require.extensions['.ts'] = function (module, sourcePath) {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sourcePath);
  };
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === serviceFile && request === '../../database') return {
      aiThreadRepository: {
        findThreadById: async () => ({ id:'thread-a',roleCardId:'role-a',roleSnapshotJson:'{}',currentBranchRootMessageId:null,currentBranchVersionIndex:null,lineageVersion:0 }),
        listSnapshotCandidateMessages: async () => messages,
        resolveBranchLineage: async () => [],
        findMessageById: async (_db, id) => messages.find((message) => message.id === id) ?? null,
      },
      runWithDatabaseSpace: async (_space, callback) => callback(db),
    };
    if (parent?.filename === serviceFile && request === './dreamRuntimeEvents') return { emitDreamRuntimeNotice: (notice) => capture.notices.push(notice) };
    if (parent?.filename === serviceFile && request === '../companion/companionMaintenanceQueue') return { scheduleCompanionMaintenance: (input) => capture.schedules.push(input) };
    return previousLoad(request, parent, isMain);
  };
  let service;
  try {
    delete require.cache[require.resolve(serviceFile)];
    service = require(serviceFile);
  } finally {
    Module._load = previousLoad;
    if (previousExtension) require.extensions['.ts'] = previousExtension;
    else delete require.extensions['.ts'];
  }

  try {
    const replacementId = await service.regenerateDreamFromCurrentConversation({ space:'normal', failedJobId:stale.id });
    assert.ok(replacementId);
    const replacement = await repository.findDreamJob(db,replacementId);
    const replacementSeed = await repository.findDreamSeed(db,replacement.seedId);
    const retired = await repository.findDreamJob(db,stale.id);
    assert.equal(replacement.phase,'generating');
    assert.equal(replacement.status,'pending');
    assert.equal(replacementSeed.manual,true);
    assert.equal(replacement.quotaReserved,false);
    assert.equal(retired.status,'cancelled');
    assert.equal(capture.notices.at(-1).type,'generating');
    assert.equal(capture.schedules.length,1);
  } finally { db.close(); }
});

test('chat reloads every terminal dream transition and chooses current-source recovery when required', () => {
  const chat = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  const runtimeEvents = fs.readFileSync(path.join(root, 'src/ai/dream/dreamRuntimeEvents.ts'), 'utf8');

  assert.match(chat, /regenerateDreamFromCurrentConversation/);
  assert.match(chat, /presentDreamFailure/);
  assert.match(chat, /await retryDreamGeneration/);
  assert.match(chat, /await regenerateDreamFromCurrentConversation/);
  assert.match(chat, /retryResult\.status === 'frequency_blocked'/);
  assert.match(chat, /replacementJobId/);
  assert.match(chat, /梦境重试失败/);
  assert.match(runtimeEvents, /status IN \('pending', 'running', 'retry'\)/);
  assert.match(runtimeEvents, /status IN \('failed', 'waiting_model'\)/);
});
