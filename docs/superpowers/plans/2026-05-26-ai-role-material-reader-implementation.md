# AI Role Material Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one coherent AI interaction update: role library becomes a chat-drawer entry with compact cards and direct chat actions; per-conversation materials become the active knowledge flow; global material library becomes a grouped overview; document reading becomes native-feeling and unboxed.
**Architecture:** Keep all data local. Split role browsing from role editing, add thread-owned material flows on top of the existing `ai_documents.ownerType/ownerId` schema, preserve old IP and knowledge-base document records for compatibility, and route normal chat retrieval through thread-owned materials.
**Tech Stack:** Expo, React Native, TypeScript, Expo Router-style local route state in `App.tsx`, SQLite repositories, local filesystem document storage, existing Pixory design tokens in `src/design/tokens/`.

---

## Current Context

The existing role-card editor at `src/screens/AiRoleCardEditorScreen.tsx` mixes creation, import, saved-card browsing, selection, and avatar picking in one screen. The avatar picker caps IP images with `images.slice(0, 12)`, which blocks scrollable selection for larger IPs.

The AI home screen at `src/screens/AiHomeScreen.tsx` still exposes `问问某个 IP` and `连接知识库`, while the target IA moves role library and global materials into the AI chat drawer. The drawer component is `src/components/ai/AiComprehensiveRecordDrawer.tsx`.

The material backend already stores `ownerType` and `ownerId` in `ai_documents`. `src/ai/aiDocumentService.ts` supports manual text import, picked file import, IP material generation, and reading documents, but list/import flows are centered on recent items or knowledge bases rather than per-thread libraries.

The chat prompt path in `src/ai/aiChatService.ts` retrieves documents only for non-normal context threads. Normal chats need to retrieve from `ownerType = 'thread'` and `ownerId = thread.id` when thread materials exist.

The reader stack is split across `src/screens/AiDocumentReaderScreen.tsx`, `src/components/ai/AiTextReader.tsx`, `src/components/ai/AiMarkdownReader.tsx`, `src/components/ai/AiDocxReader.tsx`, and `src/components/ai/AiPdfReader.tsx`. TXT and Markdown currently read as chunk cards, which creates the wrapped feeling the user rejected.

## Constraints

- Android-first, offline-first, local-only.
- Do not add server, account, sync, cloud storage, or AI generation.
- Imported system files must be copied into app-private local storage before use.
- Do not mutate original IP images.
- New UI must use shared design tokens from `src/design/tokens/` for spacing, rhythm, radius, color, typography, dimensions, and touch targets.
- Do not mention or emphasize SillyTavern or 酒馆 in user-facing import copy.
- Keep old IP and knowledge-base document threads readable.
- Plan implementation in one version after the role-library work, as requested: "在角色库后面写，共一版".

## Target UX

Drawer order inside the AI chat page:

1. `新聊天`
2. `角色库`
3. `历史记录`
4. `总资料库`

Role library:

- Opens from the AI chat drawer.
- Contains only existing role cards.
- Uses compact list rows inspired by group overview: left image, right details, source chip, short description, meta.
- Top-right has a circular framed `+` only.
- Tapping card body opens detail.
- A small `开聊` pill on the card starts a new conversation directly with that role.
- Adding or saving a role defaults into a new conversation when using the primary action.
- Detail screen shows long instructions, greetings, and attached settings in collapsed preview sections with expand controls.

Material libraries:

- AI home keeps `开始聊天` and role-library entry only.
- Session settings current-session card adds a `资料库` action next to `模型账号`.
- Each conversation has its own material library.
- Conversation material library can add from IP, system files, or manual text; system files support multi-select; materials can be opened in reader or deleted.
- IP import creates a snapshot material in the conversation library, with manual refresh for newer IP metadata.
- Global material library opens from the drawer and shows all materials grouped by owning conversation, preserving ownership clarity.
- Global deletion supports multi-select and confirms affected conversation count plus material count.

Reader:

