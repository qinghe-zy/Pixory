# SillyTavern Role Card Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready local SillyTavern role card import flow with role-library entry, PNG/JSON parsing, import preview, greeting-aware save/start-chat behavior, and backward compatibility for existing Pixory role cards.

**Architecture:** Add a focused parser/normalizer under `src/ai`, extend the local role-card schema with nullable/default import fields, then wire the existing role editor into an import-preview flow. Chat-start-from-role is isolated to a new explicit service path so existing role application and old role cards keep their current behavior.

**Tech Stack:** Expo React Native, TypeScript, Expo SQLite, Expo DocumentPicker/FileSystem, existing Pixory AI light components, Node policy tests under `tests/*.test.cjs`.

---

## Scope And Guardrails

- Implement from a clean working tree or a dedicated branch/worktree.
- Do not remove existing manual role-card behavior.
- Do not add cloud, sync, accounts, or remote role-card parsing.
- Do not modify imported source PNG/JSON files.
- Keep source JSON and avatars scoped to Pixory `normal`/`personal` spaces.
- Do not implement dynamic SillyTavern world-book triggering, regex scripts, macros, group chats, or CHARX package support.
- Preserve current AI chat P0 fixes and avoid unrelated formatting churn.

## File Structure

Create:

- `src/ai/sillyTavernRoleCardParser.ts`  
  Pure parsing and normalization for PNG/JSON role cards. No React, no database, no network.

- `src/components/ai/AiRoleCardImportPreview.tsx`  
  Preview surface for normalized imports. Receives props and emits `save`, `start`, `edit`, `cancel`.

Modify:

- `src/ai/types.ts`  
  Extend `AiRoleCardRecord` and add import source types.

- `src/database/schema.ts`  
  Bump database version and add migration columns for role-card import fields.

- `src/database/repositories/aiRoleCardRepository.ts`  
  Map and persist new role-card fields with safe defaults.

- `src/ai/aiRoleCardService.ts`  
  Extend `saveRoleCard` input and add `saveImportedRoleCard`.

- `src/ai/aiChatService.ts`  
  Add explicit new-chat-from-role helper that can insert a completed assistant greeting.

- `src/screens/AiRoleCardEditorScreen.tsx`  
  Add import button, picker, preview state, edit-after-import flow, visual role-library cards, DIY/import source badges, and save/start actions.

- `src/screens/AiHomeScreen.tsx`  
  Replace recent-materials block with role-library entry; remove recent-materials fetching from the workbench screen.

- `App.tsx`  
  Add role-library navigation entry from AI workbench and callback for role-card start-chat.

Test:

- `tests/ai-role-card-import-parser.test.cjs`
- `tests/ai-role-card-import-policy.test.cjs`
- Update existing schema version assertions in policy tests from `29` to the new version.

---

### Task 1: Schema, Types, And Repository Compatibility

**Files:**

- Modify: `src/database/schema.ts`
- Modify: `src/ai/types.ts`
- Modify: `src/database/repositories/aiRoleCardRepository.ts`
- Modify: `src/ai/aiRoleCardService.ts`
- Test: `tests/ai-role-card-import-policy.test.cjs`
- Update tests with schema version assertions:
  - `tests/ai-schema-policy.test.cjs`
  - `tests/ai-chat-fixes-policy.test.cjs`
  - `tests/privacy-cover-viewer-policy.test.cjs`
  - `tests/batch-organize-ux-policy.test.cjs`
  - `tests/asset-duplicate-v1-policy.test.cjs`
  - `tests/final-personal-system-policy.test.cjs`
  - `tests/page-todos-smart-ip-policy.test.cjs`
  - `tests/v2-ux-enhancement-policy.test.cjs`

- [ ] **Step 1: Write the failing role-card import schema policy test**

Create `tests/ai-role-card-import-policy.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('AI role cards store SillyTavern import metadata without breaking manual cards', () => {
  const schema = read('src/database/schema.ts');
  const types = read('src/ai/types.ts');
  const repository = read('src/database/repositories/aiRoleCardRepository.ts');
  const service = read('src/ai/aiRoleCardService.ts');

  assert.match(schema, /DATABASE_VERSION = 30/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN firstMessage TEXT/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN alternateGreetingsJson TEXT NOT NULL DEFAULT '\\[\\]'/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN sourceType TEXT/);
  assert.match(schema, /ALTER TABLE ai_role_cards ADD COLUMN sourceJson TEXT/);
  assert.match(types, /export type AiRoleCardSourceType/);
  assert.match(types, /firstMessage: string \\| null/);
  assert.match(types, /alternateGreetings: string\\[\\]/);
  assert.match(types, /sourceType: AiRoleCardSourceType \\| null/);
  assert.match(types, /sourceJson: string \\| null/);
  assert.match(repository, /parseAlternateGreetings/);
  assert.match(repository, /firstMessage: row\\.firstMessage \\?\\? null/);
  assert.match(repository, /alternateGreetings: parseAlternateGreetings\\(row\\.alternateGreetingsJson\\)/);
  assert.match(repository, /sourceType: normalizeRoleCardSourceType\\(row\\.sourceType\\)/);
  assert.match(service, /sourceType\\?: AiRoleCardSourceType \\| null/);
  assert.match(service, /sourceJson\\?: string \\| null/);
  assert.match(service, /sourceType: input\\.sourceType \\?\\? 'pixory_manual'/);
});
```

- [ ] **Step 2: Run the focused policy test and verify it fails**

Run:

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
```

Expected: FAIL because `DATABASE_VERSION = 30`, new columns, and new type fields do not exist yet.

- [ ] **Step 3: Extend AI role-card types**

Modify `src/ai/types.ts`:

```ts
export type AiRoleCardSourceType =
  | 'sillytavern_png_v2'
  | 'sillytavern_png_v3'
  | 'sillytavern_json_v2'
  | 'sillytavern_json_v3'
  | 'tavern_json_v1'
  | 'pixory_manual';

