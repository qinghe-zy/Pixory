const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const oldLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );

const { AI_CHAT_GUIDE_SEEN_KEY, AI_SIDEBAR_STYLE_MODE_KEY, AI_SIDEBAR_SPATIAL_PRESET_KEY } = require(path.join(
  root,
  'src/database/repositories/settingsRepository.ts',
));
const settingsRepo = require(path.join(
  root,
  'src/database/repositories/settingsRepository.ts',
)).default;

if (oldLoader) require.extensions['.ts'] = oldLoader;
else delete require.extensions['.ts'];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('settingsRepository supports AI sidebar style mode persistence with push_scale default', async () => {
  const store = new Map();
  const mockDb = {
    getFirstAsync: async (_query, ...args) => {
      const key = Array.isArray(args[0]) ? args[0][0] : args[0];
      const val = store.get(key);
      return val !== undefined ? { value: val } : null;
    },
    runAsync: async (_query, ...args) => {
      const [key, val] = Array.isArray(args[0]) ? args[0] : args;
      store.set(key, val);
    },
  };

  // 1. Defaults to push_scale
  const defaultMode = await settingsRepo.getAiSidebarStyleMode(mockDb);
  assert.equal(defaultMode, 'push_scale');

  // 2. Persists classic mode
  await settingsRepo.setAiSidebarStyleMode(mockDb, 'classic');
  const savedClassic = await settingsRepo.getAiSidebarStyleMode(mockDb);
  assert.equal(savedClassic, 'classic');
  assert.equal(store.get(AI_SIDEBAR_STYLE_MODE_KEY), 'classic');

  // 3. Switch back to push_scale
  await settingsRepo.setAiSidebarStyleMode(mockDb, 'push_scale');
  const restoredMode = await settingsRepo.getAiSidebarStyleMode(mockDb);
  assert.equal(restoredMode, 'push_scale');

  // 4. Malformed / unknown value safely falls back to push_scale
  store.set(AI_SIDEBAR_STYLE_MODE_KEY, 'unknown_style_mode');
  const safeFallback = await settingsRepo.getAiSidebarStyleMode(mockDb);
  assert.equal(safeFallback, 'push_scale');

  // 5. Legacy aiChatGuideSeen = 'true' is temporarily reset so existing users see the push_scale guide
  store.set(AI_CHAT_GUIDE_SEEN_KEY, 'true');
  assert.equal(await settingsRepo.getAiChatGuideSeen(mockDb), false);
  await settingsRepo.setAiChatGuideSeen(mockDb, true);
  assert.equal(await settingsRepo.getAiChatGuideSeen(mockDb), true);

  // 6. Supports 5 spatial presets with level_2 as recommended default
  const defaultPreset = await settingsRepo.getAiSidebarSpatialPreset(mockDb);
  assert.equal(defaultPreset, 'level_2');
  await settingsRepo.setAiSidebarSpatialPreset(mockDb, 'level_1');
  assert.equal(await settingsRepo.getAiSidebarSpatialPreset(mockDb), 'level_1');
  await settingsRepo.setAiSidebarSpatialPreset(mockDb, 'level_5');
  assert.equal(await settingsRepo.getAiSidebarSpatialPreset(mockDb), 'level_5');
  store.set(AI_SIDEBAR_SPATIAL_PRESET_KEY, 'invalid_preset');
  assert.equal(await settingsRepo.getAiSidebarSpatialPreset(mockDb), 'level_2');
});

test('SettingsScreen places 外观设置 directly below 性能设置 and AppearanceSettingsScreen switches sidebar styles', () => {
  const settingsCode = read('src/screens/SettingsScreen.tsx');
  const appearanceCode = read('src/screens/AppearanceSettingsScreen.tsx');
  const appCode = read('App.tsx');

  const perfIdx = settingsCode.indexOf('title="性能设置"');
  const appearanceIdx = settingsCode.indexOf('title="外观设置"');
  assert.ok(perfIdx > 0, 'SettingsScreen must contain 性能设置 row');
  assert.ok(appearanceIdx > perfIdx, '外观设置 row must be placed below 性能设置 row');

  assert.match(appearanceCode, /AI侧边栏样式切换/);
  assert.match(appearanceCode, /accessibilityLabel="推挤缩放式侧边栏"/);
  assert.match(appearanceCode, /accessibilityLabel="经典覆盖式侧边栏"/);
  assert.match(appearanceCode, /useAiSidebarStylePreference/);
  assert.match(appearanceCode, /空间透视角度（五档调节）/);
  assert.match(appearanceCode, /useAiSidebarSpatialPresetPreference/);
  assert.match(appearanceCode, /PREVIEW_OPEN_HOLD_MS = 2600/);
  assert.match(appearanceCode, /AI_SIDEBAR_SPATIAL_PRESET_LIST/);

  assert.match(appCode, /name:\s*'appearance-settings'/);
  assert.match(appCode, /<AppearanceSettingsScreen/);
});

