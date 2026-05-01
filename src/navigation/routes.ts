export const appRoutes = {
  home: '/ips',
  createIp: '/ips/new',
  ipDetail: '/ips/:id',
  editIp: '/ips/:id/edit',
  editImage: '/images/:imageId/edit',
  groupOverview: '/ips/:id/groups',
  createGroup: '/ips/:id/groups/new',
  groupImages: '/ips/:id/groups/:groupId',
  batchManageImages: '/ips/:id/images/batch',
  importImages: '/ips/:id/import',
  allImages: '/ips/:id/images',
  imageDetail: '/images/:imageId',
  moveImageGroup: '/images/:imageId/group',
  placeholder: '/placeholder/:title',
  importDevelopment: '/dev/import-check',
} as const;

export function buildIpDetailPath(ipId: number): string {
  return `/ips/${ipId}`;
}