export interface AiRoleCardRecord {
  id: string;
  space: PixorySpace;
  name: string;
  description: string | null;
  prompt: string;
  firstMessage: string | null;
  alternateGreetings: string[];
  sourceType: AiRoleCardSourceType | null;
  sourceJson: string | null;
  defaultLanguage: string | null;
  defaultModelId: string | null;
  boundaryMode: AiBoundaryMode;
  avatarEnabled: boolean;
  avatarUri: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
```

- [ ] **Step 4: Add schema migration**

Modify `src/database/schema.ts`:

```ts
export const DATABASE_VERSION = 30;
```

Add the new columns to the `CREATE TABLE IF NOT EXISTS ai_role_cards` block after `prompt TEXT NOT NULL`:

```sql
  firstMessage TEXT,
  alternateGreetingsJson TEXT NOT NULL DEFAULT '[]',
  sourceType TEXT,
  sourceJson TEXT,
```

Add a new migration block:

```ts
export const MIGRATION_STATEMENTS_V30 = `
ALTER TABLE ai_role_cards ADD COLUMN firstMessage TEXT;
ALTER TABLE ai_role_cards ADD COLUMN alternateGreetingsJson TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ai_role_cards ADD COLUMN sourceType TEXT;
ALTER TABLE ai_role_cards ADD COLUMN sourceJson TEXT;
`;
```

Check `src/database/db.ts` for the migration export pattern. Add `MIGRATION_STATEMENTS_V30` to the versioned migration list exactly where existing migrations are wired.

- [ ] **Step 5: Update repository mapping and create input**

Modify `src/database/repositories/aiRoleCardRepository.ts`.

Import the new type:

```ts
import type { AiBoundaryMode, AiRoleCardRecord, AiRoleCardSourceType } from '../../ai/types';
```

Update row type:

```ts
type AiRoleCardRow = Omit<AiRoleCardRecord, 'tags' | 'avatarEnabled' | 'alternateGreetings' | 'sourceType'> & {
  avatarEnabled: number;
  alternateGreetingsJson: string;
  sourceType: string | null;
  tagsJson: string;
};
```

Update create input:

```ts
export interface CreateAiRoleCardInput {
  id: string;
  space: PixorySpace;
  name: string;
  description?: string | null;
  prompt: string;
  firstMessage?: string | null;
  alternateGreetings?: string[];
  sourceType?: AiRoleCardSourceType | null;
  sourceJson?: string | null;
  defaultLanguage?: string | null;
  defaultModelId?: string | null;
  boundaryMode?: AiBoundaryMode;
  avatarEnabled?: boolean;
  avatarUri?: string | null;
  tags?: string[];
}
```

Add helpers:

```ts
function parseAlternateGreetings(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeRoleCardSourceType(value: string | null | undefined): AiRoleCardSourceType | null {
  if (
    value === 'sillytavern_png_v2' ||
    value === 'sillytavern_png_v3' ||
    value === 'sillytavern_json_v2' ||
    value === 'sillytavern_json_v3' ||
    value === 'tavern_json_v1' ||
    value === 'pixory_manual'
  ) {
    return value;
  }
  return null;
}
```

Add fields to `mapRoleCardRow`:

```ts
firstMessage: row.firstMessage ?? null,
alternateGreetings: parseAlternateGreetings(row.alternateGreetingsJson),
sourceType: normalizeRoleCardSourceType(row.sourceType),
sourceJson: row.sourceJson ?? null,
```

Add columns to `INSERT INTO ai_role_cards` and values:

```sql
firstMessage,
alternateGreetingsJson,
sourceType,
sourceJson,
```

```ts
input.firstMessage?.trim() || null,
JSON.stringify(input.alternateGreetings ?? []),
input.sourceType ?? null,
input.sourceJson ?? null,
```

Add the same fields to the returned object from `create`.

- [ ] **Step 6: Extend role-card service save input**

Modify `src/ai/aiRoleCardService.ts`:

```ts
import type { AiBoundaryMode, AiRoleCardRecord, AiRoleCardSourceType } from './types';
```

Extend `saveRoleCard` input:

```ts
firstMessage?: string | null;
alternateGreetings?: string[];
sourceType?: AiRoleCardSourceType | null;
sourceJson?: string | null;
tags?: string[];
```

Pass fields into `aiRoleCardRepository.create`. Manual saves should mark the card as `pixory_manual` for role-library badges while imported saves keep their explicit import source:

```ts
firstMessage: input.firstMessage?.trim() || null,
alternateGreetings: input.alternateGreetings ?? [],
sourceType: input.sourceType ?? 'pixory_manual',
sourceJson: input.sourceJson ?? null,
tags: input.tags ?? [],
```

- [ ] **Step 7: Update existing schema-version policy tests**

Search:

```powershell
rg -n "DATABASE_VERSION\\s*=\\s*29|DATABASE_VERSION = 29" tests
```

For each assertion that expects `29`, update it to `30`. Do not change unrelated test expectations.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
node --test tests\ai-role-card-import-policy.test.cjs tests\ai-schema-policy.test.cjs
pnpm typecheck
```

Expected: both tests pass and TypeScript reports no errors.

- [ ] **Step 9: Commit Task 1**

```powershell
git add src\database\schema.ts src\ai\types.ts src\database\repositories\aiRoleCardRepository.ts src\ai\aiRoleCardService.ts tests\ai-role-card-import-policy.test.cjs tests\ai-schema-policy.test.cjs tests\ai-chat-fixes-policy.test.cjs tests\privacy-cover-viewer-policy.test.cjs tests\batch-organize-ux-policy.test.cjs tests\asset-duplicate-v1-policy.test.cjs tests\final-personal-system-policy.test.cjs tests\page-todos-smart-ip-policy.test.cjs tests\v2-ux-enhancement-policy.test.cjs
git commit -m "feat: extend ai role card import metadata"
```

---

### Task 2: Parser And Normalizer

**Files:**

- Create: `src/ai/sillyTavernRoleCardParser.ts`
- Test: `tests/ai-role-card-import-parser.test.cjs`

- [ ] **Step 1: Write parser tests**

Create `tests/ai-role-card-import-parser.test.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const parserSource = () => fs.readFileSync(path.join(root, 'src/ai/sillyTavernRoleCardParser.ts'), 'utf8');

function pngChunk(type, data) {
  const buffer = Buffer.alloc(8 + data.length + 4);
  buffer.writeUInt32BE(data.length, 0);
  buffer.write(type, 4, 4, 'ascii');
  data.copy(buffer, 8);
  buffer.writeUInt32BE(0, 8 + data.length);
  return buffer;
}

function makePngWithChara(json) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const payload = Buffer.from(`chara\0${Buffer.from(JSON.stringify(json), 'utf8').toString('base64')}`, 'latin1');
  return Buffer.concat([signature, pngChunk('tEXt', payload), pngChunk('IEND', Buffer.alloc(0))]).toString('base64');
}

test('SillyTavern parser exposes PNG JSON V2 V3 V1 and normalization contracts', () => {
  const source = parserSource();
  assert.match(source, /export type SillyTavernImportSourceType/);
  assert.match(source, /export interface NormalizedSillyTavernRoleCard/);
  assert.match(source, /export function parseSillyTavernJson/);
  assert.match(source, /export function parseSillyTavernPngBase64/);
  assert.match(source, /export function normalizeSillyTavernRoleCard/);
  assert.match(source, /PNG_SIGNATURE/);
  assert.match(source, /readUInt32BE/);
  assert.match(source, /tEXt/);
  assert.match(source, /iTXt/);
  assert.match(source, /character_book/);
  assert.match(source, /alternate_greetings/);
  assert.match(source, /worldBookTruncated/);
});

test('PNG fixture builder documents expected chara payload shape', () => {
  const card = { spec: 'chara_card_v2', data: { name: 'Mira', description: 'Archivist', first_mes: 'Hello.' } };
  const base64 = makePngWithChara(card);
  assert.ok(base64.length > 0);
});
```

This test is source-oriented because the project test suite currently uses policy tests rather than a TS runtime transpiler.

- [ ] **Step 2: Run parser test and verify it fails**

```powershell
node --test tests\ai-role-card-import-parser.test.cjs
```

Expected: FAIL because the parser file does not exist.

- [ ] **Step 3: Implement parser types and constants**

Create `src/ai/sillyTavernRoleCardParser.ts`:

```ts
import type { AiRoleCardSourceType } from './types';

export type SillyTavernImportSourceType = AiRoleCardSourceType;

export interface NormalizedSillyTavernRoleCard {
  name: string;
  description: string | null;
  prompt: string;
  firstMessage: string | null;
  alternateGreetings: string[];
  tags: string[];
  sourceType: SillyTavernImportSourceType;
  sourceJson: string;
  sourceVersion: 'v1' | 'v2' | 'v3';
  creator: string | null;
  characterVersion: string | null;
  worldBookEntryCount: number;
  worldBookMergedCharacterCount: number;
  worldBookTruncated: boolean;
  warnings: string[];
}

export type SillyTavernParseResult =
  | { ok: true; normalized: NormalizedSillyTavernRoleCard }
  | { ok: false; code: 'unsupported_file' | 'invalid_png' | 'missing_chara' | 'invalid_base64' | 'invalid_json' | 'unsupported_spec' | 'missing_role_content'; message: string };

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const MAX_CHARA_BASE64_LENGTH = 2_000_000;
const MAX_WORLD_BOOK_CHARS = 5000;
```

- [ ] **Step 4: Implement JSON normalization**

Add:

```ts
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => stringField(item)).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function detectPayload(raw: JsonRecord): { data: JsonRecord; version: 'v1' | 'v2' | 'v3'; sourceType: AiRoleCardSourceType } | null {
  const spec = stringField(raw.spec);
  if ((spec === 'chara_card_v2' || spec === 'chara_card_v3') && isRecord(raw.data)) {
    return {
      data: raw.data,
      version: spec === 'chara_card_v3' ? 'v3' : 'v2',
      sourceType: spec === 'chara_card_v3' ? 'sillytavern_json_v3' : 'sillytavern_json_v2',
    };
  }
  if (stringField(raw.name) || stringField(raw.description) || stringField(raw.first_mes)) {
    return { data: raw, version: 'v1', sourceType: 'tavern_json_v1' };
  }
  return null;
}

function markdownSection(title: string, content: string): string {
  return content.trim() ? `## ${title}\n${content.trim()}` : '';
}
```

Add world-book extraction:

```ts
function extractWorldBook(data: JsonRecord): { text: string; count: number; truncated: boolean; mergedChars: number } {
  const book = data.character_book;
  if (!isRecord(book) || !Array.isArray(book.entries)) {
    return { text: '', count: 0, truncated: false, mergedChars: 0 };
  }
  const parts: string[] = [];
  let total = 0;
  let truncated = false;
  for (const entry of book.entries) {
    if (!isRecord(entry) || entry.enabled === false) {
      continue;
    }
    const content = stringField(entry.content);
    if (!content) {
      continue;
    }
    const label = stringField(entry.name) || stringField(entry.comment);
    const block = label ? `### ${label}\n${content}` : content;
    if (total + block.length > MAX_WORLD_BOOK_CHARS) {
      const remaining = Math.max(0, MAX_WORLD_BOOK_CHARS - total);
      if (remaining > 0) {
        parts.push(block.slice(0, remaining));
        total += remaining;
      }
      truncated = true;
      break;
    }
    parts.push(block);
    total += block.length;
  }
  return { text: parts.join('\n\n'), count: parts.length, truncated, mergedChars: total };
}
```

Add normalization:

```ts
export function normalizeSillyTavernRoleCard(raw: JsonRecord, preferredSourceType?: AiRoleCardSourceType): SillyTavernParseResult {
  const detected = detectPayload(raw);
  if (!detected) {
    return { ok: false, code: 'unsupported_spec', message: '当前版本支持 V2/V3 角色卡，并兼容常见 V1 字段。' };
  }
  const data = detected.data;
  const sourceType = preferredSourceType ?? detected.sourceType;
  const name = stringField(data.name) || '未命名角色';
  const description = stringField(data.description);
  const personality = stringField(data.personality);
  const scenario = stringField(data.scenario);
  const systemPrompt = stringField(data.system_prompt);
  const postHistory = stringField(data.post_history_instructions);
  const mesExample = stringField(data.mes_example);
  const firstMessage = stringField(data.first_mes) || null;
  const alternateGreetings = uniqueStrings([...(firstMessage ? [firstMessage] : []), ...stringArray(data.alternate_greetings)]);
  const tags = uniqueStrings(stringArray(data.tags));
  const worldBook = extractWorldBook(data);
  const prompt = [
    markdownSection('角色设定', [description, personality].filter(Boolean).join('\n\n')),
    markdownSection('场景背景', scenario),
    markdownSection('系统规则', [systemPrompt, postHistory].filter(Boolean).join('\n\n')),
    markdownSection('对话示例', mesExample),
    markdownSection('附加设定', worldBook.text),
  ].filter(Boolean).join('\n\n');

  if (!prompt.trim() && !firstMessage) {
    return { ok: false, code: 'missing_role_content', message: '角色卡缺少可导入的设定内容。' };
  }

  return {
    ok: true,
    normalized: {
      name,
      description: stringField(data.creator_notes) || description || null,
      prompt,
      firstMessage,
      alternateGreetings,
      tags,
      sourceType,
      sourceJson: JSON.stringify(raw),
      sourceVersion: detected.version,
      creator: stringField(data.creator) || null,
      characterVersion: stringField(data.character_version) || null,
      worldBookEntryCount: worldBook.count,
      worldBookMergedCharacterCount: worldBook.mergedChars,
      worldBookTruncated: worldBook.truncated,
      warnings: worldBook.truncated ? ['部分附加设定因长度限制未导入'] : [],
    },
  };
}
```

Add JSON parser:

```ts
export function parseSillyTavernJson(text: string): SillyTavernParseResult {
  try {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed)) {
      return { ok: false, code: 'invalid_json', message: '角色卡 JSON 顶层结构无效。' };
    }
    return normalizeSillyTavernRoleCard(parsed);
  } catch {
    return { ok: false, code: 'invalid_json', message: '无法解析角色卡 JSON。' };
  }
}
```

- [ ] **Step 5: Implement PNG chunk parser**

Add:

```ts
function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000) + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
}

