const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('AI memory auto maintenance cannot create or mutate global memory from chat', () => {
  const capture = read('src/ai/aiMemoryCaptureService.ts');
  const reconciliation = read('src/ai/aiMemoryReconciliationService.ts');

  assert.doesNotMatch(capture, /\{\s*scope:\s*'global',\s*scopeId:\s*null\s*\}/);
  assert.match(capture, /if \(candidate\.scope === 'global'\) \{[\s\S]{0,80}continue;/);
  assert.match(capture, /candidate\.scope,\s*\n\s*scopeId/);
  assert.match(reconciliation, /operation\.scope === 'global'[\s\S]{0,120}global_scope_requires_manual_action/);
  assert.match(reconciliation, /target\.scope === 'global'[\s\S]{0,120}global_target_requires_manual_action/);
});

test('AI profile auto maintenance writes thread scoped profiles for every chat', () => {
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const prompts = read('src/ai/aiMemoryPrompts.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const schema = read('src/database/schema.ts');

  assert.doesNotMatch(profile, /thread\.boundIpId == null[\s\S]{0,80}return null/);
  assert.match(profile, /boundThreadId:\s*prepared\.thread\.id/);
  assert.match(profile, /getUserProfile\(db,\s*space,\s*null,\s*thread\.id\)/);
  assert.match(profile, /buildProfileInitializationPrompt\(prepared\.conversation,\s*'本会话'\)/);
  assert.match(profile, /buildProfileUpdatePrompt\([\s\S]*'本会话'\)/);
  assert.match(repository, /boundThreadId/);
  assert.match(schema, /MIGRATION_STATEMENTS_V34/);
  assert.match(schema, /ALTER TABLE ai_user_profiles ADD COLUMN boundThreadId TEXT/);
  assert.match(prompts, /scopeLabel/);
  assert.match(prompts, /本会话画像/);
  assert.match(prompts, /当前 IP 内/);
});

test('AI thread scoped profiles are lifecycle-bound and cannot mix profile scopes', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const schema = read('src/database/schema.ts');

  assert.match(schema, /boundThreadId TEXT REFERENCES ai_threads\(id\) ON DELETE CASCADE/);
  assert.match(schema, /trg_ai_user_profiles_no_mixed_scope_insert/);
  assert.match(schema, /NEW\.boundIpId IS NOT NULL AND NEW\.boundThreadId IS NOT NULL/);
  assert.match(schema, /IFNULL\(boundIpId, -1\)/);
  assert.match(repository, /deleteUserProfilesBoundToThreads/);
  assert.match(repository, /DELETE FROM ai_user_profiles WHERE boundThreadId = \?/);
  assert.match(repository, /validateUserProfileScope/);
  assert.match(repository, /cannot bind both an IP and a thread/);
});

test('AI thread moves include thread scoped user profiles', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(repository, /userProfile:\s*AiUserProfileRecord \| null/);
  assert.match(repository, /SELECT \* FROM ai_user_profiles[\s\S]{0,120}boundThreadId = \?/);
  assert.match(repository, /snapshot\.userProfile/);
  assert.match(repository, /boundThreadId:\s*snapshot\.thread\.id/);
});

