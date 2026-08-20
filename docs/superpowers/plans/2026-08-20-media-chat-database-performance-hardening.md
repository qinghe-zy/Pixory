# Pixory Media, Chat, and Database Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents.

**Goal:** Implement the approved Android-first performance and UX hardening for home loading, IP-card ordering, image/video readers, pitch-preserving playback, chat entry/long history, SQLite/cache hot paths, thumbnails, imports, and extreme stability.

**Architecture:** Preserve the existing Expo/React Native/SQLite ownership and split performance into stable UI shells, cursor-bounded data windows, adaptive resource prefetch, and bounded native/file resources. Every module is independently testable and reviewed before the next starts; Personal-space caches remain session-bound and originals remain immutable.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript 5.9, Expo SQLite 16, Expo Image 3, Expo Video 3/Android Media3, React Native Reanimated 4, Node `node:test`.

**Execution status:** Modules 0–8, post-implementation full review, documentation sync and fresh host verification are complete. Android device acceptance remains pending because `adb devices -l` found no device.

---

## Execution constraints

- Design source: `docs/superpowers/specs/2026-08-20-media-chat-database-performance-hardening-design.md`.
- Work inline in the current workspace because user-owned uncommitted changes overlap target files. Never reset, stash, overwrite, or auto-commit them.
- Do not use subagents.
- Complete one module, run its focused verification, review its diff and Spec coverage, fix review findings, then mark it complete.
- Every behavior change follows RED → GREEN. Static policy tests are acceptable for JSX wiring; pure scheduling/cache/query behavior uses executable unit/integration tests.
- Baseline exceptions are recorded in `progress.md`; no module may add a new full-suite failure.
- No APK, OTA, push, tag, release, or remote deployment.

## File map

### Create

- `src/components/IPCardSkeleton.tsx` — one real-geometry loading card and bounded shimmer.
- `src/media/videoPlaybackRate.ts` — single pitch-preserving playback-rate boundary.
- `src/media/mediaPrefetchPolicy.ts` — velocity/direction/memory-aware image/video window policy.
- `src/media/mediaReaderSessionCache.ts` — scoped, bounded reader restoration snapshots.
- `src/media/mediaImagePrefetchCoordinator.ts` — generation-aware Expo Image encoded/decode prefetch coordinator.
- `src/media/videoSwipePolicy.ts` — pure gesture threshold and adjacent-slot policy.
- `src/media/videoPreloadPool.ts` — bounded player/source preparation lifecycle.
- `src/services/scopedLruCache.ts` — capacity/TTL/scope-aware cache primitive.
- `src/services/dataEpochService.ts` — domain-scoped cache invalidation epochs.
- `src/services/boundedFileConcurrency.ts` — ordered bounded I/O helper.
- `scripts/benchmark-media-database-performance.cjs` — repeatable 100k-media query benchmark.
- `tests/home-library-loading-performance-policy.test.cjs`.
- `tests/video-pitch-preservation-unit.test.cjs`.
- `tests/media-prefetch-policy-unit.test.cjs`.
- `tests/media-reader-session-cache-unit.test.cjs`.
- `tests/media-cursor-pagination-integration.test.cjs`.
- `tests/media-database-index-policy.test.cjs`.
- `tests/scoped-lru-cache-unit.test.cjs`.
- `tests/data-epoch-service-unit.test.cjs`.
- `tests/video-swipe-policy-unit.test.cjs`.
- `tests/ai-chat-entry-performance-policy.test.cjs`.
- `tests/bounded-file-concurrency-unit.test.cjs`.
- `tests/media-import-extreme-integration-policy.test.cjs`.

### Modify

