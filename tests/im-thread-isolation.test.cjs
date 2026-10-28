const test = require('node:test');
const assert = require('node:assert/strict');

test('TC-ISO-01: 长聊天历史侧边栏严格排除 chat_mode = im 的短聊天会话', () => {
  // 模拟长聊天数据库中的会话列表
  const allThreads = [
    { id: 't1', title: '长聊天项目讨论', chat_mode: 'standard', space: 'normal', archivedAt: null },
    { id: 't2', title: '旧长聊天未设chat_mode', chat_mode: null, space: 'normal', archivedAt: null },
    { id: 'im_th_1', title: '小花 (伴侣短聊)', chat_mode: 'im', space: 'normal', archivedAt: null },
    { id: 'im_th_2', title: '阿明 (伴侣短聊)', chat_mode: 'im', space: 'normal', archivedAt: null },
  ];

  // 模拟 SQL 过滤条件: WHERE (chat_mode IS NULL OR chat_mode != 'im')
  const longChatSidebarThreads = allThreads.filter(
    (t) => t.archivedAt === null && (t.chat_mode === null || t.chat_mode !== 'im')
  );

  assert.equal(longChatSidebarThreads.length, 2);
  assert.equal(longChatSidebarThreads[0].id, 't1');
  assert.equal(longChatSidebarThreads[1].id, 't2');
  assert.ok(!longChatSidebarThreads.some((t) => t.chat_mode === 'im'));
});

test('TC-KEY-01: SecureStore 密钥解析兼容 Pixory 官方点分格式与下划线格式', async () => {
  const mockSecureStore = {
    'pixory.ai.provider.normal.deepseek.apiKey': 'sk-test-deepseek-key-12345',
  };

  async function mockReadApiKey(space, providerId) {
    const candidateKeys = [
      `pixory.ai.provider.${space}.${providerId}.apiKey`,
      `pixory.ai.provider.${providerId}.apiKey`,
      `pixory_ai_provider_key_${space}_${providerId}`,
      `pixory_ai_provider_key_${providerId}`,
    ];
    for (const k of candidateKeys) {
      const val = mockSecureStore[k];
      if (val && val.trim()) return val.trim();
    }
    return null;
  }

  const key = await mockReadApiKey('normal', 'deepseek');
  assert.equal(key, 'sk-test-deepseek-key-12345');

  // 未配置任何 key 时返回 null
  const missingKey = await mockReadApiKey('normal', 'non-existent-provider');
  assert.equal(missingKey, null);
});