function extractTextChunkPayload(type: string, data: Uint8Array): string | null {
  const nulIndex = data.indexOf(0);
  if (nulIndex < 0) {
    return null;
  }
  const keyword = latin1(data.slice(0, nulIndex));
  if (keyword !== 'chara') {
    return null;
  }
  if (type === 'tEXt') {
    return latin1(data.slice(nulIndex + 1)).trim();
  }
  if (type === 'iTXt') {
    const rest = data.slice(nulIndex + 1);
    if (rest.length < 5 || rest[0] !== 0) {
      return null;
    }
    let cursor = 2;
    while (cursor < rest.length && rest[cursor] !== 0) cursor += 1;
    cursor += 1;
    while (cursor < rest.length && rest[cursor] !== 0) cursor += 1;
    cursor += 1;
    return utf8(rest.slice(cursor)).trim();
  }
  return null;
}

export function parseSillyTavernPngBase64(base64: string): SillyTavernParseResult {
  const bytes = base64ToBytes(base64);
  if (bytes.length < 12 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return { ok: false, code: 'invalid_png', message: '所选文件不是有效 PNG。' };
  }
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUInt32BE(bytes, offset);
    const type = latin1(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length < 0 || dataEnd + 4 > bytes.length) {
      return { ok: false, code: 'invalid_png', message: 'PNG 数据块长度无效。' };
    }
    if (type === 'tEXt' || type === 'iTXt') {
      const payload = extractTextChunkPayload(type, bytes.slice(dataStart, dataEnd));
      if (payload) {
        if (payload.length > MAX_CHARA_BASE64_LENGTH) {
          return { ok: false, code: 'invalid_base64', message: '角色卡数据过大，无法安全导入。' };
        }
        try {
          const json = utf8(base64ToBytes(payload));
          const parsed = JSON.parse(json);
          if (!isRecord(parsed)) {
            return { ok: false, code: 'invalid_json', message: '角色卡 JSON 顶层结构无效。' };
          }
          const normalized = normalizeSillyTavernRoleCard(parsed);
          if (!normalized.ok) {
            return normalized;
          }
          const sourceType = normalized.normalized.sourceVersion === 'v3' ? 'sillytavern_png_v3' : 'sillytavern_png_v2';
          return { ok: true, normalized: { ...normalized.normalized, sourceType } };
        } catch {
          return { ok: false, code: 'invalid_base64', message: '无法解码 PNG 中的角色卡数据。' };
        }
      }
    }
    if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  return { ok: false, code: 'missing_chara', message: '未检测到角色数据。' };
}
```

- [ ] **Step 6: Run parser and type checks**

```powershell
node --test tests\ai-role-card-import-parser.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src\ai\sillyTavernRoleCardParser.ts tests\ai-role-card-import-parser.test.cjs
git commit -m "feat: parse sillytavern role cards"
```

---

### Task 3: Imported Role Save And Start-Chat Service

**Files:**

- Modify: `src/ai/aiRoleCardService.ts`
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-role-card-import-policy.test.cjs`

