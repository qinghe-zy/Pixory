import { radius } from './radius';

export const componentTokens = {
  searchBar: {
    height: 36,
    horizontalPadding: 14,
    iconSize: 14,
    radius: radius.pill,
  },
  filterChip: {
    height: 32,
    horizontalPadding: 14,
    gap: 6,
    radius: radius.pill,
  },
  primaryButton: {
    height: 44,
    horizontalPadding: 24,
    radius: radius.md,
  },
  iconButton: {
    size: 44,
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
