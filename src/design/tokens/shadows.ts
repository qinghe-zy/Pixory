import type { ViewStyle } from 'react-native';

export const shadows: Record<'none' | 'hairline' | 'xs' | 'sm' | 'md' | 'hero' | 'floating', ViewStyle> = {
  none: {},
  hairline: {
    shadowColor: '#7C5A2E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sm: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  md: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 4,
  },
  hero: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 36,
    elevation: 5,
  },
  floating: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 48,
    elevation: 8,
  },
};