- TXT and Markdown open directly into continuous reading.
- No per-chunk cards, body panels, or frame-like wrappers.
- Markdown supports headings, lists, quotes, code blocks, and paragraphs.
- DOCX uses continuous parsed text.
- PDF remains page-based, with less frame-heavy page presentation.
- Parse failure and empty document states remain clear and recoverable.

## File Structure

New files:

- `src/screens/AiRoleLibraryScreen.tsx`
- `src/screens/AiRoleCardDetailScreen.tsx`
- `src/screens/AiThreadMaterialLibraryScreen.tsx`
- `src/screens/AiGlobalMaterialLibraryScreen.tsx`
- `src/components/ai/AiRoleLibraryItem.tsx`
- `src/components/ai/AiRoleDetailSection.tsx`
- `src/components/ai/AiMaterialGroupSection.tsx`
- `src/components/ai/AiMaterialSourceSheet.tsx`
- `tests/ai-role-material-redesign-policy.test.cjs`
- `tests/ai-reader-redesign-policy.test.cjs`

Modified files:

- `App.tsx`
- `src/screens/AiHomeScreen.tsx`
- `src/screens/AiRoleCardEditorScreen.tsx`
- `src/screens/AiSessionConfigScreen.tsx`
- `src/screens/AiDocumentReaderScreen.tsx`
- `src/components/ai/AiComprehensiveRecordDrawer.tsx`
- `src/components/ai/AiTextReader.tsx`
- `src/components/ai/AiMarkdownReader.tsx`
- `src/components/ai/AiDocxReader.tsx`
- `src/components/ai/AiPdfReader.tsx`
- `src/ai/aiDocumentService.ts`
- `src/ai/aiChatService.ts`
- `src/database/repositories/aiKnowledgeRepository.ts`
- `src/database/repositories/aiThreadRepository.ts` only if a missing thread-title lookup cannot be satisfied by existing exports.

Files to keep available but stop exposing from new IA:

- `src/screens/AiKnowledgeBaseScreen.tsx`
- existing IP chat picker screens for old routes and compatibility.

## Implementation Steps

### Task 1: Add Failing Policy Tests

- [ ] Add `tests/ai-role-material-redesign-policy.test.cjs`.
- [ ] Add `tests/ai-reader-redesign-policy.test.cjs`.
- [ ] Run the two tests and confirm they fail against the current implementation.

Test command:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs tests/ai-reader-redesign-policy.test.cjs
```

Required role/material policy assertions:

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('AI role and material redesign policy', () => {
  test('chat drawer exposes role library before history and global materials after history', () => {
    const source = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');
    expect(source).toContain('onOpenRoleLibrary');
    expect(source).toContain('onOpenGlobalMaterials');
    expect(source.indexOf('角色库')).toBeGreaterThan(source.indexOf('新聊天'));
    expect(source.indexOf('历史记录')).toBeGreaterThan(source.indexOf('角色库'));
    expect(source.indexOf('总资料库')).toBeGreaterThan(source.indexOf('历史记录'));
  });

  test('AI home no longer exposes old knowledge entry points', () => {
    const source = read('src/screens/AiHomeScreen.tsx');
    expect(source).not.toContain('问问某个 IP');
    expect(source).not.toContain('连接知识库');
    expect(source).not.toContain('SillyTavern');
    expect(source).toContain('角色库');
  });

  test('role editor does not cap IP avatar candidates at twelve', () => {
    const source = read('src/screens/AiRoleCardEditorScreen.tsx');
    expect(source).not.toContain('images.slice(0, 12)');
    expect(source).toMatch(/maxHeight|FlatList|ScrollView/);
  });

  test('thread material owner functions exist', () => {
    const source = read('src/ai/aiDocumentService.ts');
    expect(source).toContain('listThreadMaterials');
    expect(source).toContain('listGlobalMaterialsGroupedByThread');
    expect(source).toContain('generateThreadIpSnapshotMaterial');
    expect(source).toContain("ownerType: 'thread'");
  });
});
```

