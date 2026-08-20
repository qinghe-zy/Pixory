const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('media database benchmark deterministically seeds 100k rows and reports cursor plans', () => {
  const packageJson = JSON.parse(read('package.json'));
  const benchmark = read('scripts/benchmark-media-database-performance.cjs');

  assert.equal(packageJson.scripts['bench:media-db'], 'node scripts/benchmark-media-database-performance.cjs');
  assert.match(benchmark, /MEDIA_ROW_COUNT = 100_000/);
  assert.match(benchmark, /createdCursorPage/);
  assert.match(benchmark, /recentCursorPage/);
  assert.match(benchmark, /videoCursorPage/);
  assert.match(benchmark, /EXPLAIN QUERY PLAN/);
  assert.match(benchmark, /idx_image_assets_ip_media_live_created/);
  assert.match(benchmark, /idx_image_assets_media_live_viewed/);
  assert.doesNotMatch(benchmark, /Math\.random/);
});
