import { radius } from './radius';
import { metrics } from './metrics';

export const componentTokens = {
  common: metrics,
  searchBar: {
    height: metrics.searchHeight,
    horizontalPadding: 16,
    iconSize: 16,
    radius: radius.pill,
  },
  filterChip: {
    height: 36,
    horizontalPadding: metrics.chipPaddingHorizontal,
    gap: 8,
    radius: radius.pill,
  },
  primaryButton: {
    height: metrics.bottomActionHeight,
    horizontalPadding: 24,
    radius: radius.pill,
  },
  iconButton: {
    size: metrics.iconButtonSize,
    iconSize: 22,
    radius: radius.md,
  },
  ipCard: {
    radius: radius.lg,
    previewAspectRatio: 1.04,
    imageHeight: metrics.ipCardImageHeight,
    previewBadgeRadius: radius.sm,
    contentPadding: 14,
  },
  emptyState: {
    illustrationSize: 76,
    illustrationGap: 20,
    descriptionGap: 24,
    radius: 20,
  },
  thumbnail: {
    radius: radius.md,
    aspectRatio: 0.76,
    squareAspectRatio: 1,
    favoriteBadgeSize: 24,
  },
  field: {
    height: 48,
    multilineMinHeight: 92,
    radius: radius.md,
  },
  bottomTab: {
    height: metrics.bottomTabHeight,
    radiusTop: 24,
    iconSize: 22,
  },
} as const;
