const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

test('loadTsModule: 能正确加载 TS 模块并支持 mock 依赖', () => {
  const result = loadTsModule(path.resolve(__dirname, '../src/services/sandbox/sandboxDetector.ts'), {
    react: {},
  });
  assert.ok(result.detectStandaloneArtifactCandidate, '导出的 detectStandaloneArtifactCandidate 应存在');
  assert.strictEqual(typeof result.detectStandaloneArtifactCandidate, 'function');
});
