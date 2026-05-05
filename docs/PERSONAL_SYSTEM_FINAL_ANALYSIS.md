# Pixory Personal System Final Analysis

Updated: 2026-05-05

## Purpose

This document captures the current implementation state and remaining gaps for the final Pixory Personal System, resource package import, encrypted export, and privacy isolation work.

The next implementation session should be able to start from this file without relying on prior chat context.

## Product Target

Pixory should behave like two local asset libraries:

- Normal space:
  - `pixory.sqlite`
  - `pixory/originals`
  - `pixory/thumbnails`
  - `pixory/temp`
  - `pixory/exports`
- Personal space:
  - `pixory_personal.sqlite`
  - `pixory_personal/originals`
  - `pixory_personal/thumbnails`
  - `pixory_personal/temp`
  - `pixory_personal/exports`

Normal mode must never know private data exists. Personal System, after unlock, can show and operate normal and personal data together. Private IP names may display with `(ps)` in UI, but the stored database name must remain unchanged.

The privacy model for this pass is:

- Normal mode isolation is mandatory.
- Personal data is stored in Android app-private storage.
- Exported private data must not appear as plain files in user-visible directories.
- Private export uses an encrypted `.pixorypack`.
- This pass does not claim resistance against root, forensic extraction, or full app-private filesystem access.

This target is intentionally higher than the current first-version entrance. A partial implementation that only creates private IPs, imports into personal storage, or hides private rows in normal UI is not sufficient. The final target requires privacy separation across all data entry points, all navigation contexts, all aggregate screens, all exports, and all verification paths.

## Current Verified Baseline

The latest verified checks after the route-space continuation pass:

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

Latest confirmed progress commit:

```text
f7c8d7f WIP personal system route space propagation
```

## Current Implementation State

### Database Spaces

Implemented:

- `src/database/schema.ts` defines:
  - `DATABASE_NAME = 'pixory.sqlite'`
  - `PERSONAL_DATABASE_NAME = 'pixory_personal.sqlite'`
- `src/database/db.ts` defines `PixorySpace = 'normal' | 'personal'`.
- `getDatabase(space)` can open normal or personal SQLite.
- `runWithDatabaseSpace(space, task)` switches the implicit repository space for repository calls.
- Normal is still the default database space.

Implication:

- The repository layer can already work against either SQLite database if every caller supplies the right space context.
- The remaining risk is not schema separation; it is missing route and screen propagation.

### File Storage Spaces

Implemented:

- `src/services/fileStorageService.ts` defines:
  - normal root: `pixory`
  - personal root: `pixory_personal`
- `getOriginalsDir(space)`, `getThumbnailsDir(space)`, `getTempDir(space)`, and `getExportsDir(space)` support normal and personal spaces.
- `copyOriginalToAppStorage(..., space)` writes originals into the selected space.
- `src/services/thumbnailService.ts` supports thumbnail generation into the selected space.

Implication:

- Private originals and thumbnails can already avoid the normal `pixory` tree when import is called with `space: 'personal'`.
- The remaining risk is callers that omit `space` and therefore default to normal.

### Password And Lock Service

Implemented in `src/services/personalSystemService.ts`:

- First password setup.
- Password verification.
- Password change function requiring old password.
- SecureStore credential storage.
- Salted hash using `expo-crypto`.
- Five failed attempts before lockout.
- Personal data reset that deletes personal credential, personal database cache, personal directories, and `pixory_personal.sqlite`.

Incomplete:

- Change password UI.
- Global lock state and consistent lock screen behavior.
- Full background/lockscreen/exit context restore.
- Product-level handling for all Personal System routes after relock.

### Personal System Screen

Implemented:

- `src/screens/PersonalSystemScreen.tsx` has first setup, unlock, reset, create private IP, and private IP list.
- It displays private IP names with `(ps)`.
- It can open personal import for private IPs.

Incomplete:

- It is still closer to a first-version private-IP entrance than a full second-space dashboard.
- It lists only personal IPs, not normal + personal together.
- It routes private IP rows to import, not full IP detail.
- It does not support creating either normal or private IP from inside Personal System.
- It does not expose Personal System search, favorites, recent, trash, tags, groups, backup/export, import history, quick organize, or duplicate review.

### Routing And Context

Implemented:

- `App.tsx` route type now carries required `space: PixorySpace` for the ID-bearing and library routes covered by `tests/route-space-policy.test.cjs`.
- `src/navigation/imageViewerContext.ts` carries top-level `space` and exports `SpacedId` / `SpacedRecord<T>`.
- `ImageViewerScreen` and `ImageDetailScreen` run viewer/detail repository work in the viewer context or route space.
- `App.tsx` passes `currentRoute.space` into many route screens and pins ordinary root tab entries to normal where appropriate.
- `PersonalSystemScreen` passes `space: 'personal'` into private import.

Incomplete:

- Personal System still does not expose a complete dashboard that can open all normal/personal feature paths.
- Route guards after Personal System relock are not implemented.
- Combined normal + personal lists still need collision-safe rows everywhere they merge records.
- Remaining future callbacks added for Personal System must continue to pass `space` alongside IDs.

### Existing Feature Chain

Many screens now accept `space?: PixorySpace` and wrap repository work in `runWithDatabaseSpace(space, ...)`, including:

- `IpDetailScreen`
- `EditIpScreen`
- `CreateIpScreen`
- `GroupOverviewScreen`
- `CreateGroupScreen`
- `EditGroupScreen`
- `GroupImagesScreen`
- `AllImagesScreen`
- `ImageDetailScreen`
- `ImageViewerScreen`
- `EditImageScreen`
- `MoveImageGroupScreen`
- `BatchManageImagesScreen`
- `ImportBatchReviewScreen`
- `ImportBatchHistoryScreen`
- `DuplicateReviewScreen`
- `QuickOrganizeScreen`
- `GlobalSearchScreen`
- `GlobalGroupsScreen`
- `TagsOverviewScreen`
- `TagResultScreen`
- `FavoritesScreen`
- `RecentViewedScreen`
- `TrashScreen`
- `BackupScreen`

Still requiring future integration or leak validation:

- `MeScreen`
- `HomeLibraryScreen`

Normal mode currently benefits from default normal queries and explicit normal root-tab wiring, but Personal System still cannot operate the full feature chain because the unlocked dashboard and combined entry points are incomplete.

### Resource Package Import

Implemented in `src/services/packageImportService.ts`:

- DocumentPicker support.
- `.zip` and `.pixorypack` selection.
- Native unzip through `react-native-zip-archive`.
- Copy package to private temp.
- Unzip into current space temp.
- Space-aware temp directory.
- Magic-byte detection for:
  - PNG
  - JPEG
  - WebP
  - GIF
  - BMP
- Folder name to group mapping.
- Conservative limits:
  - package size
  - uncompressed size
  - file count
  - directory depth
- Basic Zip Slip path checks.
- Temp cleanup.
- `importPackageToIp(..., space)` can write into normal or personal when called correctly.

Incomplete:

- Package import currently uses repeated `importSingleImage`, so it does not create a single package import batch.
- There is no persisted per-file result table.
- Import result UI does not show durable success, failure, and skipped details from package imports.
- Skipped files only increment a count; skipped reasons are not persisted per file.
- Progress display is basic/incomplete.
- More precise free-space preflight is not implemented.
- Manual group selection and package folder group currently need the final union behavior.
- Real Android APK validation is still required because Expo Go cannot validate `react-native-zip-archive`.

### Backup And Export

Implemented in `src/services/backupService.ts`:

