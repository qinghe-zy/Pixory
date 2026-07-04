const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('continuity import persistence adds import sessions and V43 migration', () => {
  const schema = read('src/database/schema.ts');
  const db = read('src/database/db.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const types = read('src/ai/aiContinuityImportTypes.ts');

  assert.match(schema, /DATABASE_VERSION = 45/);
  assert.match(schema, /export const MIGRATION_STATEMENTS_V43 = `/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_continuity_import_sessions/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_continuity_import_blocks/);
  assert.match(schema, /ALTER TABLE ai_messages ADD COLUMN continuityImportSessionId TEXT/);
  assert.match(schema, /ALTER TABLE ai_messages ADD COLUMN continuitySyntheticKind TEXT/);
  assert.match(schema, /CREATE INDEX IF NOT EXISTS idx_ai_messages_continuity_import_session/);
  assert.match(db, /MIGRATION_STATEMENTS_V43/);
  assert.match(db, /currentVersion < 43/);
  assert.match(db, /currentVersion < 44/);
  assert.match(repository, /export interface AiContinuityImportSessionRecord/);
  assert.match(repository, /createContinuityImportSession/);
  assert.match(repository, /listContinuityImportBlocksBySessionId/);
  assert.match(repository, /createContinuityImportBlocks/);
  assert.match(types, /export type AiContinuityImportSourceKind/);
  assert.match(types, /export type AiContinuityImportReviewGateState/);
});

test('continuity import service creates a pending review gate for external imports', () => {
  const service = read('src/ai/aiContinuityImportService.ts');

  assert.match(service, /reviewGateState:\s*parsed\.mode === 'pixory_native_markdown' \? 'not_required' : 'pending_review'/);
  assert.match(service, /createContinuityImportSession/);
  assert.match(service, /createContinuityImportBlocks/);
});

test('continuity import creates a synthetic branch root and activates the imported route', () => {
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const service = read('src/ai/aiContinuityImportService.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(repository, /createSyntheticContinuityImportRoot/);
  assert.match(repository, /continuitySyntheticKind:\s*input\.continuitySyntheticKind/);
  assert.match(repository, /continuityImportSessionId:\s*input\.continuityImportSessionId/);
  assert.match(service, /createSyntheticContinuityImportRoot/);
  assert.match(service, /branchRootMessageId:\s*importRoot\.id/);
  assert.match(service, /branchVersionIndex:\s*1/);
  assert.match(repository, /listThreadContinuityMilestones/);
  assert.match(chatService, /export async function importThreadContinuity/);
});

test('external imported messages are reviewed, gated, and only become accepted after review result persistence', () => {
  const review = read('src/ai/aiContinuityImportReviewService.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const summary = read('src/ai/aiMemorySummaryService.ts');
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const reconciliation = read('src/ai/aiMemoryReconciliationService.ts');

  assert.match(review, /export async function reviewContinuityImportSession/);
  assert.match(review, /rawDocumentText/);
  assert.match(review, /parsedMessages/);
  assert.match(review, /continuityBlocks/);
  assert.match(review, /callMemoryMaintenanceModel/);
  assert.match(review, /findThreadById/);
  assert.match(repository, /listContinuityImportMessagesBySessionId/);
  assert.match(review, /markContinuityImportReviewAccepted/);
  assert.match(review, /markContinuityImportReviewFailed/);
  assert.match(review, /createReversibleContinuitySummarySegment/);
  assert.match(review, /parseMemoryReconciliationOperations/);
  assert.match(review, /sanitizeMemoryReconciliationOperations/);
  assert.match(review, /createMemory\(/);
  assert.match(review, /updateMemoryByReconciliation/);
  assert.match(review, /markMemoryStaleByReconciliation/);
  assert.match(review, /touchMemoryReconciled/);
  assert.match(review, /parseProfileJson/);
  assert.match(review, /upsertUserProfile/);
  assert.match(review, /withTransactionAsync/);
  assert.match(review, /recordContinuityImportMemoryEffect/);
  assert.match(review, /recordContinuityImportProfileEffect/);
  assert.match(queue, /loadContinuityImportReviewGateState/);
  assert.match(queue, /rollbackState === 'available'/);
  assert.match(queue, /reversibleImportSessionId/);
  assert.match(summary, /reversibleImportSessionId/);
  assert.match(profile, /reversibleImportSessionId/);
  assert.match(reconciliation, /buildMemoryReconciliationPrompt/);
  assert.match(repository, /createReversibleContinuitySummarySegment/);
});

test('external continuity import escalates to memory-model structure recovery when local parsing is insufficient', () => {
  const service = read('src/ai/aiContinuityImportService.ts');
  const maintenanceModel = read('src/ai/aiMemoryMaintenanceModelService.ts');

  assert.match(service, /callMemoryMaintenanceModel/);
  assert.match(service, /recover.*continuity.*structure|structure.*recovery|恢复结构/si);
  assert.match(service, /local parsing is insufficient|recoverable transcript|零条消息|residue|partial/i);
  assert.match(service, /messages/);
  assert.match(service, /blocks/);
  assert.match(service, /sourcePlatform/);
  assert.match(service, /containsCompressedContinuity/);
  assert.match(service, /confidence/);
  assert.match(service, /warnings/);
  assert.match(service, /role !== 'user' && role !== 'assistant' && role !== 'system'/);
  assert.match(maintenanceModel, /export async function callMemoryMaintenanceModel/);
});

test('continuity review reads explicit target fan-out fields before fallback parsing the whole review text', () => {
  const review = read('src/ai/aiContinuityImportReviewService.ts');

  assert.match(review, /profilePatch/);
  assert.match(review, /memoryOperations/);
  assert.match(review, /summaryArtifacts/);
  assert.match(review, /rejectedItems/);
  assert.match(review, /warnings/);
  assert.match(review, /recordContinuityImportMemoryEffect/);
  assert.match(review, /recordContinuityImportProfileEffect/);
  assert.match(review, /createReversibleContinuitySummarySegment/);
});

test('continuity rollback stays available for 10 effective rounds and preserves audit payload', () => {
  const service = read('src/ai/aiContinuityImportService.ts');
  const chatService = read('src/ai/aiChatService.ts');
  const chatScreen = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(service, /rollbackRoundsRemaining/);
  assert.match(service, /if \(rollbackRoundsRemaining <= 0\)/);
  assert.match(service, /rolledBackAt/);
  assert.match(service, /setContinuityImportRollbackState/);
  assert.match(repository, /excludeRolledBackContinuityPayload/);
  assert.match(repository, /reviewGateState:\s*'rolled_back'/);
  assert.doesNotMatch(repository, /reviewGateState:\s*'stabilized'/);
  assert.match(chatService, /onContinuityImportConversationRoundCompleted/);
  assert.match(chatService, /assistantMessageId/);
  assert.match(chatScreen, /const reloadContinuityMilestones = useCallback/);
  assert.match(chatScreen, /void reloadContinuityMilestones\(targetThreadId\)/);
});

test('session config exposes continuity import and feature matrix records the capability', () => {
  const session = read('src/screens/AiSessionConfigScreen.tsx');
  const chat = read('src/screens/AiChatScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const matrix = read('docs/feature-matrix.md');

  assert.match(session, /导入外部记忆/);
  assert.match(session, /导入角色卡/);
  assert.match(session, /DocumentPicker\.getDocumentAsync/);
  assert.match(session, /importThreadContinuity/);
  assert.match(session, /buildExternalContinuityPrompt/);
  assert.match(session, /Clipboard\.setStringAsync/);
  assert.match(session, /复制迁移提示词/);
  assert.match(session, /暂未安全恢复出可渲染聊天消息/);
  assert.match(session, /importResult\.partial/);
  assert.match(session, /部分接回/);
  assert.match(repository, /listThreadContinuityMilestones/);
  assert.match(chat, /continuityInlineNotice/);
  assert.match(chat, /查看详情/);
  assert.match(chat, /还可回退：剩余/);
  assert.match(chat, /回退接回分支/);
  assert.match(chat, /sourcePlatform/);
  assert.match(chat, /parsedMessageCount/);
  assert.match(chat, /containsCompressedContinuity/);
  assert.match(chat, /reviewGateState/);
  assert.match(chat, /latestVisibleBranchRootMessageId/);
  const continuityNoticeStyle = /continuityInlineNotice:\s*\{[\s\S]*?\n  \},\n  continuityInlineNoticeMain:/.exec(chat)?.[0] ?? '';
  assert.doesNotMatch(continuityNoticeStyle, /backgroundColor/);
  assert.doesNotMatch(continuityNoticeStyle, /border(Color|Width)/);
  assert.doesNotMatch(chat, /较早的部分对话可能不会被本次回复参考/);
  assert.doesNotMatch(chat, /已稳定接入，不能回退/);
  assert.match(matrix, /连续性导入|外部对话接回|原生连续性导入/);
});

test('session settings role-card import is a direct import-and-apply flow for the current thread instead of a library detour', () => {
  const app = read('App.tsx');
  const session = read('src/screens/AiSessionConfigScreen.tsx');
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');

  assert.match(session, /导入角色卡/);
  assert.match(app, /onOpenRoleCardEditor=\{\(\) => pushRoute\(\{ name: 'ai-role-card-editor'/);
  assert.doesNotMatch(app, /onOpenRoleCardEditor=\{\(\) => pushRoute\(\{ name: 'ai-role-library'.*mode: 'apply_to_thread'/);
  assert.match(editor, /threadId/);
  assert.match(editor, /await applyRoleCard\(card\.id\)/);
});

test('memory maintenance status separates import protection from ordinary pending rounds', () => {
  const session = read('src/screens/AiSessionConfigScreen.tsx');
  const board = read('src/screens/AiMemoryBoardScreen.tsx');
  const service = read('src/ai/aiMemoryService.ts');

  assert.match(service, /protectedImportRoundCount/);
  assert.match(service, /ordinaryUncompressedRoundCount/);
  assert.match(session, /导入保护/);
  assert.match(board, /导入保护/);
});

test('continuity import binds imported branch roots and scopes review gates to the active branch', () => {
  const service = read('src/ai/aiContinuityImportService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');

  assert.match(service, /importedBranchRootMessageId:\s*importRoot\.id/);
  assert.match(service, /importAnchorMessageId:\s*importAnchor\?\.id \?\? null/);
  assert.match(service, /listMessagesBase\(db, input\.threadId, 1, branchScopes\)/);
  assert.match(repository, /resolveContinuityImportSessionIdForBranchScopes/);
  assert.match(repository, /branchScopes\?: AiBranchScope\[\]/);
  assert.match(repository, /importedBranchRootMessageId = \?/);
  assert.match(queue, /resolveContinuityImportSessionIdForBranchScopes/);
  assert.match(queue, /loadContinuityImportReviewGateState\(db, input\.threadId, branchScopes\)/);
});

test('reversible continuity maintenance persists real import-session attribution and review cannot override rolled back state', () => {
  const schema = read('src/database/schema.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const review = read('src/ai/aiContinuityImportReviewService.ts');
  const service = read('src/ai/aiContinuityImportService.ts');
  const summary = read('src/ai/aiMemorySummaryService.ts');

  assert.match(schema, /DATABASE_VERSION = 45/);
  assert.match(schema, /ALTER TABLE ai_thread_summary_segments ADD COLUMN continuityImportSessionId TEXT/);
  assert.match(schema, /export const MIGRATION_STATEMENTS_V45 = `/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS ai_continuity_import_effects/);
  assert.match(repository, /export interface AiContinuityImportEffectRecord/);
  assert.match(repository, /continuityImportSessionId: string \| null/);
  assert.match(repository, /createReversibleContinuitySummarySegment/);
  assert.match(repository, /recordContinuityImportMemoryEffect/);
  assert.match(repository, /recordContinuityImportProfileEffect/);
  assert.match(repository, /rollbackContinuityImportAcceptedEffects/);
  assert.match(repository, /continuityImportSessionId \?\? null/);
  assert.match(summary, /continuityImportSessionId:\s*options\.reversibleImportSessionId/);
  assert.match(repository, /WHERE id = \? AND reviewGateState <> 'rolled_back'/);
  assert.match(review, /if \(latestSession\.rollbackState === 'rolled_back' \|\| latestSession\.reviewGateState === 'rolled_back'\)/);
  assert.match(service, /rollbackContinuityImportAcceptedEffects/);
});

test('pending-review continuity imports avoid irreversible profile or memory writes and rolled-back summary artifacts stay hidden', () => {
  const capture = read('src/ai/aiMemoryCaptureService.ts');
  const profile = read('src/ai/aiMemoryProfileService.ts');
  const queue = read('src/ai/aiMemoryMaintenanceQueue.ts');
  const summary = read('src/ai/aiMemorySummaryService.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(capture, /allowIrreversibleImportEffects === false/);
  assert.match(capture, /return emptyMaintenanceStepResult\(\)/);
  assert.match(profile, /allowIrreversibleImportEffects === false/);
  assert.match(summary, /if \(options\.allowIrreversibleImportEffects === false\)/);
  assert.match(queue, /allowIrreversibleImportEffects === false && !importAwareContext\.reversibleImportSessionId/);
  assert.match(repository, /excludeRolledBackContinuityPayload\('ai_thread_summary_segments'\)/);
});

test('stabilization and review acceptance stay separate so failed external imports cannot become fake-approved after 10 rounds', () => {
  const types = read('src/ai/aiContinuityImportTypes.ts');
  const repository = read('src/database/repositories/aiThreadRepository.ts');
  const chat = read('src/screens/AiChatScreen.tsx');

  assert.doesNotMatch(types, /\|\s*'stabilized'/);
  assert.match(repository, /rollbackState:\s*'locked'/);
  assert.doesNotMatch(repository, /reviewGateState:\s*'stabilized'/);
  assert.doesNotMatch(chat, /reviewGateState === 'stabilized'/);
});