test('AI memory board visibly separates global session and IP profile governance', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(board, /globalProfile/);
  assert.match(board, /sessionProfile/);
  assert.match(board, /projectProfile/);
  assert.match(board, /globalProfileDraft/);
  assert.match(board, /sessionProfileDraft/);
  assert.match(board, /projectProfileDraft/);
  assert.match(board, /getUserProfile\(space,\s*null\)/);
  assert.match(board, /getUserProfile\(space,\s*null,\s*threadId\)/);
  assert.match(board, /getUserProfile\(space,\s*nextThread\.boundIpId,\s*null\)/);
  assert.match(board, /全局画像/);
  assert.match(board, /本会话画像/);
  assert.match(board, /当前 IP 画像/);
  assert.match(board, /profileGovernanceCaption/);
  assert.match(board, /thread\?\.boundIpId != null[\s\S]{0,120}本会话画像优先于当前 IP 画像和全局画像/);
  assert.match(board, /本会话画像优先于全局画像/);
  assert.match(board, /thread\?\.boundIpId != null \? \(/);
  assert.doesNotMatch(board, /当前会话未绑定 IP，不会生成当前 IP 画像。/);
  assert.match(board, /availableManualMemoryScopes/);
  assert.match(board, /thread\?\.boundIpId != null\s*\?\s*MANUAL_MEMORY_SCOPE_OPTIONS\s*:\s*MANUAL_MEMORY_SCOPE_OPTIONS\.filter\(\(scope\) => scope !== 'ip'\)/);
  assert.match(board, /resolvedManualMemoryScope/);
  assert.match(board, /availableManualMemoryScopes\.includes\(manualMemoryScope\) \? manualMemoryScope : 'thread'/);
  assert.match(board, /manualMemoryPlaceholder/);
  assert.match(board, /manualMemoryPlaceholder = resolvedManualMemoryScope === 'ip'/);
  assert.match(board, /resolveManualMemoryScope\(thread,\s*resolvedManualMemoryScope\)/);
  assert.match(board, /resolvedManualMemoryScope === scope && styles\.filterChipActive/);
  assert.match(board, /resolvedManualMemoryScope === scope && styles\.filterTextActive/);
  assert.match(board, /label=\{`添加到\$\{SCOPE_LABELS\[resolvedManualMemoryScope\]\}`\}/);
});

test('AI memory board labels every memory item with its governance scope', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(board, /SCOPE_DESCRIPTIONS/);
  assert.match(board, /作用域：\{SCOPE_LABELS\[memory\.scope\]\}/);
  assert.match(board, /全局记忆/);
  assert.match(board, /当前 IP 记忆/);
  assert.match(board, /本会话记忆/);
});

test('AI memory board lets manual additions choose global project or thread scope', () => {
  const board = read('src/screens/AiMemoryBoardScreen.tsx');

  assert.match(board, /manualMemoryScope/);
  assert.match(board, /MANUAL_MEMORY_SCOPE_OPTIONS/);
  assert.match(board, /resolveManualMemoryScope/);
  assert.match(board, /scope:\s*manualScope\.scope/);
  assert.match(board, /scopeId:\s*manualScope\.scopeId/);
  assert.match(board, /label=\{`添加到\$\{SCOPE_LABELS\[resolvedManualMemoryScope\]\}`\}/);
});

test('AI memory retrieval gives local project scopes a hard priority over global memory', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiMemoryService.ts');

  assert.match(repository, /memoryScopePrioritySql/);
  assert.doesNotMatch(repository, /ORDER BY scope ASC, importance DESC, createdAt ASC, id ASC/);
  assert.match(repository, /ORDER BY \$\{memoryScopePrioritySql\(\)\} DESC/);
  assert.match(repository, /ORDER BY \$\{memoryScopePrioritySql\('ai_memories'\)\} DESC/);
  assert.match(service, /getMemoryPromptPriority/);
  assert.match(service, /right\.priority - left\.priority/);
  assert.match(service, /memory\.scope === 'ip' && thread\.boundIpId != null && memory\.scopeId === String\(thread\.boundIpId\)/);
  assert.doesNotMatch(service, /memory\.scope === 'ip' && memory\.scopeId === String\(thread\.boundIpId \?\? ''\)/);
});

test('AI memory startup cleanup stales legacy automatic global memories', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');

  assert.match(schema, /MEMORY_SCOPE_GOVERNANCE_STATEMENTS/);
  assert.match(schema, /scope = 'global'/);
  assert.match(schema, /sourceKind = 'auto'/);
  assert.match(schema, /status = 'stale'/);
  assert.match(db, /MEMORY_SCOPE_GOVERNANCE_STATEMENTS/);
  assert.match(db, /ai_memory_scope_governance_applied/);
  assert.match(db, /SELECT value FROM app_settings WHERE key = \?/);
  assert.match(db, /ON CONFLICT\(key\) DO UPDATE/);
  assert.match(db, /ensureMemoryScopeGovernance\(database\)/);
  assert.doesNotMatch(db, /await database\.execAsync\(MEMORY_SCOPE_GOVERNANCE_STATEMENTS\);/);
});
