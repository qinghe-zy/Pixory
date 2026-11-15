const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCompanionRolePrompt,
  normalizePersonalizationForUi,
} = require('../src/im/engine/imRolePromptResolver.ts');
const {
  resolveActiveMilestoneNotice,
  computeMidEpochDeltaFacts,
  buildChatPayload,
} = require('../src/im/engine/imContextBuilder.ts');
const {
  BUBBLE_SKIN_PRESETS,
  buildImThemeFromPreferences,
} = require('../src/im/theme/imTheme.ts');

test('im-personalization-and-milestones: 伴侣个性化契约、前缀缓存与纪念日轻量感知测试', async (t) => {
  await t.test('1. resolveCompanionRolePrompt: {{user}} / {{char}} 替换与显式个性化补充注入', () => {
    const mockRole = {
      name: '小汐',
      prompt: '你好 {{user}}，我是你的伴侣{{char}}。',
    };
    const personalization = {
      userNickname: '林宝',
      companionCallName: '汐汐',
      relationshipPreset: 'romantic',
      replyStyleGear: 'clingy_sweet',
      proactiveFrequencyGear: 'frequent',
      bubbleSkinPreset: 'mist_blue',
      milestones: [],
    };

    const resolved = resolveCompanionRolePrompt(mockRole, '小汐', personalization);
    assert.equal(resolved.companionName, '小汐');
    assert.equal(resolved.rolePrompt.includes('你好 林宝'), true, '{{user}} should be replaced with userNickname');
    assert.equal(resolved.rolePrompt.includes('我是你的伴侣汐汐'), true, '{{char}} should be replaced with companionCallName');
    assert.equal(resolved.rolePrompt.includes('【专属相处契约与双向默契】'), true, 'Should append contract to Layer 1');
    assert.equal(resolved.rolePrompt.includes('对方对你的专属称谓: "汐汐"'), true);
    assert.equal(resolved.rolePrompt.includes('对方专属称呼: "林宝"'), true);
    assert.equal(resolved.rolePrompt.includes('心动伴侣'), true);
    assert.equal(resolved.rolePrompt.includes('甜糯粘人'), true);
    assert.equal(resolved.rolePrompt.includes('绝不可覆盖角色卡自身的世界观、立场、性格与说话口吻'), true);
    assert.equal(resolved.rolePrompt.includes('秒回消息'), false, 'Should not inject message-speed assumptions');
    assert.equal(resolved.personaAnchor.startsWith('[身份锚定:'), true, 'personaAnchor should preserve [身份锚定: ...]');
    assert.equal(resolved.personaAnchor.includes('日常白开水'), false, 'personaAnchor must not mention 日常白开水');
  });

  await t.test('1b. 角色主权保护: role_default、历史默认元组零注入与中立兜底', () => {
    const strictRole = {
      name: '沈砚',
      prompt: '你是冷峻克制的古风剑客{{char}}，对{{user}}始终保持疏离审视。',
    };

    // a) role_default / role_default 零注入任何契约、关系与风格限制
    const roleDefaultResolved = resolveCompanionRolePrompt(strictRole, '沈砚', {
      relationshipPreset: 'role_default',
      replyStyleGear: 'role_default',
      proactiveFrequencyGear: 'balanced',
      bubbleSkinPreset: 'ink_mono',
    });
    assert.equal(roleDefaultResolved.rolePrompt.includes('【专属相处契约与双向默契】'), false);
    assert.equal(roleDefaultResolved.rolePrompt.includes('彼此相处关系定位'), false);
    assert.equal(roleDefaultResolved.rolePrompt.includes('补充表达风格倾向'), false);
    assert.equal(roleDefaultResolved.rolePrompt.includes('知心挚友'), false);
    assert.equal(roleDefaultResolved.rolePrompt.includes('自然亲切'), false);
    assert.equal(roleDefaultResolved.personaAnchor.includes('[身份锚定:'), true);
    assert.equal(roleDefaultResolved.personaAnchor.includes('「沈砚」'), true);
    assert.equal(roleDefaultResolved.personaAnchor.includes('日常白开水'), false);

    // b) 历史遗留默认元组 (close_friend + balanced 且无自定义字段) 同样实现零注入
    const legacyDefaultResolved = resolveCompanionRolePrompt(strictRole, '沈砚', {
      relationshipPreset: 'close_friend',
      replyStyleGear: 'balanced',
      proactiveFrequencyGear: 'frequent',
      bubbleSkinPreset: 'wechat_green',
      milestones: [{ id: 'm1', label: '测试纪念日', dateKey: '2026-05-20' }],
    });
    assert.equal(legacyDefaultResolved.rolePrompt.includes('【专属相处契约与双向默契】'), false);
    assert.equal(legacyDefaultResolved.rolePrompt.includes('知心挚友'), false);
    assert.equal(legacyDefaultResolved.rolePrompt.includes('自然亲切'), false);

    // c) balanced 即使搭配显式昵称，也绝不注入“微信老友”或“1~3 个短气泡”
    const balancedWithNick = resolveCompanionRolePrompt(strictRole, '沈砚', {
      userNickname: '阿木',
      relationshipPreset: 'role_default',
      replyStyleGear: 'balanced',
    });
    assert.equal(balancedWithNick.rolePrompt.includes('对方专属称呼: "阿木"'), true);
    assert.equal(balancedWithNick.rolePrompt.includes('微信老友'), false);
    assert.equal(balancedWithNick.rolePrompt.includes('1~3 个短气泡'), false);
    assert.equal(balancedWithNick.rolePrompt.includes('补充表达风格倾向'), false);

    // custom 空备注也应保持零关系注入
    const emptyCustomRel = resolveCompanionRolePrompt(strictRole, '沈砚', {
      relationshipPreset: 'custom',
      customRelationshipNote: '   ',
      replyStyleGear: 'role_default',
    });
    assert.equal(emptyCustomRel.rolePrompt.includes('【专属相处契约与双向默契】'), false);

    // 显式保留 close_friend + role_default 时（无自定义字段），不得误判为历史默认元组，仍应注入知心挚友
    const explicitCloseFriendWithRoleDefault = resolveCompanionRolePrompt(strictRole, '沈砚', {
      relationshipPreset: 'close_friend',
      replyStyleGear: 'role_default',
    });
    assert.equal(explicitCloseFriendWithRoleDefault.rolePrompt.includes('知心挚友'), true);
    assert.equal(explicitCloseFriendWithRoleDefault.rolePrompt.includes('补充表达风格倾向'), false);

    // 显式保留 close_friend + 非默认风格时，仍应正确注入
    const explicitCloseFriend = resolveCompanionRolePrompt(strictRole, '沈砚', {
      relationshipPreset: 'close_friend',
      replyStyleGear: 'concise_cool',
    });
    assert.equal(explicitCloseFriend.rolePrompt.includes('知心挚友'), true);
    assert.equal(explicitCloseFriend.rolePrompt.includes('清冷酷飒'), true);

    // UI 归一化 helper 与运行时规则 1:1 对齐
    assert.deepEqual(
      normalizePersonalizationForUi({
        relationshipPreset: 'close_friend',
        replyStyleGear: 'balanced',
      }),
      { relationshipPreset: 'role_default', replyStyleGear: 'role_default' }
    );
    assert.deepEqual(
      normalizePersonalizationForUi({
        relationshipPreset: 'close_friend',
      }),
      { relationshipPreset: 'role_default', replyStyleGear: 'role_default' }
    );
    assert.deepEqual(
      normalizePersonalizationForUi({
        relationshipPreset: 'close_friend',
        replyStyleGear: 'balanced',
        userNickname: '林木',
      }),
      { relationshipPreset: 'close_friend', replyStyleGear: 'balanced' }
    );
    assert.deepEqual(
      normalizePersonalizationForUi({
        relationshipPreset: 'close_friend',
        replyStyleGear: 'role_default',
      }),
      { relationshipPreset: 'close_friend', replyStyleGear: 'role_default' }
    );
    assert.deepEqual(normalizePersonalizationForUi(null), {
      relationshipPreset: 'role_default',
      replyStyleGear: 'role_default',
    });

    // buildChatPayload 注入 personaAnchor 时不得出现双层嵌套 [身份锚点: [身份锚定: ...]]
    const payload = buildChatPayload(
      {
        rolePrompt: roleDefaultResolved.rolePrompt,
        historyMessages: [],
        personaAnchor: roleDefaultResolved.personaAnchor,
        now: 1700000000000,
      },
      '你好'
    );
    const systemText = payload
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    assert.equal(systemText.includes('[身份锚定:'), true);
    assert.equal((systemText.match(/\[身份锚定:/g) || []).length, 1);
    assert.equal(systemText.includes('[身份锚点: [身份锚定:'), false);

    // 无 prompt/personality/scenario 时的中立兜底人设
    const emptyRoleResolved = resolveCompanionRolePrompt({ name: '无名氏', prompt: '' }, '无名氏', null);
    assert.equal(emptyRoleResolved.rolePrompt.includes('温柔体贴'), false);
    assert.equal(emptyRoleResolved.rolePrompt.includes('AI 伴侣'), false);
    assert.equal(emptyRoleResolved.rolePrompt.includes('具有独立性格、背景与立场的人物'), true);
  });

  await t.test('2. resolveActiveMilestoneNotice: 临近纪念日 0~2 天感知与远期 0 Token 零损耗', () => {
    // 假设当前时间为 2026-05-20 12:00:00 本地时间
    const fixedNow = new Date(2026, 4, 20, 12, 0, 0).getTime();

    const milestones = [
      { label: '相识一周年', dateKey: '2026-05-20' }, // 今天
      { label: '我的生日', dateKey: '2026-05-21' },   // 明天
      { label: '领证纪念日', dateKey: '2026-05-22' }, // 后天
      { label: '毕业旅行', dateKey: '2026-06-01' },   // 远期 (> 2 天)
    ];

    // 今天
    const noticeToday = resolveActiveMilestoneNotice([milestones[0]], fixedNow);
    assert.equal(noticeToday, '\n[日历节点: 今天是「相识一周年」]');

    // 明天
    const noticeTomorrow = resolveActiveMilestoneNotice([milestones[1]], fixedNow);
    assert.equal(noticeTomorrow, '\n[日历节点: 明天是「我的生日」]');

    // 后天
    const noticeDayAfter = resolveActiveMilestoneNotice([milestones[2]], fixedNow);
    assert.equal(noticeDayAfter, '\n[日历节点: 距离「领证纪念日」还有 2 天]');

    // 远期 (空字符串，0 Token 浪费)
    const noticeFar = resolveActiveMilestoneNotice([milestones[3]], fixedNow);
    assert.equal(noticeFar, '', 'Far away milestone must return empty string to save tokens');

    // 跨年边界测试: 今天是 12-31，纪念日是 01-01 (明天)
    const yearEndNow = new Date(2026, 11, 31, 15, 0, 0).getTime();
    const noticeYearEnd = resolveActiveMilestoneNotice([{ label: '元旦新年', dateKey: '01-01' }], yearEndNow);
    assert.equal(noticeYearEnd, '\n[日历节点: 明天是「元旦新年」]', 'Should support MM-DD cross-year boundary detection');

    // 未来特定目标年测试: 明确在未来 2027 年的事件
    const fixed2027Now = new Date(2027, 5, 6, 10, 0, 0).getTime();
    const noticeFutureYear = resolveActiveMilestoneNotice([{ label: '考研初试', dateKey: '2027-06-07' }], fixed2027Now);
    assert.equal(noticeFutureYear, '\n[日历节点: 明天是「考研初试」]', 'Should support future year target date');
  });

  await t.test('3. computeMidEpochDeltaFacts: 跨世代事实增量抽取与 <= 90 Token 预算控制', () => {
    const liveFacts = [
      { id: 'f1', content: '用户喜欢喝冰美式', importance: 5 },
      { id: 'f2', content: '用户今天刚领到了新电脑', importance: 7 }, // 新学到的事实
    ];
    const activeCoreFactsJson = JSON.stringify([
      { id: 'f1', content: '用户喜欢喝冰美式', importance: 5 },
    ]);

    const deltas = computeMidEpochDeltaFacts(liveFacts, activeCoreFactsJson);
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].id, 'f2');
    assert.equal(deltas[0].content, '用户今天刚领到了新电脑');
  });

  await t.test('4. BUBBLE_SKIN_PRESETS & buildImThemeFromPreferences: 五组气泡皮肤、自定义Hex配色与对比度调校', () => {
    assert.equal(Boolean(BUBBLE_SKIN_PRESETS.wechat_green), true);
    assert.equal(Boolean(BUBBLE_SKIN_PRESETS.mist_blue), true);
    assert.equal(Boolean(BUBBLE_SKIN_PRESETS.warm_amber), true);
    assert.equal(Boolean(BUBBLE_SKIN_PRESETS.rose_quartz), true);
    assert.equal(Boolean(BUBBLE_SKIN_PRESETS.ink_mono), true);

    // 测试未配壁纸的默认主题
    const themeDefault = buildImThemeFromPreferences(undefined, undefined, undefined, 'mist_blue', false);
    assert.equal(themeDefault.colors.bubbleRightBackground, BUBBLE_SKIN_PRESETS.mist_blue.bubbleRightBackground);

    // 测试配置壁纸后的动态对比度调整
    const themeWithWallpaper = buildImThemeFromPreferences(undefined, undefined, undefined, 'rose_quartz', true);
    assert.equal(themeWithWallpaper.colors.systemNoticeBackground.includes('0.32'), true, 'Wallpaper mode should use dark translucent scrim');
    assert.equal(themeWithWallpaper.colors.systemNoticeText, '#FFFFFF');

    // 测试自定义深色 Hex (深蓝/黑底) 自动适配白字
    const darkCustomTheme = buildImThemeFromPreferences(undefined, undefined, undefined, '#1E293B', false);
    assert.equal(darkCustomTheme.colors.bubbleRightBackground, '#1E293B');
    assert.equal(darkCustomTheme.colors.bubbleRightText, '#FFFFFF');

    // 测试自定义浅色 Hex (奶黄底) 自动适配深灰黑字
    const lightCustomTheme = buildImThemeFromPreferences(undefined, undefined, undefined, '#FDE047', false);
    assert.equal(lightCustomTheme.colors.bubbleRightBackground, '#FDE047');
    assert.equal(lightCustomTheme.colors.bubbleRightText, '#111111');
  });
});
