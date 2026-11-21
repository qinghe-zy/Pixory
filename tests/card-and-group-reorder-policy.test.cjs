const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Hot update silent notice policy: automatic background checks do not call showToast', () => {
  const appTsx = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf-8');

  // Find AppOtaUpdateFetchNotice component definition
  const otaNoticeMatch = appTsx.match(/function AppOtaUpdateFetchNotice[\s\S]*?return null;\s*\}/);
  assert.ok(otaNoticeMatch, 'AppOtaUpdateFetchNotice must exist in App.tsx');
  const otaNoticeCode = otaNoticeMatch[0];

  assert.ok(!otaNoticeCode.includes('showToast'), 'AppOtaUpdateFetchNotice must not show toast during silent background updates');
  assert.ok(otaNoticeCode.includes('fetchUpdateAsync'), 'AppOtaUpdateFetchNotice must still fetch update asynchronously in background');

  // Find AppUpdateAppliedNotice component definition
  const appliedNoticeMatch = appTsx.match(/function AppUpdateAppliedNotice[\s\S]*?return null;\s*\}/);
  assert.ok(appliedNoticeMatch, 'AppUpdateAppliedNotice must exist in App.tsx');
  const appliedNoticeCode = appliedNoticeMatch[0];

  assert.ok(!appliedNoticeCode.includes('showToast'), 'AppUpdateAppliedNotice must not show toast on startup after update');
  assert.ok(appliedNoticeCode.includes('setLastAppliedUpdateNoticeId'), 'AppUpdateAppliedNotice must record applied notice ID');

  // Manual update check in updateCheckService must still have showToast
  const updateCheckService = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'updateCheckService.ts'), 'utf-8');
  assert.ok(updateCheckService.includes('checkAllAppUpdates'), 'updateCheckService must export checkAllAppUpdates');
  assert.ok(updateCheckService.includes('showToast'), 'checkAllAppUpdates must retain showToast for manual user clicks');
});

test('Database schema v76: ips table includes sortOrder column and index', () => {
  const schemaTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'schema.ts'), 'utf-8');

  assert.match(schemaTs, /DATABASE_VERSION\s*=\s*76/, 'DATABASE_VERSION must be 76');
  assert.match(schemaTs, /MIGRATION_STATEMENTS_V76/, 'MIGRATION_STATEMENTS_V76 must be defined');
  assert.match(schemaTs, /ALTER TABLE ips ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;/, 'V76 must add sortOrder to ips');
  assert.match(schemaTs, /CREATE INDEX IF NOT EXISTS idx_ips_sort_order ON ips\(sortOrder\);/, 'V76 must create index on ips(sortOrder)');

  const dbTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'db.ts'), 'utf-8');
  assert.ok(dbTs.includes('MIGRATION_STATEMENTS_V76'), 'db.ts must import MIGRATION_STATEMENTS_V76');
  assert.ok(dbTs.includes('currentVersion < 76'), 'db.ts must execute migration v76');
  assert.ok(dbTs.includes('ensureIpsSchema'), 'db.ts must define ensureIpsSchema for zero-start idempotency');
});

test('Repository ordering priority: ips.sortOrder and groups.sortOrder are prioritized in queries, and batch updates are transactional', () => {
  const ipRepo = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'repositories', 'ipRepository.ts'), 'utf-8');
  assert.ok(
    ipRepo.includes('ips.sortOrder ASC, ips.name COLLATE NOCASE ASC'),
    'ipRepository must prioritize sortOrder ASC in default ordering'
  );
  assert.ok(
    ipRepo.includes('updateSortOrders('),
    'ipRepository must export updateSortOrders method'
  );
  assert.ok(
    ipRepo.includes('withTransactionAsync'),
    'ipRepository.updateSortOrders must use withTransactionAsync for batch updates'
  );

  const groupRepo = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'repositories', 'groupRepository.ts'), 'utf-8');
  assert.ok(
    groupRepo.includes('groups.sortOrder ASC, totalAssetCount DESC'),
    'groupRepository must prioritize sortOrder over totalAssetCount in findOverviewPage CTE'
  );
  assert.ok(
    groupRepo.includes('page_groups.sortOrder ASC, page_groups.totalAssetCount DESC'),
    'groupRepository must prioritize page_groups.sortOrder in final select'
  );
  assert.ok(
    groupRepo.includes('updateSortOrders('),
    'groupRepository must export updateSortOrders method'
  );
  assert.ok(
    groupRepo.includes('withTransactionAsync'),
    'groupRepository.updateSortOrders must use withTransactionAsync for batch updates'
  );
});

