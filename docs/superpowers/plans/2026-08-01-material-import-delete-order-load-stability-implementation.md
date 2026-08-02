# Pixory 素材导入删除排序与隐私加载稳定化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Android 相册删除确认、来源顺序导入、隐私模式首屏稳定加载，以及跨 IP 批量迁移都按新 spec 工作。

**Architecture:** 用最小的本地数据模型扩展把“来源顺序”和“来源类型”显式落库；相册删除走原生 MediaStore confirmation request；首页与整理页改成更保守的首屏加载与失效控制；批量面板统一成素材跨 IP 迁移入口。先补测试，再改实现，最后更新特性矩阵与验证脚本。

**Tech Stack:** Expo / React Native / TypeScript / SQLite / Expo MediaLibrary / Android Kotlin native module / react-native-zip-archive / pnpm

---

### Task 1: Source metadata and Android delete confirmation

**Files:**
- Modify: `tests/media-source-deletion-service.test.cjs`
- Modify: `tests/image-import-service-source-metadata.test.cjs`
- Modify: `src/services/mediaSourceDeletionService.ts`
- Modify: `src/services/imageImportService.ts`
- Modify: `src/services/videoImportService.ts`
- Modify: `src/native/pixoryMediaModule.ts`
- Modify: `plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt`
- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Write the failing test**

```js
test('album deletes request a dedicated Android delete flow when source asset id exists', async () => {
  const result = await deleteMediaStoreAssetsWithConfirmation(['A1', 'A2']);
  assert.equal(result, true);
});

test('imported album assets preserve source creation time and source kind', async () => {
  const pending = await buildImageAssetFromPickedFile({ ipId: 1, pickedAsset: albumAsset });
  assert.equal(pending.sourceKind, 'album');
  assert.equal(pending.sourceCreatedAt, '2026-01-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-source-deletion-service.test.cjs tests/image-import-service-source-metadata.test.cjs`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/native/pixoryMediaModule.ts
interface PixoryMediaNativeModule {
  deleteMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean>;
}

export function deleteNativeMediaStoreAssetsWithConfirmation(assetIds: string[]): Promise<boolean> {
  return requireNativeModule().deleteMediaStoreAssetsWithConfirmation(assetIds);
}
```

```kotlin
// plugins/.../PixoryMediaModule.kt
@ReactMethod
fun deleteMediaStoreAssetsWithConfirmation(assetIds: ReadableArray, promise: Promise) { ... }
```

```ts
// src/services/imageImportService.ts
const assetInfo = await MediaLibrary.getAssetInfoAsync(sourceAssetId);
sourceCreatedAt: assetInfo.creationTime ? new Date(assetInfo.creationTime * 1000).toISOString() : null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-source-deletion-service.test.cjs tests/image-import-service-source-metadata.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add src/services/mediaSourceDeletionService.ts src/services/imageImportService.ts src/services/videoImportService.ts src/native/pixoryMediaModule.ts plugins/pixory-android-intents/templates/app/src/main/java/com/pixory/app/media/PixoryMediaModule.kt tests/media-source-deletion-service.test.cjs tests/image-import-service-source-metadata.test.cjs docs/feature-matrix.md
git commit -m "feat: add android delete confirmation and source metadata"
```

### Task 2: Preserve source order for album and archive imports

**Files:**
- Modify: `tests/package-import-order.test.cjs`
- Modify: `tests/image-list-sort-order.test.cjs`
- Modify: `src/services/packageImportService.ts`
- Modify: `src/services/imageImportService.ts`
- Modify: `src/database/schema.ts`
- Modify: `src/database/types.ts`
- Modify: `src/database/utils.ts`
- Modify: `src/database/repositories/imageRepository.ts`
- Modify: `src/components/SortMenuButton.tsx`
- Modify: `src/database/repositories/settingsRepository.ts`
- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Write the failing test**

```js
test('zip entries stay in archive order', async () => {
  const entries = await listZipImageEntries(zipUri);
  assert.deepEqual(entries.map((entry) => entry.name), ['001.jpg', '002.jpg', '003.jpg']);
});

