export const japaneseFreshTokens = {
  color: {
    background: {
      page: '#FBF7EF',
      washi: '#F7F0E6',
      mist: '#F3F7EF',
    },
    surface: {
      primary: '#FFFDF8',
      secondary: '#F8F3EA',
      tinted: '#F0F5EA',
      sunken: '#EFE9DE',
    },
    text: {
      primary: '#27312B',
      secondary: '#68746A',
      tertiary: '#9AA397',
      inverse: '#FFFFFF',
    },
    sage: {
      700: '#566B48',
      600: '#6F855D',
      400: '#9DAF8A',
      200: '#DDE7D3',
      100: '#EDF4E8',
    },
    beige: {
      300: '#E6D8C2',
      200: '#F0E7D9',
    },
    gold: {
      500: '#B8945A',
    },
    coral: {
      500: '#C96F5F',
      100: '#FFF1ED',
    },
    sky: {
      200: '#DDEEF0',
    },
    border: {
      soft: '#EFE7DA',
      sage: '#D6E0CD',
    },
    overlay: {
      image: 'rgba(39,49,43,0.22)',
      surface: 'rgba(255,253,248,0.82)',
      leaf: 'rgba(111,133,93,0.18)',
      paper: 'rgba(230,216,194,0.45)',
    },
  },
  typography: {
    brandLogo: { fontSize: 44, lineHeight: 50, fontWeight: '500' },
    brandSubtitle: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
    pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
    sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
    cardTitle: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
    body: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
    bodyStrong: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
    meta: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
    caption: { fontSize: 11, lineHeight: 16, fontWeight: '400' },
    number: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  },
  layout: {
    pagePaddingHorizontal: 22,
    pageTopOffset: 28,
    sectionGap: 22,
    blockGap: 14,
    screenBottomInset: 104,
  },
  metrics: {
    searchHeight: 50,
    chipHeight: 34,
    cardPadding: 18,
    iconButtonSize: 48,
    bottomTabHeight: 86,
    ipCardImageHeight: 168,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 30,
    pill: 999,
  },
} as const;

export type JapaneseFreshTokens = typeof japaneseFreshTokens;