- [ ] **Step 1: Add failing policy assertions**

Append to `tests/ai-role-card-import-policy.test.cjs`:

```js
test('imported roles can start a normal chat with a saved assistant greeting', () => {
  const roleService = read('src/ai/aiRoleCardService.ts');
  const chatService = read('src/ai/aiChatService.ts');

  assert.match(roleService, /export async function saveImportedRoleCard/);
  assert.match(roleService, /NormalizedSillyTavernRoleCard/);
  assert.match(chatService, /export async function createNormalThreadFromRoleCard/);
  assert.match(chatService, /firstMessage/);
  assert.match(chatService, /roleSnapshotJson: JSON\\.stringify\\(roleCard\\)/);
  assert.match(chatService, /roleCard\\.firstMessage/);
  assert.match(chatService, /role: 'assistant'/);
  assert.match(chatService, /status: 'completed'/);
});
```

- [ ] **Step 2: Run focused policy test and verify it fails**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
```

Expected: FAIL because service functions do not exist.

- [ ] **Step 3: Add imported role save helper**

Modify `src/ai/aiRoleCardService.ts`:

```ts
import type { NormalizedSillyTavernRoleCard } from './sillyTavernRoleCardParser';
```

Add:

```ts
export async function saveImportedRoleCard(input: {
  space: PixorySpace;
  imported: NormalizedSillyTavernRoleCard;
  avatarUri?: string | null;
  firstMessage?: string | null;
}): Promise<AiRoleCardRecord> {
  return saveRoleCard({
    alternateGreetings: input.imported.alternateGreetings,
    avatarEnabled: Boolean(input.avatarUri),
    avatarUri: input.avatarUri ?? null,
    description: input.imported.description,
    firstMessage: input.firstMessage ?? input.imported.firstMessage,
    name: input.imported.name,
    prompt: input.imported.prompt,
    sourceJson: input.imported.sourceJson,
    sourceType: input.imported.sourceType,
    space: input.space,
    tags: input.imported.tags,
  });
}
```

- [ ] **Step 4: Add explicit normal chat from role helper**

Modify `src/ai/aiChatService.ts`.

Add a new exported helper near `createThreadFromContext`:

```ts
export async function createNormalThreadFromRoleCard(input: {
  roleCardId: string;
  space: PixorySpace;
}): Promise<AiThreadRecord> {
  await ensureBuiltInProviders(input.space);
  return runWithDatabaseSpace(input.space, async (db) => {
    const roleCard = await aiRoleCardRepository.findById(db, input.roleCardId);
    if (!roleCard || roleCard.space !== input.space) {
      throw new Error('角色卡不存在。');
    }
    const { provider, model } = await resolveDefaultThreadProvider(input.space, null, null);
    const thread = await aiThreadRepository.createThread(db, {
      id: createAiId('aithread'),
      space: input.space,
      contextType: 'normal',
      boundIpId: null,
      boundKnowledgeBaseId: null,
      includeIpDocuments: false,
      title: roleCard.name,
      titleStatus: 'custom',
      providerId: provider?.id ?? null,
      modelId: model?.modelId ?? null,
      modelSnapshotJson: JSON.stringify(model ?? {}),
      roleCardId: roleCard.id,
      roleSnapshotJson: JSON.stringify(roleCard),
      roleInstructionWeight: 'default',
      replyPreference: 'auto',
      systemPrompt: roleCard.prompt,
      materialRulesSnapshot: null,
      boundaryMode: roleCard.boundaryMode,
      lastMessagePreview: roleCard.firstMessage?.slice(0, 80) ?? null,
    });
    if (roleCard.firstMessage?.trim()) {
      await aiThreadRepository.createMessage(db, {
        id: createAiId('aimsg'),
        threadId: thread.id,
        role: 'assistant',
        status: 'completed',
        content: roleCard.firstMessage.trim(),
        completedAt: new Date().toISOString(),
      });
    }
    return thread;
  });
}
```

If `CreateAiThreadInput` does not currently accept `lastMessagePreview`, extend it in `src/database/repositories/aiThreadRepository.ts` with `lastMessagePreview?: string | null`, and pass it through the existing insert path where the SQL already includes `lastMessagePreview`.

- [ ] **Step 5: Run focused tests**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src\ai\aiRoleCardService.ts src\ai\aiChatService.ts src\database\repositories\aiThreadRepository.ts tests\ai-role-card-import-policy.test.cjs
git commit -m "feat: start normal chat from imported role"
```

