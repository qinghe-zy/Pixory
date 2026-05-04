export type ImageViewerIpAllFilter =
  | { type: 'all' }
  | { type: 'favorite' }
  | { type: 'ungrouped' }
  | { type: 'untagged' }
  | { type: 'recent-viewed' }
  | { type: 'mime'; mimeType: string; label: string }
  | { type: 'group'; groupId: number }
  | { type: 'tag'; tagId: number };

export type ImageViewerContext =
  | { type: 'ip-recent'; ipId: number; limit: number }
  | { type: 'ip-all'; ipId: number; filter: ImageViewerIpAllFilter }
  | { type: 'group'; ipId: number; groupId: number }
  | { type: 'tag'; tagId: number }
  | { type: 'favorites' }
  | { type: 'recent-viewed' };
