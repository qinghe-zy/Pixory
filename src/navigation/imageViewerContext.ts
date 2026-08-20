import type { MediaCursorPageRequest, PixorySpace } from '../database';

export type SpacedId = {
  id: number;
  space: PixorySpace;
};

export type SpacedRecord<T> = {
  space: PixorySpace;
  record: T;
};

type ImageViewerContextBase = {
  space: PixorySpace;
};

export type ImageViewerIpAllFilter =
  | { type: 'all' }
  | { type: 'favorite' }
  | { type: 'ungrouped' }
  | { type: 'untagged' }
  | { type: 'recent-viewed' }
  | { type: 'mime'; mimeType: string; label: string }
  | { type: 'aspect'; aspectRatio: 'landscape' | 'portrait' | 'square' | 'panorama'; label: string }
  | { type: 'size'; label: string; minFileSize?: number; maxFileSize?: number }
  | { type: 'group'; groupId: number }
  | { type: 'tag'; tagId: number };

export type ImageViewerContext =
  | (ImageViewerContextBase & { type: 'ip-recent'; ipId: number; limit: number })
  | (ImageViewerContextBase & { type: 'import-batch'; ipId: number; importBatchId: number })
  | (ImageViewerContextBase & { type: 'image-scope'; imageIds: number[]; label?: string })
  | (ImageViewerContextBase & {
      type: 'media-query';
      label?: string;
      request: Omit<MediaCursorPageRequest, 'cursor' | 'direction' | 'limit' | 'mediaType'>;
    })
  | (ImageViewerContextBase & { type: 'ip-all'; ipId: number; filter: ImageViewerIpAllFilter })
  | (ImageViewerContextBase & { type: 'group'; ipId: number; groupId: number })
  | (ImageViewerContextBase & { type: 'tag'; tagId: number })
  | (ImageViewerContextBase & { type: 'favorites' })
  | (ImageViewerContextBase & { type: 'recent-viewed' });