- `src/design/tokens/components.ts` — shared IP-card aspect ratio and shimmer timing.
- `src/components/IPCard.tsx` — remove first-item sensor path; use shared geometry and image priority/recycling.
- `src/components/SecureImage.tsx` — safely pass Expo Image priority/recycling/placeholder/transition.
- `src/screens/HomeLibraryScreen.tsx` — always-mounted FlatList, one skeleton, fixed layout and visible-priority covers.
- `src/screens/ImageViewerScreen.tsx` — declaration fix, around-anchor data, initial index, prefetch/session/write coalescing.
- `src/screens/VideoPlayerScreen.tsx` — pitch helper, adjacent visual slots, prepared player swap and virtual queue.
- `src/database/db.ts` — ensure evidence-backed performance indexes in both spaces.
- `src/database/repositories/imageRepository.ts` — cursor page and around-anchor queries.
- `src/database/repositories/assetRepository.ts` — bounded video queue page boundary.
- `src/database/types.ts` — media cursor/page types.
- `src/screens/AiChatScreen.tsx` — ordinary-entry stable reveal, linear older-page merge, animation lifecycle and bounded attachments.
- `src/ai/aiThreadMessagePrefetch.ts` — retain one current revision-safe prefetch and expose warmup metadata.
- `App.tsx` — initialize shared cache state during the existing startup mask and clear Personal caches on lock; never guess an unpersisted chat target.
- `src/services/mediaFilePickerService.ts` — quota preflight result and platform-safe cache-copy policy.
- `src/services/cacheCleanupService.ts` — bounded recursive directory traversal.
- `src/services/imageImportService.ts` / `src/services/videoImportService.ts` — shared byte/count/free-space preflight and bounded stages.
- `src/constants/limits.ts` — centralized import and attachment limits.
- `docs/feature-matrix.md` — implemented behavior and verification coverage.
- `package.json` — media/database benchmark script.

## Module 0: Baseline and ImageViewer correctness blocker

**Files:** `src/screens/ImageViewerScreen.tsx`, `tests/mature-media-experience-policy.test.cjs`, `progress.md`.

- [x] **Step 0.1: Capture the RED compiler failure**

Run:

```powershell
pnpm exec tsc --noEmit --allowJs false
```

Expected RED: `TS2448/TS2454` for `jumpToImageIndex` and `handleImageLongPress` in `ImageViewerScreen.tsx`, plus the separately recorded `CircularProgress.tsx` baseline errors.

- [x] **Step 0.2: Add the source-order regression assertion**

Append to `tests/mature-media-experience-policy.test.cjs`:

```js
test('image viewer declares callbacks before memoized renderers consume them', () => {
  const source = readProjectFile('src/screens/ImageViewerScreen.tsx');
  const jump = source.indexOf('const jumpToImageIndex = useCallback');
  const relative = source.indexOf('const goToRelativeImage = useCallback');
  const longPress = source.indexOf('const handleImageLongPress = useCallback');
  const renderer = source.indexOf('const renderItem = useCallback');
  assert.ok(jump >= 0 && jump < relative);
  assert.ok(longPress >= 0 && longPress < renderer);
});
```

Run `node --test tests/mature-media-experience-policy.test.cjs`; expected RED because both declarations currently occur later.

- [x] **Step 0.3: Move callbacks without changing behavior**

In `ImageViewerScreen.tsx`, place `imagesLengthRef`, `jumpToImageIndex`, `activeIndexRef`, `handleImageLongPress`, `goToRelativeImage`, and `handleReaderZonePress` in dependency order before `renderItem`. Keep bodies unchanged except removing their old duplicate declarations.

- [x] **Step 0.4: Verify and review Module 0**

Run:

```powershell
node --test tests/mature-media-experience-policy.test.cjs
pnpm exec tsc --noEmit --allowJs false
git diff --check
git diff -- src/screens/ImageViewerScreen.tsx tests/mature-media-experience-policy.test.cjs
```

Expected: focused test passes; ImageViewer TS2448/TS2454 errors disappear; only recorded unrelated TypeScript errors may remain. Review for duplicate callbacks, hook-order changes, stale dependencies and unrelated formatting.

## Module 1: Home single skeleton and deterministic first card

**Files:** `src/design/tokens/components.ts`, `src/components/IPCard.tsx`, `src/components/IPCardSkeleton.tsx`, `src/components/SecureImage.tsx`, `src/screens/HomeLibraryScreen.tsx`, `tests/home-library-loading-performance-policy.test.cjs`.

- [x] **Step 1.1: Write the RED home policy test**

Create the test with assertions that:

```js
assert.match(home, /ListEmptyComponent=\{isLoading \? <IPCardSkeleton \/> :/);
assert.doesNotMatch(home, /正在读取本地资产库|SQLite 数据加载完成后/);
assert.doesNotMatch(home, /isFirst=\{index === 0\}/);
assert.doesNotMatch(card, /MagneticCardContainer|MagneticLiquidContainer|GyroSpecularHighlight|isFirst/);
assert.match(tokens, /aspectRatio:\s*2\.08/);
assert.match(card, /aspectRatio:\s*componentTokens\.ipCard\.aspectRatio/);
assert.match(skeleton, /aspectRatio:\s*componentTokens\.ipCard\.aspectRatio/);
assert.match(home, /getItemLayout=/);
assert.match(secureImage, /recyclingKey/);
assert.match(secureImage, /priority/);
```

Run the test; expected RED on all new contracts.

- [x] **Step 1.2: Add shared geometry tokens**

Extend `componentTokens.ipCard`:

```ts
aspectRatio: 2.08,
contentPadding: spacing[4],
shimmerDurationMs: 1_200,
```

Import `spacing` into `components.ts`; replace the literal `contentPadding: 12` with the shared value only if no current consumer relies on 12, otherwise keep `contentPadding` and add `heroContentPadding` for the real card.

- [x] **Step 1.3: Implement the one-card skeleton**

Create `IPCardSkeleton.tsx` with a root card using `componentTokens.ipCard.aspectRatio/radius`, an image-toned base, caption-width blocks matching the lower-right real caption, and one `Animated.loop` translate shimmer. Use `AccessibilityInfo.isReduceMotionEnabled()` and the `reduceMotionChanged` subscription; stop the loop on unmount.

- [x] **Step 1.4: Remove the first-item heavy path**

Delete `isFirst` from `IPCardProps`, remove sensor imports and conditional branches, and always return the same `shadowContainer → Pressable` structure. Keep AcrylicGlass and add only static highlights already present in `AcrylicGlass`.

- [x] **Step 1.5: Extend SecureImage without weakening privacy**

Add props:

```ts
priority?: ImageProps['priority'];
recyclingKey?: string;
placeholder?: ImageProps['placeholder'];
transition?: ImageProps['transition'];
```

Pass them to `<Image>`. Preserve the current working-tree Personal cache expression exactly; do not resolve the pre-existing policy conflict inside this module.

- [x] **Step 1.6: Keep FlatList mounted and render exactly one skeleton**

Replace loading ownership in `HomeLibraryScreen` so error/loaded-empty states use `PageStateBlock`, while loading renders the same `FlatList` with `ListEmptyComponent={isLoading ? <IPCardSkeleton /> : ...}`. Remove the loading title/description. Add stable `renderItem`, `getItemLayout` based on measured content width and aspect ratio, `initialNumToRender={3}`, `maxToRenderPerBatch={4}`, `windowSize={5}`, and high image priority for indices 0–2.

- [x] **Step 1.7: Verify and review Module 1**

Run focused home/library/privacy tests, application TypeScript, and diff checks. Inspect the screenshot layout on Android when available. Review that there is one skeleton, no sensor import, no list-wide entering animation, no Personal cache change, and no user-owned Home changes lost.

## Module 2: Pitch-preserving playback

**Files:** `src/media/videoPlaybackRate.ts`, `src/screens/VideoPlayerScreen.tsx`, `tests/video-pitch-preservation-unit.test.cjs`, `tests/mature-media-experience-policy.test.cjs`.

- [x] **Step 2.1: Write executable RED tests**

Load the TypeScript helper with `typescript.transpileModule`. Assert call order through property setters:

```js
const calls = [];
const player = {
  set preservesPitch(value) { calls.push(['pitch', value]); },
  set playbackRate(value) { calls.push(['rate', value]); },
};
applyPitchPreservingRate(player, 2);
assert.deepEqual(calls, [['pitch', true], ['rate', 2]]);
assert.throws(() => applyPitchPreservingRate(player, 0), /positive finite/);
```

Add a source assertion that every direct `player.playbackRate =` assignment is removed from `VideoPlayerScreen.tsx`. Run expected RED because the helper does not exist.

