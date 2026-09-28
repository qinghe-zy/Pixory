import { useCallback, useEffect, useState } from 'react';

import { runWithDatabaseSpace, settingsRepository, type IpSortOrder, type PixorySpace } from '../database';

export function useIpListPreferences(space: PixorySpace = 'normal', fallbackSortOrder: IpSortOrder = 'default') {
  const [sortOrder, setSortOrderState] = useState<IpSortOrder>(fallbackSortOrder);

  useEffect(() => {
    let isMounted = true;

    void runWithDatabaseSpace(space, async (db) => {
      const storedSortOrder = await settingsRepository.getIpListSortOrder(db, fallbackSortOrder);
      if (!isMounted) {
        return;
      }
      setSortOrderState(storedSortOrder);
    }).catch((error) => {
      console.warn('Pixory IP list preferences load failed.', error);
    });

    return () => {
      isMounted = false;
    };
  }, [fallbackSortOrder, space]);

  const setSortOrder = useCallback(
    (nextSortOrder: IpSortOrder) => {
      setSortOrderState(nextSortOrder);
      void runWithDatabaseSpace(space, (db) => settingsRepository.setIpListSortOrder(db, nextSortOrder)).catch((error) => {
        console.warn('Pixory IP list sort preference save failed.', error);
      });
    },
    [space]
  );

  return { sortOrder, setSortOrder };
}
