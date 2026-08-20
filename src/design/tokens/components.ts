import { radius } from './radius';
import { metrics } from './metrics';
import { spacing } from './spacing';

export const componentTokens = {
  common: metrics,
  searchBar: {
    height: metrics.searchHeight,
    horizontalPadding: 16,
    iconSize: 16,
    radius: radius.pill,
  },
  filterChip: {
    height: metrics.chipHeight,
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
    aspectRatio: 2.08,
    captionWidth: '74%',
    previewAspectRatio: 1.04,
    imageHeight: metrics.ipCardImageHeight,
    imageTransitionMs: 120,
    previewBadgeRadius: radius.sm,
    contentPadding: spacing[4],
    shimmerDurationMs: 1_200,
  },
  emptyState: {
    illustrationSize: 76,
    illustrationGap: 20,
    descriptionGap: 24,
    radius: radius.xl,
  },
  thumbnail: {
    radius: radius.md,
    aspectRatio: 0.76,
    squareAspectRatio: 1,
    favoriteBadgeSize: 24,
  },
  field: {
    height: 50,
    multilineMinHeight: 92,
    radius: radius.md,
  },
  bottomTab: {
    height: metrics.bottomTabHeight,
    radiusTop: 24,
    iconSize: 22,
  },
} as const;
