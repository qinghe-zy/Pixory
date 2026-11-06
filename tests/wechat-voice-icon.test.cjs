const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('WeChatVoiceIcon 1:1 replica of WeChat voice input icon', () => {
  const filePath = path.resolve(__dirname, '../src/im/components/WeChatVoiceIcon.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  // 1. Component export
  assert.ok(content.includes('export const WeChatVoiceIcon'), 'Must export WeChatVoiceIcon component');

  // 2. Strict horizontal layout - no rotation
  assert.ok(!content.includes('rotate(-45'), 'Must not have -45 degree rotation, should be strictly horizontal');
  assert.ok(!content.includes('rotate(45'), 'Must not have 45 degree rotation');

  // 3. Circular outer border
  assert.ok(content.includes('cx="14"'), 'Outer circle must be centered at x=14');
  assert.ok(content.includes('cy="14"'), 'Outer circle must be centered at y=14');
  assert.ok(content.includes('r="11.5"'), 'Outer circle radius must be 11.5 in 28x28 viewBox');

  // 4. Horizontal sound cone (Apex on left, base arc on right)
  assert.ok(content.includes('M8.6 14'), 'Triangle apex must point left at (8.6, 14)');

  // 5. Two concentric wave arcs radiating to the right with round caps
  assert.ok(content.includes('strokeLinecap="round"'), 'Arcs must have rounded caps');
  assert.ok(content.includes('fill="none"'), 'Arc paths must have fill="none"');

  // 6. Configurable props
  assert.ok(content.includes('size = 28'), 'Default size must be 28');
  assert.ok(content.includes('strokeWidth = 1.9'), 'Default strokeWidth must be 1.9');
});