test('AiPushScaleDrawerStage enforces Push & Scale Drawer visual and spatial hierarchy contracts', () => {
  const stageCode = read('src/components/ai/AiPushScaleDrawerStage.tsx');

  // 1. Target scale 0.90, borderRadius 28, shadowOffset -8, shadowOpacity 0.18, shadowRadius 24, satin fog mask 0.54, micro optical lift -4, perspective 1300, tilt 2.6°
  assert.match(stageCode, /PUSH_SCALE_TARGET_SCALE\s*=\s*0\.9/);
  assert.match(stageCode, /PUSH_SCALE_TARGET_BORDER_RADIUS\s*=\s*28/);
  assert.match(stageCode, /PUSH_SCALE_WHITE_MASK_MAX_OPACITY\s*=\s*0\.(?:4|54)/);
  assert.match(stageCode, /PUSH_SCALE_OPTICAL_LIFT_Y\s*=\s*-4/);
  assert.match(stageCode, /PUSH_SCALE_PERSPECTIVE\s*=\s*1300/);
  assert.match(stageCode, /PUSH_SCALE_TILT_DEG\s*=\s*2\.6/);
  assert.match(stageCode, /PUSH_SCALE_SHADOW_MAX_OPACITY\s*=\s*0\.(?:06|18)/);
  assert.match(stageCode, /PUSH_SCALE_SHADOW_RADIUS\s*=\s*(?:16|24)/);
  assert.match(stageCode, /PUSH_SCALE_SHADOW_OFFSET_X\s*=\s*-(?:6|8)/);
  assert.match(stageCode, /PUSH_SCALE_CARD_BREATHING_GAP\s*=\s*0/);

  // 2. Geometry contracts: scale compensation, 0.82 drawer width ratio, and seamless translation
  assert.match(stageCode, /SCALE_INSET_COMPENSATION\s*=\s*SCREEN_WIDTH\s*\*\s*\(\(1\s*-\s*SCALE_TARGET\)\s*\/\s*2\)/);
  assert.match(stageCode, /LEFT_PUSH_TRANSLATE_X\s*=\s*LEFT_DRAWER_WIDTH\s*-\s*SCALE_INSET_COMPENSATION/);
  assert.match(stageCode, /RIGHT_PUSH_TRANSLATE_X\s*=\s*RIGHT_DRAWER_WIDTH\s*-\s*SCALE_INSET_COMPENSATION/);

  // 3. Z-axis hierarchy & underlay canvas
  assert.match(stageCode, /underlayCanvas:\s*\{[\s\S]*?zIndex:\s*1/);
  assert.match(stageCode, /mainCardShadowWrapper:\s*\{[\s\S]*?zIndex:\s*2/);
  assert.match(stageCode, /underlayCanvas:\s*\{[\s\S]*?backgroundColor:\s*aiLightColors\.underlayCanvas/);

  // 4. Dual-layer card: outer shadow wrapper has translateX first, pure 2D GPU fast-path, and instant 5% rounded corner lock
  assert.match(stageCode, /transform:\s*\[\s*\{\s*translateX\s*\}/);
  assert.match(stageCode, /\[0,\s*0\.05,\s*1\]/);
  assert.match(stageCode, /dragStartDxRef/);

  // 5. Inner clip wrapper uses overflow: 'hidden' and borderWidth: 0 (no inner black ring)
  assert.match(stageCode, /mainCardClipWrapper:\s*\{[\s\S]*?overflow:\s*'hidden'/);
  assert.match(stageCode, /borderWidth:\s*0/);
  assert.match(stageCode, /whiteDimMask:\s*\{[\s\S]*?backgroundColor:\s*'#FFFFFF'/);

  // 6. Mutual exclusion & parallax
  assert.match(stageCode, /if\s*\(p\s*<=\s*0\.005\)\s*\{[\s\S]*?opacity:\s*0/);
  assert.match(stageCode, /if\s*\(p\s*>=\s*-0\.005\)\s*\{[\s\S]*?opacity:\s*0/);
});

test('AiChatScreen and both drawers preserve classic mode isolation while supporting push_scale', () => {
  const chatCode = read('src/screens/AiChatScreen.tsx');
  const leftDrawerCode = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');
  const rightDrawerCode = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(chatCode, /useAiSidebarStylePreference/);
  assert.match(chatCode, /<AiPushScaleDrawerStage/);
  assert.match(chatCode, /presentationMode=\{sidebarStyleMode\}/);
  assert.match(chatCode, /spatialPreset=\{sidebarSpatialPreset\}/);

  // When switching threads or opening a new chat in push_scale mode, the drawer stays open
  assert.match(chatCode, /if \(!isPushScaleSidebar\) \{\s*setRecordDrawerVisible\(false\);\s*\}\s*handleNewChatPress\(\);/);
  assert.match(chatCode, /if \(!isPushScaleSidebar\) \{\s*setRecordDrawerVisible\(false\);\s*\}\s*onOpenThread\(thread\);/);

  // Left and right drawers keep classic scrim only when !isPushScale (No Scrim in push_scale mode)
  assert.match(leftDrawerCode, /presentationMode\?:\s*'classic'\s*\|\s*'push_scale'/);
  assert.match(leftDrawerCode, /!isPushScale\s*\?\s*\(/);
  assert.match(rightDrawerCode, /presentationMode\?:\s*'classic'\s*\|\s*'push_scale'/);
  assert.match(rightDrawerCode, /!isPushScale\s*\?\s*\(/);

  // Right drawer in push_scale mode must be right-aligned with elevation: 0
  assert.match(rightDrawerCode, /drawerOverlayPushScale:[\s\S]*?right:\s*0/);
  assert.match(rightDrawerCode, /drawerContainerPushScale:[\s\S]*?elevation:\s*0/);
});

test('New user onboarding guide (AiChatGuideOverlay) adapts highlight measurement and bubble bounds for push_scale mode', () => {
  const guideCode = read('src/components/ai/AiChatGuideOverlay.tsx');
  const leftDrawerCode = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');
  const chatCode = read('src/screens/AiChatScreen.tsx');

  // 1. Left drawer waits for parallax spring settlement and provides static layout fallback without rejecting (ox === 0 && oy === 0)
  assert.match(leftDrawerCode, /reportFallbackLayoutIfNeeded/);
  assert.match(leftDrawerCode, /springStillMoving/);
  assert.doesNotMatch(leftDrawerCode, /ox\s*===\s*0\s*&&\s*oy\s*===\s*0/);

  // 2. Guide bubble aligns with highlighted button right edge on Step 2 and stays inside active drawer bounds on Steps 1 & 3
  assert.match(guideCode, /alignedRight\s*=\s*SCREEN_WIDTH\s*-\s*\(x\s*\+\s*width\s*\+\s*HIGHLIGHT_PADDING\)/);
  assert.match(guideCode, /SCREEN_WIDTH\s*\*\s*0\.14/);
  assert.match(guideCode, /SCREEN_WIDTH\s*\*\s*0\.15/);

  // 3. Step 2 -> Step 3 transition clears stale highlight hole immediately before switching drawers
  assert.match(chatCode, /guideTransitionTimerRef/);
  assert.match(chatCode, /setSettingsButtonRect\(null\)/);
});

test('settingsRepository supports chat appearance, typography 5 gears, and profile page style preferences', async () => {
  const store = new Map();
  const mockDb = {
    getFirstAsync: async (_query, ...args) => {
      const key = Array.isArray(args[0]) ? args[0][0] : args[0];
      const val = store.get(key);
      return val !== undefined ? { value: val } : null;
    },
    runAsync: async (_query, ...args) => {
      const [key, val] = Array.isArray(args[0]) ? args[0] : args;
      store.set(key, val);
    },
  };

  // 1. Profile page style defaults to 'minimalist'
  assert.equal(await settingsRepo.getProfilePageStyleMode(mockDb), 'minimalist');
  await settingsRepo.setProfilePageStyleMode(mockDb, 'classic');
  assert.equal(await settingsRepo.getProfilePageStyleMode(mockDb), 'classic');

  // 2. Profile avatar radius defaults to 34 (circle), avatar frame defaults to false
  assert.equal(await settingsRepo.getProfileAvatarRadius(mockDb), 34);
  assert.equal(await settingsRepo.getProfileAvatarFrameEnabled(mockDb), false);
  await settingsRepo.setProfileAvatarRadius(mockDb, 8);
  assert.equal(await settingsRepo.getProfileAvatarRadius(mockDb), 8);
  await settingsRepo.setProfileAvatarFrameEnabled(mockDb, true);
  assert.equal(await settingsRepo.getProfileAvatarFrameEnabled(mockDb), true);

  // 3. Chat appearance defaults: avatar 6dp (WeChat style), bubble 16dp, bubble color #95EC69 (WeChat green)
  assert.equal(await settingsRepo.getChatAvatarRadius(mockDb), 6);
  assert.equal(await settingsRepo.getChatBubbleRadius(mockDb), 16);
  assert.equal(await settingsRepo.getChatUserBubbleColor(mockDb), '#95EC69');

  await settingsRepo.setChatAvatarRadius(mockDb, 14);
  assert.equal(await settingsRepo.getChatAvatarRadius(mockDb), 14);
  await settingsRepo.setChatBubbleRadius(mockDb, 20);
  assert.equal(await settingsRepo.getChatBubbleRadius(mockDb), 20);
  await settingsRepo.setChatUserBubbleColor(mockDb, '#DCEBFA');
  assert.equal(await settingsRepo.getChatUserBubbleColor(mockDb), '#DCEBFA');

  // 4. All typography dimensions default strictly to gear_2 (standard)
  assert.equal(await settingsRepo.getChatFontSizeGear(mockDb), 'gear_2');
  assert.equal(await settingsRepo.getChatLetterSpacingGear(mockDb), 'gear_2');
  assert.equal(await settingsRepo.getChatLineHeightGear(mockDb), 'gear_2');
  assert.equal(await settingsRepo.getChatParagraphSpacingGear(mockDb), 'gear_2');

  await settingsRepo.setChatFontSizeGear(mockDb, 'gear_4');
  assert.equal(await settingsRepo.getChatFontSizeGear(mockDb), 'gear_4');
});

test('AiMessageBubble action bar places version pagination leftmost and auto-fills without gap', () => {
  const bubbleCode = read('src/components/ai/AiMessageBubble.tsx');

  // Left action area contains version switcher when versionTotal > 1
  assert.match(bubbleCode, /versionTotal\s*>\s*1/);
  // Auto-fill: when versionTotal <= 1, no spacer is left, actions start at flex-start
  assert.match(bubbleCode, /justifyContent:\s*'space-between'/);
  assert.match(bubbleCode, /leftActionGroup/);
  // Regenerate placed on right side
  assert.match(bubbleCode, /重新生成回复/);
  assert.match(bubbleCode, /RegenerateIcon/);
  assert.match(bubbleCode, /onRegenerate/);
});

test('MeScreen minimalist mode enforces 8px margin, 10px empty line spacing, no section titles, and 20px monochrome icons', () => {
  const meCode = read('src/screens/MeScreen.tsx');

  assert.match(meCode, /profileStyleMode === 'minimalist'/);
  assert.match(meCode, /minimalistInsetGroup/);
  assert.match(meCode, /marginHorizontal:\s*8/);
  assert.match(meCode, /minimalistGap/);
  assert.match(meCode, /height:\s*10/);
  assert.match(meCode, /color="#1A1C1C"/);
  assert.match(meCode, /size=\{20\}/);
});

test('ChatAppearanceSettingsScreen provides 168dp live preview, WeChat green swatch, and 5-gear typography', () => {
  const chatAppearanceCode = read('src/screens/ChatAppearanceSettingsScreen.tsx');

  assert.match(chatAppearanceCode, /ai_system_avatar\.png/);
  assert.match(chatAppearanceCode, /#95EC69/);
  assert.match(chatAppearanceCode, /微信风格/);
  assert.match(chatAppearanceCode, /gear_1/);
  assert.match(chatAppearanceCode, /gear_2/);
  assert.match(chatAppearanceCode, /gear_5/);
  assert.match(chatAppearanceCode, /恢复默认标准/);
});
