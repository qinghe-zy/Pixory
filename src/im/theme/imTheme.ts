/**
 * 伴侣短聊天 (IM 模式) 统一设计令牌体系 (ImThemeTokens)
 *
 * 核心目标：
 * 所有的字距字号，行距段距，气泡间距离，气泡颜色，圆角，用户/AI头像圆角等，
 * 背景，系统提示 ui，发送按钮颜色，主题颜色等都做成可统一修改。
 * 默认完全一比一像素级复刻 `docs/微信` 原型规范。
 */

import type { DimensionValue } from 'react-native';

export interface ImThemeColors {
  // 画布与顶栏
  background: string;
  headerBackground: string;
  headerBorder: string;
  headerTitle: string;
  headerSubText: string;

  // 输入条与操作区
  composerBackground: string;
  composerBorder: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  sendButtonBackground: string;
  sendButtonText: string;
  sendButtonDisabled: string;
  actionIconColor: string;

  // 气泡区
  bubbleLeftBackground: string;
  bubbleLeftText: string;
  bubbleLeftBorder: string;
  bubbleRightBackground: string;
  bubbleRightText: string;
  bubbleRightBorder: string;

  // 元数据与系统提示
  timeText: string;
  systemNoticeBackground: string;
  systemNoticeText: string;

  // 扩展面板 (九宫格)
  attachmentPanelBackground: string;
  attachmentItemCardBackground: string;
  attachmentItemText: string;
}

export interface ImThemeTypography {
  bubbleFontSize: number;
  bubbleLineHeight: number;
  bubbleLetterSpacing: number;
  timeFontSize: number;
  timeLineHeight: number;
  headerTitleFontSize: number;
  headerSubFontSize: number;
  systemNoticeFontSize: number;
  inputFontSize: number;
  inputLineHeight: number;
  sendButtonFontSize: number;
  attachmentItemFontSize: number;
}

export interface ImThemeRadii {
  bubbleRadius: number;
  avatarRadius: number;
  inputRadius: number;
  sendButtonRadius: number;
  systemNoticeRadius: number;
  attachmentCardRadius: number;
}

export interface ImThemeMetrics {
  avatarSize: number;
  bubblePaddingHorizontal: number;
  bubblePaddingVertical: number;
  bubbleMaxWidthPercent: DimensionValue;
  bubbleSpacingSameSpeaker: number;
  bubbleSpacingDiffSpeaker: number;
  avatarToBubbleGap: number;
  beakWidth: number;
  beakHeight: number;
  beakOffsetTop: number;
  composerMinHeight: number;
  inputMinHeight: number;
  inputMaxHeight: number;
}

export interface ImThemeShadows {
  bubbleShadowOpacity: number;
  bubbleShadowRadius: number;
  avatarShadowOpacity: number;
}

export interface ImThemeFlags {
  showBeak: boolean;
}

export interface ImThemeTokens {
  colors: ImThemeColors;
  typography: ImThemeTypography;
  radii: ImThemeRadii;
  metrics: ImThemeMetrics;
  shadows: ImThemeShadows;
  flags: ImThemeFlags;
}

/**
 * 微信官方像素级基线主题 (WeChat Authentic Baseline)
 * 严格对标 docs/微信/code.html 与 docs/微信/DESIGN.md
 */