- [x] **Step 2.2: Implement the minimal helper**

```ts
export interface PitchPreservingRatePlayer {
  playbackRate: number;
  preservesPitch: boolean;
}

export function applyPitchPreservingRate(player: PitchPreservingRatePlayer, rate: number): void {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Playback rate must be a positive finite number.');
  player.preservesPitch = true;
  player.playbackRate = rate;
}
```

- [x] **Step 2.3: Route all five rate paths through the helper**

Use the helper in player creation, `replaceAsync` completion, speed effect, hold-start and hold-end/cleanup. Set pitch before rate on every path. Do not add SoundTouch/Rubber Band.

- [x] **Step 2.4: Verify and review Module 2**

Run helper unit tests, mature media policy, application TypeScript, diff check. Review source replacement and long-press cleanup paths. Record that acoustic verification still requires Android speaker/headphone/Bluetooth testing.

## Module 3: SQLite indexes, cursor pages, scoped cache primitives

**Files:** `src/database/db.ts`, `src/database/types.ts`, `src/database/repositories/imageRepository.ts`, `src/database/repositories/assetRepository.ts`, `src/services/scopedLruCache.ts`, `src/services/dataEpochService.ts`, `tests/scoped-lru-cache-unit.test.cjs`, `tests/data-epoch-service-unit.test.cjs`, `tests/media-database-index-policy.test.cjs`, `tests/media-cursor-pagination-integration.test.cjs`.

- [x] **Step 3.1: Write RED LRU and epoch unit tests**

Assert capacity eviction, TTL expiry with injected clock, scope clear, epoch bump isolation, and composite key changes. No timers are used in production cache; expiry is checked on access.

- [x] **Step 3.2: Implement `ScopedLruCache` and epochs**

Expose only `get`, `set`, `delete`, `clearScope`, `clear`, `size`; store `scope`, `expiresAt`, `value` in insertion-ordered `Map`. `dataEpochService` exposes `getDataEpoch(domain)` and `bumpDataEpoch(domain)` with monotonically increasing integers.

- [x] **Step 3.3: Write RED database index integration test**

Build an in-memory `image_assets`/`ai_messages` fixture, execute the same three `CREATE INDEX IF NOT EXISTS` statements planned by the Spec, and assert `EXPLAIN QUERY PLAN` chooses the named index for media-created, recently-viewed, and chat-thread ordering queries.

- [x] **Step 3.4: Add idempotent runtime index ensure**

Add `ensureMediaPerformanceIndexes` in `db.ts` and call it after version migrations for both spaces. Do not bump `DATABASE_VERSION`.

- [x] **Step 3.5: Write RED cursor boundary tests**

Seed equal timestamps and assert two pages have no duplicate/skip. Cover `createdAtDesc`, `lastViewedAtDesc`, `sourceOrderAsc`, explicit IDs, group/tag filters, and video-only filters. Assert SQL uses `(sortValue, id)` tie breakers and `limit + 1` for exact `hasMore`.

- [x] **Step 3.6: Implement cursor types and repository queries**

Add `MediaPageCursor`, `MediaCursorPageRequest`, `MediaPageResult`. Implement `findFilteredCursorPage`, `findCursorPageAroundId`, and a bounded `findVideoQueuePageByIpId`. Reuse `buildImageListWhereClause`; add cursor predicates per supported sort and reject unsupported cursor sorts with a clear error rather than falling back to OFFSET.

- [x] **Step 3.7: Verify and review Module 3**

Run LRU/epoch/cursor/index tests, existing library repository tests, application TypeScript, `EXPLAIN` benchmark and diff check. Review SQL parameter order, equal-value tie breakers, Personal initialization and index write cost.

## Module 4: Image reader adaptive prefetch and restoration

**Files:** new `src/media/*` policy/session/prefetch files, `ImageViewerScreen.tsx`, `SecureImage.tsx`, repository tests.

- [x] **Step 4.1: Write RED policy tests**

Assert slow/medium/fast windows are respectively `8/4/3/2`, `16/6/5/3`, `32/8/6/3`; direction reverses ahead/behind; memory pressure reduces decoded window to current-only; all generated indices are clamped and unique.

