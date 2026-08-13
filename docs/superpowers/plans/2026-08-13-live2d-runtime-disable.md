# Live2D Runtime Disable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop all active Live2D pet work while retaining dormant source, downloaded model files, and existing SQLite settings.

**Architecture:** Remove the two application entry points rather than add a runtime flag that still mounts hooks. `AiChatScreen` will no longer own Live2D rendering, timers, gesture responders, settings reads, or event listeners. `AiSessionConfigScreen` will no longer import or mount the model manager, so no setting read, download, preview, or write can start from normal app navigation.

**Tech Stack:** Expo React Native, TypeScript, Node policy tests.

---

### Task 1: Add the runtime-disable regression contract

**Files:**
- Create: `tests/live2d-runtime-disabled-policy.test.cjs`
- Test: `tests/live2d-runtime-disabled-policy.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('Live2D has no chat or session-settings runtime entry point', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');

  for (const source of [chat, sessionConfig]) {
    assert.doesNotMatch(source, /Live2DPetView|Live2DPetManagerModal|PET_MODELS/);
    assert.doesNotMatch(source, /GLOBAL_PET_|LIVE2D_MODEL_CHANGED/);
  }
  assert.doesNotMatch(chat, /petPan|petScale|resetIdleTimer|petPanResponder|scalePanResponder/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/live2d-runtime-disabled-policy.test.cjs`
Expected: FAIL because both screen files still import or reference the Live2D runtime.

- [ ] **Step 3: Implement the minimal runtime-entry removal**

Remove Live2D imports, state, settings reads, events, timers, responders, callbacks, generation reactions, and render tree from `src/screens/AiChatScreen.tsx`. Remove the dormant manager imports, states, load effect, selector, commented settings group, and modal mount from `src/screens/AiSessionConfigScreen.tsx`. Do not modify `Live2DPetView`, `Live2DPetManagerModal`, `live2dManagerService`, `petModels`, downloaded files, or persisted `GLOBAL_PET_*` values.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/live2d-runtime-disabled-policy.test.cjs`
Expected: PASS.

### Task 2: Remove superseded pet-animation policy and update feature inventory

**Files:**
- Modify: `tests/ai-chat-performance-hardening-policy.test.cjs:300-311`
- Modify: `docs/feature-matrix.md:98`
- Test: `tests/ai-chat-performance-hardening-policy.test.cjs`

- [ ] **Step 1: Write the failing policy expectation**

Replace the resize-handle policy with an assertion that `AiChatScreen` has no `resizeHandleOpacity` or `useNativeDriver` pet-animation fragment. This must fail before the Live2D removal because the old resize policy is still present.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai-chat-performance-hardening-policy.test.cjs`
Expected: FAIL because `AiChatScreen` still contains the disabled runtime animation code.

- [ ] **Step 3: Update inventory**

Mark Live2D in `docs/feature-matrix.md` as fully disabled/not shipped: source and assets are intentionally retained, but no chat or session-settings runtime entry point remains and no model is loaded, animated, or previewed.

- [ ] **Step 4: Run focused verification**

Run: `node --test tests/live2d-runtime-disabled-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs`
Expected: PASS.

### Task 3: Verify and save the implementation

**Files:**
- Modify: all files from Tasks 1–2 only

- [ ] **Step 1: Run static and type verification**

Run: `git diff --check` and `pnpm typecheck`
Expected: no whitespace errors and TypeScript exits 0.

- [ ] **Step 2: Run full regression suite**

Run: `pnpm test`
Expected: all runnable tests pass; skipped tests keep their existing skip status.

- [ ] **Step 3: Record Android boundary**

Run: `D:\\Develop\\Android\\Sdk\\platform-tools\\adb.exe devices`
Expected: if no device is listed, report Android memory/frame validation as blocked without attempting installation.

- [ ] **Step 4: Commit**

Run: `git add src/screens/AiChatScreen.tsx src/screens/AiSessionConfigScreen.tsx tests/live2d-runtime-disabled-policy.test.cjs tests/ai-chat-performance-hardening-policy.test.cjs docs/feature-matrix.md` then `git commit -m "perf(chat): disable Live2D pet runtime"`.

## Execution record

2026-08-13：Tasks 1–3 已在当前 worktree 完成。目标策略测试、性能硬化策略测试、`pnpm typecheck` 与 `pnpm test` 均通过；`adb devices` 没有列出设备，因此 Android 内存与帧率验证仍被门禁阻止。
