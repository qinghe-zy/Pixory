# Media Import Sources And Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently remembered album/file selectors for images and videos and make album move imports preserve successful Pixory copies when Android cannot delete the original.

**Architecture:** Each picked item carries `sourceKind: 'album' | 'files'`; file items always resolve to copy mode. Album copy keeps the Photo Picker, while album move requests Expo Image Picker `legacy: true` on Android so the native bridge can convert a document URI to a MediaStore URI and request system deletion. Deletion is a post-persistence best-effort result, never part of the transaction that creates the Pixory copy.

**Tech Stack:** React Native, Expo Image Picker, Expo Document Picker, Expo SQLite, Kotlin MediaStore bridge, Node tests.

---

### Task 1: Define source and move outcome policy

**Files:**
- Create: `src/services/mediaImportSourcePolicy.ts`
- Create: `tests/media-import-source-policy-unit.test.cjs`

- [ ] **Step 1: Write failing unit tests**

Cover album move, file-forced copy, successful deletion, cancelled deletion, unsupported deletion, and missing deletable URI.

```js
assert.equal(resolvePickedAssetImportMode('files', 'move'), 'copy');
assert.equal(resolvePickedAssetImportMode('album', 'move'), 'move');
assert.deepEqual(toMoveDeletionNotice({ deleted: false, reason: 'cancelled' }), {
  sourceDeleted: false,
  message: '导入成功，原文件未删除',
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/media-import-source-policy-unit.test.cjs
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Export:

```ts
export type MediaPickerSource = 'album' | 'files';
export type MediaSourceDeletionResult = {
  deleted: boolean;
  reason?: 'cancelled' | 'unsupported' | 'unresolvable' | 'failed';
};
export function resolvePickedAssetImportMode(
  sourceKind: MediaPickerSource,
  requestedMode: ImageImportSourceMode
): ImageImportSourceMode {
  return sourceKind === 'files' ? 'copy' : requestedMode;
}
```

Add `toMoveDeletionNotice` returning `null` when deleted and the exact partial-success message otherwise.

- [ ] **Step 4: Verify GREEN**

```powershell
node --test tests/media-import-source-policy-unit.test.cjs
```

Expected: all policy tests pass.

### Task 2: Persist independent source controls and warning preference

**Files:**
- Modify: `src/database/repositories/settingsRepository.ts`
- Modify: `src/database/index.ts` only if the existing barrel does not already export repository types
- Test: `tests/media-import-source-settings-policy.test.cjs`

- [ ] **Step 1: Write failing settings tests**

Assert keys and methods exist for `imageMediaPickerSource`, `videoMediaPickerSource`, and `moveImportWarningDismissed`; invalid values fall back to album/false.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/media-import-source-settings-policy.test.cjs
```

- [ ] **Step 3: Add the exact repository API**

```ts
export const IMAGE_MEDIA_PICKER_SOURCE_KEY = 'imageMediaPickerSource';
export const VIDEO_MEDIA_PICKER_SOURCE_KEY = 'videoMediaPickerSource';
export const MOVE_IMPORT_WARNING_DISMISSED_KEY = 'moveImportWarningDismissed';

async getImageMediaPickerSource(db): Promise<MediaPickerSource>
async setImageMediaPickerSource(db, source: MediaPickerSource): Promise<void>
async getVideoMediaPickerSource(db): Promise<MediaPickerSource>
async setVideoMediaPickerSource(db, source: MediaPickerSource): Promise<void>
async getMoveImportWarningDismissed(db): Promise<boolean>
async setMoveImportWarningDismissed(db, dismissed: boolean): Promise<void>
```

- [ ] **Step 4: Verify GREEN**

```powershell
node --test tests/media-import-source-settings-policy.test.cjs
```

### Task 3: Add compact header-right segmented controls

**Files:**
- Create: `src/components/CompactSegmentedControl.tsx`
- Modify: `src/components/LightFormSection.tsx`
- Modify: `src/screens/ImportImagesScreen.tsx`
- Test: `tests/media-import-source-ui-policy.test.cjs`

- [ ] **Step 1: Write failing UI policy tests**

Assert `LightFormSection` accepts `headerRight`, both image/video sections render independent `相册/文件` controls, and the header uses `flex: 1` for the title group with the control aligned to the right inset.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/media-import-source-ui-policy.test.cjs
```

- [ ] **Step 3: Implement the two-option control**

Use only shared tokens, minimum 44px touch height, a selected pill, `accessibilityRole="tab"`, and no dependency on AI conversation-mode components.

- [ ] **Step 4: Extend `LightFormSection` without changing defaults**

Add `headerRight?: ReactNode`. Render a row with a flexible title/hint column and the optional right slot; existing callers without the prop retain the current structure and spacing.

- [ ] **Step 5: Load, display, and persist independent values**

Extend `screenData` with both sources and the warning preference. Initialize to `album`, update each setting independently, and pass each state to its own section header.

- [ ] **Step 6: Verify GREEN**

```powershell
node --test tests/media-import-source-ui-policy.test.cjs
pnpm.cmd typecheck
```

### Task 4: Add file multi-selection adapters

**Files:**
- Modify: `src/services/imageImportService.ts`
- Modify: `src/services/videoImportService.ts`
- Modify: `src/screens/ImportImagesScreen.tsx`
- Test: `tests/media-import-file-picker-unit.test.cjs`

- [ ] **Step 1: Write failing adapter tests**

Stub `expo-document-picker` and assert:

```ts
{ type: 'image/*', multiple: true, copyToCacheDirectory: true }
{ type: 'video/*', multiple: true, copyToCacheDirectory: true }
```

Assert every converted item has `sourceKind: 'files'`, a filename, MIME type, and readable cache URI.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/media-import-file-picker-unit.test.cjs
```

