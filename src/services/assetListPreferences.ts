import { useCallback, useEffect, useState } from 'react';

import { runWithDatabaseSpace, settingsRepository, type ImageSortOrder, type PixorySpace } from '../database';
import type { AssetListViewMode } from '../database/repositories/settingsRepository';

export function useAssetListPreferences(space: PixorySpace = 'normal', fallbackSortOrder: ImageSortOrder = 'createdAtDesc') {
  const [viewMode, setViewModeState] = useState<AssetListViewMode>('grid');
  const [sortOrder, setSortOrderState] = useState<ImageSortOrder>(fallbackSortOrder);

  useEffect(() => {
    let isMounted = true;

    void runWithDatabaseSpace(space, async (db) => {
      const [storedViewMode, storedSortOrder] = await Promise.all([
        settingsRepository.getAssetListViewMode(db),
        settingsRepository.getAssetListSortOrder(db, fallbackSortOrder),
      ]);
      if (!isMounted) {
        return;
      }
      setViewModeState(storedViewMode);
      setSortOrderState(storedSortOrder);
    }).catch((error) => {
      console.warn('Pixory asset list preferences load failed.', error);
    });

    return () => {
      isMounted = false;
    };
  }, [fallbackSortOrder, space]);

  const setViewMode = useCallback(
    (nextViewMode: AssetListViewMode) => {
      setViewModeState(nextViewMode);
      void runWithDatabaseSpace(space, (db) => settingsRepository.setAssetListViewMode(db, nextViewMode)).catch((error) => {
        console.warn('Pixory asset list view preference save failed.', error);
      });
    },
    [space]
  );

  const setSortOrder = useCallback(
    (nextSortOrder: ImageSortOrder) => {
      setSortOrderState(nextSortOrder);
      void runWithDatabaseSpace(space, (db) => settingsRepository.setAssetListSortOrder(db, nextSortOrder)).catch((error) => {
        console.warn('Pixory asset list sort preference save failed.', error);
      });
    },
    [space]
  );

  return { viewMode, sortOrder, setViewMode, setSortOrder };
}
