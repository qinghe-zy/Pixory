# Pixory Personal System Final Handoff

Updated: 2026-05-05

## Mission

Implement the final Personal System, resource package import, encrypted export, encrypted import, and normal-mode privacy isolation for Pixory.

This is a final-version handoff, not a basic-version handoff. Do not stop at adding an entrance, hiding private cards, or making only import work. The target is the complete two-space product described in the analysis, implementation plan, and acceptance matrix, including automated tests and Android APK validation.

Start by reading:

1. `AGENTS.md`
2. `docs/PERSONAL_SYSTEM_FINAL_ANALYSIS.md`
3. `docs/PERSONAL_SYSTEM_FINAL_IMPLEMENTATION_PLAN.md`
4. `docs/PERSONAL_SYSTEM_FINAL_ACCEPTANCE_MATRIX.md`
5. `docs/PACKAGE_IMPORT_EXPORT_PLAN.md`
6. `docs/UI_PAGE_OPTIMIZATION_RULES.md`

## Non-Negotiable Product Rules

- Pixory is Android-first.
- Pixory must work fully offline.
- Do not introduce servers, cloud storage, account systems, sync, social features, or AI generation.
- Preserve imported original images losslessly.
- Never compress, crop, overwrite, re-encode, or replace originals.
- Thumbnails are allowed only as separate preview files.
- Structured metadata belongs in SQLite.
- Image files belong in the local file system.
- Deletion defaults to soft delete.
- Physical deletion requires explicit destructive action.

## Current Working Branch And Hygiene

Observed branch before the documentation handoff:

```text
codex/pixory-organize-batch-ux
```

Before code work, inspect:

```bash
git status --short --branch
```

Do not revert unrelated user changes.

Do not touch `.codex-expo-android.log` unless the user explicitly asks. It was previously identified as a local environment artifact, not functional code.

Use `pnpm` because the project has `pnpm-lock.yaml`.

Do not switch package managers.

## Required Verification Commands

Run these after meaningful implementation milestones and at the end:

```bash
pnpm test
pnpm typecheck
pnpm exec expo install --check
```

Resource package import must also be validated with a rebuilt Android APK. Expo Go is not sufficient because `react-native-zip-archive` is a native dependency.

The implementation is not finished until tests exist for the new privacy, package import, encrypted export, encrypted import, and route-space behavior. Do not rely only on manual review.

## Current Progress Snapshot

Latest continuation checkpoint: 2026-05-05, after commit `f7c8d7f: WIP personal system route space propagation`.

Fresh verification after the latest code pass:

```bash
pnpm test
```

Result: 40 tests passed.

```bash
pnpm typecheck
```

Result: passed.

```bash
pnpm exec expo install --check
```

Result: dependencies are up to date.

Completed in the latest route-space pass:

- `AppRoute` already carries required `space: PixorySpace` for ID-bearing and library routes covered by `tests/route-space-policy.test.cjs`.
- `src/navigation/imageViewerContext.ts` includes top-level `space` and shared `SpacedId` / `SpacedRecord<T>` helper types.
- These screens now accept `space?: PixorySpace`, default to normal, and wrap repository work in `runWithDatabaseSpace(space, ...)`:
  - `CreateIpScreen`
  - `GlobalSearchScreen`
  - `TrashScreen`
  - `BackupScreen`
  - `GlobalGroupsScreen`
  - `TagsOverviewScreen`
- `App.tsx` passes `currentRoute.space` into route screens and pins ordinary root-tab `GlobalGroupsScreen` / `TagsOverviewScreen` to `space="normal"`.
- `clearTrash(space)` and `createFullBackup(space)` / `createIpBackup(ipId, space)` are now explicit about database space. Normal callers still default to normal.

Known worktree hygiene note:

- A set of old `codex-*.png` screenshot files are deleted in the worktree. They were pre-existing unrelated changes in the session and were not part of the route-space pass.

Do not restart from the beginning. Continue from the remaining gaps below.

## Core Architecture Guardrails

### Space Is Part Of Identity

Every ID-bearing route must carry `space`.

Wrong:

```ts
{ name: 'image-detail', imageId: 12 }
```

Right:

```ts
{ name: 'image-detail', imageId: 12, space: 'personal' }
```

