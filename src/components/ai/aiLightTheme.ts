import { Platform } from 'react-native';

export const aiLightColors = {
  canvas: '#FAF9F5',
  surface: '#F5F0E8',
  card: '#EFE9DE',
  cardWash: 'rgba(255, 250, 242, 0.72)',
  coral: '#CC785C',
  coralActive: '#A9583E',
  coralSoft: '#F4E2D4',
  dark: '#181715',
  hairline: '#E6DFD8',
  ink: '#141413',
  muted: '#6C6A64',
  mutedSoft: '#8E8B82',
  onDark: '#FAF9F5',
  paperMark: 'rgba(204, 120, 92, 0.08)',
  posterBottomFade: 'rgba(250, 249, 245, 0.92)',
  posterRightFade: 'rgba(250, 249, 245, 0.82)',
  posterWarmOverlay: 'rgba(250, 249, 245, 0.14)',
} as const;

export const aiLightDisplayFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
