import { Platform } from 'react-native';

// Chat-only light mode adapted from design.md. These constants intentionally stay
// scoped to AI chat so the cream/coral treatment does not leak into global tokens.
export const aiChatLightColors = {
  canvas: '#FAF9F5',
  card: '#EFE9DE',
  coral: '#CC785C',
  coralActive: '#A9583E',
  dark: '#181715',
  hairline: '#E6DFD8',
  ink: '#141413',
  muted: '#6C6A64',
  mutedSoft: '#8E8B82',
  onDark: '#FAF9F5',
  surface: '#F5F0E8',
} as const;

export const aiChatDisplayFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});
