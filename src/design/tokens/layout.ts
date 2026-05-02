import { metrics } from './metrics';

export const layout = {
  pagePaddingHorizontal: 16,
  pageTopOffset: 18,
  pageBottomOffset: 18,
  stickyFooterBottomOffset: metrics.bottomActionInset,
  sectionGap: metrics.sectionGap,
  blockGap: 16,
  gridGap: 12,
  galleryGap: 8,
  headerHeight: 76,
  maxReadableWidth: 680,
  maxContentWidth: 430,
  screenBottomInset: 96,
} as const;