- [x] **Step 4.2: Implement pure prefetch policy**

Define `MediaScrollSample`, `MediaPrefetchWindow`, `resolveMediaPrefetchWindow`, and `buildPrefetchIndices`. Velocity thresholds are centralized constants and not duplicated in the screen.

- [x] **Step 4.3: Write RED session-cache tests**

Assert LRU capacity, context+epoch keying, current id/index restoration, and Personal scope clear. Implement `mediaReaderSessionCache` on `ScopedLruCache`.

- [x] **Step 4.4: Implement generation-aware image prefetch coordinator**

Expose `updateTarget({items,index,direction,velocity,space})` and `dispose()`. Use Expo Image `prefetch` for encoded URIs, at most 4 concurrent requests, skip disk prefetch for Personal, ignore completion from obsolete generations, and never decode all fast-window items.

- [x] **Step 4.5: Replace full-context load with around-anchor cursor page**

Initial load requests current id plus surrounding metadata. Pass `initialScrollIndex` directly to both reader lists. On boundary approach, append/prepend cursor pages while retaining the active item by id.

- [x] **Step 4.6: Coalesce last-view writes and restore sessions**

Queue unique stable-visible ids, flush every 2 seconds and on unmount, and call `onRefreshed` once per flush rather than once per page. Save the bounded session snapshot on active id/window changes; clear Personal sessions from the app lock path.

- [x] **Step 4.7: Verify and review Module 4**

Run all reader/prefetch/session/cursor tests, typecheck, diff check, and manual rapid-swipe script when Android is available. Review stale generations, prepend index retention, reverse mode, zoom paging lock, unmount flush and original-file immutability.

## Module 5: Short-video swipe and bounded preload

**Files:** `src/media/videoSwipePolicy.ts`, `src/media/videoPreloadPool.ts`, `VideoPlayerScreen.tsx`, video tests.

- [x] **Step 5.1: Write RED swipe policy tests**

Assert distance threshold, velocity threshold, cancel, reverse direction, boundary handling and interrupt retargeting. The pure result is `{ action: 'cancel' | 'switch'; direction: -1 | 1 | 0; targetOffset: number }`.

- [x] **Step 5.2: Implement swipe policy**

Use both distance and velocity; compute target from current translation so interruption never jumps to zero.

- [x] **Step 5.3: Write RED preload-pool lifecycle tests**

With fake players assert maximum live players ≤ 5, only active owns audio, three forward items are prepared before the reverse fallback, direction reversal reprioritizes, removed players release exactly once, and dispose releases all. The original three-item draft was superseded by the user's explicit rapid-swipe requirement.

- [x] **Step 5.4: Implement the bounded pool**

Inject player factory/release/prepare functions so policy is testable. The pool has active + three directional successors + one reverse fallback; it tracks source id, state and generation while retaining a single audio owner. Preparation preserves priority order but runs with a hard maximum of three concurrent source operations.

- [x] **Step 5.5: Render adjacent covers before gesture completion**

Add previous/current/next absolute visual slots. Current player moves with transform; adjacent slot always renders that asset's cover. Do not wait for exit animation to call `setLoadingCoverVideo`.

- [x] **Step 5.6: Swap prepared player at activation and virtualize queue**

Attach the prepared player at the settle boundary, keep one audio owner, then prepare the new adjacent direction. Replace queue `ScrollView + map` with bounded `FlatList` and cursor-backed page loading.

- [x] **Step 5.7: Verify and review Module 5**

Run swipe/pool/mature-media tests, typecheck, diff check. Android review records 30 rapid reversals, no double audio, no post-settle cover flash, decoder count and memory. If the Expo two-player path misses the gate, stop and write a separate Media3 bridge plan before native code.

## Module 6: Chat entry stability, long history and bounded attachments

**Files:** `AiChatScreen.tsx`, `aiThreadMessagePrefetch.ts`, `App.tsx`, `src/constants/limits.ts`, chat tests.

- [x] **Step 6.1: Write RED ordinary-entry policy test**