export const defaultWechatTheme: ImThemeTokens = {
  colors: {
    // 微信经典浅灰底色
    background: '#EDEDED',
    headerBackground: '#EDEDED',
    headerBorder: '#DCDCDC',
    headerTitle: '#111111',
    headerSubText: '#7F7F7F',

    // 微信输入区
    composerBackground: '#F7F7F7',
    composerBorder: '#E5E5E5',
    inputBackground: '#FFFFFF',
    inputBorder: '#E0E0E0',
    inputText: '#111111',
    inputPlaceholder: '#A1A1AA',
    sendButtonBackground: '#95EC69',
    sendButtonText: '#111111',
    sendButtonDisabled: '#E1E1E1',
    actionIconColor: '#181818',

    // 微信气泡：对方白、我方微信绿
    bubbleLeftBackground: '#FFFFFF',
    bubbleLeftText: '#111111',
    bubbleLeftBorder: 'transparent',
    bubbleRightBackground: '#95EC69',
    bubbleRightText: '#111111',
    bubbleRightBorder: 'transparent',

    // 时间与系统胶囊
    timeText: '#B2B2B2',
    systemNoticeBackground: 'rgba(0, 0, 0, 0.05)',
    systemNoticeText: '#888888',

    // 微信九宫格更多面板
    attachmentPanelBackground: '#F7F7F7',
    attachmentItemCardBackground: '#FFFFFF',
    attachmentItemText: '#555555',
  },

  typography: {
    bubbleFontSize: 16,
    bubbleLineHeight: 22,
    bubbleLetterSpacing: 0,
    timeFontSize: 12,
    timeLineHeight: 16,
    headerTitleFontSize: 17,
    headerSubFontSize: 11,
    systemNoticeFontSize: 12,
    inputFontSize: 16,
    inputLineHeight: 22,
    sendButtonFontSize: 14,
    attachmentItemFontSize: 12,
  },

  radii: {
    bubbleRadius: 5,            // 微信经典 5px 气泡圆角
    avatarRadius: 4,            // 微信 4px 方圆头像
    inputRadius: 4,             // 微信 4px 输入框
    sendButtonRadius: 4,        // 微信 4px 发送按钮
    systemNoticeRadius: 4,
    attachmentCardRadius: 16,   // 九宫格 16px 圆角
  },

  metrics: {
    avatarSize: 32,             // 32x32 伴聊头像尺寸 (调小为原来的80%)
    bubblePaddingHorizontal: 12,// px-3
    bubblePaddingVertical: 8,   // py-2
    bubbleMaxWidthPercent: '84%',// 最大宽度 84%
    bubbleSpacingSameSpeaker: 16,// 同人多句 16px 舒适呼吸间距 (加大)
    bubbleSpacingDiffSpeaker: 26,// 不同说话人 26px 优雅大段过渡 (加大)
    avatarToBubbleGap: 10,      // 头像与气泡水平间距 10px
    beakWidth: 6,               // 三角小尖角宽度 6px
    beakHeight: 10,             // 三角小尖角高度 10px
    beakOffsetTop: 7,           // 尖角垂直偏移 7px (尖角上移，对齐气泡与头像上边界)
    composerMinHeight: 52,      // 微信底栏标称高度 52px
    inputMinHeight: 38,         // 微信单行输入框最小高度 38px
    inputMaxHeight: 120,        // 多行展开最大高度
  },

  shadows: {
    bubbleShadowOpacity: 0,
    bubbleShadowRadius: 0,
    avatarShadowOpacity: 0.04,
  },

  flags: {
    showBeak: true,             // 默认展示微信三角尖角
  },
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * 创建自定义主题并安全继承微信基线
 */
export function createImTheme(overrides?: DeepPartial<ImThemeTokens>): ImThemeTokens {
  if (!overrides) return defaultWechatTheme;

  return {
    colors: { ...defaultWechatTheme.colors, ...overrides.colors },
    typography: { ...defaultWechatTheme.typography, ...overrides.typography },
    radii: { ...defaultWechatTheme.radii, ...overrides.radii },
    metrics: { ...defaultWechatTheme.metrics, ...overrides.metrics },
    shadows: { ...defaultWechatTheme.shadows, ...overrides.shadows },
    flags: { ...defaultWechatTheme.flags, ...overrides.flags },
  };
}

/**
 * 根据用户的排版与外观偏好构建动态主题令牌
 */
export function buildImThemeFromPreferences(
  baseTheme: ImThemeTokens = defaultWechatTheme,
  typography?: { fontSize?: number; lineHeight?: number; letterSpacing?: number; paragraphSpacing?: number },
  appearance?: { avatarRadius?: number; bubbleRadius?: number; userBubbleColor?: string }
): ImThemeTokens {
  const pSpacing = typography?.paragraphSpacing ?? 10;
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      bubbleRightBackground: (appearance?.userBubbleColor && appearance.userBubbleColor !== 'transparent')
        ? appearance.userBubbleColor
        : baseTheme.colors.bubbleRightBackground,
    },
    typography: {
      ...baseTheme.typography,
      bubbleFontSize: typography?.fontSize ?? baseTheme.typography.bubbleFontSize,
      bubbleLineHeight: typography?.lineHeight ?? baseTheme.typography.bubbleLineHeight,
      bubbleLetterSpacing: typography?.letterSpacing ?? baseTheme.typography.bubbleLetterSpacing,
    },
    radii: {
      ...baseTheme.radii,
      avatarRadius: appearance?.avatarRadius ?? baseTheme.radii.avatarRadius,
      bubbleRadius: appearance?.bubbleRadius ?? baseTheme.radii.bubbleRadius,
    },
    metrics: {
      ...baseTheme.metrics,
      bubbleSpacingSameSpeaker: Math.max(14, Math.round(pSpacing * 1.4)),
      bubbleSpacingDiffSpeaker: Math.max(24, Math.round(pSpacing * 2.4)),
    },
  };
}
