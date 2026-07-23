# Main UI Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved main-branch visual changes without importing group chat, daily/immersive modes, or altering any existing chat behavior.

**Architecture:** Shared AI colors, typography, and shadows provide the visual changes. Existing screens receive surgical layout changes only; reusable components gain optional props whose defaults preserve all current callers. Source-policy tests guard the chat logic boundary.

**Tech Stack:** React Native, TypeScript, shared design tokens, Node policy tests.

---

### Task 1: Lock the no-chat-logic boundary

**Files:**
- Create: `tests/main-ui-stabilization-policy.test.cjs`
- Inspect only: `src/screens/AiChatScreen.tsx`
- Inspect only: `src/components/ai/AiChatComposer.tsx`

- [ ] **Step 1: Record baseline hashes for logic regions**

The test extracts and hashes the non-style portions of `AiChatScreen` and `AiChatComposer`, excluding their final `StyleSheet.create` blocks. It also asserts no new imports contain group conversation, daily mode, immersive mode, or conversation-mode selector names.

- [ ] **Step 2: Run baseline test**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
```

Expected: PASS before UI changes. Keep this guard passing throughout.

### Task 2: Update the shared AI canvas, title, and composer surface

**Files:**
- Modify: `src/components/ai/aiLightTheme.ts`
- Modify: `src/components/ai/AiLightScaffold.tsx`
- Modify: `src/components/ai/AiChatComposer.tsx` styles only
- Modify: `src/screens/AiChatScreen.tsx` styles only
- Modify: `src/design/tokens/shadows.ts` if no existing token matches the approved composer elevation
- Test: `tests/main-ui-stabilization-policy.test.cjs`

- [ ] **Step 1: Add failing visual-token assertions**

Assert canvas is `#EDEDED`, scaffold title is system 18/600, composer shell is near-white with a subtle border and shared shadow, and the composer panel remains transparent.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
```

- [ ] **Step 3: Make token-only/style-only changes**

Set:

```ts
canvas: '#EDEDED'
```

Use `typography.family.base`, `fontSize: 18`, `fontWeight: '600'` for the scaffold title. Apply the near-white surface, hairline border, radius, and Android elevation/shadow to the real composer shell only. Set the surrounding panel to transparent. Do not add any extra wrapper or frame.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
pnpm.cmd typecheck
```

### Task 3: Add optional AI dialog/button variants

**Files:**
- Modify: `src/components/AppDialog.tsx`
- Modify: `src/components/PrimaryButton.tsx`
- Test: `tests/main-ui-stabilization-policy.test.cjs`

- [ ] **Step 1: Add failing assertions**

Assert both components accept an optional AI visual variant and retain their current default values.

- [ ] **Step 2: Implement optional styles only**

Add a narrowly named visual prop, apply AI canvas/border/button colors only when requested, and leave event handlers, disabled behavior, layouts, and all default call sites unchanged.

- [ ] **Step 3: Verify**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
```

### Task 4: Simplify AI home and search copy

**Files:**
- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `src/screens/AiChatSearchScreen.tsx`
- Modify: `tests/ai-home-workbench-policy.test.cjs`
- Modify: `tests/ai-chat-search-policy.test.cjs`

- [ ] **Step 1: Update tests first**

Require only `选择 IP 开聊` and `会话历史` in the AI home quick-entry area, and assert `资料库/总资料库` quick cards are absent while their route callbacks remain referenced elsewhere. Add exact assertions for the approved search title and static empty-state copy.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/ai-home-workbench-policy.test.cjs tests/ai-chat-search-policy.test.cjs
```

- [ ] **Step 3: Remove only duplicate cards and replace only copy**

Do not remove routes, material screens, provider entry points, search behavior, pagination, or filters.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test tests/ai-home-workbench-policy.test.cjs tests/ai-chat-search-policy.test.cjs
```

### Task 5: Put About explanations into normal flow

**Files:**
- Modify: `src/screens/AboutScreen.tsx`
- Test: `tests/main-ui-stabilization-policy.test.cjs`

- [ ] **Step 1: Add failing layout assertions**

Assert the selected explanation is rendered once after its two-item row, spans the row width, has natural line height, and no absolute positioning. Assert the five-second timer and tap-to-close remain.

- [ ] **Step 2: Refactor only the stats render**

Chunk the six stats into three rows. Render both cells, then conditionally render a full-width explanation for the selected cell in that row. Do not reserve explanation height when nothing is selected.

- [ ] **Step 3: Verify**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
```

### Task 6: Unify detail-reader canvas

**Files:**
- Modify: `src/screens/MilestonesDetailScreen.tsx`
- Reference only: `src/screens/ProductDocumentationScreen.tsx`
- Test: `tests/main-ui-stabilization-policy.test.cjs`

- [ ] **Step 1: Add failing assertions**

Require the same `#FAF9F5` reader canvas and a simple divider header; reject `backgroundVariant="detail"` on the milestone detail screen.

- [ ] **Step 2: Apply the reader surface**

Remove only the decorative background. Preserve Markdown creation, preloading, loading/error states, and IP/chat navigation callbacks.

- [ ] **Step 3: Verify**

```powershell
node --test tests/main-ui-stabilization-policy.test.cjs
```

### Task 7: Remove the Me title block while preserving safe inset

**Files:**
- Modify: `src/components/ScreenScaffold.tsx`
- Modify: `src/screens/MeScreen.tsx`
- Test: `tests/current-ux-fixes-policy.test.cjs`
- Test: `tests/main-ui-stabilization-policy.test.cjs`

- [ ] **Step 1: Add failing assertions**

Require an optional `showHeader={false}` path that retains `useSafeAreaInsets().top` spacing and assert Me uses it without rendering `title="我的"`.

- [ ] **Step 2: Implement the optional headerless path**

Keep `showHeader` default true. When false, omit the full header component and render only a safe-area top spacer. Do not change footer navigation, privacy-space controls, content, animation, or error handling.

- [ ] **Step 3: Verify focused tests**

```powershell
node --test tests/current-ux-fixes-policy.test.cjs tests/main-ui-stabilization-policy.test.cjs
pnpm.cmd typecheck
git diff --check
```

### Task 8: Full UI boundary verification and commit

**Files:**
- Review all files listed above

- [ ] **Step 1: Run full verification**

```powershell
pnpm.cmd test
pnpm.cmd typecheck
git diff --check
```

- [ ] **Step 2: Inspect the exact diff**

Confirm no modifications to provider payloads, SSE, SQLite chat schema/repositories, active task DTOs, reasoning/tail rendering, group chat, daily mode, immersive mode, OTA, or release configuration.

- [ ] **Step 3: Commit only UI files and tests**

```powershell
git commit -m "style: refine main chat and profile surfaces"
```

Do not stage user-owned documentation or Playwright artifacts.

