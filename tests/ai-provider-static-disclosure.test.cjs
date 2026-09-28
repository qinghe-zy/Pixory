const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/AiProviderSettingsScreen.tsx'),
  'utf8'
);

test('provider settings add only the requested static data-processing statements', () => {
  for (const statement of [
    'API Key 保存在受保护的本地存储中。',
    '对话请求会发送给你选择的模型服务商。',
    '“测试成功”只代表本次验证通过，不是模型永久可用保证。',
  ]) {
    assert.match(source, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /styles\.providerDisclosure/);
});
