/**
 * 伴侣手账日记 (Companion Diary) 领域模型
 * 像素级复刻 docs/ai.html，严格遵循实体物理逻辑与 3-Spread 视口设计
 */

export type DiaryPaperTexture = 'grid' | 'lined' | 'dots' | 'kraft';

export type DiaryThemeKey = 'sage' | 'rainwater' | 'rose' | 'lavender' | 'celadon';

export type WashiTapeStyle = 'pink' | 'mint' | 'sunny' | 'sky';

export interface DiaryStickerItem {
  id: string;
  emojiOrAsset: string;
  x: number; // 0.0 ~ 1.0 页面相对 X
  y: number; // 0.0 ~ 1.0 页面相对 Y
  rotateDeg: number; // 旋转角
  scale?: number;
  label?: string;
}

export interface DiaryWashiTapeItem {
  id: string;
  style: WashiTapeStyle;
  x: number;
  y: number;
  rotateDeg: number;
  width?: number;
}

export interface DiaryPolaroidCard {
  id: string;
  imageUri?: string | null;
  caption: string;
  rotateDeg?: number;
}

/**
 * 日记里层提炼的结构化记忆元数据 (供后续 RAG/记忆库长效检索接口)
 */
export interface DiaryMemoryMetadata {
  summary?: string;          // 核心事件摘要（约100字客观总结）
  userPreferences?: string[]; // 捕捉到的用户偏好、习惯与状态
  keyEntities?: string[];     // 关键信物、物品与地点
  hooks?: string[];           // 待触发钩子与未来约定
  rawText?: string;           // 原始元数据文本
}

export interface ImCompanionDiary {
  id: string;
  threadId: string;
  roleCardId: string;
  diaryDate: string; // YYYY-MM-DD
  title: string;
  content: string; // 第一人称伴侣手账正文
  weather?: string | null;
  moodTag?: string | null;
  stickers: DiaryStickerItem[];
  tapes: DiaryWashiTapeItem[];
  polaroid?: DiaryPolaroidCard | null;
  paperTexture: DiaryPaperTexture;
  themeKey?: DiaryThemeKey;
  pageColor?: string | null;
  memoryMetadata?: DiaryMemoryMetadata | null;
  createdAt: number;
  updatedAt: number;
}

export interface DiaryPageContent {
  pageNumber: number;
  isLeft: boolean;
  dateStr: string;
  weather?: string | null;
  moodTag?: string | null;
  title?: string;
  themeKey?: DiaryThemeKey;
  pageColor?: string | null;
  paragraphs: string[];
  stickers: DiaryStickerItem[];
  tapes: DiaryWashiTapeItem[];
  polaroid?: DiaryPolaroidCard | null;
  isEndPage?: boolean;
}

export interface DiarySpreadPair {
  spreadIndex: number;
  leftPage: DiaryPageContent;
  rightPage: DiaryPageContent;
}