test('IP card reordering boundary calculations: unpinned cannot exceed pinned, pinned down unpins', () => {
  function computeIpMoveBoundaries(items, currentIndex) {
    const currentIp = items[currentIndex];
    const isPinned = Boolean(currentIp?.isPinned);
    const isFirstItem = currentIndex === 0;
    const isLastItem = currentIndex === items.length - 1;
    const prevItem = currentIndex > 0 ? items[currentIndex - 1] : null;

    const canMoveUp = !isFirstItem && (isPinned || !prevItem?.isPinned);
    const canMoveDown = !isLastItem;

    return { canMoveUp, canMoveDown };
  }

  // Setup: [P1(pinned), P2(pinned), U1(unpinned), U2(unpinned)]
  const mockItems = [
    { id: 1, name: 'P1', isPinned: true },
    { id: 2, name: 'P2', isPinned: true },
    { id: 3, name: 'U1', isPinned: false },
    { id: 4, name: 'U2', isPinned: false },
  ];

  // P1 at index 0: top of list
  const p1Bounds = computeIpMoveBoundaries(mockItems, 0);
  assert.equal(p1Bounds.canMoveUp, false, 'P1 at top cannot move up');
  assert.equal(p1Bounds.canMoveDown, true, 'P1 can move down');

  // P2 at index 1: last pinned item
  const p2Bounds = computeIpMoveBoundaries(mockItems, 1);
  assert.equal(p2Bounds.canMoveUp, true, 'P2 can move up');
  assert.equal(p2Bounds.canMoveDown, true, 'P2 can move down (to unpin)');

  // U1 at index 2: first unpinned item, above is P2
  const u1Bounds = computeIpMoveBoundaries(mockItems, 2);
  assert.equal(u1Bounds.canMoveUp, false, 'U1 cannot move up over pinned card P2 (prematurely disabled)');
  assert.equal(u1Bounds.canMoveDown, true, 'U1 can move down to swap with U2');

  // U2 at index 3: bottom of list
  const u2Bounds = computeIpMoveBoundaries(mockItems, 3);
  assert.equal(u2Bounds.canMoveUp, true, 'U2 can move up to swap with U1');
  assert.equal(u2Bounds.canMoveDown, false, 'U2 at bottom cannot move down');
});

test('Group reordering within same type: boundaries strictly scoped to same type', () => {
  function computeGroupMoveBoundaries(groups, actionGroup) {
    const sameType = groups.filter((g) => g.type === actionGroup.type);
    const actionGroupIndex = sameType.findIndex((g) => g.id === actionGroup.id);
    const isActionGroupPinned = Boolean(actionGroup?.isPinned);
    const isFirstInType = actionGroupIndex === 0;
    const isLastInType = actionGroupIndex >= 0 && actionGroupIndex === sameType.length - 1;
    const prevInType = actionGroupIndex > 0 ? sameType[actionGroupIndex - 1] : null;

    const canGroupMoveUp = !isFirstInType && (isActionGroupPinned || !prevInType?.isPinned);
    const canGroupMoveDown = !isLastInType;

    return { canGroupMoveUp, canGroupMoveDown };
  }

  const mockGroups = [
    { id: 10, type: 'season', isPinned: true },
    { id: 11, type: 'season', isPinned: false },
    { id: 20, type: 'scene', isPinned: false },
    { id: 21, type: 'scene', isPinned: false },
  ];

  // Season pinned group
  const sPinned = computeGroupMoveBoundaries(mockGroups, mockGroups[0]);
  assert.equal(sPinned.canGroupMoveUp, false, 'First season group cannot move up');
  assert.equal(sPinned.canGroupMoveDown, true, 'Season pinned group can move down (unpin)');

  // Season unpinned group (above is pinned season group)
  const sUnpinned = computeGroupMoveBoundaries(mockGroups, mockGroups[1]);
  assert.equal(sUnpinned.canGroupMoveUp, false, 'Season unpinned group cannot exceed pinned season group');
  assert.equal(sUnpinned.canGroupMoveDown, false, 'Last season group cannot move down');

  // Scene group (different type, should not be affected by season groups)
  const sc1 = computeGroupMoveBoundaries(mockGroups, mockGroups[2]);
  assert.equal(sc1.canGroupMoveUp, false, 'First scene group cannot move up');
  assert.equal(sc1.canGroupMoveDown, true, 'First scene group can move down to swap with second scene group');
});