Normal and personal SQLite databases can both contain `id = 12`. A numeric ID without space is ambiguous and unsafe.

### Normal Mode Must Never Query Personal DB

Normal mode must use only:

- `pixory.sqlite`
- `pixory/originals`
- `pixory/thumbnails`
- `pixory/temp`
- `pixory/exports`

Normal mode must not:

- query `pixory_personal.sqlite`
- read `pixory_personal/originals`
- read `pixory_personal/thumbnails`
- include private names/tags/notes/paths in manifests
- display private thumbnails or covers
- include private counts in stats

### Personal System May Combine Spaces

After unlock, Personal System may show normal and personal records together.

Combined lists must preserve space per row:

```ts
type SpacedRecord<T> = {
  space: PixorySpace;
  record: T;
};
```

Do not flatten combined lists into plain records, because IDs can collide.

### Private Suffix Is UI-Only

Private IP display:

```text
海报 (ps)
角色A (ps)
```

Database names must remain:

```text
海报
角色A
```

Never store `_ps`, `(ps)`, or similar suffixes in the database.

### Private Exports Must Not Be Plain Folders

Private or all-data export from Personal System must be a single encrypted `.pixorypack`.

The exported private pack must not expose plain:

- SQLite database
- manifest
- original images
- thumbnail images
- paths
- names
- tags
- notes

Use password-protected zip through `react-native-zip-archive` and prefer AES-256 encryption.

### Internal Personal Storage Is App-Private, Not Root-Proof Encryption

For this pass, personal data inside the app is protected by:

- separate SQLite database
- separate file directories
- Android app-private storage
- Personal System password gate

Do not claim this protects against root access, forensic extraction, or full app-private filesystem access.

## Implementation Sequence Recommendation

### 1. Add Space To Routing First

Do not start by polishing UI. First make identity safe.

Update:

- `App.tsx`
- `src/navigation/imageViewerContext.ts`
- route callback signatures
- viewer/detail navigation helpers

Acceptance checkpoint:

- every ID-bearing route has `space`.
- TypeScript forces callers to provide it.

### 2. Space-Enable Screens And Services

For each screen:

- add `space?: PixorySpace`.
- default to `'normal'`.
- wrap repository reads/writes in `runWithDatabaseSpace(space, ...)`.
- pass space through callbacks.

Service functions that call repositories internally should either:

- accept `space`, or
- be called only inside `runWithDatabaseSpace(space, ...)`.

Acceptance checkpoint:

- private IP/image/group/tag operations can complete without falling back to normal DB.

### 3. Build The Personal System Dashboard

The unlocked Personal System should expose:

- normal IPs.
- private IPs.
- create normal/private IP.
- search.
- groups.
- tags.
- favorites.
- recent.
- trash.
- backup/export.
- quick organize.

Private rows display `(ps)`.

Acceptance checkpoint:

- private IP opens full IP detail.
- normal and private records can be operated from Personal System.

### 4. Finish Resource Package Import

Add persistent package import result details.

Important final behavior:

- package folder group and manually selected groups are both applied.
- package import creates one batch.
- each file gets a success, failed, or skipped item record.
- private package import writes only personal DB and personal directories.
- temp is cleaned.

Acceptance checkpoint:

- result page shows success, failed, skipped details.
- package import works on Android APK in both spaces.

### 5. Add Encrypted `.pixorypack` Export And Import

Private export:

- require password again.
- create encrypted `.pixorypack`.
- export only encrypted pack to public/user-selected destination.

Private encrypted import:

- only inside unlocked Personal System.
- copy pack to personal temp.
- decrypt/unzip after password.
- merge into personal DB.
- remap IDs.
- clean temp.

Acceptance checkpoint:

- normal mode refuses to inspect private encrypted packs.
- encrypted import merges without clearing existing personal data.

### 6. Verify Normal-Mode Privacy Isolation

Use the acceptance matrix as the checklist.

Pay special attention to:

- search.
- tags.
- groups.
- favorites.
- recent.
- trash.
- stats.
- covers.
- import batches.
- quick organize.
- duplicate review.
- backup manifest.
- debug/regression logs.

## Suggested Next Implementation Prompt

