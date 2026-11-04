/**
 * tests/im-document-memory-isolation-and-intent.test.cjs
 *
 * 智能文档系统全域加固与沙箱重构专项测试：
 * 1. imTagParser 十六进制 SHA-256 块 ID 解析支持；
 * 2. Document Intent Gate 闲聊态阻断与意图激活；
 * 3. resolveTargetDocumentMessages 序数词版本回退链溯源；
 * 4. coalesceHistoryBurstMessages 文档卡片短文本脱敏，消除 [BR] 裸 JSON 拼接；
 * 5. buildShadowCompactionPayload 记忆提炼安全脱敏防投毒；
 * 6. ooxmlRunSplicer Markdown 裸标记净化；
 * 7. documentExport 防缓存时间戳指纹；
 * 8. CasBlobStore 内存 Pinning 锁防误删。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadTsModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const m = { exports: {} };
  const moduleDir = path.dirname(filePath);
  const contextRequire = (reqPath) => {
    if (reqPath.startsWith('.')) {
      const resolved = path.resolve(moduleDir, reqPath);
      if (fs.existsSync(resolved + '.ts')) return loadTsModule(resolved + '.ts');
      if (fs.existsSync(resolved + '.tsx')) return loadTsModule(resolved + '.tsx');
      if (fs.existsSync(resolved + '.js')) return require(resolved + '.js');
      if (fs.existsSync(resolved)) return require(resolved);
    }
    try {
      return require(reqPath);
    } catch {
      return {};
    }
  };

  const fn = new Function('module', 'exports', 'require', '__dirname', '__filename', transpiled);
  fn(m, m.exports, contextRequire, moduleDir, filePath);
  return m.exports;
}

const tagParser = loadTsModule(path.resolve(__dirname, '../src/im/engine/imTagParser.ts'));
const contextBuilder = loadTsModule(path.resolve(__dirname, '../src/im/engine/imContextBuilder.ts'));
const ooxmlSplicer = loadTsModule(path.resolve(__dirname, '../src/services/sandbox/docx/ooxmlRunSplicer.ts'));
const casStoreModule = loadTsModule(path.resolve(__dirname, '../src/services/agent/vfs/casBlobStore.ts'));

test('1. imTagParser: 正则放宽，支持十六进制 SHA-256 块 ID 与下划线序号', () => {
  const patchTagText = `[DOCUMENT_PATCH: msg_101 | 预算表.docx]
@@ PATCH [[BLK_a3f1c2e4]] @@
${'<' + '<<<<<<'} SEARCH
预算合计：50万元
${'=' + '======='}
预算合计：80万元
${'>' + '>>>>>>'} REPLACE

@@ APPEND_AFTER [[BLK_b8d2e5_1]] @@
## 补充免责声明
最终解释权归财务所有。
[/DOCUMENT_PATCH]`;

  const parsed = tagParser.parseDocumentPatchTag(patchTagText);
  assert.ok(parsed, '必须成功解析含有十六进制与下划线后缀的文档补丁');
  assert.equal(parsed.baseMsgId, 'msg_101');
  assert.equal(parsed.title, '预算表.docx');
  assert.equal(parsed.operations.length, 2, '必须提取 2 个操作');

  assert.equal(parsed.operations[0].op, 'replace');
  assert.equal(parsed.operations[0].targetBlockId, '[[BLK_A3F1C2E4]]', '必须提取出大写十六进制块 ID');
  assert.equal(parsed.operations[0].search, '预算合计：50万元');
  assert.equal(parsed.operations[0].replace, '预算合计：80万元');

  assert.equal(parsed.operations[1].op, 'append');
  assert.equal(parsed.operations[1].targetBlockId, '[[BLK_B8D2E5_1]]', '必须提取出带 _1 序号的块 ID');
  assert.ok(parsed.operations[1].replace.includes('最终解释权归财务所有'));
});

test('2. Document Intent Gate: 闲聊态 0 挂载，修改意图精准激活', () => {
  const history = [
    {
      id: 'doc_1',
      role: 'assistant',
      type: 'document',
      content: '房屋租赁合同.docx',
      metadata: {
        document: { title: '房屋租赁合同.docx', size: 1200 },
      },
    },
    { id: 'user_1', role: 'user', type: 'text', content: '收到啦' },
    { id: 'asst_1', role: 'assistant', type: 'text', content: '不客气呀' },
    { id: 'user_2', role: 'user', type: 'text', content: '今天工作好累' },
    { id: 'asst_2', role: 'assistant', type: 'text', content: '辛苦啦抱抱你' },
    { id: 'user_3', role: 'user', type: 'text', content: '好想吃火锅' },
    { id: 'asst_3', role: 'assistant', type: 'text', content: '今晚去吃吧' },
  ];

  // 1. 距离上次文档已超过 3 轮，且是日常闲聊 -> 门控返回 false
  const casualIntent = contextBuilder.hasDocumentEditIntent('今晚吃什么好呢？', history);
  assert.equal(casualIntent, false, '日常闲聊严禁触发文档挂载');

  // 2. 命中文档操作意图 -> 门控返回 true
  const editIntent1 = contextBuilder.hasDocumentEditIntent('把刚才合同里的违约金改成10%', history);
  assert.equal(editIntent1, true, '包含“改”、“合同”、“违约金”必须触发门控');

  const editIntent2 = contextBuilder.hasDocumentEditIntent('精简一下第三段', history);
  assert.equal(editIntent2, true, '包含“精简”、“第三段”必须触发门控');

  // 3. 显式引用了文档气泡 -> 门控返回 true
  const refIntent = contextBuilder.hasDocumentEditIntent('你看这里', history, 'doc_1');
  assert.equal(refIntent, true, '显式引用文档 ID 必须触发门控');
});

test('3. resolveTargetDocumentMessages: 序数词版本回退链溯源 (V1 -> V2 -> V3)', () => {
  const v1 = {
    id: 'msg_v1',
    role: 'assistant',
    type: 'document',
    content: '方案.docx',
    metadata: { document: { title: '方案.docx' } },
  };
  const v2 = {
    id: 'msg_v2',
    role: 'assistant',
    type: 'document',
    content: '方案_v2.docx',
    metadata: { document: { title: '方案_v2.docx', derivedFromMsgId: 'msg_v1' } },
  };
  const v3 = {
    id: 'msg_v3',
    role: 'assistant',
    type: 'document',
    content: '方案_v3.docx',
    metadata: { document: { title: '方案_v3.docx', derivedFromMsgId: 'msg_v2' } },
  };

  const msgs = [v1, v2, v3];

  // 默认指向最新一条 V3 (不带具体版本标题时的默认最新候选)
  const defaultTarget = contextBuilder.resolveTargetDocumentMessages(msgs, '改一下这个文档');
  assert.equal(defaultTarget.primaryTarget.id, 'msg_v3', '未指定历史版本时默认指向演进最新的 V3');

  // 口头指示“退回第一版原件”
  const targetV1 = contextBuilder.resolveTargetDocumentMessages(msgs, '刚才第三版太啰嗦了，退回第一版原件修改');
  assert.equal(targetV1.primaryTarget.id, 'msg_v1', '必须成功寻根到 V1');

  // 口头指示“退回第二版”
  const targetV2 = contextBuilder.resolveTargetDocumentMessages(msgs, '退回第二版，加个标题');
  assert.equal(targetV2.primaryTarget.id, 'msg_v2', '必须成功解析序数词并锁定 V2');

  // 口头指示“上一版”
  const targetPrev = contextBuilder.resolveTargetDocumentMessages(msgs, '改回上一版');
  assert.equal(targetPrev.primaryTarget.id, 'msg_v2', '必须从 V3 回退一步到 V2');
});

test('4. coalesceHistoryBurstMessages: 文档卡片转短文本，消除 [BR] 裸 JSON 拼接', () => {
  const messages = [
    { id: 'm1', role: 'user', type: 'text', content: '改一下' },
    { id: 'm2', role: 'assistant', type: 'text', content: '好的，已经帮您改好了' },
    {
      id: 'm3',
      role: 'assistant',
      type: 'document',
      content: '{"type":"document","title":"房屋租赁合同.docx","casHash":"a3b4c5","tocSkeleton":[{"blockId":"[[BLK_01]]"}]}',
      metadata: {
        document: { title: '房屋租赁合同.docx', hasRevisions: true },
      },
    },
  ];

  const coalesced = contextBuilder.coalesceHistoryBurstMessages(messages);
  assert.equal(coalesced.length, 2, 'user 与 assistant 应分别为 1 轮');

  const assistantTurn = coalesced[1];
  assert.equal(assistantTurn.role, 'assistant');
  // 必须是干净短文本，绝不能包含 {"type":"document" 裸 JSON
  assert.ok(assistantTurn.content.includes('[文档卡片: 《房屋租赁合同.docx》(修订版)]'));
  assert.ok(!assistantTurn.content.includes('{"type":"document"'), '严禁拼接裸 JSON');
});

test('5. buildShadowCompactionPayload: 记忆提炼安全脱敏防投毒', () => {
  const options = {
    rolePrompt: '你是一个贴心伴侣',
    historyMessages: [
      { id: 'u1', role: 'user', type: 'text', content: '帮我看看这份合同' },
      {
        id: 'd1',
        role: 'user',
        type: 'document',
        content: '本人甲方王五，身份证号110101199001011234，目前欠款50万元已离职...',
        metadata: {
          document: { title: '王五借款协议.docx' },
        },
      },
      { id: 'a1', role: 'assistant', type: 'text', content: '收到，内容已看完了' },
    ],
  };

  const payload = contextBuilder.buildShadowCompactionPayload(options);
  const payloadStr = JSON.stringify(payload);

  // 必须彻底切除身份证号、欠款金额与离职敏感词，且保留标题中立元描述
  assert.ok(!payloadStr.includes('110101199001011234'), '身份证号严禁送入记忆提炼模型');
  assert.ok(!payloadStr.includes('欠款50万元已离职'), '第三方敏感条款严禁送入记忆提炼模型');
  assert.ok(payloadStr.includes('王五借款协议'), '必须脱敏为中立的交互元描述并保留标题');
});

test('6. ooxmlRunSplicer: Markdown 标号净化 (## 与 **)', () => {
  const rawLlmText = '## 预算测算说明\n本条为**特别强调**的__重点金额__50万元。';
  const cleaned = ooxmlSplicer.sanitizeOoxmlText(rawLlmText);

  assert.equal(cleaned, '预算测算说明\n本条为特别强调的重点金额50万元。');
  assert.ok(!cleaned.includes('##'), '必须剥离标题标号');
  assert.ok(!cleaned.includes('**'), '必须剥离加粗星号');
  assert.ok(!cleaned.includes('__'), '必须剥离下划线');
});

test('7. CasBlobStore: 内存 Pinning 锁机制生效', () => {
  const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  casStoreModule.CasBlobStore.pinHash(hash);

  assert.ok(casStoreModule.CasBlobStore.pinnedHashes.has(hash));

  casStoreModule.CasBlobStore.unpinHash(hash);
  assert.ok(!casStoreModule.CasBlobStore.pinnedHashes.has(hash));
});