Required reader policy assertions:

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('AI document reader redesign policy', () => {
  test('text reader no longer renders each chunk as a bordered card', () => {
    const source = read('src/components/ai/AiTextReader.tsx');
    expect(source).not.toMatch(/borderWidth:\s*1/);
    expect(source).not.toContain('chunkCard');
  });

  test('markdown reader supports continuous markdown blocks without a body card', () => {
    const source = read('src/components/ai/AiMarkdownReader.tsx');
    expect(source).toContain('code');
    expect(source).toContain('quote');
    expect(source).not.toMatch(/borderWidth:\s*1/);
    expect(source).not.toContain('markdownCard');
  });
});
```

Commit:

```powershell
git add tests/ai-role-material-redesign-policy.test.cjs tests/ai-reader-redesign-policy.test.cjs
git commit -m "test: cover ai library redesign policies"
```

### Task 2: Split Role Library From Role Creation

- [ ] Create `src/components/ai/AiRoleLibraryItem.tsx`.
- [ ] Create `src/components/ai/AiRoleDetailSection.tsx`.
- [ ] Create `src/screens/AiRoleLibraryScreen.tsx`.
- [ ] Create `src/screens/AiRoleCardDetailScreen.tsx`.
- [ ] Keep `src/screens/AiRoleCardEditorScreen.tsx` focused on create/import/edit.
- [ ] Remove saved-card browsing UI from the editor screen after the new library screen can browse cards.
- [ ] Replace role-card import copy with neutral wording: `导入角色卡`, `从文件导入`, `导入完成`.
- [ ] Add primary `保存并开聊` and secondary `仅保存` actions.
- [ ] Change the avatar IP image picker from capped candidates to a scrollable four-row area.

Role library item contract:

```ts
type AiRoleLibraryItemProps = {
  card: AiRoleCard;
  onPress: (card: AiRoleCard) => void;
  onStartChat: (card: AiRoleCard) => void;
};
```

Role detail section contract:

```ts
type AiRoleDetailSectionProps = {
  title: string;
  previewLines?: number;
  children: React.ReactNode;
};
```

Editor save behavior:

```ts
type RoleSaveMode = 'save-and-chat' | 'save-only';

type AiRoleCardEditorScreenProps = {
  mode?: 'create' | 'edit';
  editingCardId?: string;
  initialImportUri?: string;
  onCancel: () => void;
  onSavedOnly: (cardId: string) => void;
  onSavedAndStartChat: (cardId: string) => void;
};
```

Verification for this task:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add src/components/ai/AiRoleLibraryItem.tsx src/components/ai/AiRoleDetailSection.tsx src/screens/AiRoleLibraryScreen.tsx src/screens/AiRoleCardDetailScreen.tsx src/screens/AiRoleCardEditorScreen.tsx
git commit -m "feat: split role library from role editor"
```

### Task 3: Wire Role Routes And Drawer Entry

- [ ] Extend the route union in `App.tsx` with `ai-role-library` and `ai-role-card-detail`.
- [ ] Route `onOpenRoleLibrary` from `AiComprehensiveRecordDrawer` to `ai-role-library`.
- [ ] Route role-library `+` to `ai-role-card-editor`.
- [ ] Route role-library card body to `ai-role-card-detail`.
- [ ] Route card `开聊` to a new normal AI thread bound to the selected role.
- [ ] Route editor primary save to a new normal AI thread bound to the saved role.
- [ ] Route editor secondary save back to the role library.
- [ ] Replace session-settings role `更换` behavior with opening `ai-role-library`.

Start-chat helper shape inside `App.tsx`:

```ts
const startNormalChatWithRole = async (roleCardId: string) => {
  const thread = await createNormalThreadFromRoleCard({ roleCardId, space: activeSpace });
  replaceRoute({ name: 'ai-chat', threadId: thread.id, space: activeSpace });
};
```

`createNormalThreadFromRoleCard` is already imported by `App.tsx` from `src/ai/aiChatService.ts`; reuse it for both direct card `开聊` and editor `保存并开聊`.

