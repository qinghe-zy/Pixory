const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadTsModule(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireModule = (id) => {
    if (id in mocks) return mocks[id];
    if (id === 'pinyin-match') {
      const matcher = {
        match: (target, keyword) => String(target).toLowerCase().includes(String(keyword).toLowerCase()),
      };
      return { __esModule: true, default: matcher, ...matcher };
    }
    const resolved = path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`));
    return loadTsModule(resolved, mocks);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: requireModule, Date, Set, Map }, { filename });
  return module.exports;
}

const catalogMod = loadTsModule('src/services/searchActionCatalog.ts');
const searchServiceMod = loadTsModule('src/services/searchActionService.ts');
const registryMod = loadTsModule('src/ai/systemAssistant/systemAssistantRegistry.ts');
const promptMod = loadTsModule('src/ai/systemAssistant.ts');
const { SystemAssistantProtocol } = loadTsModule('src/ai/systemAssistant/systemAssistantProtocol.ts');
const { recoverSystemAssistantActionFromIntent } = loadTsModule('src/ai/systemAssistant/systemAssistantTaskIngestion.ts', {
  '../../database': {},
  './systemAssistantExecutor': { listSystemAssistantIps: async () => [], validateSystemAssistantIp: async () => ({}) },
  './systemAssistantPersistence': { loadSystemTask: async () => null, saveSystemTask: async () => {} },
  './systemAssistantEvents': { publishSystemTask: () => {} },
  './systemAssistantRuntime': { withSystemTaskStep: (t) => t },
  './systemAssistantRoleCreation': {},
});

test('every entry in SEARCHABLE_FEATURE_CATALOG automatically syncs to Global Search and System Assistant', () => {
  const { SEARCHABLE_FEATURE_CATALOG } = catalogMod;
  const { GLOBAL_ACTIONS, searchActions } = searchServiceMod;
  const { SYSTEM_ASSISTANT_ROUTES, SYSTEM_ASSISTANT_ROUTE_ALIASES } = registryMod;
  const promptText = promptMod.buildSystemAssistantPrompt([]);

  const ids = new Set();
  const routes = new Set();

  for (const entry of SEARCHABLE_FEATURE_CATALOG) {
    assert.equal(ids.has(entry.id), false, `Duplicate feature id: ${entry.id}`);
    ids.add(entry.id);
    assert.equal(routes.has(entry.route), false, `Duplicate feature route: ${entry.route}`);
    routes.add(entry.route);

    // 1. Global Search sync check
    if (entry.enableInGlobalSearch !== false) {
      const globalItem = GLOBAL_ACTIONS.find((a) => a.id === entry.id);
      assert.ok(globalItem, `Missing ${entry.id} (${entry.title}) in GLOBAL_ACTIONS`);
      assert.equal(globalItem.route, entry.route);
      assert.ok(
        searchActions(entry.title).some((a) => a.id === entry.id),
        `searchActions("${entry.title}") should match ${entry.id}`
      );
      if (entry.aliases.length > 0) {
        assert.ok(
          searchActions(entry.aliases[0]).some((a) => a.id === entry.id),
          `searchActions("${entry.aliases[0]}") should match ${entry.id}`
        );
      }
    } else {
      assert.equal(
        GLOBAL_ACTIONS.some((a) => a.id === entry.id),
        false,
        `${entry.id} has enableInGlobalSearch: false and must not appear in GLOBAL_ACTIONS`
      );
    }

    // 2. System Assistant route whitelist, alias, XML protocol, prompt, and intent recovery check
    if (entry.systemAssistant?.enabled !== false) {
      assert.ok(
        Object.hasOwn(SYSTEM_ASSISTANT_ROUTES, entry.route),
        `Missing route "${entry.route}" in SYSTEM_ASSISTANT_ROUTES`
      );
      assert.equal(SYSTEM_ASSISTANT_ROUTE_ALIASES[entry.route], entry.route);
      assert.equal(SYSTEM_ASSISTANT_ROUTE_ALIASES[entry.route.replace(/-/g, '_')], entry.route);

      for (const alias of entry.systemAssistant?.routeAliases ?? []) {
        assert.equal(SYSTEM_ASSISTANT_ROUTE_ALIASES[alias], entry.route, `Alias ${alias} should resolve to ${entry.route}`);
      }

      const parser = new SystemAssistantProtocol();
      parser.push(`好的\n<system_action type="navigate" route="${entry.route}" />`);
      parser.finish();
      assert.equal(parser.invalid, false, `Protocol rejected valid route ${entry.route}`);
      assert.equal(parser.actions[0]?.route, entry.route);

      if (entry.systemAssistant?.autoPrompt !== false) {
        assert.match(
          promptText,
          new RegExp(`route="${entry.route}"`),
          `System assistant prompt is missing <system_action type="navigate" route="${entry.route}" />`
        );
      }
    } else {
      assert.equal(
        Object.hasOwn(SYSTEM_ASSISTANT_ROUTES, entry.route),
        false,
        `Disabled system assistant route ${entry.route} should not be in SYSTEM_ASSISTANT_ROUTES`
      );
    }
  }
});

test('new settings entries (性能设置, 外观设置, 密码与安全, 更多设置) work in both Global Search and System Assistant', () => {
  const { searchActions } = searchServiceMod;

  // Global search keyword & alias checks
  assert.ok(searchActions('性能设置').some((a) => a.route === 'performance-settings'));
  assert.ok(searchActions('流式输出').some((a) => a.route === 'performance-settings'));
  assert.ok(searchActions('打字机').some((a) => a.route === 'performance-settings'));
  assert.ok(searchActions('外观设置').some((a) => a.route === 'appearance-settings'));
  assert.ok(searchActions('推挤缩放').some((a) => a.route === 'appearance-settings'));
  assert.ok(searchActions('侧边栏').some((a) => a.route === 'appearance-settings'));
  assert.ok(searchActions('密码与安全').some((a) => a.route === 'password-security-settings'));
  assert.ok(searchActions('更多设置').some((a) => a.route === 'advanced-settings'));
  assert.ok(searchActions('数字身份').some((a) => a.route === 'advanced-settings'));
  assert.ok(searchActions('聊天视觉').some((a) => a.route === 'chat-appearance-settings'));
  assert.ok(searchActions('微信绿').some((a) => a.route === 'chat-appearance-settings'));
  assert.ok(searchActions('字距').some((a) => a.route === 'chat-appearance-settings'));
  assert.ok(searchActions('个人信息').some((a) => a.route === 'profile-info-settings'));
  assert.ok(searchActions('修改昵称').some((a) => a.route === 'profile-info-settings'));

  // System assistant intent recovery checks (specific settings must not be swallowed by generic 'settings')
  assert.equal(recoverSystemAssistantActionFromIntent('打开性能设置', '好的，为您打开性能设置。')?.route, 'performance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('调整流式输出打字机模式', '好的。')?.route, 'performance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('性能设置', '好的。')?.route, 'performance-settings');

  assert.equal(recoverSystemAssistantActionFromIntent('打开外观设置', '好的，为您打开外观设置。')?.route, 'appearance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('切换AI侧边栏样式', '好的。')?.route, 'appearance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('外观设置', '好的。')?.route, 'appearance-settings');

  assert.equal(recoverSystemAssistantActionFromIntent('修改气泡颜色为微信绿', '好的。')?.route, 'chat-appearance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('调整聊天字号和行距', '好的。')?.route, 'chat-appearance-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('聊天视觉', '好的。')?.route, 'chat-appearance-settings');

  assert.equal(recoverSystemAssistantActionFromIntent('修改个人信息', '好的。')?.route, 'profile-info-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('更换头像', '好的。')?.route, 'profile-info-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('个人信息', '好的。')?.route, 'profile-info-settings');

  assert.equal(recoverSystemAssistantActionFromIntent('打开密码与安全', '好的。')?.route, 'password-security-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('修改隐私密码', '好的。')?.route, 'password-security-settings');

  assert.equal(recoverSystemAssistantActionFromIntent('打开更多设置', '好的。')?.route, 'advanced-settings');
  assert.equal(recoverSystemAssistantActionFromIntent('导出数字身份凭证', '好的。')?.route, 'advanced-settings');

  // Generic settings still routes to 'settings'
  assert.equal(recoverSystemAssistantActionFromIntent('打开系统设置', '好的。')?.route, 'settings');
  assert.equal(recoverSystemAssistantActionFromIntent('打开设置', '好的。')?.route, 'settings');
});

test('SettingsScreen user-facing rows and App.tsx routes stay aligned with SEARCHABLE_FEATURE_CATALOG', () => {
  const { SEARCHABLE_FEATURE_CATALOG } = catalogMod;
  const appCode = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
  const settingsCode = fs.readFileSync(path.resolve(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');

  const specialNonAppRoutes = new Set(['lock-personal-space', 'system-assistant-toggle']);
  for (const entry of SEARCHABLE_FEATURE_CATALOG) {
    if (specialNonAppRoutes.has(entry.route)) continue;
    assert.match(
      appCode,
      new RegExp(`name:\\s*'${entry.route}'`),
      `Route "${entry.route}" in SEARCHABLE_FEATURE_CATALOG is missing from App.tsx AppRoute`
    );
  }

  // Extract non-developer SettingsRow titles from SettingsScreen.tsx before "{developerMode &&"
  const userFacingSettingsSection = settingsCode.split('{developerMode &&')[0];
  const rowTitleMatches = [...userFacingSettingsSection.matchAll(/<SettingsRow[\s\S]*?title="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(rowTitleMatches.length >= 5, 'Should find user-facing SettingsRow entries in SettingsScreen.tsx');

  for (const rowTitle of rowTitleMatches) {
    const matched = SEARCHABLE_FEATURE_CATALOG.some(
      (entry) => entry.title === rowTitle || entry.aliases.includes(rowTitle)
    );
    assert.equal(
      matched,
      true,
      `SettingsScreen row "${rowTitle}" is not registered in SEARCHABLE_FEATURE_CATALOG (title or aliases)`
    );
  }
});
