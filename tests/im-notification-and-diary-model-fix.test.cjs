const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(relPath, mocks = {}) {
  const fullPath = path.resolve(__dirname, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (id) => {
    if (mocks[id]) return mocks[id];
    if (id.startsWith('.')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      const finalFile = fs.existsSync(candidate + '.ts')
        ? candidate + '.ts'
        : fs.existsSync(candidate + '.tsx')
          ? candidate + '.tsx'
          : candidate;
      return loadTsModule(finalFile, mocks);
    }
    return require(id);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

test('TC-MODEL-01: getActiveProviderConfig 自动跳过无 Key 的首选，命中首个带 Key 的可用 Provider', async () => {
  const mockProviders = [
    { id: 'deepseek-empty', baseUrl: 'https://api.deepseek.com', protocol: 'openai_compatible', defaultChatModelId: 'deepseek-chat' },
    { id: 'siliconflow-active', baseUrl: 'https://api.siliconflow.cn/v1', protocol: 'openai_compatible', defaultChatModelId: 'deepseek-ai/DeepSeek-V3' },
  ];

  const secureApiKeyModule = loadTsModule('../src/core/llm-transport/secureApiKey.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => {
        if (key.includes('siliconflow-active')) return 'sk-siliconflow-valid-key';
        return null;
      },
    },
    '../../database/index': {
      initDatabase: async () => ({
        getFirstAsync: async () => null,
        getAllAsync: async () => mockProviders,
      }),
    },
    '../../database/repositories/settingsRepository': {
      settingsRepository: {
        getAiPromptCacheSettings: async () => ({ enabled: true, disabledProviderIds: [] }),
        getDefaultAiProviderId: async () => null,
      },
    },
  });

  const config = await secureApiKeyModule.getActiveProviderConfig('normal');
  assert.ok(config, '应当返回有效 Provider 配置');
  assert.equal(config.providerId, 'siliconflow-active', '应当跳过无 Key 的条目并选中 siliconflow-active');
  assert.equal(config.apiKey, 'sk-siliconflow-valid-key');
});

test('TC-MODEL-02: getActiveProviderConfig 优先采用传入的 preferredProviderId', async () => {
  const secureApiKeyModule = loadTsModule('../src/core/llm-transport/secureApiKey.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => {
        if (key.includes('custom-provider')) return 'sk-custom-key';
        return null;
      },
    },
    '../../database/index': {
      initDatabase: async () => ({
        getFirstAsync: async (sql, params) => {
          if (params?.[0] === 'custom-provider') {
            return { id: 'custom-provider', baseUrl: 'https://custom.ai/v1', protocol: 'openai_compatible', defaultChatModelId: 'custom-model' };
          }
          return null;
        },
        getAllAsync: async () => [],
      }),
    },
    '../../database/repositories/settingsRepository': {
      settingsRepository: {
        getAiPromptCacheSettings: async () => ({ enabled: true, disabledProviderIds: [] }),
        getDefaultAiProviderId: async () => null,
      },
    },
  });

  const config = await secureApiKeyModule.getActiveProviderConfig('normal', 'custom-provider', 'custom-model-override');
  assert.ok(config);
  assert.equal(config.providerId, 'custom-provider');
  assert.equal(config.modelId, 'custom-model-override');
  assert.equal(config.apiKey, 'sk-custom-key');
});

test('TC-NOTIF-01: 通知设置默认值与读写能力', async () => {
  const store = {};
  const mockDb = {};

  const { settingsRepository } = loadTsModule('../src/database/repositories/settingsRepository.ts');

  // mock getValue & setValue
  settingsRepository.getValue = async (_db, key) => store[key] ?? null;
  settingsRepository.setValue = async (_db, key, val) => {
    store[key] = val;
  };

  const initial = await settingsRepository.getNotificationSettings(mockDb);
  assert.equal(initial.enabled, true, '默认开启通知');
  assert.equal(initial.showContent, true, '默认开启正文');
  assert.equal(initial.showAvatar, true, '默认开启头像');
  assert.equal(initial.dndEnabled, false, '默认未激活夜间勿扰');

  await settingsRepository.saveNotificationSettings(mockDb, {
    showContent: false,
    showAvatar: false,
    dndEnabled: true,
  });

  const updated = await settingsRepository.getNotificationSettings(mockDb);
  assert.equal(updated.showContent, false);
  assert.equal(updated.showAvatar, false);
  assert.equal(updated.dndEnabled, true);
});

test('TC-NOTIF-02: postCompanionNotificationSafely 遵守防偷窥脱敏与夜间勿扰', async () => {
  let postedNotif = null;
  let mockSettings = {
    enabled: true,
    showContent: false,
    showAvatar: false,
    dndEnabled: false,
    dndStart: '23:00',
    dndEnd: '08:00',
    vibrationEnabled: true,
  };

  const notifManager = loadTsModule('../src/im/services/imNotificationManager.ts', {
    'react-native': {
      Platform: { OS: 'android', Version: 33 },
      PermissionsAndroid: { check: async () => true, request: async () => true, RESULTS: { GRANTED: 'granted' } },
      Linking: { openSettings: () => {} },
    },
    '../../native/pixoryMediaModule': {
      scheduleDiaryAlarm: async () => 'exact',
      cancelDiaryAlarm: async () => true,
      postCompanionNotification: async (threadId, title, content) => {
        postedNotif = { threadId, title, content };
        return true;
      },
      cancelCompanionNotification: async () => true,
    },
    '../../database/index': {
      initDatabase: async () => ({}),
    },
    '../../database/repositories/settingsRepository': {
      settingsRepository: {
        getNotificationSettings: async () => mockSettings,
      },
    },
    '../utils/formatImPreviewText': {
      formatImPreviewText: (c) => c,
    },
  });

  // 1. 防偷窥脱敏测试
  const res1 = await notifManager.postCompanionNotificationSafely('normal', 'th_123', '林浅浅', '亲爱的晚上记得吃饭');
  assert.equal(res1, true);
  assert.equal(postedNotif.title, '新消息', '隐藏角色名字时统一显示新消息');
  assert.equal(postedNotif.content, '你收到了一条新消息', '隐藏正文时统一脱敏');

  // 2. 私密空间严格禁止发通知测试
  const resPrivate = await notifManager.postCompanionNotificationSafely('personal', 'th_priv', '伴侣', '私密消息');
  assert.equal(resPrivate, false, '私密空间必须静默');

  // 3. 通知总开关禁用测试
  mockSettings.enabled = false;
  const resDisabled = await notifManager.postCompanionNotificationSafely('normal', 'th_123', '伴侣', '消息');
  assert.equal(resDisabled, false, '通知关闭时必须抑制');
});
