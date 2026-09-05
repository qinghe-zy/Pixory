const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('chat list uses guarded dynamic clipping instead of permanent Android false', () => {
  const source = fs.readFileSync('src/screens/AiChatScreen.tsx', 'utf8');
  assert.match(source, /clippingEnabled/);
  assert.match(source, /setTimeout\(\(\) => setClippingEnabled\(true\), 1000\)/);
  assert.match(source, /recordDiagnosticIncident/);
  assert.doesNotMatch(source, /Platform\.OS === "android" \? false : undefined/);
});