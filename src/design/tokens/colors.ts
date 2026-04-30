export const colors = {
  primary: {
    background: '#E6F4FF',
    hover: '#BAD7FF',
    default: '#1677FF',
    active: '#0958D9',
    dark: '#003EB3',
  },
  text: {
    title: '#1A1A1A',
    body: '#595959',
    secondary: '#8C8C8C',
    placeholder: '#BFBFBF',
    inverse: '#FFFFFF',
    link: '#1677FF',
  },
  semantic: {
    favorite: '#FAAD14',
    success: '#52C41A',
    warning: '#FAAD14',
    danger: '#FF4D4F',
    successBackground: '#F6FFED',
    warningBackground: '#FFFBE6',
    dangerBackground: '#FFF1F0',
  },
  background: {
    page: '#F5F5F5',
    surface: '#FFFFFF',
    input: '#F0F2F5',
    tag: '#E6F4FF',
    tagInactive: '#F5F5F5',
    empty: '#EBF1FF',
  },
  border: {
    subtle: '#F0F0F0',
    default: '#E8E8E8',
    strong: '#D9D9D9',
  },
  overlay: {
    scrim: 'rgba(26, 26, 26, 0.08)',
    iconMuted: 'rgba(26, 26, 26, 0.42)',
  },
} as const;

export type Colors = typeof colors;