---

### Task 4: Import Preview Component

**Files:**

- Create: `src/components/ai/AiRoleCardImportPreview.tsx`
- Test: `tests/ai-role-card-import-policy.test.cjs`

- [ ] **Step 1: Add failing preview policy assertions**

Append:

```js
test('role card import preview exposes save start and edit actions', () => {
  const preview = read('src/components/ai/AiRoleCardImportPreview.tsx');
  assert.match(preview, /AiRoleCardImportPreview/);
  assert.match(preview, /保存角色/);
  assert.match(preview, /保存并开始聊天/);
  assert.match(preview, /编辑后保存/);
  assert.match(preview, /默认开场白/);
  assert.match(preview, /worldBookTruncated/);
  assert.match(preview, /SecureImage/);
  assert.doesNotMatch(preview, /唤醒|神经元|呼吸|外发光/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
```

Expected: FAIL because preview component does not exist.

- [ ] **Step 3: Create preview component**

Create `src/components/ai/AiRoleCardImportPreview.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { NormalizedSillyTavernRoleCard } from '../../ai/sillyTavernRoleCardParser';
import type { PixorySpace } from '../../database';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../SecureImage';
import { AiLightButton } from './AiLightButton';
import { aiLightColors } from './aiLightTheme';

interface AiRoleCardImportPreviewProps {
  avatarUri: string | null;
  imported: NormalizedSillyTavernRoleCard;
  selectedGreeting: string | null;
  space: PixorySpace;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  onSaveAndStart: () => void;
  onSelectGreeting: (greeting: string | null) => void;
}

export function AiRoleCardImportPreview({
  avatarUri,
  imported,
  selectedGreeting,
  space,
  onCancel,
  onEdit,
  onSave,
  onSaveAndStart,
  onSelectGreeting,
}: AiRoleCardImportPreviewProps) {
  const greetings = imported.alternateGreetings;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={avatarUri} />
          ) : (
            <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconSizeLg} />
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.title}>{imported.name}</Text>
          <Text numberOfLines={2} style={styles.caption}>{imported.description ?? '已解析角色卡'}</Text>
        </View>
        <Pressable accessibilityLabel="关闭导入预览" accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.muted} name="close" size={18} />
        </Pressable>
      </View>

      {imported.tags.length ? (
        <View style={styles.tagRow}>
          {imported.tags.slice(0, 8).map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
        </View>
      ) : null}

      {greetings.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>默认开场白</Text>
          {greetings.map((greeting) => (
            <Pressable
              accessibilityRole="button"
              key={greeting}
              onPress={() => onSelectGreeting(greeting)}
              style={({ pressed }) => [styles.greetingRow, selectedGreeting === greeting && styles.greetingRowActive, pressed && styles.pressed]}
            >
              <Text numberOfLines={3} style={styles.greetingText}>{greeting}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>导入摘要</Text>
        <Text style={styles.caption}>
          {`设定 ${imported.prompt.length} 字 · 附加设定 ${imported.worldBookEntryCount} 条`}
        </Text>
        {imported.worldBookTruncated ? <Text style={styles.warning}>部分附加设定因长度限制未导入</Text> : null}
      </View>

      <View style={styles.actions}>
        <AiLightButton label="保存角色" onPress={onSave} />
        <AiLightButton label="保存并开始聊天" onPress={onSaveAndStart} variant="outline" />
        <AiLightButton label="编辑后保存" onPress={onEdit} variant="ghost" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.lg,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  headerCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  closeButton: {
    alignItems: 'center',
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  tag: {
    ...typography.textStyles.micro,
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    color: aiLightColors.muted,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  section: {
    gap: rhythm.microGap,
  },
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  greetingRow: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[2],
  },
  greetingRowActive: {
    borderColor: aiLightColors.coral,
  },
  greetingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  warning: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
});
```

- [ ] **Step 4: Run tests**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src\components\ai\AiRoleCardImportPreview.tsx tests\ai-role-card-import-policy.test.cjs
git commit -m "feat: add role card import preview"
```

---

### Task 5: Role Editor Import Flow

**Files:**

- Modify: `src/screens/AiRoleCardEditorScreen.tsx`
- Modify if needed: `package.json` only if project lacks required Expo packages. Prefer existing `expo-document-picker` and `expo-file-system` if already present.
- Test: `tests/ai-role-card-import-policy.test.cjs`

- [ ] **Step 1: Add failing policy assertions**

Append:

```js
test('role editor imports SillyTavern PNG and JSON cards locally', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  assert.match(editor, /expo-document-picker/);
  assert.match(editor, /expo-file-system/);
  assert.match(editor, /parseSillyTavernJson/);
  assert.match(editor, /parseSillyTavernPngBase64/);
  assert.match(editor, /AiRoleCardImportPreview/);
  assert.match(editor, /导入角色卡/);
  assert.match(editor, /saveImportedRoleCard/);
  assert.match(editor, /copyAiRoleAvatarToAppStorage/);
  assert.match(editor, /onStartChatWithRole/);
  assert.doesNotMatch(editor, /fetch\\(/);
});

