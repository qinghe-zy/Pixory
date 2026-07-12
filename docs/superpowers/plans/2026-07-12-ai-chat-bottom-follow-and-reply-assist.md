# AI Chat Bottom Follow And Reply Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely restore the normal streaming cursor and bottom-follow behavior after the user returns from history, and make reply assist self-correct invalid output with a 20–200 character long mode.

**Architecture:** Keep replay/read mode while scrolling and introduce one explicit safe handoff predicate for returning to the normal streaming renderer. Keep reply-assist transport failures immediate, but feed validation failures into at most two corrective prompts before returning one stable user-facing error.

**Tech Stack:** React Native, TypeScript, Node test runner, Expo Android.

---

### Task 1: Reproduce the bottom handoff regression

**Files:**
- Modify: `tests/ai-chat-fixes-policy.test.cjs`
- Modify: `tests/ai-chat-streaming-tail-policy.test.cjs`
- Inspect: `src/screens/AiChatScreen.tsx`

- [ ] Add contract tests proving near-bottom alone, active drag/momentum, unmeasured promoted blocks, and shrink debt cannot exit replay mode.
- [ ] Add a contract test proving offset `0` plus settled scrolling plus safe tail state schedules a next-frame handoff that clears read mode and enables the normal streaming renderer/cursor.
- [ ] Run `node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-chat-streaming-tail-policy.test.cjs`; confirm the new handoff assertions fail because the current stable commit flushes with `followLatest: false` and has no explicit next-frame renderer recovery.
- [ ] Commit the red tests as `test: reproduce bottom streaming follow regression`.

### Task 2: Implement one safe bottom handoff

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`
- Test: `tests/ai-chat-fixes-policy.test.cjs`
- Test: `tests/ai-chat-streaming-tail-policy.test.cjs`

- [ ] Add one named predicate covering native safe offset, settled gesture/momentum, promoted-block measurement, and zero shrink debt.
- [ ] When the predicate succeeds, flush buffered content without an eager tree switch, preserve the bottom lock, and schedule the replay-mode reset on the next animation frame.
- [ ] On that frame, re-enable `followLatestMessage` only if the native offset is still safe and no new gesture began; otherwise remain in replay mode.
- [ ] Route both natural scrolling to offset `0` and “回到最新” through the same request/commit path.
- [ ] Run the two focused streaming suites and confirm green.
- [ ] Commit as `fix: restore streaming follow after safe bottom handoff`.

### Task 3: Reproduce reply-assist correction requirements

**Files:**
- Modify: `tests/ai-reply-assist-policy.test.cjs`
- Modify: `tests/ai-chat-continue-generation-policy.test.cjs`
- Inspect: `src/ai/aiChatService.ts`

- [ ] Add tests requiring three total attempts and inclusion of the previous validation failure in attempts two and three.
- [ ] Add boundary tests for 20 and 200 Unicode characters accepted, 19 and 201 rejected, and a valid single-sentence long suggestion accepted.
- [ ] Add a test requiring three validation failures to surface exactly `帮答生成失败，请重试。`, while provider/network/abort errors remain immediate.
- [ ] Run `node --test tests/ai-reply-assist-policy.test.cjs tests/ai-chat-continue-generation-policy.test.cjs`; confirm failures reflect the current two-attempt, 35–136 character, three-sentence contract.
- [ ] Commit the red tests as `test: reproduce reply assist correction regressions`.

### Task 4: Implement reply-assist correction retries

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Test: `tests/ai-reply-assist-policy.test.cjs`
- Test: `tests/ai-chat-continue-generation-policy.test.cjs`

- [ ] Set the total request limit to three and keep transport errors outside the validation retry path.
- [ ] Build each retry user prompt from the stable base plus the prior parse/validation failure reason and an instruction to return corrected JSON only.
- [ ] Replace long-mode validation with one suggestion containing 20–200 Unicode characters and remove sentence-count validation.
- [ ] After the third parse/validation failure, throw `帮答生成失败，请重试。` without exposing raw format errors.
- [ ] Run the two focused reply-assist suites and confirm green.
- [ ] Commit as `fix: retry invalid reply assist output`.

### Task 5: Document and verify the combined change

**Files:**
- Modify: `docs/feature-matrix.md`

- [ ] Record safe bottom replay-to-live handoff and three-attempt reply-assist correction with the 20–200 character long mode.
- [ ] Run all focused AI chat suites covering streaming, fixes, reply assist, and continue generation.
- [ ] Run `pnpm typecheck` and `git diff --check` in the isolated worktree.
- [ ] Review the diff for unrelated changes, secret leakage, and renderer timing regressions.
- [ ] Commit as `docs: update streaming follow and reply assist coverage`.

### Task 6: Integrate once and perform Android acceptance

**Files:**
- Merge the isolated branch into `main` only after review.

- [ ] Run the full test suite in the main workspace where native Android sources are present.
- [ ] Build once after all issues are fixed, always running `android\\gradlew.bat clean` before `assembleRelease` if an APK is requested.
- [ ] On Android, test long reasoning with slow scroll-to-bottom, fast fling, “回到最新”, background/foreground, and continued token/new-line arrival.
- [ ] Verify the cursor appears only after the lowest point is visible and scrolling settles; verify subsequent lines auto-follow without jitter, duplicates, gaps, or renderer seams.
- [ ] Verify reply assist silently corrects invalid JSON/count/length responses, accepts natural 20–200 character long replies, and never displays the raw validation message.
- [ ] Do not publish another production OTA unless explicitly requested after acceptance.
