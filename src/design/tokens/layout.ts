import { metrics } from './metrics';

export const layout = {
  pagePaddingHorizontal: 22,
  pageTopOffset: 28,
  pageBottomOffset: 18,
  stickyFooterBottomOffset: metrics.bottomActionInset,
  sectionGap: metrics.sectionGap,
  blockGap: 14,
  gridGap: 12,
  galleryGap: 8,
  headerHeight: 76,
  maxReadableWidth: 680,
  maxContentWidth: 430,
  screenBottomInset: 96,
} as const;
