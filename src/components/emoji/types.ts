/**
 * 独立解耦表情系统核心类型定义 (Decoupled Emoji System Contract)
 *
 * 规范：
 * 1. 纯净跨端契约，不耦合任何具体页面或 IM 模块逻辑；
 * 2. 支持任意表情包拓展注册；
 * 3. 严格遵循 7 列栅格规范与极简黑白线框导航。
 */

export type EmojiItemType = 'animated' | 'static' | 'kaomoji';

export interface BaseEmojiItem {
  id: string;
  type: EmojiItemType;
  name: string;
  previewText?: string;
}

export interface AnimatedEmojiItem extends BaseEmojiItem {
  type: 'animated';
  animatedUri: string;
  previewUri?: string;
  width?: number;
  height?: number;
  category?: 'face' | 'animal' | 'prop' | 'gesture' | 'custom';
  emotionBucket?: string;
  keywords?: string[];
}

export interface CustomStickerRecord {
  id: string;
  space: 'normal' | 'personal';
  packId?: string | null;
  name: string;
  uri: string;
  previewUri?: string | null;
  emotionBucket?: string | null;
  keywords: string[];
  width?: number | null;
  height?: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface StickerPackRecord {
  id: string;
  space: 'normal' | 'personal';
  name: string;
  coverUri?: string | null;
  description?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StaticEmojiItem extends BaseEmojiItem {
  type: 'static';
  char: string;
}

export interface KaomojiItem extends BaseEmojiItem {
  type: 'kaomoji';
  text: string;
}

export type AnyEmojiItem = AnimatedEmojiItem | StaticEmojiItem | KaomojiItem;

/**
 * 顶部导航 Tab 选项（严格由黑白线框图标驱动，不带文字）
 */
export interface EmojiTabItem {
  id: string;
  /** 图标名 */
  iconName: string;
  /** 图标库族，默认 Ionicons */
  iconFamily?: 'Ionicons' | 'MaterialCommunityIcons';
  accessibilityLabel: string;
}

/**
 * 表情选择器通用入参
 */
export interface EmojiPickerPanelProps {
  /** 选中静态表情回调（插入光标） */
  onSelectStaticEmoji: (char: string) => void;
  /** 选中动态大表情回调（直接单发） */
  onSelectAnimatedEmoji: (sticker: AnimatedEmojiItem) => void;
  /** 选中颜文字回调（插入光标） */
  onSelectKaomoji: (text: string) => void;
  /** 点击退格删除键 */
  onBackspace?: () => void;
  /** 面板高度（默认约 290dp，贴合移动端软键盘常态高度） */
  height?: number;
  /** 是否深色模式/自定义主题底色 */
  backgroundColor?: string;
  /** 空间沙盒隔离标识（可选） */
  space?: 'normal' | 'personal';
}
