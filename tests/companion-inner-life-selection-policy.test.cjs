const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const innerLife = fs.readFileSync('src/screens/CompanionInnerLifeScreen.tsx', 'utf8');
const chat = fs.readFileSync('src/screens/AiChatScreen.tsx', 'utf8');
const diaryRepository = fs.readFileSync('src/ai/diary/diaryRepository.ts', 'utf8');
const diaryVersionService = fs.readFileSync('src/ai/diary/diaryVersionService.ts', 'utf8');
const dreamService = fs.readFileSync('src/ai/dream/dreamService.ts', 'utf8');

function functionBody(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('inner life uses one atomic repository call for selected thoughts', () => {
  assert.match(innerLife, /thoughtRepository\.permanentlyDeleteMany\(db, ids\)/);
  assert.doesNotMatch(innerLife, /for \(const id of ids\)[^{]*thoughtRepository\.permanentlyDelete/);
});

test('legacy soft-deleted thoughts retain an explicit restore action', () => {
  assert.match(innerLife, /thought\.status === 'soft_deleted'[\s\S]*thoughtRepository\.restore/);
  assert.match(innerLife, />恢复</);
});

test('inner life display positions are recomputed from surviving versions', () => {
  assert.match(innerLife, /group\.versions\.map\(\(version, versionIndex\)/);
  assert.match(innerLife, /versionIndex \+ 1/);
  assert.doesNotMatch(innerLife, /version\.versionNumber\}\/\{group\.versions\.length/);
  assert.doesNotMatch(innerLife, /dream\.versionNumber\}\/\{group\.versions\.length/);
});

test('dream cards keep the version group anchor and lock duplicate regeneration jobs', () => {
  assert.match(chat, /const anchorDream = versions\.at\(0\) \?\? currentDream/);
  assert.match(chat, /createdAt: anchorDream\.displayAt/);
  assert.match(chat, /sourceMessageIds: anchorDream\.sourceMessageIds/);
  assert.match(chat, /regeneratingDreamGroupIds/);
  assert.match(chat, /targetVersionGroupId/);
  assert.match(chat, /disabled: artifactActionPending[\s\S]*regeneratingDreamGroupIds\.has\(artifactContextMenuState\.groupId\)/);
});

test('failed dream version jobs surface an error without replacing the existing card', () => {
  assert.match(chat, /dreamNotice\?\.type !== 'failed'/);
  assert.match(chat, /dreamRepository\.findJob\(db, dreamNotice\.jobId\)/);
  assert.match(chat, /failedJob\.targetVersionGroupId/);
  assert.match(chat, /梦境重新生成失败/);
});

test('diary version groups avoid concurrent statements on one SQLite connection', () => {
  const body = diaryRepository.slice(
    diaryRepository.indexOf('async listVersionGroupsForRole('),
    diaryRepository.indexOf('async listContextOptInDiaryVersionsForRole('),
  );
  assert.doesNotMatch(body, /Promise\.all/);
  assert.match(body, /JOIN companion_diaries/);
});

test('artifact screens and regeneration services avoid same-connection Promise.all queries', () => {
  assert.doesNotMatch(functionBody(chat, 'const reloadRoleDiaries', 'useEffect(() => subscribeDiaryRuntimeNotices'), /Promise\.all/);
  assert.doesNotMatch(functionBody(chat, 'const reloadRoleDreams', 'const handleDreamJobRetry'), /Promise\.all/);
  assert.doesNotMatch(functionBody(innerLife, 'const load = useCallback', 'useEffect(() => { void load();'), /Promise\.all/);
  assert.doesNotMatch(diaryVersionService, /Promise\.all/);
  assert.doesNotMatch(functionBody(dreamService, 'export async function regenerateDreamVersion', 'export const dreamService'), /Promise\.all/);
});

test('dream notices and initial artifact reloads do not launch overlapping database reads', () => {
  const noticeEffect = functionBody(chat, 'const reloadDreamNotice = async', 'const handleDreamJobRetry');
  assert.doesNotMatch(noticeEffect, /void reloadDreamNotice\(\)[\s\S]*void reloadRoleDreams\(\)/);
  assert.match(noticeEffect, /await reloadDreamNotice\(\)[\s\S]*await reloadRoleDreams\(\)/);
  const initialReload = functionBody(chat, 'if (!thinking && !isInitialMessageLoading)', 'const generateDiaryManually');
  assert.doesNotMatch(initialReload, /void reloadRoleDiaries\(\)[\s\S]*void reloadRoleDreams\(\)/);
  assert.doesNotMatch(initialReload, /reloadRoleDreams/);
});
