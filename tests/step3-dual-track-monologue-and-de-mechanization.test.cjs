const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
    else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
  } else if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
    else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
      else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
    }
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

// 1. 验证 tagAwareStreamParser: 分句级系统语义过滤 sanitizeThoughtForUi
const {
  sanitizeThoughtForUi,
  META_SENTENCE_BLACKLIST_RE,
} = loadModule('../src/im/engine/tagAwareStreamParser.ts');

// 2. 验证 humanizeOutputGate: 支持轻量文学神态描写保留
const {
  sanitizeCompanionBubble,
} = loadModule('../src/im/engine/humanizeOutputGate.ts');

// 3. 验证 proactiveTimingEvaluator: 环境感知型自主追聊指令重构
const {
  buildProactivePromptDirective,
} = loadModule('../src/im/engine/proactiveTimingEvaluator.ts');

// 4. 验证 imProactiveFallbackPlanner: 真实作息时段意图映射
const {
  resolveNaturalProactiveIntent,
  planFallbackProactivePing,
} = loadModule('../src/im/engine/imProactiveFallbackPlanner.ts');

test('IM Step 3: sanitizeThoughtForUi 彻底终结图一真实翻车病句 (整句分句剥离)', () => {
  // 图一用户的真实模型 CoT 翻车输出
  const rawCoTFromFig1 =
    '深夜1:53，对方要听声音，我发了语音。现在系统说到预定联系时间，要主动发消息。顺着刚才话题，我已经困了，催他睡。要自然1-2个短句，口语，可能带个拍一拍或NEXT_FOLLOWUP。时间深夜，我困得不行。';

  const cleaned = sanitizeThoughtForUi(rawCoTFromFig1, { isFinal: true });

  // 1. 必须彻底剔除含有系统词的分句
  assert.doesNotMatch(cleaned, /现在系统/);
  assert.doesNotMatch(cleaned, /预定联系时间/);
  assert.doesNotMatch(cleaned, /主动发消息/);
  assert.doesNotMatch(cleaned, /个短句/);
  assert.doesNotMatch(cleaned, /NEXT_FOLLOWUP/);

  // 2. 严禁出现残缺半截病句（如“现在系统说到，要。”）
  assert.doesNotMatch(cleaned, /现在系统说到/);
  assert.doesNotMatch(cleaned, /说到，要/);

  // 3. 必须完整保留第一人称角色情感心声
  assert.match(cleaned, /深夜1:53，对方要听声音，我发了语音。/);
  assert.match(cleaned, /顺着刚才话题，我已经困了，催他睡。/);
  assert.match(cleaned, /时间深夜，我困得不行。/);
});

test('IM Step 3: sanitizeThoughtForUi 流式静默与完结兜底状态机', () => {
  const purelySystemCoT =
    '根据系统指令，字数限制20字以内，按照指令输出[STATUS: 窝在沙发上][NEXT_FOLLOWUP: 1m]。';

  // 1. 流式阶段 (isFinal = false)：全部被滤空时必须保持静默空字符串，绝不提前闪烁兜底文字
  const streamingClean = sanitizeThoughtForUi(purelySystemCoT, { isFinal: false });
  assert.equal(streamingClean, '', '流式未结束被全部滤空时应静默');

  // 2. 完结阶段 (isFinal = true)：全部被滤空时优雅展示角色第一人称心理留白
  const finalClean = sanitizeThoughtForUi(purelySystemCoT, { isFinal: true });
  assert.equal(finalClean, '（看着屏幕，心里悄悄盘算着要怎么跟你说……）');
});

test('IM Step 3: sanitizeCompanionBubble 支持轻量文学神态描写保留 (竞品同款拟真感)', () => {
  const bubbleWithStageAction =
    '（靠在窗边，午后的阳光照得人有点发懒，可心里还是横着一口气）你慢慢磨，我看你还能磨到什么时候。';

  // 1. 默认或显式保留模式 (用于即时对话分发至 UI)
  const preserved = sanitizeCompanionBubble(bubbleWithStageAction, { preserveInlineStageActions: true });
  assert.match(preserved, /（靠在窗边，午后的阳光照得人有点发懒，可心里还是横着一口气）/);
  assert.match(preserved, /你慢慢磨，我看你还能磨到什么时候。/);

  // 2. 严格剥离模式 (用于纯纯文本TTS或严格要求无括号场景)
  const stripped = sanitizeCompanionBubble(bubbleWithStageAction, { preserveInlineStageActions: false });
  assert.doesNotMatch(stripped, /靠在窗边/);
  assert.equal(stripped, '你慢慢磨，我看你还能磨到什么时候。');
});

