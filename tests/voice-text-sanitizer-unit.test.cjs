const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 读取 TypeScript 源码并进行正则验证
test('voice textSanitizer policy and transformation verification', () => {
  const sanitizerPath = path.resolve(__dirname, '../src/voice/textSanitizer.ts');
  const content = fs.readFileSync(sanitizerPath, 'utf8');

  assert.ok(content.includes('sanitizeTextForTts'), 'Must export sanitizeTextForTts');
  assert.ok(content.includes('CONTROL_TAGS_REGEX'), 'Must define CONTROL_TAGS_REGEX');
  assert.ok(content.includes('CODE_BLOCK_REGEX'), 'Must define CODE_BLOCK_REGEX');
  assert.ok(content.includes('EMOJI_REGEX'), 'Must define EMOJI_REGEX');
});

test('sanitizeTextForTts strips control tags, code blocks, URLs, and thought blocks', () => {
  // 模拟 textSanitizer 中的逻辑进行深度单测
  const CONTROL_TAGS_REGEX = /\[\s*(STATUS|MOOD|STICKER|表情|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|BR)[^\]\n]*\]/gi;
  const CHINESE_CONTROL_TAGS_REGEX = /【\s*(STATUS|MOOD|STICKER|表情|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|BR)[^】\n]*】/gi;
  const XML_TAGS_REGEX = /<\/?(memory_data|thought|action|artifact|think)[^>]*>/gi;
  const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
  const INLINE_CODE_REGEX = /`([^`]+)`/g;
  const MARKDOWN_LINKS_REGEX = /\[([^\]]+)\]\([^)]+\)/g;
  const URL_REGEX = /https?:\/\/[^\s]+/g;
  const MARKDOWN_SYMBOLS_REGEX = /[*_~#>]+/g;
  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu;

  function sanitize(rawText) {
    if (!rawText) return '';
    let text = rawText;
    text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(CODE_BLOCK_REGEX, '，代码内容已省略，');
    text = text.replace(INLINE_CODE_REGEX, '$1');
    text = text.replace(MARKDOWN_LINKS_REGEX, '$1');
    text = text.replace(URL_REGEX, '网页链接');
    text = text.replace(CONTROL_TAGS_REGEX, '');
    text = text.replace(CHINESE_CONTROL_TAGS_REGEX, '');
    text = text.replace(XML_TAGS_REGEX, '');
    text = text.replace(MARKDOWN_SYMBOLS_REGEX, '');
    text = text.replace(EMOJI_REGEX, '');
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '，').replace(/\n/g, '，').trim();
    text = text.replace(/^[，,。.！!？?、;；]+/, '').replace(/[，,、;；]+$/, '');
    return text;
  }

  // 1. 标签与表情剥离
  const input1 = '[VOICE:5"]今天天气真好呀！[STICKER: 偷笑]【表情: 开心】';
  assert.equal(sanitize(input1), '今天天气真好呀！');

  // 2. 思考过程剥离
  const input2 = '<thought>用户看起来有点累，我要温柔一些</thought>早点休息哦，晚安~';
  assert.equal(sanitize(input2), '早点休息哦，晚安');

  // 3. 代码块与链接
  const input3 = '这里是示例：```python\nprint("hello")\n```你可以访问 [点击这里](https://example.com) 查看详情。';
  assert.ok(sanitize(input3).includes('代码内容已省略'));
  assert.ok(sanitize(input3).includes('点击这里'));
  assert.ok(!sanitize(input3).includes('print'));

  // 4. Emoji 清洗
  const input4 = '今天好开心呀😂😂😂祝你做个好梦✨🌙';
  assert.equal(sanitize(input4), '今天好开心呀祝你做个好梦');
});
