import type { ImCompanionDiary, DiaryPageContent, DiarySpreadPair, DiaryStickerItem, DiaryWashiTapeItem } from '../types';

/**
 * 物理纸张排版引擎 (Physical Paper Pagination Engine)
 * 物理铁律：绝对禁止内部文字滚动！
 * 依据物理纸面承载力，在句子边界平滑切分并自然装填，彻底告别半页留白。
 */

// 单个物理面容纳的标准正文字符数与行高估计 (14px 字号在 300px 正文宽度下约 20 字/行)
const CHARS_PER_LINE = 20;
const MAX_LINES_FIRST_PAGE = 13;   // 第一页包含避让区与标题，正文容纳 13 行 (约 260 字)
const MAX_LINES_NORMAL_PAGE = 16;  // 续页避让上方 Diary 艺术字后，正文容纳 16 行 (约 320 字)

/**
 * 将长段落按自然语义标点 (。！？…) 切分为句子单元
 */
function splitParagraphIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const regex = /[^。！？…\n]+[。！？…]+|\S+$/g;
  const matches = trimmed.match(regex);
  if (!matches || matches.length === 0) return [trimmed];
  return matches.map((s) => s.trim()).filter(Boolean);
}

export function paginateDiaryIntoPages(diary: ImCompanionDiary): DiaryPageContent[] {
  const pages: DiaryPageContent[] = [];
  const rawParagraphs = diary.content
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  let currentPageIndex = 1;
  let pageParagraphs: string[] = [];
  let currentLines = 0;
  const maxLinesForPage = (idx: number) => (idx === 1 ? MAX_LINES_FIRST_PAGE : MAX_LINES_NORMAL_PAGE);

  for (const para of rawParagraphs) {
    const sentences = splitParagraphIntoSentences(para);
    if (sentences.length === 0) continue;

    let currentParaChunk = '';
    let isParaStart = true;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const testChunk = currentParaChunk ? currentParaChunk + sentence : (isParaStart ? `\u3000\u3000${sentence}` : sentence);
      const testLines = Math.max(1, Math.ceil(testChunk.length / CHARS_PER_LINE));

      const limit = maxLinesForPage(currentPageIndex);
      if (currentLines + testLines > limit && (currentLines > 0 || currentParaChunk.length > 0)) {
        // 当前页空间不足以容纳下一句，先封存已有内容并换页
        if (currentParaChunk.trim()) {
          pageParagraphs.push(currentParaChunk);
        }
        if (pageParagraphs.length > 0) {
          pages.push(buildPage(currentPageIndex, diary, pageParagraphs, false));
          currentPageIndex++;
          pageParagraphs = [];
          currentLines = 0;
        }

        // 剩余句子作为未结束段落继续流向下页（非段首不重加缩进）
        isParaStart = false;
        currentParaChunk = sentence;
      } else {
        currentParaChunk = testChunk;
      }
    }

    if (currentParaChunk.trim()) {
      pageParagraphs.push(currentParaChunk);
      currentLines += Math.max(1, Math.ceil(currentParaChunk.length / CHARS_PER_LINE));
    }
  }

  if (pageParagraphs.length > 0 || pages.length === 0) {
    pages.push(buildPage(currentPageIndex, diary, pageParagraphs, true));
  } else if (pages.length > 0) {
    pages[pages.length - 1].isEndPage = true;
  }

  // 保持对开书本结构，单数页补齐对页
  if (pages.length % 2 !== 0) {
    pages.push({
      pageNumber: pages.length + 1,
      isLeft: false,
      dateStr: diary.diaryDate,
      paragraphs: [],
      stickers: [],
      tapes: [],
      polaroid: diary.polaroid,
      isEndPage: true,
      themeKey: diary.themeKey,
      pageColor: diary.pageColor,
    });
  }

  return pages;
}

function buildPage(
  pageNumber: number,
  diary: ImCompanionDiary,
  paragraphs: string[],
  isEnd: boolean
): DiaryPageContent {
  const isLeft = pageNumber % 2 !== 0;
  const isFirst = pageNumber === 1;

  return {
    pageNumber,
    isLeft,
    dateStr: diary.diaryDate,
    weather: isFirst ? diary.weather : undefined,
    moodTag: isFirst ? diary.moodTag : undefined,
    title: isFirst ? diary.title : undefined,
    themeKey: diary.themeKey,
    pageColor: diary.pageColor,
    paragraphs,
    stickers: [],
    tapes: [],
    polaroid: isFirst && !isLeft ? diary.polaroid : undefined,
    isEndPage: isEnd,
  };
}

export function buildDiarySpreads(diary: ImCompanionDiary): DiarySpreadPair[] {
  const pages = paginateDiaryIntoPages(diary);
  const spreads: DiarySpreadPair[] = [];

  for (let i = 0; i < pages.length; i += 2) {
    spreads.push({
      spreadIndex: Math.floor(i / 2),
      leftPage: pages[i],
      rightPage: pages[i + 1] || pages[i],
    });
  }

  return spreads;
}