test('IM Step 3: buildProactivePromptDirective 彻底摒弃冰冷指令并严守协议锚点', () => {
  const stage1Prompt = buildProactivePromptDirective(1, '小依');
  const stage2Prompt = buildProactivePromptDirective(2, '小依');
  const stage3Prompt = buildProactivePromptDirective(3, '小依');

  // 1. 严格保留下游协议锚点与状态机关键词 (防 Pitfall 4)
  assert.match(stage1Prompt, /Stage 1/);
  assert.match(stage1Prompt, /对方在聊天界面/);
  assert.match(stage1Prompt, /\[NEXT_FOLLOWUP:/);
  assert.match(stage1Prompt, /\[PASS\]/);

  assert.match(stage2Prompt, /Stage 2/);
  assert.match(stage2Prompt, /对方在聊天界面/);
  assert.match(stage2Prompt, /\[NEXT_FOLLOWUP:/);

  assert.match(stage3Prompt, /Stage 3/);
  assert.match(stage3Prompt, /对方在聊天界面/);
  assert.match(stage3Prompt, /\[PING:/);

  // 2. 严厉剔除引发模型思考复读的工业机械词
  assert.doesNotMatch(stage1Prompt, /高粘性伴随指令/);
  assert.doesNotMatch(stage2Prompt, /高粘性伴随指令/);
  assert.doesNotMatch(stage3Prompt, /高粘性伴随指令/);
});

test('IM Step 3: IM_PROTOCOL_PROMPT 潜意识心声铁律与在场感声明', () => {
  const contextBuilderPath = path.resolve(__dirname, '../src/im/engine/imContextBuilder.ts');
  const content = fs.readFileSync(contextBuilderPath, 'utf8');

  // 1. 潜意识心声声明
  assert.match(content, /【潜意识心声与人设纯净铁律（最高沉浸准则）】/);
  assert.match(content, /沉浸式第一人称心声/);
  assert.match(content, /绝对严禁技术复读/);

  // 2. 状态标签从“强制每轮”变为“按需触发”
  assert.match(content, /伴侣生活状态跑马灯 \[STATUS\]：仅在你的手头小事/);
  assert.match(content, /短时紧凑追聊 \(3分钟内\)：仅当话题意犹未尽/);
});

test('IM Step 3: 真实截图英文元指令 (The intent was... persona:...) 100% 净化与心声兜底', () => {
  // 用户真实截图中的大模型 CoT 泄露内容
  const screenshotCoT =
    'The intent was "新一天清晨轻声早安问候" but it\'s actually 22:44 at night, 9 hours since last contact. So I should naturally acknowledge — morning plan slipped to night. Lumine persona: concise, dry, a bit wry.\n\nShe asked him to come look at the rubbing in the afternoon; he didn\'t show. Now it\'s 22:44. So she should speak with mild dry complaint but not soppy.\n\nKeep it short, natural bubbles.';

  const cleaned = sanitizeThoughtForUi(screenshotCoT, { isFinal: true });

  // 1. 彻底剔除英文元指令与提示词分析
  assert.doesNotMatch(cleaned, /intent was/i);
  assert.doesNotMatch(cleaned, /persona/i);
  assert.doesNotMatch(cleaned, /bubbles/i);
  assert.doesNotMatch(cleaned, /morning plan/i);
  assert.doesNotMatch(cleaned, /mild dry complaint/i);
  assert.doesNotMatch(cleaned, /新一天清晨轻声早安问候/);

  // 2. 全部为英文规划时，优雅转换为第一人称潜意识心声留白供用户赏读
  assert.equal(cleaned, '（看着屏幕，心里悄悄盘算着要怎么跟你说……）');
});

test('IM Step 3: 中英文系统词与角色心声混杂时，精准剥离指令并保留角色心声', () => {
  const mixedCoT =
    'The intent was to check in. 预定意图: 睡前问候。（窗外天都黑透了，下午那会儿压着的拓片不知道他看过了没……发个消息问问他，但可别显得太刻意了。）';

  const cleaned = sanitizeThoughtForUi(mixedCoT, { isFinal: true });

  assert.doesNotMatch(cleaned, /The intent was/i);
  assert.doesNotMatch(cleaned, /预定意图/);
  assert.match(cleaned, /窗外天都黑透了/);
  assert.match(cleaned, /发个消息问问他，但可别显得太刻意了/);
});

test('IM Step 3: resolveNaturalProactiveIntent 作息感知意图映射与时段冲突消除', () => {
  // 构造夜间 22:44 时间戳
  const nightDate = new Date();
  nightDate.setHours(22, 44, 0, 0);
  const nightTs = nightDate.getTime();

  const nightIntent = resolveNaturalProactiveIntent(nightTs);
  assert.match(nightIntent, /夜间睡前/);
  assert.doesNotMatch(nightIntent, /早安/);

  // 构造清晨 07:45 时间戳
  const morningDate = new Date();
  morningDate.setHours(7, 45, 0, 0);
  const morningTs = morningDate.getTime();

  const morningIntent = resolveNaturalProactiveIntent(morningTs);
  assert.match(morningIntent, /清晨/);
});

test('IM Step 3: Layer 4 主动唤醒双向时钟冲突自校准 (早晨不晚安，夜间不早安)', () => {
  const { buildChatPayload } = loadModule('../src/im/engine/imContextBuilder.ts');

  // 1. 夜间 22:44 传入错位早安意图
  const nightTs = new Date('2026-10-28T22:44:00.000+08:00').getTime();
  const nightPayload = buildChatPayload(
    {
      rolePrompt: '角色设定：旅行者',
      historyMessages: [{ id: '1', role: 'user', content: '先去忙了' }],
      now: nightTs,
      isWakeupPing: true,
      pingIntent: '清晨早安问候与关心',
    },
    ''
  );
  const nightLayer4 = nightPayload[nightPayload.length - 2];
  assert.doesNotMatch(nightLayer4.content, /清晨早安问候/);
  assert.match(nightLayer4.content, /问候与关心/);

  // 2. 早晨 08:30 传入错位睡前晚安意图
  const morningTs = new Date('2026-10-28T08:30:00.000+08:00').getTime();
  const morningPayload = buildChatPayload(
    {
      rolePrompt: '角色设定：旅行者',
      historyMessages: [{ id: '1', role: 'user', content: '睡觉去了' }],
      now: morningTs,
      isWakeupPing: true,
      pingIntent: '夜间睡前轻声关怀',
    },
    ''
  );
  const morningLayer4 = morningPayload[morningPayload.length - 2];
  assert.doesNotMatch(morningLayer4.content, /夜间睡前/);
  assert.match(morningLayer4.content, /早间轻声关怀/);
});
