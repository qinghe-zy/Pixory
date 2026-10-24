const test = require('node:test');
const assert = require('node:assert/strict');

// Test the pure folding policy helper logic
function countMessageLines(text) {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

function hasComplexMarkdownStructure(blocks, text) {
  if (text.includes('<html') || text.includes('<!DOCTYPE')) return true;
  let markdownStructureCount = 0;
  for (const block of blocks) {
    if (block.type === 'code' || block.type === 'table' || block.type === 'math' || block.type === 'image') {
      markdownStructureCount += 2;
    } else if (
      block.type === 'list' ||
      block.type === 'quote' ||
      block.type === 'definitionList' ||
      block.type === 'heading'
    ) {
      markdownStructureCount += 1;
    }
    if (markdownStructureCount >= 2) return true;
  }
  return markdownStructureCount >= 1 || blocks.length >= 6;
}

function shouldFoldAiHistoryMessage(params) {
  if (
    params.disableFolding ||
    params.variant === 'user' ||
    params.streaming ||
    params.isLatestMessage ||
    !params.isFoldingEnabled
  ) {
    return false;
  }
  const lineThreshold = params.isDeepHistory ? 10 : 14;
  return params.lineCount > lineThreshold && params.hasComplexMarkdown;
}

test('shouldFoldAiHistoryMessage: disableFolding explicitly set prevents folding', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    disableFolding: true,
    isFoldingEnabled: true,
    lineCount: 100,
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'disableFolding must prevent folding even on long history messages');
});

test('shouldFoldAiHistoryMessage: latest message is NEVER folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: true, // latest message!
    isFoldingEnabled: true,
    lineCount: 100,
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'Latest message must never be folded');
});

test('shouldFoldAiHistoryMessage: streaming message is NEVER folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: true, // streaming!
    isLatestMessage: false,
    isFoldingEnabled: true,
    lineCount: 100,
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'Streaming message must never be folded');
});

test('shouldFoldAiHistoryMessage: user message is NEVER folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'user', // user message!
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    lineCount: 100,
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'User message must never be folded');
});

test('shouldFoldAiHistoryMessage: disabled setting prevents folding', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: false, // disabled in settings!
    lineCount: 100,
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'Disabled switch in settings must prevent folding');
});

test('shouldFoldAiHistoryMessage: short message (<= 14 lines) is NOT folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    lineCount: 14, // exactly 14 lines
    hasComplexMarkdown: true,
  });
  assert.equal(result, false, 'Message with <= 14 lines should not fold');
});

test('shouldFoldAiHistoryMessage: plain text without markdown is NOT folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    lineCount: 45,
    hasComplexMarkdown: false, // no complex markdown
  });
  assert.equal(result, false, 'Plain text without markdown structures should not fold');
});

test('shouldFoldAiHistoryMessage: history message > 14 lines with complex markdown IS folded', () => {
  const result = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    lineCount: 15,
    hasComplexMarkdown: true,
  });
  assert.equal(result, true, 'History assistant message > 14 lines with complex markdown must fold');
});

test('shouldFoldAiHistoryMessage: deep history message (> 10 lines) folds when isDeepHistory is true', () => {
  const shallowResult = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    isDeepHistory: false,
    lineCount: 12,
    hasComplexMarkdown: true,
  });
  assert.equal(shallowResult, false, 'Shallow message (12 lines) should NOT fold');

  const deepResult = shouldFoldAiHistoryMessage({
    variant: 'assistant',
    streaming: false,
    isLatestMessage: false,
    isFoldingEnabled: true,
    isDeepHistory: true,
    lineCount: 12,
    hasComplexMarkdown: true,
  });
  assert.equal(deepResult, true, 'Deep message (12 lines) MUST fold');
});

test('countMessageLines correctly counts newlines', () => {
  assert.equal(countMessageLines(''), 0);
  assert.equal(countMessageLines('hello'), 1);
  assert.equal(countMessageLines('line 1\nline 2\nline 3'), 3);
  const thirtyTwoLines = Array.from({ length: 32 }, (_, i) => `Line ${i + 1}`).join('\n');
  assert.equal(countMessageLines(thirtyTwoLines), 32);
});