test('role library displays saved roles as visual cards with covers and source badges', () => {
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  assert.match(editor, /function getRoleCardSourceLabel/);
  assert.match(editor, /DIY 角色/);
  assert.match(editor, /酒馆角色/);
  assert.match(editor, /styles\.roleCover/);
  assert.match(editor, /styles\.sourceBadge/);
  assert.match(editor, /card\.avatarEnabled && card\.avatarUri/);
  assert.match(editor, /SecureImage[\s\S]*style=\{styles\.roleCoverImage\}/);
  assert.match(editor, /已保存/);
  assert.match(editor, /numberOfLines=\{2\} style=\{styles\.caption\}/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
```

Expected: FAIL because the editor has no import flow.

- [ ] **Step 3: Extend screen props**

Modify `AiRoleCardEditorScreenProps`:

```ts
onStartChatWithRole?: (roleCardId: string) => void;
```

Update function signature:

```ts
export function AiRoleCardEditorScreen({ space, roleCardId, threadId, onBack, onApplyRoleCard, onStartChatWithRole }: AiRoleCardEditorScreenProps) {
```

- [ ] **Step 4: Add imports and state**

Add imports:

```ts
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { AiRoleCardImportPreview } from '../components/ai/AiRoleCardImportPreview';
import { parseSillyTavernJson, parseSillyTavernPngBase64, type NormalizedSillyTavernRoleCard } from '../ai/sillyTavernRoleCardParser';
import { saveImportedRoleCard } from '../ai/aiRoleCardService';
```

Keep existing `saveRoleCard` import and add `saveImportedRoleCard` to it rather than making a second import from the same module.

Add state:

```ts
const [importedRole, setImportedRole] = useState<NormalizedSillyTavernRoleCard | null>(null);
const [importedAvatarUri, setImportedAvatarUri] = useState<string | null>(null);
const [selectedGreeting, setSelectedGreeting] = useState<string | null>(null);
const [importing, setImporting] = useState(false);
```

- [ ] **Step 5: Add picker and parse handlers**

Add:

```ts
function isJsonAsset(asset: DocumentPicker.DocumentPickerAsset): boolean {
  return asset.mimeType === 'application/json' || asset.name.toLowerCase().endsWith('.json');
}

function isPngAsset(asset: DocumentPicker.DocumentPickerAsset): boolean {
  return asset.mimeType === 'image/png' || asset.name.toLowerCase().endsWith('.png');
}

async function importRoleCard() {
  setStatus(null);
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['image/png', 'application/json'],
  });
  if (result.canceled || !result.assets[0]) {
    return;
  }
  const asset = result.assets[0];
  setImporting(true);
  try {
    const parsed = isJsonAsset(asset)
      ? parseSillyTavernJson(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 }))
      : isPngAsset(asset)
        ? parseSillyTavernPngBase64(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }))
        : { ok: false as const, code: 'unsupported_file' as const, message: '请选择 PNG 或 JSON 角色卡。' };

    if (!parsed.ok) {
      if (parsed.code === 'missing_chara' && isPngAsset(asset)) {
        const copiedUri = await copyAiRoleAvatarToAppStorage(asset.uri, space);
        setAvatarUri(copiedUri);
        setAvatarEnabled(true);
        setStatus('未检测到角色数据，已将图片作为角色头像。');
        return;
      }
      setStatus(parsed.message);
      return;
    }

    const copiedAvatarUri = isPngAsset(asset) ? await copyAiRoleAvatarToAppStorage(asset.uri, space) : null;
    setImportedRole(parsed.normalized);
    setImportedAvatarUri(copiedAvatarUri);
    setSelectedGreeting(parsed.normalized.firstMessage ?? parsed.normalized.alternateGreetings[0] ?? null);
  } catch (error) {
    setStatus(error instanceof Error ? `导入失败：${error.message}` : '导入失败');
  } finally {
    setImporting(false);
  }
}
```

- [ ] **Step 6: Add save/start/edit handlers**

Add:

```ts
async function saveImported(startChat: boolean) {
  if (!importedRole) {
    return null;
  }
  setSaving(true);
  try {
    const card = await saveImportedRoleCard({
      avatarUri: importedAvatarUri,
      firstMessage: selectedGreeting,
      imported: importedRole,
      space,
    });
    setImportedRole(null);
    setImportedAvatarUri(null);
    setStatus(startChat ? '已保存，正在开始聊天。' : '已保存角色。');
    await loadCards();
    if (startChat) {
      onStartChatWithRole?.(card.id);
    }
    return card;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存失败');
    return null;
  } finally {
    setSaving(false);
  }
}

