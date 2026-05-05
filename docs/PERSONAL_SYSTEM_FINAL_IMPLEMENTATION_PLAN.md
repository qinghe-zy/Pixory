# Pixory Personal System Final Implementation Plan

Updated: 2026-05-05

## Goal

Complete Pixory's final Personal System, resource package import, encrypted export, and privacy isolation behavior while preserving the Android-first, offline-only, lossless-original product direction.

## Source Of Truth

This plan supersedes earlier partial Personal System and package import notes for the final implementation pass. Use it together with:

- `AGENTS.md`
- `docs/PERSONAL_SYSTEM_FINAL_ANALYSIS.md`
- `docs/PERSONAL_SYSTEM_FINAL_ACCEPTANCE_MATRIX.md`
- `docs/PERSONAL_SYSTEM_FINAL_HANDOFF.md`
- `docs/PACKAGE_IMPORT_EXPORT_PLAN.md`
- `docs/UI_PAGE_OPTIMIZATION_RULES.md`

## Chosen Product Defaults

- Resource package folder groups and manually selected import groups are both applied.
- Encrypted `.pixorypack` import into Personal System merges data; it does not overwrite or clear existing personal data.
- Private and all-data export from Personal System uses encrypted `.pixorypack`.
- Normal full backup and normal IP export stay normal-only.
- Software-internal personal storage remains in Android app-private storage and is not full root-resistant file encryption.
- Private display suffix `(ps)` is UI-only and never written into the database name.
- Normal mode must never query personal SQLite or personal file directories.

## Completion Standard: Final Version Only

Do not ship this as a basic Personal System entrance, a private IP list, or a visual hiding layer. The implementation is acceptable only when private data is separated through database access, file paths, import, export, search, tags, groups, favorites, recent records, trash, stats, thumbnails, covers, batch history, duplicate review, quick organize, and debug output.

The final implementation must include tests. A feature path is not complete when it is merely coded; it is complete only when the related automated tests pass and the Android APK checklist has evidence for native package import, private import, encrypted export, encrypted import, and normal-mode leak prevention.

## Phase 1: Route And Context Space Propagation

### Target

Every ID-bearing navigation path must carry `space: PixorySpace`. Numeric IDs from normal and personal SQLite must never be interpreted without space.

### Implementation

- Extend `AppRoute` in `App.tsx` so these routes carry `space`:
  - IP routes: detail, edit, group overview, create group, edit group, group images, all images, import images, import result, import batch history, duplicate review, quick organize.
  - Image routes: viewer, detail, edit image, move group.
  - Tag routes: tag result.
  - Library routes: favorites, recent viewed, trash, backup, global search when used from Personal System.
  - Batch routes: batch management, import batch review/history, duplicate review.
- Add a small shared route helper type:
  - `type SpacedId = { id: number; space: PixorySpace }`
  - `type SpacedRecord<T> = { space: PixorySpace; record: T }`
- Extend `src/navigation/imageViewerContext.ts` so every context includes `space` directly or inherits it through a required top-level field.
- Update all callbacks that currently pass only `id` to pass `space` too when the callback can be invoked from Personal System.
- Ensure normal root tab routes always set or default to `space: 'normal'`.
- Ensure Personal System combined lists keep space alongside every row.

### Acceptance

- No route from Personal System can open a screen without a personal or normal space value.
- Image viewer and image detail update `lastViewedAt` in the correct database.
- Normal and personal records with the same numeric ID cannot be confused.

## Phase 2: Personal System Dashboard And Lock Lifecycle

### Target

Personal System becomes a full second-space dashboard after unlock. It shows normal IPs and private IPs, lets users create normal or private IPs, and relocks reliably.

### Implementation

- Add app-level Personal System lock state in `App.tsx`:
  - locked by default on cold start.
  - unlocked only after password verification.
  - relock on app background, lock screen, and explicit exit.
  - after relock, personal routes must show the Personal System lock screen before revealing content.
