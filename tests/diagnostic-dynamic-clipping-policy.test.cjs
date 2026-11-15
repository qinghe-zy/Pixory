const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('chat list keeps Android removeClippedSubviews permanently disabled to avoid Fabric image blank screens', () => {
  const source = fs.readFileSync('src/screens/AiChatScreen.tsx', 'utf8');
  assert.match(source, /Platform\.OS === "android" \? false : undefined/);
  assert.match(source, /recordDiagnosticIncident/);
  assert.doesNotMatch(source, /setClippingEnabled\(/);
});
