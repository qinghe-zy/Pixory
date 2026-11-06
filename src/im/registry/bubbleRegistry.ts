import type React from 'react';
import type { ImMessage, ImMessageType } from '../types';
import { TextBubbleRenderer } from '../components/renderers/TextBubbleRenderer';
import { SystemNoticeRenderer } from '../components/renderers/SystemNoticeRenderer';
import { ImageBubbleRenderer } from '../components/renderers/ImageBubbleRenderer';
import { DiaryCardRenderer } from '../components/renderers/DiaryCardRenderer';
import { StickerBubbleRenderer } from '../../components/emoji/StickerBubbleRenderer';
import { DocumentBubbleRenderer } from '../components/renderers/DocumentBubbleRenderer';
import { ThoughtBubbleRenderer } from '../components/renderers/ThoughtBubbleRenderer';
import { VoiceBubbleRenderer } from '../components/renderers/VoiceBubbleRenderer';

export interface OpenDocumentTarget {
  uri?: string;
  title?: string;
  content?: string | Uint8Array;
  mode?: 'clean' | 'diff';
}

export interface BubbleRendererProps {
  message: ImMessage;
  companionAvatarUri?: string | null;
  companionName?: string;
  userAvatarUri?: string | null;
  onLongPressMessage?: (message: ImMessage, pageX: number, pageY: number) => void;
  onPressMessage?: (message: ImMessage) => void;
  onRetryMessage?: (message: ImMessage) => void;
  onNudge?: () => void;
  onNudgeSelf?: () => void;
  onOpenDiary?: (diaryId?: string) => void;
  onOpenSandbox?: (target: { code: string; language?: string; title?: string }) => void;
  onOpenDocument?: (target: OpenDocumentTarget) => void;
  space?: 'normal' | 'personal';
  isLatestMessage?: boolean;
}

export type BubbleRendererComponent = React.ComponentType<BubbleRendererProps>;

const registry = new Map<ImMessageType, BubbleRendererComponent>();

// 默认注册微信基础渲染器、日记略缩信封与极简文档卡片
registry.set('text', TextBubbleRenderer);
registry.set('system_notice', SystemNoticeRenderer);
registry.set('image', ImageBubbleRenderer);
registry.set('diary_card', DiaryCardRenderer);
registry.set('sticker', StickerBubbleRenderer as any);
registry.set('document', DocumentBubbleRenderer);
registry.set('thought', ThoughtBubbleRenderer);
registry.set('voice', VoiceBubbleRenderer);

/**
 * 气泡渲染器注册表 (插件化高扩展契约)
 *
 * 杜绝在主列表内堆叠 if-else 巨石代码。
 * 针对新气泡类型（语音、图片、卡片、系统事件等），在此动态注册即可。
 */
export const BubbleRegistry = {
  register(type: ImMessageType, component: BubbleRendererComponent): void {
    registry.set(type, component);
  },

  get(type: ImMessageType = 'text'): BubbleRendererComponent {
    return registry.get(type) ?? TextBubbleRenderer;
  },

  has(type: ImMessageType): boolean {
    return registry.has(type);
  },

  clear(): void {
    registry.clear();
  },
};