- Keep the current five-attempt lockout and SecureStore credential model.
- Add change password UI using existing `changePersonalPassword(currentSecret, nextSecret)`.
- Keep forgot password reset as destructive clear of personal data only.
- Replace the current private-only IP list with a dashboard:
  - normal IP section.
  - private IP section.
  - empty states for no private IPs and no private images.
  - entry points for search, groups, tags, favorites, recent, trash, backup/export, and quick organize.
- Add create IP flow inside Personal System:
  - segmented option: `普通 IP` or `隐私 IP`.
  - normal writes to normal DB.
  - private writes to personal DB.
- Display private rows as `海报 (ps)` while storing `海报`.

### Acceptance

- Entering Personal System requires setup or verification.
- Backgrounding and exiting Personal System relock it.
- Unlocking reveals normal and private IPs.
- Private IP rows open full IP detail, not only import.
- Change password requires the old password.
- Reset personal data does not affect normal data.

## Phase 3: Screen And Service Space Enablement

### Target

All existing product features work for private data inside Personal System and remain normal-only outside it.

### Implementation

- Add `space?: PixorySpace` props to affected screens and default to normal.
- Wrap each screen load and mutation in `runWithDatabaseSpace(space, ...)`.
- Update service calls that use repositories internally so they either accept `space` or are called inside `runWithDatabaseSpace`.
- Space-enable:
  - IP detail and edit.
  - group create/edit/delete/pin and group image lists.
  - all images and filters.
  - image viewer, image detail, edit image, move group.
  - tag overview, tag result, tag create/rename/delete.
  - favorites.
  - recent viewed.
  - trash restore and clear.
  - quick organize.
  - batch management.
  - import result/review.
  - import batch history.
  - duplicate review.
  - global search.
  - Me screen stats where relevant.
- Add Personal System combined variants where needed:
  - combined search should query normal and personal separately after unlock, then merge display rows with space.
  - combined favorites/recent/trash should preserve space per image row.
  - normal tabs must keep using only normal DB.
- Audit dev logging:
  - normal mode logs must not include private names, filenames, notes, paths, thumbnail URIs, or original URIs.
  - personal logs should avoid unnecessary sensitive values too.

### Acceptance

- Private IP supports full detail, edit, soft delete, restore, permanent delete.
- Private image supports detail, preview, note, favorite, group move, tag edit, restore, delete.
- Private groups, tags, favorites, recent, trash, quick organize, duplicate review, and import batches work.
- Normal and private same-name IPs, groups, and tags do not conflict.
- Normal mode cannot see private data through any existing screen.

## Phase 4: Package Import Batch Item Persistence

### Target

Resource package import becomes a product-grade batch workflow with progress and durable result details.

### Implementation

- Add a migration for an `import_batch_items` table:
  - `id`
  - `importBatchId`
  - `sourcePath`
  - `originalFilename`
  - `status` with values `success`, `failed`, `skipped`
  - `imageAssetId`
  - `reason`
  - `createdAt`
- Add repository methods:
  - create item.
  - list items by batch.
  - count items by status.
- Update `importPackageToIp`:
  - create a single import batch for the whole package.
  - persist each file outcome.
  - keep single-file failure non-blocking.
  - delete copied original/thumbnail if DB write fails for that image.
  - clean current temp directory after completion or failure.
  - return `importBatchId`, success count, failure count, skipped count, and detailed items.
- Apply final group rule:
  - selected manual groups are always included.
  - folder-derived group is added when present.
  - root images use selected manual groups or remain ungrouped.
  - duplicate group IDs are deduped.
- Add a processing state in import UI:
  - cannot submit twice while importing.
  - show progress or at least current processing state.
- Update import result/history screens to display:
  - success count.
  - failed count.
  - skipped count.
  - failed/skipped detail rows with reasons.

### Acceptance

- `.zip` and `.pixorypack` imports work in normal and personal spaces.
- Folder names map to groups.
- Manual and folder groups both apply.
- Unsupported files show skipped reasons.
- Failed images do not block the package.
- Failed DB writes do not leave orphan files.
- Temp is cleaned.
- Package import batches appear in the correct space only.

## Phase 5: Encrypted Export And Encrypted Import

### Target

Private data exported to user-visible locations must not appear as plain folders or plain image files. Personal System can export private or all data as encrypted `.pixorypack`, and later merge-import it into personal space.

