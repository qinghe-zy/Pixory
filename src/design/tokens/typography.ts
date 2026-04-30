import { Platform, type TextStyle } from 'react-native';

import { colors } from './colors';

const baseFontFamily = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: 'System',
});

const statFontFamily = Platform.select({
  ios: 'SF Pro Display',
  android: 'sans-serif-medium',
  default: 'System',
});

const monoFontFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

type TextStyles = Record<
  | 'navTitle'
  | 'pageTitle'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'caption'
  | 'micro'
  | 'statNumber'
  | 'statLabel'
  | 'emptyTitle'
  | 'emptyDescription'
  | 'navTab',
  TextStyle
>;

export const typography = {
  family: {
    base: baseFontFamily,
    stat: statFontFamily,
    mono: monoFontFamily,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  size: {
    navTitle: 17,
    pageTitle: 16,
    sectionTitle: 15,
    cardTitle: 14,
    body: 13,
    caption: 12,
    micro: 11,
    navTab: 10,
    statNumber: 20,
  },
  textStyles: {
    navTitle: {
      fontFamily: baseFontFamily,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      color: colors.text.title,
    },
    pageTitle: {
      fontFamily: baseFontFamily,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: colors.text.title,
    },
    sectionTitle: {
      fontFamily: baseFontFamily,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      color: colors.text.title,
    },
    cardTitle: {
      fontFamily: baseFontFamily,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: colors.text.title,
    },
    body: {
      fontFamily: baseFontFamily,
      fontSize: 13,
      lineHeight: 21,
      fontWeight: '400',
      color: colors.text.body,
    },
    caption: {
      fontFamily: baseFontFamily,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
      color: colors.text.secondary,
    },
    micro: {
      fontFamily: baseFontFamily,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '400',
      color: colors.text.placeholder,
    },
    statNumber: {
      fontFamily: statFontFamily,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '600',
      color: colors.text.title,
    },
    statLabel: {
      fontFamily: baseFontFamily,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '400',
      color: colors.text.secondary,
    },
    emptyTitle: {
      fontFamily: baseFontFamily,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
      color: colors.text.title,
    },
    emptyDescription: {
      fontFamily: baseFontFamily,
      fontSize: 13,
      lineHeight: 21,
      fontWeight: '400',
      color: colors.text.secondary,
    },
    navTab: {
      fontFamily: baseFontFamily,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '400',
      color: colors.text.secondary,
    },
  } satisfies TextStyles,
} as const;
