const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src/screens/CompanionInnerLifeScreen.tsx'),
  'utf8',
);

test('inner-life index owns compact header tabs and content rhythm', () => {
  assert.match(source, /screen:\s*\{[^}]*gap:\s*0/);
  assert.match(source, /tabsSection:\s*\{[^}]*marginTop:\s*rhythm\.fieldContentGap/);
  assert.match(source, /content:\s*\{[^}]*marginTop:\s*rhythm\.heroToListGap/);
  assert.match(source, /empty:\s*\{[^}]*marginTop:\s*0/);
});