Verification for this task:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add App.tsx src/components/ai/AiComprehensiveRecordDrawer.tsx src/screens/AiSessionConfigScreen.tsx
git commit -m "feat: add role library chat routes"
```

### Task 4: Add Thread Material Service APIs

- [ ] Add service types to `src/ai/aiDocumentService.ts`.
- [ ] Add thread-list, grouped-global-list, count, system-file import, manual-text import, IP snapshot import, and snapshot refresh functions.
- [ ] Reuse existing repository and filesystem copy logic for imported files.
- [ ] Keep `ownerType = 'thread'` for conversation libraries.
- [ ] Keep existing `ownerType = 'ip'` and `ownerType = 'knowledge_base'` records readable.
- [ ] Add repository helper only if service-level grouping cannot resolve thread titles from existing exports.

Service API target:

```ts
export type AiMaterialOwnerRef = {
  ownerType: 'thread';
  ownerId: string;
};

export type AiMaterialConversationGroup = {
  threadId: string;
  title: string;
  updatedAt: number;
  materialCount: number;
  materials: AiDocumentRecord[];
};

export async function listThreadMaterials(input: {
  space: AiSpace;
  threadId: string;
}): Promise<AiDocumentRecord[]>;

export async function countThreadMaterials(input: {
  space: AiSpace;
  threadId: string;
}): Promise<number>;

export async function listGlobalMaterialsGroupedByThread(input: {
  space: AiSpace;
  query?: string;
}): Promise<AiMaterialConversationGroup[]>;

export async function importPickedDocumentsToThread(input: {
  space: AiSpace;
  threadId: string;
}): Promise<AiDocumentRecord[]>;

export async function importManualTextToThread(input: {
  space: AiSpace;
  threadId: string;
  title: string;
  content: string;
}): Promise<AiDocumentRecord>;

export async function generateThreadIpSnapshotMaterial(input: {
  space: AiSpace;
  threadId: string;
  ipId: string;
  title?: string;
}): Promise<AiDocumentRecord>;

export async function refreshThreadIpSnapshotMaterial(input: {
  space: AiSpace;
  threadId: string;
  materialId: string;
  ipId: string;
}): Promise<AiDocumentRecord>;
```

IP snapshot rule:

- Generate a text or markdown material from the selected IP’s current metadata.
- Store the generated document under the thread owner directory.
- Save metadata that lets refresh know the source IP ID.
- Refresh replaces the generated snapshot content inside Pixory’s private document storage, not the source IP images or IP database records.

Verification for this task:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add src/ai/aiDocumentService.ts src/database/repositories/aiKnowledgeRepository.ts src/database/repositories/aiThreadRepository.ts
git commit -m "feat: add thread material document APIs"
```

### Task 5: Build Conversation And Global Material Screens

- [ ] Create `src/components/ai/AiMaterialSourceSheet.tsx`.
- [ ] Create `src/components/ai/AiMaterialGroupSection.tsx`.
- [ ] Create `src/screens/AiThreadMaterialLibraryScreen.tsx`.
- [ ] Create `src/screens/AiGlobalMaterialLibraryScreen.tsx`.
- [ ] Thread library top-right `+` opens source sheet with `从 IP 导入`, `从系统文件导入`, `手动文本`.
- [ ] System import uses the new thread import service and preserves multi-select.
- [ ] IP import uses IP picker and creates a thread snapshot.
- [ ] Manual text uses existing manual import fields or a small local modal matching current app style.
- [ ] Material row supports `阅读`, refresh when source is IP snapshot, and select/delete mode.
- [ ] Global library groups materials by conversation and supports search across material title and conversation title without flattening groups.
- [ ] Multi-select delete confirmation says `将从 X 个对话删除 Y 份资料`.

Thread screen route props:

```ts
type AiThreadMaterialLibraryScreenProps = {
  space: AiSpace;
  threadId: string;
  onBack: () => void;
  onOpenReader: (materialId: string) => void;
  onPickIp: () => void;
};
```

Global screen route props:

