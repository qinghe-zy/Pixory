const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.tsx') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
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

test('Message Preview Formatting: 语音消息格式化（支持转写、时长与截断容错）', () => {
  const { formatMessagePreview } = loadModule('../src/utils/formatMessagePreview.ts');

  // 1. 完整语音 JSON，优先显示统一规范时长 [语音] 3"
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///test.m4a","durationMs":3000,"transcription":"晚上一起散步吗","isPlayed":true}'),
    '[语音] 3"'
  );

  // 2. 完整语音 JSON，无转写文字，有时长
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///test.m4a","durationMs":3000}'),
    '[语音] 3"'
  );

  // 3. 完整语音 JSON，无转写文字，无时长
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///test.m4a"}'),
    '[语音]'
  );

  // 4. 截断语音 JSON（模拟数据库截断，无法 JSON.parse 的场景）
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///data/user/0/host.exp.exponent/cache/aud_12345'),
    '[语音]'
  );

  // 5. 截断语音 JSON，保留了转写文本
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///...","transcription":"收到啦"'),
    '[语音] 收到啦'
  );

  // 6. 截断语音 JSON，保留了时长
  assert.equal(
    formatMessagePreview('{"type":"voice","audioUri":"file:///...","durationMs":5200'),
    '[语音] 5"'
  );

  // 7. 历史非 JSON 格式兼容
  assert.equal(formatMessagePreview('[语音消息]: 收到啦'), '[语音] 收到啦');
  assert.equal(formatMessagePreview('[语音 3"]'), '[语音] 3"');
  assert.equal(formatMessagePreview('[语音 3"] 收到啦'), '[语音] 3"');
  assert.equal(formatMessagePreview('[发送了一条语音消息]'), '[语音]');
  assert.equal(formatMessagePreview('[语音]'), '[语音]');
});

test('Message Preview Formatting: 图片与文档格式化', () => {
  const { formatMessagePreview } = loadModule('../src/utils/formatMessagePreview.ts');

  // 图片
  assert.equal(
    formatMessagePreview('{"type":"image","imageUri":"file:///a.jpg","text":"看看今天的天空"}'),
    '[图片] 看看今天的天空'
  );
  assert.equal(
    formatMessagePreview('{"imageUri":"file:///a.jpg","boundIpName":"荧"}'),
    '[图片·荧]'
  );
  assert.equal(
    formatMessagePreview('{"imageUri":"file:///a.jpg"}'),
    '[图片]'
  );
  assert.equal(
    formatMessagePreview('{"imageUri":"file:///data/user/0/host.exp.exponent/cache/img_12345'),
    '[图片]'
  );

  // 文件/文档：统一显示为 [文档] 文档名
  assert.equal(
    formatMessagePreview('{"type":"document","document":{"title":"需求分析.pdf"}}'),
    '[文档] 需求分析.pdf'
  );
  assert.equal(
    formatMessagePreview('[DOCUMENT: 需求分析.pdf|uri=file://...]'),
    '[文档] 需求分析.pdf'
  );
  assert.equal(
    formatMessagePreview('[DOC: 需求分析.docx]'),
    '[文档] 需求分析.docx'
  );
  assert.equal(
    formatMessagePreview('{"type":"document"}'),
    '[文档]'
  );
});

test('Message Preview Formatting: 表情、日记与思考过程', () => {
  const { formatMessagePreview } = loadModule('../src/utils/formatMessagePreview.ts');

  // 表情规范为 [表情名称]
  assert.equal(
    formatMessagePreview('{"type":"sticker","name":"大笑"}'),
    '[表情大笑]'
  );
  assert.equal(
    formatMessagePreview('{"type":"sticker","name":"[大笑]"}'),
    '[大笑]'
  );
  assert.equal(
    formatMessagePreview('{"type":"sticker"}'),
    '[表情]'
  );
  assert.equal(
    formatMessagePreview('[STICKER: 偷笑]'),
    '[表情偷笑]'
  );
  assert.equal(
    formatMessagePreview('[表情] 偷笑'),
    '[表情偷笑]'
  );

  // 日记卡片
  assert.equal(
    formatMessagePreview('{"type":"diary_card","diaryDate":"2026-11-08"}'),
    '[日记已生成]'
  );

  // 思考过程
  assert.equal(
    formatMessagePreview('{"type":"thought","content":"正在思考..."}'),
    '[思考过程]'
  );
});

test('Message Preview Formatting: 内部系统提示与控制标签彻底过滤', () => {
  const { formatMessagePreview } = loadModule('../src/utils/formatMessagePreview.ts');

  // 控制标签伴随正文：标签被剥离，保留正文
  assert.equal(
    formatMessagePreview('[STATUS: 在阳台][PING: +1h] 回来给你带奶茶'),
    '回来给你带奶茶'
  );
  assert.equal(
    formatMessagePreview('[前台高粘性伴随指令: 维持语气] 你好呀'),
    '你好呀'
  );

  // 纯内部指令：剥离后为空，回退到 fallbackText
  assert.equal(
    formatMessagePreview('[系统提示: 请保持荧的语气回答][前台伴随情境: 傍晚]', '暂无消息'),
    '暂无消息'
  );
  assert.equal(
    formatMessagePreview('系统提示：网络连接已断开', '发句问候开启对话'),
    '发句问候开启对话'
  );

  // 内部占位引导词与附件提炼
  assert.equal(
    formatMessagePreview('请根据以下附件继续对话。\n\n[附件]\n- 文档：合同草案.pdf'),
    '[文档] 合同草案.pdf'
  );
  assert.equal(
    formatMessagePreview('<system_prompt>内部提示</system_prompt>早安'),
    '早安'
  );
  assert.equal(
    formatMessagePreview('[文件] 财务表.xlsx'),
    '[文档] 财务表.xlsx'
  );

  // 换行与空白字符折叠
  assert.equal(
    formatMessagePreview('你好[BR]派蒙   今天  吃什么'),
    '你好 派蒙 今天 吃什么'
  );
});

test('Message Preview Formatting: 向后兼容 formatImPreviewText 导出', () => {
  const { formatImPreviewText } = loadModule('../src/im/utils/formatImPreviewText.ts');

  assert.equal(
    formatImPreviewText('{"type":"voice","audioUri":"file:///test.m4a","durationMs":3000}'),
    '[语音] 3"'
  );
  assert.equal(
    formatImPreviewText('{"type":"sticker","name":"开心"}'),
    '[表情开心]'
  );
  assert.equal(
    formatImPreviewText('{"imageUri":"file:///a.jpg"}'),
    '[图片]'
  );
});