Use this prompt in a new coding session. It follows the current OpenAI GPT-5.5 prompt guidance style: outcome-first, scoped, explicit constraints and verification, with less process-heavy boilerplate.

```text
Continue in D:\Project\Pixory\pixory and finish Pixory Personal System final version without restarting earlier completed route-space work.

Outcome:
Make Pixory a complete offline two-space Android image asset manager:
- normal space remains normal-only and never queries or exports private data.
- unlocked Personal System can operate normal + personal data while preserving space on every record identity.
- resource package import has durable batch item details.
- private/all export uses encrypted .pixorypack.
- encrypted import merges into personal space only.
- automated tests and Android APK validation evidence cover the privacy and package workflows.

First actions:
1. Read AGENTS.md.
2. Read docs/PERSONAL_SYSTEM_FINAL_HANDOFF.md, docs/PERSONAL_SYSTEM_FINAL_ANALYSIS.md, docs/PERSONAL_SYSTEM_FINAL_IMPLEMENTATION_PLAN.md, docs/PERSONAL_SYSTEM_FINAL_ACCEPTANCE_MATRIX.md, docs/PACKAGE_IMPORT_EXPORT_PLAN.md, and docs/UI_PAGE_OPTIMIZATION_RULES.md.
3. Run git status --short --branch.
4. Confirm commit f7c8d7f: WIP personal system route space propagation exists.
5. Inspect current route-space tests before changing code.

Current checkpoint:
- AppRoute and ImageViewerContext are already space-aware.
- Most core screens already use runWithDatabaseSpace(space, ...).
- CreateIpScreen, GlobalSearchScreen, TrashScreen, BackupScreen, GlobalGroupsScreen, and TagsOverviewScreen were space-enabled in the latest pass.
- Fresh checks after that pass: pnpm test passed 40/40, pnpm typecheck passed, pnpm exec expo install --check passed.
- Do not touch unrelated deleted codex-*.png screenshot files unless explicitly asked.

Next priority:
Complete Phase 2: Personal System dashboard and lock lifecycle.

Implement:
- app-level Personal System lock state in App.tsx.
- cold start locked state.
- relock on background/lockscreen/explicit exit.
- personal route guard after relock.
- unlocked dashboard with normal IP section and private IP section.
- private IP rows open full IpDetailScreen with space: 'personal'.
- dashboard actions for create normal IP and create private IP.
- entry points to search, groups, tags, favorites, recent, trash, backup/export, quick organize, and import history.
- change password UI using changePersonalPassword(currentSecret, nextSecret).
- reset remains personal-only and must not affect normal data.

Constraints:
- Android-first, offline-only.
- No server, cloud, account, sync, social, AI generation, or image editing.
- Never compress, crop, overwrite, re-encode, or replace originals.
- Private display suffix "(ps)" is UI-only; never store it in SQLite.
- Every route or callback carrying an ID must also preserve PixorySpace.
- Ordinary mode entry points must stay normal-only and must not query personal DB.
- Keep changes scoped. Do not do unrelated visual rewrites.

Testing:
- Add or extend policy/behavior tests before implementation where feasible.
- Run after each meaningful milestone:
  pnpm test
  pnpm typecheck
  pnpm exec expo install --check

Completion rule:
Do not claim final Personal System completion unless all of these are implemented and verified:
- Personal System dashboard.
- normal + private full feature chain.
- resource package batch item details.
- encrypted private/all .pixorypack export.
- encrypted merge import.
- normal-mode leak prevention across all entries.
- automated privacy/package/export/import tests.
- rebuilt Android APK validation.

Final response:
Keep it concise. Report what changed, verification results, and what remains.
```

## Documentation Pass Verification Baseline

The documentation handoff was prepared with the following intended verification for the docs-only pass:

```bash
pnpm test
pnpm typecheck
pnpm exec expo install --check
```

Expected result:

- all pass.
- no app code changes.
- only the four `docs/PERSONAL_SYSTEM_FINAL_*.md` files are new.

## Final Reminder

The core of this work is not hiding a few cards. It is preventing private data from entering normal database queries, normal file paths, normal exports, normal logs, normal stats, normal recents, normal search, normal thumbnails, and normal route contexts.

Treat `space` as part of every record identity and most downstream bugs become easier to prevent.
