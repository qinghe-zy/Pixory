import type { MediaCursorPageRequest } from '../database';
import type { ImageViewerContext, ImageViewerIpAllFilter } from '../navigation/imageViewerContext';

export const MEDIA_READER_INITIAL_WINDOW_SIZE = 200;
export const MEDIA_READER_PAGE_SIZE = 100;

export function buildMediaReaderCursorRequest(context: ImageViewerContext): MediaCursorPageRequest | null {
  if (context.type === 'ip-recent') {
    return null;
  }
  
  const baseRequest: MediaCursorPageRequest = {
    limit: MEDIA_READER_INITIAL_WINDOW_SIZE,
    mediaType: 'image',
    orderBy: context.orderBy ?? 'createdAtDesc',
  };

  if (context.type === 'import-batch') {
    return { ...baseRequest, importBatchId: context.importBatchId, orderBy: 'sourceOrderAsc' };
  }
  if (context.type === 'image-scope') {
    return { ...baseRequest, imageIds: context.imageIds };
  }
  if (context.type === 'media-query') {
    return { ...baseRequest, ...context.request, mediaType: 'image' };
  }
  if (context.type === 'ip-all') {
    return applyIpAllFilter({ ...baseRequest, ipId: context.ipId }, context.filter);
  }
  if (context.type === 'group') {
    return { ...baseRequest, groupId: context.groupId, ipId: context.ipId };
  }
  if (context.type === 'tag') {
    return { ...baseRequest, tagId: context.tagId };
  }
  if (context.type === 'favorites') {
    return { ...baseRequest, favoritesOnly: true };
  }
  return {
    ...baseRequest,
    orderBy: 'lastViewedAtDesc',
    recentlyViewedOnly: true,
  };
}

function applyIpAllFilter(
  request: MediaCursorPageRequest,
  filter: ImageViewerIpAllFilter
): MediaCursorPageRequest {
  if (filter.type === 'favorite') {
    return { ...request, favoritesOnly: true };
  }
  if (filter.type === 'ungrouped') {
    return { ...request, ungroupedOnly: true };
  }
  if (filter.type === 'untagged') {
    return { ...request, untaggedOnly: true };
  }
  if (filter.type === 'recent-viewed') {
    return { ...request, orderBy: 'lastViewedAtDesc', recentlyViewedOnly: true };
  }
  if (filter.type === 'mime') {
    return { ...request, mimeType: filter.mimeType };
  }
  if (filter.type === 'aspect') {
    return { ...request, aspectRatio: filter.aspectRatio };
  }
  if (filter.type === 'size') {
    return { ...request, maxFileSize: filter.maxFileSize, minFileSize: filter.minFileSize };
  }
  if (filter.type === 'group') {
    return { ...request, groupId: filter.groupId };
  }
  if (filter.type === 'tag') {
    return { ...request, tagId: filter.tagId };
  }
  return request;
}