```ts
type AiGlobalMaterialLibraryScreenProps = {
  space: AiSpace;
  onBack: () => void;
  onOpenReader: (materialId: string) => void;
  onOpenThreadMaterials: (threadId: string) => void;
};
```

Visual rules:

- Use a single page surface, not nested cards.
- Conversation group rows should read as grouped information blocks with one clear `进入` action.
- Avoid fragmented mini chips for every attribute; show ownership first, then material rows.
- Keep action buttons compact.

Verification for this task:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add src/components/ai/AiMaterialSourceSheet.tsx src/components/ai/AiMaterialGroupSection.tsx src/screens/AiThreadMaterialLibraryScreen.tsx src/screens/AiGlobalMaterialLibraryScreen.tsx
git commit -m "feat: add conversation material libraries"
```

### Task 6: Wire Material IA Into Home, Drawer, Session Settings, And Routes

- [ ] Extend `App.tsx` route union with `ai-thread-material-library` and `ai-global-material-library`.
- [ ] Add drawer callbacks `onOpenGlobalMaterials` and `onOpenRoleLibrary`.
- [ ] Remove AI home visible entries for `问问某个 IP` and `连接知识库`.
- [ ] Keep AI home role entry but route it to `ai-role-library`.
- [ ] Add `资料库` action to the current-session card in `AiSessionConfigScreen.tsx`.
- [ ] Show thread material count under or near the current-session card model/provider metadata.
- [ ] Route session settings `资料库` to `ai-thread-material-library` for the active thread.
- [ ] Ensure old knowledge-base and IP routes remain reachable only through existing old thread data or internal navigation that still needs them.

Session settings action row target:

```tsx
<View style={styles.sessionActionRow}>
  <Pressable onPress={onOpenProviderSettings}>{/* 模型账号 */}</Pressable>
  <Pressable onPress={onOpenThreadMaterials}>{/* 资料库 */}</Pressable>
</View>
```

Verification for this task:

```powershell
pnpm test -- tests/ai-role-material-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add App.tsx src/screens/AiHomeScreen.tsx src/screens/AiSessionConfigScreen.tsx src/components/ai/AiComprehensiveRecordDrawer.tsx
git commit -m "feat: wire ai material library navigation"
```

### Task 7: Enable Normal Chat Retrieval From Thread Materials

- [ ] Update `buildPromptForThread` in `src/ai/aiChatService.ts`.
- [ ] For `thread.contextType === 'normal'`, retrieve documents from `ownerType = 'thread'`, `ownerId = thread.id` when materials exist.
- [ ] Preserve current behavior for `contextType === 'ip'` and `contextType === 'knowledge_base'`.
- [ ] Keep the same retrieval limit and formatting style already used for IP and knowledge-base documents.
- [ ] Add or extend a service test if the repository has a stable test harness for chat prompt assembly; keep the policy test if direct integration testing would require a heavy SQLite fixture.

Retrieval branch target:

```ts
if (thread.contextType === 'normal') {
  const retrieval = await retrieveForThread({
    space: thread.space,
    ownerType: 'thread',
    ownerId: thread.id,
    query: latestUserMessage,
  });
  return {
    prompt: buildNormalChatPrompt({
      dynamicMemoryContext,
      roleInstructionWeight: thread.roleInstructionWeight,
      replyPreference: thread.replyPreference,
      companionMemoryPrefix,
      stableMemoryPrefix,
      systemPrompt: thread.systemPrompt,
      materialSnippets: retrieval.snippets.map((snippet) => ({ label: snippet.label, text: snippet.text })),
      userMessage,
    }),
    snippets: retrieval.snippets,
  };
}
```

`retrieveForThread` is already imported in `src/ai/aiChatService.ts`. If `buildNormalChatPrompt` does not accept `materialSnippets`, extend that function with an optional parameter and include a neutral `当前会话资料` section only when snippets exist.

Verification for this task:

```powershell
pnpm typecheck
pnpm test
```

Commit:

```powershell
git add src/ai/aiChatService.ts tests/ai-role-material-redesign-policy.test.cjs
git commit -m "feat: retrieve thread materials in normal chats"
```

### Task 8: Redesign TXT, Markdown, DOCX, And PDF Reading Surfaces

- [ ] Refactor `AiTextReader` to render continuous paragraphs in one flowing content area.
- [ ] Remove bordered chunk cards and per-chunk wrappers from text reading.
- [ ] Refactor `AiMarkdownReader` into a small block parser that handles headings, unordered lists, ordered lists, quotes, fenced code blocks, inline paragraphs, and blank-line spacing.
- [ ] Keep Markdown parser local and dependency-free unless the repo already includes a Markdown renderer.
- [ ] Let `AiDocxReader` inherit continuous text behavior from `AiTextReader`.
- [ ] Reduce `AiPdfReader` page frame weight: lighter background, no heavy card border, stable page width, compact page number marker.
- [ ] Keep locator/citation highlight soft and inline with the flow.
- [ ] Preserve parse failure and empty document states.

Text reader target:

```tsx
<View style={styles.readerFlow}>
  {paragraphs.map((paragraph) => (
    <Text key={paragraph.id} style={styles.paragraph}>
      {paragraph.text}
    </Text>
  ))}
