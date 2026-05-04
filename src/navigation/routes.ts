export const appRoutes = {
  home: '/tabs/home',
  groups: '/tabs/groups',
  tags: '/tabs/tags',
  me: '/tabs/me',
  createIp: '/ips/new',
  ipDetail: '/ips/:id',
  editIp: '/ips/:id/edit',
  editImage: '/images/:imageId/edit',
  groupOverview: '/ips/:id/groups',
  createGroup: '/ips/:id/groups/new',
  groupImages: '/ips/:id/groups/:groupId',
  batchManageImages: '/ips/:id/images/batch',
  importImages: '/ips/:id/import',
  importBatchHistory: '/ips/:id/import-batches',
  duplicateReview: '/ips/:id/import-batches/:importBatchId/duplicates',
  allImages: '/ips/:id/images',
  imageViewer: '/images/:imageId/viewer',
  imageDetail: '/images/:imageId',
  moveImageGroup: '/images/:imageId/group',
  tagResult: '/tags/:tagId',
  favorites: '/me/favorites',
  recentViewed: '/me/recent-viewed',
  trash: '/me/trash',
  placeholder: '/placeholder/:title',
  importDevelopment: '/dev/import-check',
} as const;

export function buildIpDetailPath(ipId: number): string {
  return `/ips/${ipId}`;
}
