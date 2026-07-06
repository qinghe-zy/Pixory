import { Platform } from 'react-native';

export const aiLightColors = {
  canvas: '#F2F2F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardWash: 'rgba(255, 255, 255, 0.72)',
  primary: '#5B9CF6',
  primaryActive: '#4A8BE6',
  primarySoft: '#EBF4FE',
  dark: '#1C1C1E',
  hairline: '#E5E5EA',
  ink: '#1C1C1E',
  muted: '#8E8E93',
  mutedSoft: '#C7C7CC',
  onDark: '#FFFFFF',
  paperMark: 'rgba(91, 156, 246, 0.08)',
  posterBottomFade: 'rgba(242, 242, 247, 0.92)',
  posterRightFade: 'rgba(242, 242, 247, 0.82)',
  posterWarmOverlay: 'rgba(0, 0, 0, 0.04)',
} as const;

export const aiLightDisplayFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
