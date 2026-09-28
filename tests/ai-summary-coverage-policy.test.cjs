const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('summary compression records exact route, lineage, source IDs, version hash, quality, and status', () => {
  const service = read('src/ai/aiMemorySummaryService.ts');
  assert.match(service, /summaryPrewarmRoundThreshold/);
  assert.match(service, /thread\.contextHistoryRoundLimit/);
  assert.match(service, /sourceMessageIdsJson:\s*JSON\.stringify/);
  assert.match(service, /branchRouteHash:\s*hashBranchRoute\(options\.branchScopes\)/);
  assert.match(service, /lineageVersion:\s*prepared\.thread\.lineageVersion/);
  assert.match(service, /sourceMessageVersionHash:\s*hashCoverageMessageVersions/);
  assert.match(service, /quality:\s*modelResult\.text \? 'model' : 'local'/);
  assert.match(service, /status:\s*'active'/);
});

test('summary merge preserves the exact union of source message IDs', () => {
  const service = read('src/ai/aiMemorySummaryService.ts');
  assert.match(service, /mergeSourceMessageIds/);
  assert.match(service, /sourceMessageIdsJson:\s*JSON\.stringify\(prepared\.sourceMessageIds\)/);
  assert.match(service, /sourceMessageVersionHash:\s*prepared\.sourceMessageVersionHash/);
  assert.match(service, /quality:\s*modelResult\.text \? 'model' : 'merged'/);
});

test('coverage repair remains local and does not add a pre-send remote call', () => {
  const compiler = read('src/ai/context/conversationCoverageService.ts');
  const pure = read('src/ai/context/conversationCoverage.ts');
  assert.doesNotMatch(compiler + pure, /callMemoryMaintenanceModel|callProvider|fetch\(/);
  assert.match(pure, /buildProvisionalSummary/);
  assert.match(pure, /PROVISIONAL_SUMMARY_CHAR_LIMIT/);
});