- `createFullBackup(space)` defaults to normal and runs repository work in the selected space.
- `createIpBackup(ipId, space)` defaults to normal and runs repository work in the selected space.
- `createPersonalBackup(secret)` exists and requires password verification.
- Normal backup should not serialize `pixory_personal.sqlite`.
- `BackupScreen` accepts `space?: PixorySpace`; ordinary mode routes pass normal.

Incomplete:

- `BackupScreen` still exposes directory-style full backup and IP export, not final encrypted private/all pack flows.
- Personal System does not expose:
  - export normal data
  - export private data
  - export all data
- Private export is still a directory-style backup, not an encrypted single `.pixorypack`.
- Private export does not yet use `zipWithPassword(..., AES_256)`.
- Encrypted `.pixorypack` import/restore is not implemented.
- Export UI does not yet warn users about public directory visibility for non-encrypted exports.

### Privacy Leak Surface

Normal-mode default queries currently use normal DB by default, which is good, but this must be verified end to end after space propagation.

Leak surfaces that require explicit validation:

- Home IP cards.
- Home cover thumbnails.
- Global search.
- Tags overview and tag result.
- Groups overview and group result.
- Favorites.
- Recent viewed.
- Trash.
- Stats on Me screen.
- Import batch history.
- Quick organize.
- Duplicate review.
- Backup manifest.
- Development logs and regression tools.
- Any debug output containing names, filenames, notes, paths, thumbnail URIs, or original URIs.

### Dependencies And Engineering Notes

- `react-native-zip-archive` is installed and must be validated with a rebuilt Android APK.
- `@noble/hashes` is installed but current password implementation uses `expo-crypto`; remove it if no final implementation uses it.
- `.codex-expo-android.log` was noted as a local environment artifact and should not be touched unless explicitly requested.
- Existing tests are policy/source-shape tests, not a complete Android privacy regression suite.

## Confirmed Gaps By Subsystem

### Routing

- Missing full `space` propagation through `AppRoute`.
- Missing `space` in `ImageViewerContext`.
- Missing collision-safe combined list item model for normal + personal records.
- Missing route guards after Personal System relock.

### Personal System Dashboard

- Missing combined normal + personal IP list.
- Missing full IP operations for private IPs.
- Missing normal/private choice during create IP inside Personal System.
- Missing dashboard entry points to personal search, favorites, recent, trash, backup, tags, groups, quick organize, and import history.

### Feature Chain

- Most screens still default to normal repository because they do not accept `space`.
- Services such as trash and IP deletion need to be called inside the selected database space.
- Viewer and image detail currently update `lastViewedAt` without space context.

### Backup UI

- Normal backup UI exists.
- Personal System backup UI is missing.
- Private export re-authentication UI is missing.
- Public-directory warning is missing.

### Encrypted Pack Export And Import

- Password-protected `.pixorypack` export is missing.
- Encrypted pack import is missing.
- ID remapping for merge import is missing.
- Normal-mode refusal to inspect private encrypted packs is missing.

### Package Import Result Records

- No durable package import item table.
- No package import batch detail page with success/failed/skipped reasons.
- No package import progress model.

### Android APK Verification

- Existing validation cannot rely on Expo Go for zip import.
- Rebuilt APK validation is required for normal package import, private package import, encrypted export, and encrypted import.

## Implementation Priority

Follow the project priority from `AGENTS.md`:

```text
Local reliability
> Original image safety
> Data consistency
> Simple UX
> Clean UI
> Future extensibility
```

Do not add server, cloud storage, account system, sync, social features, AI generation, or image editing.

## Practical Conclusion

The foundation is already in place: two SQLite names, two storage roots, password gate, space-aware import primitives, and normal-scoped backup primitives.

The final work is primarily:

1. Make every ID-bearing route and screen space-aware.
2. Turn Personal System into a real unlocked second-space dashboard.
3. Finish resource package import as a batch-tracked product workflow.
4. Add encrypted private/all `.pixorypack` export and merge import.
5. Prove normal mode cannot leak private data through automated and Android APK verification.
