import { radius } from './radius';
import { metrics } from './metrics';

export const componentTokens = {
  common: metrics,
  searchBar: {
    height: 36,
    horizontalPadding: 14,
    iconSize: 14,
    radius: radius.pill,
  },
  filterChip: {
    height: metrics.chipHeight,
    horizontalPadding: metrics.chipPaddingHorizontal,
    gap: 6,
    radius: radius.pill,
  },
  primaryButton: {
    height: metrics.bottomActionHeight,
    horizontalPadding: 24,
    radius: radius.md,
  },
  iconButton: {
    size: metrics.iconButtonSize,
    iconSize: 22,
    radius: radius.md,
  },
  ipCard: {
    radius: radius.lg,
    previewAspectRatio: 3 / 2,
    previewBadgeRadius: radius.sm,
  },
  emptyState: {
    illustrationSize: 120,
    illustrationGap: 20,
    descriptionGap: 24,
    radius: radius.xl,
  },
} as const;