</View>
```

Markdown block model:

```ts
type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string };
```

Verification for this task:

```powershell
pnpm test -- tests/ai-reader-redesign-policy.test.cjs
pnpm typecheck
```

Commit:

```powershell
git add src/components/ai/AiTextReader.tsx src/components/ai/AiMarkdownReader.tsx src/components/ai/AiDocxReader.tsx src/components/ai/AiPdfReader.tsx src/screens/AiDocumentReaderScreen.tsx tests/ai-reader-redesign-policy.test.cjs
git commit -m "feat: simplify ai document reader surfaces"
```

### Task 9: Product QA Pass With Real Data

- [ ] Run all automated checks.
- [ ] Start the app in the existing development mode.
- [ ] In the in-app browser or Android emulator, verify the role library, role detail, create/import role, direct chat, drawer IA, thread material library, global grouped material library, reader, and session settings.
- [ ] Capture at least one screenshot for each main screen if using emulator validation.
- [ ] Fix visual issues caused by cramped text, oversized buttons, unclear hierarchy, nested cards, or accidental wrapped-body feeling.

Commands:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Manual checks:

- Drawer order is `新聊天` -> `角色库` -> `历史记录` -> `总资料库`.
- Role card `开聊` creates a new conversation without opening detail.
- Editor primary `保存并开聊` creates a new conversation.
- Avatar IP picker shows four rows and scrolls.
- Home no longer shows `问问某个 IP` or `连接知识库`.
- Session settings current-session card shows `资料库`.
- Thread library can import multiple files.
- Thread library can import IP snapshot.
- Global library groups by conversation, not a flat list.
- Deleting selected global materials confirms conversation count and material count.
- TXT and Markdown read continuously without chunk cards.
- DOCX opens as continuous parsed text.
- PDF pages are readable without heavy frames.

Commit:

```powershell
git add .
git commit -m "polish: refine ai library redesign"
```

## Risk Controls

- Keep old document owner types readable by changing retrieval and listing additively.
- Keep old knowledge-base screen files until a later cleanup, reducing route regression risk.
- Avoid broad UI rewrites outside AI screens and AI components.
- Use the existing design tokens first; only add literal values where dynamic sizing cannot be represented by tokens.
- Do not alter release config, Android signing, storage layout for original images, or non-AI image asset import behavior.

## Final Verification

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected outcome:

- TypeScript passes.
- Jest or repository test runner passes.
- `git diff --check` reports no whitespace errors.
- Android/in-app browser smoke test confirms the new IA and reader surfaces with real local data.

## Suggested Execution Mode

Use subagent-driven development for implementation because the work naturally splits into independent role UI, material service, navigation wiring, retrieval, and reader UI streams. Keep route wiring and final QA in the main worker to avoid merge conflicts in `App.tsx`.
