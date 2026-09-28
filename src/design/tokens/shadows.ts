import type { ViewStyle } from 'react-native';

export const shadows: Record<'none' | 'hairline' | 'xs' | 'sm' | 'md' | 'hero' | 'floating', ViewStyle> = {
  none: {},
  hairline: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sm: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 2,
  },
  md: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  hero: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  floating: {
    shadowColor: '#5D4C34',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.13,
    shadowRadius: 36,
    elevation: 4,
  },
};
