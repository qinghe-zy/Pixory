import { Platform } from 'react-native';

export const aiLightColors = {
  canvas: '#F2F2F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardWash: 'rgba(255, 255, 255, 0.82)',
  coral: '#1C1C1E', // Premium dark ink for primary actions
  coralActive: '#000000',
  coralSoft: '#E5E5EA',
  dark: '#000000',
  hairline: '#E5E5EA',
  ink: '#1C1C1E',
  muted: '#8E8E93',
  mutedSoft: '#C7C7CC',
  onDark: '#FFFFFF',
  paperMark: 'rgba(28, 28, 30, 0.04)',
  posterBottomFade: 'rgba(242, 242, 247, 0.95)',
  posterRightFade: 'rgba(242, 242, 247, 0.85)',
  posterWarmOverlay: 'rgba(0, 0, 0, 0.02)',
} as const;

export const aiLightDisplayFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'sans-serif',
});
