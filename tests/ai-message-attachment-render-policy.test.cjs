const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('AiMessageBubble renders documents with exact same 120x120 dimensions as images', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  assert.match(source, /attachmentImageOuter:\s*\{[^}]*height:\s*120[^}]*width:\s*120/s);
  assert.match(source, /attachmentDocumentOuter:\s*\{[^}]*height:\s*120[^}]*width:\s*120/s);
  assert.match(source, /attachmentDocumentOuter:\s*\{[^}]*flexDirection:\s*'column'/s);
});

test('AiChatScreen populates attachments into optimistic user message for instant synchronized rendering', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  assert.match(source, /function createOptimisticUserMessage\([^)]*attachments\?:\s*AiComposerAttachment\[\]/);
  assert.match(source, /createOptimisticUserMessage\([^)]*pendingUserMessage\.attachments/);
  assert.match(source, /attachments:\s*attachments\?\.map\(\(attachment\)\s*=>/);
});

test('AiChatScreen preserves in-memory optimistic attachments during streaming reloads', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
  assert.match(source, /if \(currentMessage\?\.attachments && currentMessage\.attachments\.length > 0\)/);
  assert.match(source, /resolvedMessage = \{ \.\.\.message, attachments: currentMessage\.attachments \};/);
});
