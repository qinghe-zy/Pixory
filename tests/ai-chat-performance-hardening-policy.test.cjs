const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch lineage uses one recursive SQLite query with invalid lineage guards', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const lineageBody = /async resolveBranchLineage[\s\S]*?\r?\n  \},\r?\n\r?\n  async listRecentCompletedMessagesBefore/.exec(repository)?.[0] ?? '';

  assert.match(lineageBody, /BRANCH_LINEAGE_MAX_DEPTH/);
  assert.match(lineageBody, /WITH RECURSIVE/);
  assert.match(lineageBody, /lineage/);
  assert.match(lineageBody, /path/);
  assert.match(lineageBody, /cycleDetected/);
  assert.match(lineageBody, /missingParentDetected/);
  assert.match(lineageBody, /depthLimitReached/);
  assert.match(lineageBody, /ORDER BY depth ASC/);
  assert.doesNotMatch(lineageBody, /while \(currentRootMessageId && currentVersionIndex\)/);
  assert.doesNotMatch(lineageBody, /getFirstAsync<AiMessageRecord>\('SELECT \* FROM ai_messages WHERE id = \?', currentRootMessageId\)/);
});

test('AI chat streaming patches update by indexed message id before falling back', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const patchBody = /const applyStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[\]\);/.exec(chat)?.[0] ?? '';
  const bufferBody = /const applyOrBufferStreamingMessagePatch = useCallback[\s\S]*?\r?\n  \}, \[applyStreamingMessagePatch\]\);/.exec(chat)?.[0] ?? '';

  assert.match(chat, /messageIndexByIdRef/);
  assert.match(chat, /function rebuildMessageIndex/);
  assert.match(chat, /function replaceMessages/);
  assert.match(patchBody, /const messageIndex = messageIndexByIdRef\.current\.get\(patch\.id\)/);
  assert.match(patchBody, /current\[messageIndex\]/);
  assert.match(patchBody, /nextMessages\[messageIndex\] =/);
  assert.match(patchBody, /current\.map/);
  assert.match(patchBody, /rebuildMessageIndex\(nextMessages\)/);
  assert.match(chat, /replaceMessages\(\[\]\)/);
  assert.match(chat, /replaceMessages\(renderedMessages\)/);
  const mergeMatches = bufferBody.match(/mergeBufferedStreamingPatch\(patch\)/g) ?? [];
  assert.equal(mergeMatches.length, 1);
});

test('embedding retrieval limits vector candidates before JS cosine scoring', () => {
  const embedding = read('src/ai/aiEmbeddingService.ts');
  const retrievalBody = /export async function tryEmbeddingRetrieval[\s\S]*?\r?\n}\r?\n?$/.exec(embedding)?.[0] ?? '';

  assert.match(embedding, /const EMBEDDING_VECTOR_CANDIDATE_LIMIT =/);
  assert.match(retrievalBody, /const candidateLimit = Math\.max/);
  assert.match(retrievalBody, /LIMIT \?/);
  assert.match(retrievalBody, /candidateLimit/);
  assert.match(retrievalBody, /ORDER BY ai_chunks\.documentId ASC, ai_chunks\.chunkIndex ASC, ai_embeddings\.chunkId ASC/);
  assert.match(retrievalBody, /\.slice\(0, input\.limit \?\? 6\)/);
});

test('memory maintenance preserves per-thread coalescing and serializes global passes', () => {
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');

  assert.match(queue, /const activeMaintenanceTasks = new Map/);
  assert.match(queue, /const queuedMaintenanceTasks: ActiveMaintenanceTask\[\] = \[\]/);
  assert.match(queue, /let globalMaintenanceRunnerActive = false/);
  assert.match(queue, /function enqueueMaintenanceTask/);
  assert.match(queue, /async function drainMaintenanceQueue/);
  assert.match(queue, /queuedMaintenanceTasks\.sort/);
  assert.match(queue, /reasonPriority\(right\.reason\) - reasonPriority\(left\.reason\)/);
  assert.match(queue, /let currentInput = entry\.currentInput/);
  assert.match(queue, /await runUnifiedMemoryMaintenancePass\(currentInput\)/);
  assert.match(queue, /recordMaintenanceFailure\(currentInput\.space, currentInput\.threadId, error\)/);
  assert.match(queue, /entry\.done\(undefined\)/);
  assert.match(queue, /activeMaintenanceTasks\.set\(key, entry\)/);
  assert.match(queue, /return entry\.promise/);
});