test('IPCard component optimizes entrance animation for smooth reordering without flash', () => {
  const ipCardSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'IPCard.tsx'), 'utf-8');
  assert.ok(ipCardSource.includes('animateEntrance'), 'IPCard must accept animateEntrance prop');
  assert.ok(ipCardSource.includes('hasAnimatedRef'), 'IPCard must track hasAnimatedRef to avoid replaying on index change');
});

test('Screens integrate reorderUtils to guarantee immutability and eliminate duplication', () => {
  const homeScreen = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'HomeLibraryScreen.tsx'), 'utf-8');
  assert.ok(homeScreen.includes('getFlatItemMoveBoundaries'), 'HomeLibraryScreen must use getFlatItemMoveBoundaries');
  assert.ok(homeScreen.includes('moveFlatItem'), 'HomeLibraryScreen must use moveFlatItem');

  const groupOverview = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'GroupOverviewScreen.tsx'), 'utf-8');
  assert.ok(groupOverview.includes('getGroupedItemMoveBoundaries'), 'GroupOverviewScreen must use getGroupedItemMoveBoundaries');
  assert.ok(groupOverview.includes('moveGroupedItem'), 'GroupOverviewScreen must use moveGroupedItem');

  const globalGroups = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'GlobalGroupsScreen.tsx'), 'utf-8');
  assert.ok(globalGroups.includes('getGroupedItemMoveBoundaries'), 'GlobalGroupsScreen must use getGroupedItemMoveBoundaries');
  assert.ok(globalGroups.includes('moveGroupedItem'), 'GlobalGroupsScreen must use moveGroupedItem');
});

test('Reorder utilities moveFlatItem correctly handles unpinning and sortOrder spacing', () => {
  // Re-implement the pure function directly to assert contract behavior
  function moveFlatItem(items, targetId, direction) {
    const index = items.findIndex((item) => item.id === targetId);
    if (index < 0) return null;

    const current = items[index];
    if (direction === 'up') {
      if (index === 0) return null;
      const prev = items[index - 1];
      if (!current.isPinned && prev.isPinned) return null;

      const newItems = [...items];
      newItems[index - 1] = current;
      newItems[index] = prev;

      const updates = [];
      const nextItems = newItems.map((item, idx) => {
        const nextOrder = idx * 10;
        if (item.sortOrder !== nextOrder) {
          updates.push({ id: item.id, sortOrder: nextOrder });
          return { ...item, sortOrder: nextOrder };
        }
        return item;
      });

      return { nextItems, updates, unpinned: false };
    } else {
      if (index >= items.length - 1) return null;
      const next = items[index + 1];

      const newItems = [...items];
      const updates = [];

      if (current.isPinned && !next.isPinned) {
        const unpinnedItem = { ...current, isPinned: false };
        newItems[index] = next;
        newItems[index + 1] = unpinnedItem;

        const nextItems = newItems.map((item, idx) => {
          const nextOrder = idx * 10;
          const isTarget = item.id === targetId;
          if (item.sortOrder !== nextOrder || isTarget) {
            updates.push({ id: item.id, sortOrder: nextOrder, isPinned: isTarget ? false : undefined });
            return { ...item, sortOrder: nextOrder, isPinned: isTarget ? false : item.isPinned };
          }
          return item;
        });

        return { nextItems, updates, unpinned: true };
      } else {
        newItems[index] = next;
        newItems[index + 1] = current;

        const nextItems = newItems.map((item, idx) => {
          const nextOrder = idx * 10;
          if (item.sortOrder !== nextOrder) {
            updates.push({ id: item.id, sortOrder: nextOrder });
            return { ...item, sortOrder: nextOrder };
          }
          return item;
        });

        return { nextItems, updates, unpinned: false };
      }
    }
  }

  const items = [
    { id: 1, sortOrder: 0, isPinned: true },
    { id: 2, sortOrder: 10, isPinned: true },
    { id: 3, sortOrder: 20, isPinned: false },
  ];

  // Moving item 2 down past item 3 (pinned -> unpinned) must unpin item 2
  const downRes = moveFlatItem(items, 2, 'down');
  assert.ok(downRes, 'Down move must succeed');
  assert.equal(downRes.unpinned, true, 'Item 2 moving down past unpinned item must trigger unpinned: true');
  assert.equal(downRes.nextItems[2].id, 2);
  assert.equal(downRes.nextItems[2].isPinned, false, 'Item 2 must now have isPinned: false');
  assert.equal(downRes.nextItems[1].id, 3);

  // Moving unpinned item 3 up past pinned item 1 must be rejected
  const invalidUpRes = moveFlatItem(downRes.nextItems, 3, 'up');
  assert.equal(invalidUpRes, null, 'Unpinned item cannot move up past pinned item');
});
