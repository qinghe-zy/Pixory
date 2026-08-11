const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('companion cards can reuse the shared version stepper controls', () => {
  const stepperPath = path.join(root, 'src/components/ai/AiVersionStepper.tsx');
  const stepper = fs.existsSync(stepperPath) ? fs.readFileSync(stepperPath, 'utf8') : '';

  assert.match(stepper, /currentIndex[\s\S]*total/);
  assert.match(stepper, /chevron-back/);
  assert.match(stepper, /chevron-forward/);
  assert.match(read('src/components/ai/AiMessageBubble.tsx'), /AiVersionStepper/);
});
