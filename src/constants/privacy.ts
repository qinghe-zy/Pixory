export const PERSONAL_COVER_BLUR_RADIUS = 6;
export const PERSONAL_COVER_BLUR_OPTIONS = [3, 6, 9, 12] as const;

export function resolvePersonalCoverBlurRadius(value: number | null | undefined): number {
  return value ?? PERSONAL_COVER_BLUR_RADIUS;
}