- [ ] **Step 3: Add source metadata**

Change picked image/video types to include:

```ts
sourceKind: MediaPickerSource;
sourceDeleteUri?: string | null;
```

Album adapters set `sourceKind: 'album'`; file adapters set `sourceKind: 'files'` and `sourceDeleteUri: null`.

- [ ] **Step 4: Add Document Picker paths**

Add `pickImageFilesForImport()` and `pickVideoFilesForImport()`. In the screen, `handlePickImages()` and `handlePickVideos()` dispatch to album or file picker according to their independent state and continue merging into the existing arrays.

- [ ] **Step 5: Force file items to copy per item**

Use `resolvePickedAssetImportMode(pickedAsset.sourceKind, imageImportSourceMode)` inside each image/video loop. Do not use the current UI source state to reinterpret already-picked items.

- [ ] **Step 6: Verify GREEN**

```powershell
node --test tests/media-import-file-picker-unit.test.cjs tests/media-import-source-policy-unit.test.cjs
```

### Task 5: Request Android system deletion without rolling back imports

**Files:**
- Modify: `android/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- Modify: `plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- Modify: `src/native/pixoryMediaModule.ts`
- Modify: `src/services/imageImportService.ts`
- Modify: `src/services/videoImportService.ts`
- Modify: `tests/asset-duplicate-v1-policy.test.cjs`
- Create: `tests/media-import-move-policy.test.cjs`

- [ ] **Step 1: Replace the obsolete failing policy**

Remove the assertion that move must reject before import when `assetId` is absent. Add assertions that no pre-copy rejection remains, deletion happens after DB persistence, and deletion failure produces partial success without cleanup.

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/asset-duplicate-v1-policy.test.cjs tests/media-import-move-policy.test.cjs
```

- [ ] **Step 3: Add native deletion result types**

```ts
export interface NativeMediaDeleteResult {
  deleted: boolean;
  reason?: 'cancelled' | 'unsupported' | 'unresolvable' | 'failed';
}
export function deleteNativeMediaWithConfirmation(sourceUri: string): Promise<NativeMediaDeleteResult>;
```

- [ ] **Step 4: Add the Kotlin bridge**

For Android 11+:

1. Convert `content://` document URIs with `MediaStore.getMediaUri`.
2. Accept direct MediaStore image/video URIs.
3. Reject cache/file/Photo-Picker-only URIs as `{ deleted: false, reason: "unresolvable" }`.
4. Call `MediaStore.createDeleteRequest(resolver, listOf(mediaUri))`.
5. Resolve on `onActivityResult`: OK -> deleted, cancel -> cancelled.

For older Android, call `ContentResolver.delete` on a verified MediaStore URI and return deleted/failed. Maintain a separate promise and request code from speech recognition.

- [ ] **Step 5: Use legacy selection only for album move**

Pass `legacy: Platform.OS === 'android' && requestedMode === 'move'` to `launchImageLibraryAsync`. Preserve the standard Photo Picker in copy mode. Store the picker-returned content URI as `sourceDeleteUri`; never use Pixory cache/private URIs as deletion targets.

- [ ] **Step 6: Decouple post-persistence deletion**

After file and DB verification, call deletion only for an album item whose resolved mode is move. Catch/convert cancellation, unsupported, unresolvable, and native failures into a partial-success notice; do not enter cleanup/rollback after the persisted record exists.

Extend image/video import results with a `sourceDeletionNotices` array so the screen can show `导入成功，原文件未删除` while counting the item as successful.

- [ ] **Step 7: Verify GREEN**

```powershell
node --test tests/asset-duplicate-v1-policy.test.cjs tests/media-import-move-policy.test.cjs
pnpm.cmd typecheck
```

### Task 6: Add the one-button move warning

**Files:**
- Modify: `src/components/AppDialog.tsx`
- Modify: `src/screens/ImportImagesScreen.tsx`
- Test: `tests/media-import-source-ui-policy.test.cjs`

- [ ] **Step 1: Write failing UI assertions**

Assert the move switch opens a warning unless dismissed, the primary label is `知道了`, and the small `下次不再弹出` checkbox persists only after acknowledgment.

- [ ] **Step 2: Allow one-button dialogs without altering defaults**

Change `secondaryLabel?: string | null`, keep the default `取消`, and render the secondary button only when the resolved label is non-null.

- [ ] **Step 3: Implement warning state**

When switching from copy to move:

- enable move state;
- open the Pixory warning unless the stored preference is true;
- update a local checkbox;
- persist dismissal only when the user taps `知道了`.

System deletion confirmation remains independent and always appears when Android requires it.

- [ ] **Step 4: Focused and full verification**

```powershell
node --test tests/media-import-source-ui-policy.test.cjs tests/media-import-file-picker-unit.test.cjs tests/media-import-move-policy.test.cjs tests/asset-duplicate-v1-policy.test.cjs
pnpm.cmd test
pnpm.cmd typecheck
git diff --check
```

- [ ] **Step 5: Commit only import-source files**

Stage the exact files listed in this plan and commit:

```powershell
git commit -m "feat: add safe album and file import sources"
```

Do not stage user-owned documentation or Playwright artifacts.

