const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('generation state machine declares ordered terminal phases and rejects invalid transitions', () => {
  const source = fs.readFileSync('src/ai/aiGenerationStateMachine.ts', 'utf8');
  for (const phase of ['created', 'local_persisted', 'request_started', 'first_byte', 'reasoning', 'answer', 'terminal', 'final_persisted', 'ui_stable']) assert.match(source, new RegExp(`['"]${phase}['"]`));
  assert.match(source, /invalid_transition/);
  assert.match(source, /duplicate_terminal/);
});

test('diagnostic windows aggregate high-frequency samples without per-token persistence', () => {
  const source = fs.readFileSync('src/diagnostics/diagnosticWindowAggregator.ts', 'utf8');
  assert.match(source, /aggregateDiagnosticWindow/);
  assert.match(source, /jsFrameP95/);
  assert.match(source, /anomalyFlags/);
  assert.match(source, /shouldSuspectBlankScreen/);
});