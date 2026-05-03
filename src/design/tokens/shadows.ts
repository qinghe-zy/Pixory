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
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sm: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  md: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 3,
  },
  hero: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 3,
  },
  floating: {
    shadowColor: '#5C4527',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 48,
    elevation: 8,
  },
};