Assert ordinary route adoption does not use delayed latest-jump retries after message area becomes visible; search/branch/edit retries remain named and isolated. Assert route click prefetch occurs before push.

- [x] **Step 6.2: Remove ordinary visible correction and make reveal readiness-driven**

Adopt valid snapshot or final page, render inverted list at offset 0, and mark ready from first committed non-empty list layout. Do not use 400/700ms ordinary-entry correction. Preserve target-specific retry helpers.

- [x] **Step 6.3: Write RED linear merge unit/policy test**

Assert loading 100 pages does not call full accumulated `.sort`; equal timestamps remain deterministic. Implement a linear id-dedup merge that accepts already ordered older/current pages.

- [x] **Step 6.4: Bound attachment preparation**

Add centralized count/byte limits, reject before Base64 work, use existing `settleWithConcurrency` with limit 2, preserve attachment order, and never read video into Base64. Add partial-failure tests.

- [x] **Step 6.5: Use initialization and route time narrowly**

During the existing startup mask, initialize SQLite/index/cache state only. The app does not currently persist a reliable target thread, so do not guess or add unrelated root-tab persistence. On every known thread-open path, start the existing revision-safe prefetch before route push; clear Personal prefetch on lock.

- [x] **Step 6.6: Stop hidden infinite animation work**

Pass active/visible state into `ParallaxLightSweep`; cancel loops when chat is covered, backgrounded or initial loading ends. Preserve reduced-motion behavior.

- [x] **Step 6.7: Verify and review Module 6**

Run route-loading, performance-hardening, streaming, new entry stability and attachment tests plus `pnpm bench:ai-chat`. Review branch/search positioning, detached streaming, keyboard behavior, Personal isolation and timer cleanup.

## Module 7: Thumbnail, import and cleanup extremes

**Files:** `boundedFileConcurrency.ts`, `cacheCleanupService.ts`, import services, picker, limits, tests.

- [x] **Step 7.1: Write RED bounded-file helper tests**

Assert ordered results, maximum concurrency 4, failure containment, cancellation stopping new work, and zero/invalid limit rejection.

- [x] **Step 7.2: Implement helper and replace recursive Promise.all**

Use a worker cursor with `Promise.all` only over the fixed worker count. `getLocalEntrySize` schedules children through the helper and never launches one promise per entry.

- [x] **Step 7.3: Write RED import preflight tests**

Cover file count, known total bytes, per-file bytes, unknown-size reserve, remaining storage, Personal space and cancellation. Errors use concrete Chinese messages and include the violated limit.

- [x] **Step 7.4: Centralize limits and enforce before copying**

Add limits to `constants/limits.ts`; make image/video import call the same preflight before background task creation and again before database commit if bytes changed.

- [x] **Step 7.5: Validate picker cache ownership**

Keep `copyToCacheDirectory: true` until Android tests prove returned URIs remain readable with false. When true, register selected cache URIs as task-owned temporary inputs and remove them after managed copy success/cancel.

- [x] **Step 7.6: Verify and review Module 7**

Run bounded cleanup, import picker/source/stability/package tests, typecheck and diff check. Review partial copies, database rollback, free-space race, original immutability and cleanup target safety.

## Module 8: Matrix, benchmark and final verification

**Files:** `scripts/benchmark-media-database-performance.cjs`, `package.json`, `docs/feature-matrix.md`, all changed files.

- [x] **Step 8.1: Add deterministic media/database benchmark**

Seed 100,000 media rows and record created/recent/video cursor page latency, query-plan detail and result count. Add `bench:media-db` script.

- [x] **Step 8.2: Update feature matrix**

Record single home skeleton, deterministic IP card first frame, adaptive reader prefetch/session restore, pitch preservation, short-video switching, cursor/index/cache coverage, chat entry stabilization, bounded imports and test coverage. Correct any previous claim that cover preloading was already complete.

- [x] **Step 8.3: Run fresh full verification**

Run:

```powershell
pnpm exec tsc --noEmit --allowJs false
pnpm test
pnpm bench:ai-chat
pnpm bench:media-db
git diff --check
git status --short --branch
```

Classify every remaining failure against the recorded baseline; no new failure is acceptable.

