export interface DiaryPageContent {
  body: string;
  index: number;
}

/**
 * Indent a paragraph for Chinese typesetting: two full-width spaces (　　)
 * at the start of each paragraph.
 */
function indentParagraph(paragraph: string): string {
  return `\u3000\u3000${paragraph}`;
}

/**
 * Split a paragraph into clean sentence units based on sentence-ending punctuation.
 */
function splitParagraphIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const regex = /[^。！？…\n!?]+[。！？…!?]+|\S+$/g;
  const matches = trimmed.match(regex);
  if (!matches || matches.length === 0) return [trimmed];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Split an exceptionally long sentence that exceeds the page limit by commas or character chunks.
 */
function splitOversizedSentence(sentence: string, maxLen: number): string[] {
  if (sentence.length <= maxLen) return [sentence];
  const chunks: string[] = [];
  let rest = sentence;
  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen);
    const commaIdx = Math.max(
      window.lastIndexOf('，'),
      window.lastIndexOf(','),
      window.lastIndexOf('；'),
      window.lastIndexOf(';')
    );
    const splitAt = commaIdx >= Math.floor(maxLen * 0.6) ? commaIdx + 1 : maxLen;
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Paginates diary text so that pages are filled naturally to match the physical
 * 9:13 paper aspect ratio (approx. 13-15 lines of text).
 *
 * Rules:
 * - Default capacity is 320 characters (comfortably holds a standard ~260-300 word diary on a single page).
 * - Multi-paragraph text will fill the current page before turning to the next page, preventing
 *   awkward half-empty pages.
 * - Always break at sentence boundaries (。！？…).
 * - Preserve paragraph-level first-line full-width indentation.
 */
export function paginateDiaryText(body: string, maxCharactersPerPage = 320): DiaryPageContent[] {
  const trimmed = body.trim();
  if (!trimmed) return [{ body: '', index: 0 }];

  const rawParagraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const indentedParagraphs = rawParagraphs.map(indentParagraph);
  const fullText = indentedParagraphs.join('\n\n');

  // If the whole content fits comfortably on one page, keep it intact
  if (fullText.length <= maxCharactersPerPage) {
    return [{ body: fullText, index: 0 }];
  }

  const pages: string[] = [];
  let currentPage = '';

  for (const para of rawParagraphs) {
    const rawSentences = splitParagraphIntoSentences(para);
    if (rawSentences.length === 0) continue;

    const sentences = rawSentences.flatMap((s) => splitOversizedSentence(s, maxCharactersPerPage));
    let isParaStart = true;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const chunkWithIndent = isParaStart ? indentParagraph(sentence) : sentence;
      const testPage = currentPage
        ? (isParaStart ? `${currentPage}\n\n${chunkWithIndent}` : `${currentPage}${sentence}`)
        : chunkWithIndent;

      if (testPage.length > maxCharactersPerPage && currentPage.length > 0) {
        pages.push(currentPage.trim());
        currentPage = isParaStart ? chunkWithIndent : sentence;
      } else {
        currentPage = testPage;
      }
      isParaStart = false;
    }
  }

  if (currentPage.trim()) {
    pages.push(currentPage.trim());
  }

  return (pages.length > 0 ? pages : [fullText]).map((pageBody, index) => ({ body: pageBody, index }));
}
