import { Platform, type TextStyle } from 'react-native';

import { colors } from './colors';

const baseFontFamily = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: 'System',
});

const displayFontFamily = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: 'System',
});

const brandFontFamily = Platform.select({
  ios: 'PingFang SC',
  android: 'sans-serif',
  default: 'System',
});

const statFontFamily = Platform.select({
  ios: 'SF Pro Display',
  android: 'sans-serif-medium',
  default: 'System',
});

const monoFontFamily = 'JetBrainsMono_400Regular';
const monoBoldFontFamily = 'JetBrainsMono_700Bold';

const serifFontFamily = 'PlayfairDisplay_400Regular';
const serifItalicFontFamily = 'PlayfairDisplay_400Regular_Italic';

type TextStyles = Record<
  | 'brandLogo'
  | 'brandSubtitle'
  | 'navTitle'
  | 'pageTitle'
  | 'heroTitle'
  | 'heroCaption'
  | 'sectionTitle'
  | 'cardTitle'
  | 'body'
  | 'bodyStrong'
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
    display: displayFontFamily,
    brand: brandFontFamily,
    stat: statFontFamily,
    mono: monoFontFamily,
    monoBold: monoBoldFontFamily,
    serif: serifFontFamily,
    serifItalic: serifItalicFontFamily,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  size: {
    brandLogo: 44,
    navTitle: 18,
    pageTitle: 24,
    heroTitle: 24,
    sectionTitle: 17,
    cardTitle: 22,
    body: 14,
    caption: 12,
    micro: 11,
    navTab: 11,
    statNumber: 20,
  },
  textStyles: {
    brandLogo: {
      fontFamily: brandFontFamily,
      fontSize: 44,
      lineHeight: 50,
      fontWeight: '500',
      letterSpacing: 0,
      color: colors.text.heading,
    },
    brandSubtitle: {
      fontFamily: baseFontFamily,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '500',
      letterSpacing: 0,
      color: colors.text.secondary,
    },
    navTitle: {
      fontFamily: displayFontFamily,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      letterSpacing: 0,
      color: colors.text.heading,
    },
    pageTitle: {
      fontFamily: displayFontFamily,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      letterSpacing: 0,
      color: colors.text.heading,
    },
    heroTitle: {
      fontFamily: displayFontFamily,
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600',
      letterSpacing: 0,
      color: colors.text.primary,
    },
    heroCaption: {
      fontFamily: baseFontFamily,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400',
      letterSpacing: 0,
      color: colors.text.secondary,
    },
    sectionTitle: {
      fontFamily: displayFontFamily,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '600',
      letterSpacing: 0,
      color: colors.text.heading,
    },
    cardTitle: {
      fontFamily: displayFontFamily,
      fontSize: 22,
      lineHeight: 30,
      fontWeight: '600',
      letterSpacing: 0,
      color: colors.text.heading,
    },
    body: {
      fontFamily: baseFontFamily,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '400',
      color: colors.text.body,
    },
    bodyStrong: {
      fontFamily: baseFontFamily,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '600',
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
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
  } satisfies TextStyles,
} as const;
