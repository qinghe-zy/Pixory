const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('diagnostic batch writes do not open a nested SQLite transaction', () => {
  const repository = fs.readFileSync('src/diagnostics/diagnosticRepository.ts', 'utf8');
  assert.doesNotMatch(repository, /insertDiagnosticEvents[\s\S]*withTransactionAsync/);
});

test('chat diagnostics cover history, first layout, stream windows, and paging', () => {
  const screen = fs.readFileSync('src/screens/AiChatScreen.tsx', 'utf8');
  for (const eventType of ['chat_history_load_started', 'chat_history_load_completed', 'chat_content_layout', 'chat_stream_render_window', 'chat_history_page_completed']) {
    assert.match(screen, new RegExp(eventType));
  }
});

test('home and materials diagnostics cover load performance', () => {
  const home = fs.readFileSync('src/screens/AiHomeScreen.tsx', 'utf8');
  const materials = fs.readFileSync('src/screens/AiMaterialListScreen.tsx', 'utf8');
  assert.match(home, /home_load_started/);
  assert.match(home, /home_threads_load_completed/);
  assert.match(home, /home_roles_load_completed/);
  assert.match(materials, /materials_load_started/);
  assert.match(materials, /materials_load_completed/);
});
