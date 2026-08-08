const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const original = require.extensions['.ts'];
require.extensions['.ts'] = function (module, filename) { module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); };
let schema, repository, runtimeEvents;
try { schema = require(path.join(root, 'src/database/schema.ts')); repository = require(path.join(root, 'src/ai/dream/dreamRepository.ts')); runtimeEvents = require(path.join(root, 'src/ai/dream/dreamRuntimeEvents.ts')); } finally { if (original) require.extensions['.ts'] = original; else delete require.extensions['.ts']; }

class DB { constructor() { this.db = new DatabaseSync(':memory:'); } exec(s) { this.db.exec(s); } async runAsync(s,...p){return this.db.prepare(s).run(...p);} async getFirstAsync(s,...p){return this.db.prepare(s).get(...p)??null;} async getAllAsync(s,...p){return this.db.prepare(s).all(...p);} async withTransactionAsync(task){this.db.exec('BEGIN');try{const r=await task();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}} close(){this.db.close();} }
function createDb() { const db = new DB(); db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE ai_threads(id TEXT PRIMARY KEY, space TEXT NOT NULL); CREATE TABLE ai_messages(id TEXT PRIMARY KEY, threadId TEXT NOT NULL, FOREIGN KEY(threadId) REFERENCES ai_threads(id) ON DELETE CASCADE); INSERT INTO ai_threads VALUES('thread-a','normal'); INSERT INTO ai_messages VALUES('user-a','thread-a'); INSERT INTO ai_messages VALUES('assistant-a','thread-a');`); db.exec(schema.MIGRATION_STATEMENTS_V53); return db; }

test('round receipts are idempotent and first automatic dream can reserve quota', async () => {
  const db=createDb(); try {
    const input={space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',userMessageId:'user-a',assistantMessageId:'assistant-a',userMessageVersionHash:'uh',assistantMessageVersionHash:'ah',now:'2026-07-29T08:00:00.000Z'};
    const first=await repository.registerDreamRound(db,input); const duplicate=await repository.registerDreamRound(db,input);
    assert.equal(first.inserted,true); assert.equal(duplicate.inserted,false); assert.equal(duplicate.counter.totalRounds,1);
    const scene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'snapshot',now:input.now});
    const seed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'snapshot',roll:0.01,decision:'classifying',manual:false,policyVersion:'v',idempotencyKey:'seed-a',now:input.now});
    const job=await repository.createDreamJob(db,{seed,phase:'classifying',now:input.now});
    assert.equal(await repository.reserveDreamQuota(db,job,input.now),true);
    const counter=db.db.prepare('SELECT * FROM companion_role_round_counters').get(); assert.equal(counter.dailyDreamReservedCount,1);
    await repository.cancelDreamJob(db,job.id,input.now); const released=db.db.prepare('SELECT * FROM companion_role_round_counters').get(); assert.equal(released.dailyDreamReservedCount,0);
    assert.equal((await repository.findDreamJob(db,job.id)).quotaReserved,false);
    assert.equal(await repository.completeDream(db,{job,seed,title:'雾中回声',body:'我沿着月光走进一片安静的雾。',now:input.now,workerId:'late-worker'}),null);
    assert.equal(db.db.prepare('SELECT COUNT(*) n FROM companion_dreams').get().n,0);
  } finally { db.close(); }
});

test('one continuous scene has one seed and closes explicitly', async () => {
  const db=createDb(); try {
    const base={space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,evidenceMessageIds:['user-a'],sourceSnapshotHash:'s',now:'2026-07-29T08:00:00Z'};
    const first=await repository.upsertDreamScene(db,{...base,state:'approaching_sleep'}); const same=await repository.upsertDreamScene(db,{...base,state:'dream_active',evidenceMessageIds:['assistant-a']}); assert.equal(first.id,same.id); assert.deepEqual(same.evidenceMessageIds,['user-a','assistant-a']);
    await repository.closeDreamScene(db,first.id,'2026-07-29T09:00:00Z'); assert.equal(await repository.findActiveDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0}),null);
  } finally { db.close(); }
});

test('persisted source-thread notice survives process-local event loss', async () => {
  const db=createDb(); try {
    const now='2026-07-29T08:00:00Z';
    const scene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'snapshot',now});
    const seed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'snapshot',roll:0.01,decision:'classifying',manual:false,policyVersion:'v',idempotencyKey:'notice-seed',now});
    const job=await repository.createDreamJob(db,{seed,phase:'classifying',now});
    assert.deepEqual(await runtimeEvents.loadDreamRuntimeNotice(db,{threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0}),{type:'generating',threadId:'thread-a',jobId:job.id});
    assert.equal(await runtimeEvents.loadDreamRuntimeNotice(db,{threadId:'thread-a',branchRouteHash:'sibling',lineageVersion:0}),null);
  } finally { db.close(); }
});

test('counter rebuild after delete or move excludes completed manual dreams from automatic quota', async () => {
  const db=createDb(); try {
    const now='2026-07-29T08:00:00Z';
    await repository.registerDreamRound(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',userMessageId:'user-a',assistantMessageId:'assistant-a',userMessageVersionHash:'uh',assistantMessageVersionHash:'ah',now});
    const scene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'manual-snapshot',now});
    const seed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'manual-snapshot',roll:0,decision:'selected',manual:true,policyVersion:'v',idempotencyKey:'manual-seed',now});
    const pending=await repository.createDreamJob(db,{seed,phase:'generating',now});
    const running=await repository.acquireDreamJob(db,{id:pending.id,workerId:'manual-worker',now,leaseUntil:'2026-07-29T08:05:00Z'});
    assert.ok(running);
    assert.equal(await repository.reserveDreamQuota(db,running,now),true);
    assert.ok(await repository.completeDream(db,{job:running,seed,title:'手动梦境',body:'这是用户明确请求生成的梦。',now,workerId:'manual-worker'}));

    await repository.rebuildRoleRoundCounter(db,{space:'normal',roleCardId:'role-a',now});
    const counter=db.db.prepare('SELECT * FROM companion_role_round_counters WHERE roleCardId=?').get('role-a');
    assert.equal(counter.lastDreamSuccessRound,null);
    assert.equal(counter.dailyDreamSuccessCount,0);

    await repository.closeDreamScene(db,scene.id,'2026-07-29T08:10:00Z');
    const autoScene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'auto-snapshot',now:'2026-07-29T08:11:00Z'});
    const autoSeed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:autoScene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'auto-snapshot',roll:0.01,decision:'classifying',manual:false,policyVersion:'v',idempotencyKey:'auto-after-rebuild',now:'2026-07-29T08:11:00Z'});
    const autoJob=await repository.createDreamJob(db,{seed:autoSeed,phase:'classifying',now:'2026-07-29T08:11:00Z'});
    assert.equal(await repository.reserveDreamQuota(db,autoJob,'2026-07-29T08:11:00Z'),true);
  } finally { db.close(); }
});

test('terminal automatic failure releases quota and only a successful automatic retry advances cooldown', async () => {
  const db=createDb(); try {
    const now='2026-07-29T08:00:00Z';
    await repository.registerDreamRound(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',userMessageId:'user-a',assistantMessageId:'assistant-a',userMessageVersionHash:'uh',assistantMessageVersionHash:'ah',now});
    const scene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'snapshot',now});
    const seed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'snapshot',roll:0.01,decision:'selected',manual:false,policyVersion:'v',idempotencyKey:'retry-seed',now});
    const pending=await repository.createDreamJob(db,{seed,phase:'generating',now});
    assert.equal(await repository.reserveDreamQuota(db,pending,now),true);
    const reserved=await repository.findDreamJob(db,pending.id);
    await repository.releaseDreamQuota(db,reserved,'2026-07-29T08:01:00Z');
    await repository.transitionDreamJob(db,{id:pending.id,status:'failed',now:'2026-07-29T08:01:00Z'});

    let counter=db.db.prepare('SELECT * FROM companion_role_round_counters').get();
    assert.equal(counter.dailyDreamReservedCount,0);
    assert.equal(counter.dailyDreamSuccessCount,0);
    assert.equal(counter.lastDreamSuccessRound,null);

    const failed=await repository.findDreamJob(db,pending.id);
    assert.equal(await repository.reserveDreamQuota(db,failed,'2026-07-29T08:02:00Z'),true);
    await db.runAsync("UPDATE companion_dream_jobs SET status='pending', attemptCount=0, nextRunAt=? WHERE id=?",'2026-07-29T08:02:00Z',pending.id);
    const running=await repository.acquireDreamJob(db,{id:pending.id,workerId:'retry-worker',now:'2026-07-29T08:02:00Z',leaseUntil:'2026-07-29T08:07:00Z'});
    assert.ok(await repository.completeDream(db,{job:running,seed,title:'重试成梦',body:'我从雾里重新找到了那条发光的小路。',now:'2026-07-29T08:03:00Z',workerId:'retry-worker'}));
    assert.equal((await repository.findDreamJob(db,pending.id)).quotaReserved,false);

    counter=db.db.prepare('SELECT * FROM companion_role_round_counters').get();
    assert.equal(counter.dailyDreamReservedCount,0);
    assert.equal(counter.dailyDreamSuccessCount,1);
    assert.equal(counter.lastDreamSuccessRound,1);
  } finally { db.close(); }
});

test('classification success starts generation with a fresh three-attempt budget', async () => {
  const db=createDb(); try {
    const now='2026-07-29T08:00:00Z';
    await repository.registerDreamRound(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',userMessageId:'user-a',assistantMessageId:'assistant-a',userMessageVersionHash:'uh',assistantMessageVersionHash:'ah',now});
    const scene=await repository.upsertDreamScene(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,state:'sleep_established',evidenceMessageIds:['user-a','assistant-a'],sourceSnapshotHash:'snapshot',now});
    const seed=await repository.createDreamSeed(db,{space:'normal',roleCardId:'role-a',threadId:'thread-a',branchRouteHash:'route-a',lineageVersion:0,sceneId:scene.id,sourceMessageIds:['user-a','assistant-a'],sourceMessageVersionHashes:['uh','ah'],sourceSnapshotHash:'snapshot',roll:0.01,decision:'classifying',manual:false,policyVersion:'v',idempotencyKey:'attempt-seed',now});
    const pending=await repository.createDreamJob(db,{seed,phase:'classifying',now});
    const running=await repository.acquireDreamJob(db,{id:pending.id,workerId:'classifier',now,leaseUntil:'2026-07-29T08:05:00Z'});
    assert.equal(running.attemptCount,1);

    await repository.transitionDreamJob(db,{id:pending.id,phase:'generating',status:'pending',now,workerId:'classifier',resetAttemptCount:true});
    const generating=await repository.findDreamJob(db,pending.id);
    assert.equal(generating.attemptCount,0);
  } finally { db.close(); }
});
