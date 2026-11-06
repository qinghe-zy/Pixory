/**
 * 文本清洗管道 (Text Sanitizer)
 *
 * 在送入语音合成前，彻底剥离模型输出的控制标签、思考内容、代码块与 Markdown 干扰符，
 * 保障合成内容为纯净、自然的口语台词。
 */

const CONTROL_TAGS_REGEX = /\[\s*(STATUS|MOOD|STICKER|表情|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|BR)[^\]\n]*\]/gi;
const CHINESE_CONTROL_TAGS_REGEX = /【\s*(STATUS|MOOD|STICKER|表情|HEARTBEAT|VOICE|NUDGE|NEXT_FOLLOWUP|STAGE_FOLLOWUP|PASS|PING|BR)[^】\n]*】/gi;
const XML_TAGS_REGEX = /<\/?(memory_data|thought|action|artifact|think)[^>]*>/gi;
const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const MARKDOWN_LINKS_REGEX = /\[([^\]]+)\]\([^)]+\)/g;
const URL_REGEX = /https?:\/\/[^\s]+/g;
const MARKDOWN_SYMBOLS_REGEX = /[*_~#>]+/g;
// 常用 Emoji 范围清洗，防止机械发音人把 Emoji 读出文字名称
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/gu;

export function sanitizeTextForTts(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. 若文本包含思考块（<thought>...</thought>），先整体剥离思考内容
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. 剥离代码块并替换为自然过渡语
  text = text.replace(CODE_BLOCK_REGEX, '，代码内容已省略，');

  // 3. 剥离内联代码
  text = text.replace(INLINE_CODE_REGEX, '$1');

  // 4. 剥离 Markdown 链接并保留标题文本
  text = text.replace(MARKDOWN_LINKS_REGEX, '$1');

  // 5. 剥离裸 URL
  text = text.replace(URL_REGEX, '网页链接');

  // 6. 剥离系统控制标签
  text = text.replace(CONTROL_TAGS_REGEX, '');
  text = text.replace(CHINESE_CONTROL_TAGS_REGEX, '');
  text = text.replace(XML_TAGS_REGEX, '');

  // 7. 剥离多余 Markdown 格式符号
  text = text.replace(MARKDOWN_SYMBOLS_REGEX, '');

  // 8. 净化 Emoji
  text = text.replace(EMOJI_REGEX, '');

  // 9. 规范化空白与标点
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '，')
    .replace(/\n/g, '，')
    .trim();

  // 10. 去除开头和结尾的多余标点
  text = text.replace(/^[，,。.！!？?、;；]+/, '').replace(/[，,、;；]+$/, '');

  return text;
}