- [x] **Step 8.4: Android acceptance when a device is available**

Use `D:\Develop\Android\Sdk\platform-tools\adb.exe devices -l`, then collect populated-home screenshots, 30/200 image-swipe traces, 30 bidirectional video switches, audio 1×/1.5×/2× matrix, 20k-message scroll/entry recording, memory and ANR/crash evidence. If no device exists, report these gates as unverified rather than passing.

- [x] **Step 8.5: Final self-review**

Re-read the Spec line by line and map every requirement to a completed module/test/evidence item. Search changed files for unbounded `Promise.all`, direct video `playbackRate` writes, old home loading copy, `isFirst` sensor path, reader full-context calls and ordinary delayed latest jumps. Report remaining risks and do not claim completion without fresh evidence.

## Pre-execution self-review record

- Requirement coverage: all nine Spec goals map to Modules 1–8; Module 0 removes the compiler blocker before behavior work.
- Executability: every module names exact source/test files, starts with a RED check, ends with focused verification and a diff/Spec review gate.
- Draft hygiene: no unresolved TBD/TODO/unknown-value marker remains; occurrences of `placeholder` are intentional Expo Image API property names.
- Type/API consistency: `MediaCursorPageRequest`, `MediaPageCursor`, `MediaPageResult`, `ScopedLruCache`, data epochs, adaptive prefetch, swipe phases and pitch helper have one named boundary each.
- Scope correction: startup does not guess an unpersisted chat target; it initializes shared state, while known route intent triggers target-thread prefetch before navigation.
- Baseline integrity: 2 pre-existing full-suite policy failures, 4 user-owned `CircularProgress` diagnostics, 6 in-scope `ImageViewer` declaration diagnostics, plus the root `fix_tests.js` parser blocker are recorded and may not be hidden.
- Decision: approved for sequential execution without subagents. No module starts until the preceding module review is recorded as passed.

## Module review record

After each module, append to `progress.md`:

```markdown
### Module review: use the completed module's numeric heading
- RED evidence: command and expected failure
- GREEN evidence: focused commands and counts
- Files changed: exact list
- Spec coverage: exact sections
- Diff review: correctness, privacy, cleanup, memory, unrelated changes
- Findings fixed during review: exact items or “none observed”
- Remaining device-only verification: exact scenarios
```

## Post-implementation full review

- Detailed review and itemized delivery index: [`docs/reviews/2026-08-20-performance-hardening-review.md`](../../reviews/2026-08-20-performance-hardening-review.md).
- The review and follow-up found and fixed 19 additional issues after the original modules were green: the original 15 review findings plus normal/personal epoch isolation, shared mixed-import actual-byte accounting, Android memory-trim/pixel bounds, and one-statement chat anchor loading with a 6000-message benchmark.
- Review changes were applied one module at a time and followed by focused regression. Final whole-repository verification remains a separate fresh gate so the document does not reuse stale intermediate results.
- Android frame pacing, decoder/RSS pressure, acoustic pitch quality, OEM URI behavior and low-storage races remain device-only acceptance items and are not marked passed by source-policy tests.

## Rollback boundaries

- Module 1 is independently revertible; it must not restore first-card sensors.
- Module 2 is independently revertible; direct rate writes are forbidden if helper remains.
- Modules 3–4 form a dependency chain: screen cursor/session code cannot remain without repository/cache primitives.
- Module 5 can revert to the single-player path while keeping Module 2 pitch preservation.
- Module 6 chat changes revert independently and must preserve existing cursor paging, branch routes and recoverable streaming.
- Module 7 is independently revertible per helper/preflight call site; never revert by deleting originals or database records.

## Follow-up execution

全面 review 后的 4 项源码级补强已按独立 Plan 完成并逐模块 review：[`2026-08-20-performance-hardening-followup.md`](2026-08-20-performance-hardening-followup.md)。最终结果同步到[`全面 Review`](../../reviews/2026-08-20-performance-hardening-review.md)和[`功能矩阵`](../../feature-matrix.md)；Android 真机帧率、RSS/codec、声学与 OEM URI 仍保持未验证。
