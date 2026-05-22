import { Platform } from 'react-native';

export const aiLightColors = {
  canvas: '#FAF9F5',
  surface: '#F5F0E8',
  card: '#EFE9DE',
  coral: '#CC785C',
  coralActive: '#A9583E',
  dark: '#181715',
  hairline: '#E6DFD8',
  ink: '#141413',
  muted: '#6C6A64',
  mutedSoft: '#8E8B82',
  onDark: '#FAF9F5',
} as const;

export const aiLightDisplayFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
