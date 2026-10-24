const assert = require('assert');

// 验证 SHORT_LORE_DIRECT_INJECT_LIMIT
const SHORT_LORE_DIRECT_INJECT_LIMIT = 2500;

function shouldInjectToStableRules(fileSize, textLength) {
  return fileSize <= SHORT_LORE_DIRECT_INJECT_LIMIT && textLength <= SHORT_LORE_DIRECT_INJECT_LIMIT && textLength > 0;
}

console.log('Testing docPinService logic...');

// Case 1: 500 字设定符合直接注入稳定区
assert.strictEqual(shouldInjectToStableRules(1200, 500), true);

// Case 2: 超过 2500 字的不直接硬塞稳定区，避免撑爆上下文
assert.strictEqual(shouldInjectToStableRules(15000, 3200), false);

// Case 3: 空文件不注入
assert.strictEqual(shouldInjectToStableRules(0, 0), false);

// Case 4: 规则注入与回滚正则清洗验证
const title = '艾泽拉斯编年史';
const loreTag = `【常驻设定资料：《${title}》】`;
const fullText = '艾泽拉斯是一个充满魔法与奇迹的世界...';

let rulesSnapshot = '你是一个温柔的伴侣。';
// 固化注入
if (!rulesSnapshot.includes(loreTag)) {
  rulesSnapshot = `${rulesSnapshot}\n\n${loreTag}\n${fullText}`;
}
assert.strictEqual(rulesSnapshot.includes(loreTag), true);

// 重复固化防重检查
if (!rulesSnapshot.includes(loreTag)) {
  rulesSnapshot = `${rulesSnapshot}\n\n${loreTag}\n${fullText}`;
}
const countOccurrences = (rulesSnapshot.match(new RegExp(loreTag, 'g')) || []).length;
assert.strictEqual(countOccurrences, 1, '重复固化不应导致规则重复拼接');

// 撤销回滚清理
const escapedTag = loreTag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const lorePattern = new RegExp(`(?:\\r?\\n){0,2}${escapedTag}[\\s\\S]*?(?=(?:\\r?\\n){2}【常驻设定资料：|$)`, 'g');
const cleanedRules = rulesSnapshot.replace(lorePattern, '').trim();
assert.strictEqual(cleanedRules, '你是一个温柔的伴侣。', '撤销后必须完全清除注入规则');

console.log('docPinService tests passed! ✓');