test('image sort options include source time ordering', () => {
  assert.match(source, /sourceCreatedAtDesc/);
  assert.match(source, /sourceSequenceAsc/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/package-import-order.test.cjs tests/image-list-sort-order.test.cjs`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/database/schema.ts
ALTER TABLE image_assets ADD COLUMN sourceKind TEXT;
ALTER TABLE image_assets ADD COLUMN sourceCreatedAt TEXT;
ALTER TABLE image_assets ADD COLUMN sourceSequence INTEGER;
ALTER TABLE image_assets ADD COLUMN sourceEntryPath TEXT;
```

```ts
// plugins/.../PixoryMediaModule.kt
zip.entries().asSequence()
  .filter { ... }
  .forEach { entry -> ... }
```

```ts
// src/services/packageImportService.ts
const orderedEntries = await listNativeZipImageEntries(copiedPackageUri);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/package-import-order.test.cjs tests/image-list-sort-order.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add src/services/packageImportService.ts src/services/imageImportService.ts src/database/schema.ts src/database/types.ts src/database/utils.ts src/database/repositories/imageRepository.ts src/components/SortMenuButton.tsx src/database/repositories/settingsRepository.ts tests/package-import-order.test.cjs tests/image-list-sort-order.test.cjs docs/feature-matrix.md
git commit -m "feat: preserve source order for imported assets"
```

### Task 3: Make privacy-mode entry load progressively

**Files:**
- Modify: `tests/personal-load-stability.test.cjs`
- Modify: `src/hooks/useScreenLoad.ts`
- Modify: `src/screens/HomeLibraryScreen.tsx`
- Modify: `src/screens/QuickOrganizeScreen.tsx`
- Modify: `src/screens/AllImagesScreen.tsx`
- Modify: `src/screens/GroupImagesScreen.tsx`
- Modify: `src/components/SecureImage.tsx`
- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Write the failing test**

```js
test('screen load exposes request identity so stale loads do not win', () => {
  assert.match(source, /requestIdRef/);
  assert.match(source, /ignore stale load/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/personal-load-stability.test.cjs`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useScreenLoad.ts
const requestIdRef = useRef(0);
```

```ts
// src/screens/HomeLibraryScreen.tsx
const items = data?.items.slice(0, 30) ?? [];
```

```ts
// src/screens/QuickOrganizeScreen.tsx
const visibleImages = images.slice(currentIndex, currentIndex + 1);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/personal-load-stability.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScreenLoad.ts src/screens/HomeLibraryScreen.tsx src/screens/QuickOrganizeScreen.tsx src/screens/AllImagesScreen.tsx src/screens/GroupImagesScreen.tsx src/components/SecureImage.tsx tests/personal-load-stability.test.cjs docs/feature-matrix.md
git commit -m "feat: harden personal mode startup loading"
```

### Task 4: Enable IP-to-IP batch migration for all selected media

**Files:**
- Modify: `tests/batch-image-organize-panel.test.cjs`
- Modify: `src/components/BatchImageOrganizePanel.tsx`
- Add: `src/services/imageMoveService.ts`
- Modify: `src/services/videoMoveService.ts`
- Modify: `src/database/repositories/imageRepository.ts`
- Modify: `src/screens/BatchManageImagesScreen.tsx`
- Modify: `docs/feature-matrix.md`

- [ ] **Step 1: Write the failing test**

```js
test('batch organize exposes move-to-ip for image selections', () => {
  assert.match(source, /moveToIp/);
  assert.match(source, /targetIpId/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/batch-image-organize-panel.test.cjs`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/imageMoveService.ts
export async function moveImagesToIp({ space, imageIds, targetIpId }) { ... }
```

```tsx
// src/components/BatchImageOrganizePanel.tsx
<PanelAction disabled={isSubmitting || ips.filter((ip) => !selectedIpIds.includes(ip.id)).length === 0} icon="trail-sign-outline" label="移动到 IP" onPress={() => resetMode('move-ip')} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/batch-image-organize-panel.test.cjs`

- [ ] **Step 5: Commit**

```bash
git add src/components/BatchImageOrganizePanel.tsx src/services/imageMoveService.ts src/services/videoMoveService.ts src/database/repositories/imageRepository.ts src/screens/BatchManageImagesScreen.tsx tests/batch-image-organize-panel.test.cjs docs/feature-matrix.md
git commit -m "feat: support batch move between IPs"
```

## Self-Review Checklist

- [ ] Every spec section maps to at least one task.
- [ ] Every code-changing task starts with a failing test.
- [ ] No task depends on an undefined helper or type.
- [ ] `docs/feature-matrix.md` is updated for each user-visible change.
- [ ] Android deletion, import ordering, personal startup, and IP migration are each independently verifiable.