### Implementation

- Use `react-native-zip-archive`:
  - `zipWithPassword(source, target, password, EncryptionMethods.AES_256)`.
- Add backup service functions:
  - `createNormalFullBackup()`.
  - `createNormalIpBackup(ipId)`.
  - `createEncryptedPersonalPack(secret)`.
  - `createEncryptedAllPack(secret)`.
  - `importEncryptedPersonalPack({ packageUri, secret, mode: 'merge' })`.
- Private export flow:
  - require password again.
  - create a staging directory in personal temp.
  - copy `pixory_personal.sqlite`, personal originals, personal thumbnails, and manifest.
  - zip staging directory into a single encrypted `.pixorypack`.
  - clean staging directory.
  - export only the encrypted pack to user-visible destination.
- All-data export flow:
  - require password again.
  - include normal backup payload and personal backup payload inside one encrypted pack.
  - mark manifest with spaces so restore can remap correctly.
- Normal export flow:
  - remains normal-only.
  - may still export directory backup.
  - must not include personal DB, names, tags, paths, originals, thumbnails, or manifest entries.
- Encrypted import flow:
  - available only inside unlocked Personal System.
  - normal mode must refuse to inspect or preview private encrypted packs.
  - copy pack to `pixory_personal/temp`.
  - ask for Personal System password or pack password.
  - unzip/decrypt into personal temp.
  - verify manifest type/version.
  - merge import into personal DB.
  - remap IP, group, tag, image, image group, image tag, and import batch IDs.
  - copy originals and thumbnails into personal originals/thumbnails.
  - clean temp.
- Merge policy:
  - never clear current personal data.
  - imported records become new personal records.
  - same names are allowed.
  - UI still displays `(ps)` for private IPs.

### Acceptance

- Private export creates a single encrypted `.pixorypack`.
- The exported private pack cannot be browsed as plain images, manifest, or SQLite in a file manager.
- Normal mode cannot inspect private encrypted packs.
- Personal System can merge-import encrypted packs.
- Import does not touch normal DB or normal file directories.

## Phase 6: Privacy Leak Tests And Android APK Validation

### Target

Prove normal mode isolation and package import behavior through automated tests and Android APK validation.

### Automated Tests

Run after implementation:

```bash
pnpm test
pnpm typecheck
pnpm exec expo install --check
```

Add policy tests for:

- every ID-bearing route includes `space`.
- `ImageViewerContext` includes `space`.
- Personal System combined list types include `space`.
- normal screens do not call personal DB.
- normal backup excludes `PERSONAL_DATABASE_NAME`.
- private export requires password verification.
- encrypted private/all export uses `zipWithPassword` and `AES_256`.
- encrypted import uses merge mode.
- package import creates one import batch.
- package import persists success, failed, and skipped item rows.
- package import applies manual group IDs and folder group ID together.
- package import uses current space temp/originals/thumbnails.
- private names/paths are not emitted in normal-mode debug output.

### Android APK Validation

Rebuild the Android APK. Do not validate package import with Expo Go.

Validate:

- normal `.zip` import.
- private `.zip` import.
- normal `.pixorypack` import as resource package.
- private `.pixorypack` resource import.
- private encrypted `.pixorypack` export.
- encrypted `.pixorypack` merge import inside Personal System.
- Android system gallery does not show imported private or normal originals stored in app-private storage.
- Personal System relocks after backgrounding.
- normal home, search, tags, groups, favorites, recent, trash, stats, covers, backups, quick organize, duplicates, import history do not leak private data.

## Final Definition Of Done

The implementation is done only when:

- all automated checks pass.
- the acceptance matrix is updated with actual status.
- Android APK validation evidence is collected.
- normal mode private leak checks pass end to end.
- private export is encrypted as a single `.pixorypack`.
- encrypted import into Personal System is merge-only and space-safe.
- every acceptance item marked `Planned` in `docs/PERSONAL_SYSTEM_FINAL_ACCEPTANCE_MATRIX.md` is either implemented and verified or explicitly reclassified with a written reason approved by the user.
- no app code introduces server, cloud, account, sync, social, AI generation, image editing, or original re-encoding behavior.
