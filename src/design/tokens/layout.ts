import { metrics } from './metrics';

export const layout = {
  pagePaddingHorizontal: 16,
  pageTopOffset: 16,
  pageBottomOffset: 16,
  stickyFooterBottomOffset: metrics.bottomActionInset,
  sectionGap: metrics.sectionGap,
  blockGap: 16,
  gridGap: 8,
  headerHeight: 44,
  maxReadableWidth: 680,
} as const;
