import type { ImageListItem, MediaCursorPageRequest, MediaPageCursor, PixorySpace } from '../database';
import { imageRepository, runWithDatabaseSpace } from '../database';
import { usePagedScreenLoad } from './usePagedScreenLoad';

interface UseMediaCursorCollectionOptions {
  formatError?: (error: unknown) => string;
  onLoadMoreError?: (error: unknown) => void;
  request: Omit<MediaCursorPageRequest, 'cursor' | 'direction' | 'limit'>;
  requestKey: string;
  pageSize?: number;
  space: PixorySpace;
}

export function useMediaCursorCollection({
  formatError,
  onLoadMoreError,
  request,
  requestKey,
  pageSize = 48,
  space,
}: UseMediaCursorCollectionOptions) {
  return usePagedScreenLoad<ImageListItem, MediaPageCursor | null>(
    async (_offset, cursor) => runWithDatabaseSpace(space, async (db) => {
      const page = await imageRepository.findFilteredCursorPage(db, {
        ...request,
        cursor,
        direction: 'after',
        limit: pageSize,
      });
      return {
        items: page.items,
        hasMore: page.hasOlder,
        meta: page.olderCursor,
      };
    }),
    {
      deferUntilInteractions: true,
      formatError,
      getItemKey: (item) => item.id,
      initialMeta: null,
      onLoadMoreError,
      requestKey,
    }
  );
}