function editImportedRole() {
  if (!importedRole) {
    return;
  }
  setName(importedRole.name);
  setDescription(importedRole.description ?? '');
  setPrompt(importedRole.prompt);
  setAvatarUri(importedAvatarUri);
  setAvatarEnabled(Boolean(importedAvatarUri));
  setImportedRole(null);
  setImportedAvatarUri(null);
  setStatus('已填入角色编辑表单。');
}
```

- [ ] **Step 7: Add role source badge helper**

Add this helper before `selectionFooter`:

```ts
function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
  if (!card.sourceType || card.sourceType === 'pixory_manual') {
    return 'DIY 角色';
  }
  if (card.sourceType.startsWith('sillytavern_') || card.sourceType === 'tavern_json_v1') {
    return '酒馆角色';
  }
  return '角色';
}
```

- [ ] **Step 8: Render import action and preview**

Add an import button near the existing actions before manual save/apply:

```tsx
<AiLightButton label={importing ? '解析角色卡中' : '导入角色卡'} loading={importing} onPress={() => void importRoleCard()} variant="outline" />
```

Render preview after `status` or before saved cards:

```tsx
{importedRole ? (
  <AiRoleCardImportPreview
    avatarUri={importedAvatarUri}
    imported={importedRole}
    selectedGreeting={selectedGreeting}
    space={space}
    onCancel={() => {
      setImportedRole(null);
      setImportedAvatarUri(null);
    }}
    onEdit={editImportedRole}
    onSave={() => {
      void saveImported(false);
    }}
    onSaveAndStart={() => {
      void saveImported(true);
    }}
    onSelectGreeting={setSelectedGreeting}
  />
) : null}
```

- [ ] **Step 9: Replace saved role rows with visual role-library cards**

In the saved cards render block, keep long-press selection and apply behavior, but make each saved role card image-led:

```tsx
{cards.map((card) => {
  const selected = selectedCardIds.includes(card.id);
  const sourceLabel = getRoleCardSourceLabel(card);
  return (
    <Pressable
      accessibilityRole="button"
      key={card.id}
      onLongPress={() => toggleSelected(card.id)}
      onPress={() => {
        if (selectedCardIds.length) {
          toggleSelected(card.id);
          return;
        }
        loadCardIntoEditor(card);
      }}
      style={({ pressed }) => [styles.savedCard, selected && styles.selectedSavedCard, pressed && styles.pressed]}
    >
      <View style={styles.savedHeader}>
        <View style={styles.roleCover}>
          {card.avatarEnabled && card.avatarUri ? (
            <SecureImage contentFit="cover" space={space} style={styles.roleCoverImage} uri={card.avatarUri} />
          ) : (
            <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconSizeLg} />
          )}
        </View>
        <View style={styles.savedCopy}>
          <View style={styles.savedTitleRow}>
            <Text numberOfLines={1} style={styles.savedTitle}>{card.name}</Text>
            {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={metrics.iconSizeMd} /> : null}
          </View>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
          </View>
          <Text numberOfLines={2} style={styles.caption}>{card.description ?? card.prompt}</Text>
        </View>
      </View>
      {!selectedCardIds.length && threadId ? <AiLightButton label="应用到当前会话" onPress={() => void applyRoleCard(card.id)} variant="ghost" /> : null}
      {!selectedCardIds.length && !threadId ? <AiLightButton label="开始聊天" onPress={() => onStartChatWithRole?.(card.id)} variant="ghost" /> : null}
    </Pressable>
  );
})}
```

Add or adjust styles:

```ts
roleCover: {
  alignItems: 'center',
  backgroundColor: aiLightColors.canvas,
  borderColor: aiLightColors.hairline,
  borderRadius: radius.lg,
  borderWidth: StyleSheet.hairlineWidth,
  height: 92,
  justifyContent: 'center',
  overflow: 'hidden',
  width: 92,
},
roleCoverImage: {
  height: '100%',
  width: '100%',
},
savedTitleRow: {
  alignItems: 'center',
  flexDirection: 'row',
  gap: rhythm.microGap,
},
sourceBadge: {
  alignSelf: 'flex-start',
  backgroundColor: aiLightColors.canvas,
  borderColor: aiLightColors.hairline,
  borderRadius: radius.pill,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: spacing[2],
  paddingVertical: spacing[0.5],
},
sourceBadgeText: {
  ...typography.textStyles.micro,
  color: aiLightColors.muted,
  fontWeight: '700',
},
```

Remove or stop using old tiny `savedAvatar` styles if they become unused.

- [ ] **Step 10: Run focused tests**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit Task 5**

```powershell
git add src\screens\AiRoleCardEditorScreen.tsx tests\ai-role-card-import-policy.test.cjs
git commit -m "feat: import role cards from role editor"
```

---

### Task 6: AI Workbench Role Library Entry And App Navigation

**Files:**

- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `App.tsx`
- Test: `tests/ai-role-card-import-policy.test.cjs`
- Test: `tests/ai-navigation-policy.test.cjs`

- [ ] **Step 1: Add failing policy assertions**

Append:

```js
test('AI workbench replaces recent materials with role library while keeping materials route', () => {
  const home = read('src/screens/AiHomeScreen.tsx');
  const app = read('App.tsx');
  assert.match(home, /onOpenRoleLibrary/);
  assert.match(home, /角色库/);
  assert.match(home, /管理和导入 AI 角色/);
  assert.doesNotMatch(home, /listRecentMaterials/);
  assert.doesNotMatch(home, /最近材料/);
  assert.match(app, /onOpenRoleLibrary/);
  assert.match(app, /onStartChatWithRole/);
  assert.match(app, /createNormalThreadFromRoleCard/);
  assert.match(app, /onOpenMaterials/);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs
```

Expected: FAIL because home still uses recent materials and App has no role-library callback.

- [ ] **Step 3: Update AiHomeScreen props and remove recent-materials fetch**

Modify imports in `src/screens/AiHomeScreen.tsx`:

```ts
// remove:
import { listRecentMaterials } from '../ai/aiDocumentService';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
```

Modify props:

```ts
onOpenRoleLibrary: () => void;
```

Remove:

```ts
const [recentMaterials, setRecentMaterials] = useState<AiDocumentRecord[]>([]);
```

Remove the `useEffect` that calls `listRecentMaterials`.

- [ ] **Step 4: Replace recent-materials section with role-library card**

Replace the current `最近材料` section with:

```tsx
<View style={styles.section}>
  <SectionTitle actionLabel="打开" title="角色库" onPress={onOpenRoleLibrary} />
  <Pressable accessibilityRole="button" onPress={onOpenRoleLibrary} style={({ pressed }) => [styles.recentCard, styles.materialCard, pressed && styles.pressed]}>
    <View style={styles.threadIcon}>
      <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={24} />
    </View>
    <View style={styles.threadCopy}>
      <Text numberOfLines={1} style={styles.threadTitle}>管理和导入 AI 角色</Text>
      <Text numberOfLines={2} style={styles.threadDescription}>
        导入 SillyTavern 角色卡，保存角色，或直接开始聊天
      </Text>
    </View>
    <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={20} />
  </Pressable>
</View>
```

- [ ] **Step 5: Add navigation and start-chat callback in App.tsx**

Import helper:

```ts
import { createNormalThreadFromRoleCard } from './src/ai/aiChatService';
```

When rendering `AiHomeScreen`, pass:

```tsx
onOpenRoleLibrary={() => pushRoute({ name: 'ai-role-card-editor', space: currentRoute.tab === 'personal' ? 'personal' : 'normal' })}
```

Use the existing space derivation pattern in the current root-tab branch rather than inventing a new global value.

When rendering `AiRoleCardEditorScreen`, add:

```tsx
onStartChatWithRole={(roleCardId) => {
  void createNormalThreadFromRoleCard({ roleCardId, space: currentRoute.space }).then((thread) => {
    replaceCurrentRoute({
      name: 'ai-chat',
      contextTitle: thread.title,
      contextType: 'normal',
      space: currentRoute.space,
      threadId: thread.id,
    });
  });
}}
```

Keep `onApplyRoleCard={popRoute}` for session-settings flows.

- [ ] **Step 6: Keep materials reachable**

Verify App still passes `onOpenMaterials={() => pushRoute({ name: 'ai-material-list', space })}` to `AiHomeScreen`, or expose material list from the AI workbench secondary action if current code uses that route. Do not delete `ai-material-list`, `AiMaterialListScreen`, or related routes.

- [ ] **Step 7: Run focused navigation tests**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs tests\ai-navigation-policy.test.cjs
pnpm typecheck
```

Expected: PASS. If an existing test still expects `最近材料`, update it to assert `角色库` and keep `onOpenMaterials` route coverage.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src\screens\AiHomeScreen.tsx App.tsx tests\ai-role-card-import-policy.test.cjs tests\ai-navigation-policy.test.cjs
git commit -m "feat: add ai role library entry"
```

---

### Task 7: Chat Opening Message Behavior And Old Role Safeguards

**Files:**

- Modify if needed: `src/ai/aiChatService.ts`
- Modify if needed: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-role-card-import-policy.test.cjs`
- Test: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add old-role safeguard policy assertions**

Append:

```js
test('old and manual role cards do not automatically insert greetings into existing sessions', () => {
  const chatService = read('src/ai/aiChatService.ts');
  const roleService = read('src/ai/aiRoleCardService.ts');
  assert.match(roleService, /sourceType: input\\.sourceType \\?\\? 'pixory_manual'/);
  assert.match(chatService, /applyRoleCardToThread/);
  assert.doesNotMatch(chatService, /function applyRoleCardToThread[\\s\\S]*createMessage\\([\\s\\S]*firstMessage/);
  assert.match(chatService, /createNormalThreadFromRoleCard[\\s\\S]*roleCard\\.firstMessage/);
});
```

- [ ] **Step 2: Run focused tests**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs tests\ai-final-acceptance-policy.test.cjs
```

Expected: PASS if Task 3 isolated greeting insertion correctly. If it fails, fix `applyRoleCardToThread` so it only updates prompt/snapshot and never creates a greeting message.

- [ ] **Step 3: Manual code review checks**

Confirm these exact properties:

```powershell
rg -n "createNormalThreadFromRoleCard|applyRoleCardToThread|firstMessage|createMessage" src\ai\aiChatService.ts
```

Expected:

- `createNormalThreadFromRoleCard` contains greeting insertion.
- `applyRoleCardToThread` does not create messages.
- `sendUserMessage` remains unchanged except for imports if any.

- [ ] **Step 4: Commit Task 7 if changes were needed**

If no code changes were required and tests passed, do not create an empty commit. If changes were needed:

```powershell
git add src\ai\aiChatService.ts tests\ai-role-card-import-policy.test.cjs tests\ai-final-acceptance-policy.test.cjs
git commit -m "fix: isolate role opening greetings"
```

---

### Task 8: End-To-End Policy Coverage And Regression Verification

**Files:**

- Modify: `tests/ai-role-card-import-policy.test.cjs`
- Modify any failing existing policy tests only where expectations intentionally changed.

- [ ] **Step 1: Add no-cloud/no-network policy assertion**

Append:

```js
test('role card import remains local only', () => {
  const parser = read('src/ai/sillyTavernRoleCardParser.ts');
  const editor = read('src/screens/AiRoleCardEditorScreen.tsx');
  const service = read('src/ai/aiRoleCardService.ts');
  assert.doesNotMatch(parser, /fetch\\(|XMLHttpRequest|https?:\\/\\//);
  assert.doesNotMatch(editor, /fetch\\(|XMLHttpRequest|https?:\\/\\//);
  assert.doesNotMatch(service, /fetch\\(|XMLHttpRequest|https?:\\/\\//);
  assert.match(editor, /copyAiRoleAvatarToAppStorage/);
  assert.match(service, /runWithDatabaseSpace/);
});
```

- [ ] **Step 2: Run full verification**

```powershell
node --test tests\ai-role-card-import-policy.test.cjs tests\ai-role-card-import-parser.test.cjs
pnpm typecheck
pnpm test
git diff --check
```

Expected:

- New focused tests pass.
- `pnpm typecheck` passes.
- `pnpm test` passes all tests.
- `git diff --check` has no whitespace errors. CRLF warnings are acceptable if no whitespace error is reported.

- [ ] **Step 3: Inspect final diff**

```powershell
git diff --stat
git diff -- src\ai\sillyTavernRoleCardParser.ts src\screens\AiRoleCardEditorScreen.tsx src\screens\AiHomeScreen.tsx App.tsx
```

Expected:

- No unrelated release docs changed.
- No IP image import/storage code changed except avatar copy reuse.
- No network APIs added to parser/import services.

- [ ] **Step 4: Commit final test adjustments**

If Task 8 changed tests:

```powershell
git add tests\ai-role-card-import-policy.test.cjs
git commit -m "test: cover local role card import flow"
```

---

## Manual Android Acceptance Checklist

Run after all tasks pass automated verification:

- [ ] Import a valid SillyTavern PNG V2 card.
- [ ] Import a valid JSON V2 card.
- [ ] Import a V3 card with unknown fields and confirm it saves.
- [ ] Import a plain PNG and continue as avatar-only role.
- [ ] Pick a non-default greeting in preview and save.
- [ ] Tap `保存角色`; confirm role appears as a visual role card with avatar/cover and source badge.
- [ ] Confirm a manual role with avatar uses the avatar as cover and shows `DIY 角色`.
- [ ] Confirm an imported role shows `酒馆角色`.
- [ ] Tap `保存并开始聊天`; confirm a normal AI chat opens.
- [ ] Confirm the selected greeting appears as a completed assistant message.
- [ ] Open session settings for an existing thread and apply an imported role; confirm no greeting is inserted into that existing thread.
- [ ] Open, edit, save, and apply an old manual role created before this feature.
- [ ] Confirm AI workbench shows `角色库` and no longer shows `最近材料`.
- [ ] Confirm material list is still reachable from the AI module.
- [ ] Confirm no keyboard double-lift or chat scroll jitter regresses in the chat page.

## Rollback Plan

If parser or UI behavior is unstable late in release:

1. Keep schema migration and type fields because they are backward-compatible.
2. Hide the `导入角色卡` button in `AiRoleCardEditorScreen.tsx`.
3. Keep manual role creation and application unchanged.
4. Keep `角色库` entry if manual role library is stable; otherwise restore the previous workbench block by reverting only the `AiHomeScreen.tsx` role-library replacement.