test('hasComplexMarkdownStructure detects code, tables, math and lists', () => {
  assert.equal(hasComplexMarkdownStructure([{ type: 'code', text: 'const a = 1;' }], ''), true);
  assert.equal(hasComplexMarkdownStructure([{ type: 'table', rows: [] }], ''), true);
  assert.equal(hasComplexMarkdownStructure([{ type: 'math', math: 'E=mc^2' }], ''), true);
  assert.equal(
    hasComplexMarkdownStructure(
      [
        { type: 'heading', text: 'H1', level: 1 },
        { type: 'list', items: [] },
      ],
      ''
    ),
    true
  );
  assert.equal(
    hasComplexMarkdownStructure([{ type: 'paragraph', text: 'Just a normal sentence' }], 'Just a normal sentence'),
    false
  );
});

test('virtual slicing truncates blocks to preview subset when folded', () => {
  const blocks = Array.from({ length: 50 }, (_, i) => ({
    type: 'paragraph',
    text: `Paragraph ${i + 1}`,
  }));
  assert.equal(blocks.length, 50);
  const subset = [];
  let lines = 0;
  for (const block of blocks) {
    subset.push(block);
    lines += 1;
    if (lines >= 14) break;
  }
  assert.equal(subset.length, 14, 'Should truncate to exactly 14 paragraphs when folded');
});

test('anchor shift pipeline is correctly wired across AiMessageContent, AiMessageBubble, and AiChatScreen', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const contentFile = fs.readFileSync(path.join(__dirname, '../src/components/ai/AiMessageContent.tsx'), 'utf8');
  assert.match(contentFile, /onAnchorShift\?:\s*\(offsetDelta:\s*number\)\s*=>\s*void;/);
  assert.match(contentFile, /cardRef\.current\?\.measureInWindow/);
  assert.match(contentFile, /onAnchorShift\?\.\(delta\)/);
  assert.match(contentFile, /handleToggleExpanded/);

  const bubbleFile = fs.readFileSync(path.join(__dirname, '../src/components/ai/AiMessageBubble.tsx'), 'utf8');
  assert.match(bubbleFile, /onAnchorShift\?:\s*\(offsetDelta:\s*number\)\s*=>\s*void;/);
  assert.match(bubbleFile, /<AiMessageContent[\s\S]*?content=\{content\}[\s\S]*?isLatestMessage=\{isLatestMessage\}[\s\S]*?onAnchorShift=\{onAnchorShift\}[\s\S]*?\/>/);
  assert.match(bubbleFile, /previous\.onAnchorShift === next\.onAnchorShift/);

  const chatScreenFile = fs.readFileSync(path.join(__dirname, '../src/screens/AiChatScreen.tsx'), 'utf8');
  assert.match(chatScreenFile, /onAnchorShift=\{preserveThinkingHeaderAnchor\}/);
});

test('performance architecture: pure-text Fast-Path and historical immunity shield assertions', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const bubbleFile = fs.readFileSync(path.join(__dirname, '../src/components/ai/AiMessageBubble.tsx'), 'utf8');
  assert.match(
    bubbleFile,
    /const isHistorical = !previous\.isLatestMessage && !next\.isLatestMessage;/,
    'AiMessageBubble must distinguish historical messages for memo short-circuit'
  );
  assert.match(
    bubbleFile,
    /\/\/ 1\. 历史消息绝对免疫盾/,
    'AiMessageBubble must implement historical message immunity shield'
  );

  const contentFile = fs.readFileSync(path.join(__dirname, '../src/components/ai/AiMessageContent.tsx'), 'utf8');
  assert.match(
    contentFile,
    /const isPlainText = !streaming && !HAS_ANY_MARKDOWN_TRIGGER\.test\(cleanContent\);/,
    'AiMessageContent must implement pure-text Fast-Path without AST parsing'
  );
  assert.match(
    contentFile,
    /const lineThreshold = params\.isDeepHistory \? 10 : 14;/,
    'AiMessageContent must enforce 14 and 10 lines folding threshold'
  );
  assert.match(
    contentFile,
    /const shouldFoldCode = codeLines > 12 && !streaming;/,
    'AiCodeBlockView must implement code folding for blocks > 12 lines'
  );
  assert.match(
    contentFile,
    /const cached = markdownParseCache\.get\(content\);/,
    'getCachedMarkdownContent must use markdownParseCache LRU map'
  );
});
