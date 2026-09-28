export interface DiaryPageContent {
  body: string;
  index: number;
}

// Sentence-ending punctuation marks that are safe page-break points.
const SENTENCE_ENDS = ['。', '！', '？', '…', '!', '?'];

/**
 * Split a single paragraph into chunks that each fit within maxCharacters.
 *
 * Rules:
 * - Only break at sentence-ending punctuation (。！？…).
 * - Never break at a comma (，,) mid-sentence.
 * - If no valid sentence boundary is found before maxCharacters, keep the
 *   whole remainder together and let the pager push it to the next page.
 */
function splitLongParagraph(paragraph: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let rest = paragraph.trim();
  while (rest.length > maxCharacters) {
    const preferred = rest.slice(0, maxCharacters);
    // Find the last sentence-ending punctuation within the window.
    let boundary = -1;
    for (const punct of SENTENCE_ENDS) {
      const idx = preferred.lastIndexOf(punct);
      if (idx > boundary) boundary = idx;
    }
    // Only split if a sentence boundary was found past 50% of the window.
    // Otherwise keep the whole chunk unsplit and let it flow to the next page.
    if (boundary >= Math.floor(maxCharacters * 0.50)) {
      chunks.push(rest.slice(0, boundary + 1).trim());
      rest = rest.slice(boundary + 1).trim();
    } else {
      // No good sentence boundary found — treat the whole rest as one unit.
      break;
    }
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Indent a paragraph for Chinese typesetting: two full-width spaces (　　)
 * at the start of each paragraph.
 */
function indentParagraph(paragraph: string): string {
  return `\u3000\u3000${paragraph}`;
}

export function paginateDiaryText(body: string, maxCharactersPerPage = 220): DiaryPageContent[] {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // Split oversized paragraphs into sentence-boundary chunks.
  const units = paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph, maxCharactersPerPage));

  const pages: string[] = [];
  let page = '';

  for (const unit of units) {
    const indented = indentParagraph(unit);
    // +2 accounts for the two full-width indent characters we added.
    const joined = page ? `${page}\n\n${indented}` : indented;
    if (page && joined.length > maxCharactersPerPage + 2) {
      pages.push(page);
      page = indented;
    } else {
      page = joined;
    }
  }
  if (page) pages.push(page);
  return (pages.length > 0 ? pages : [body.trim()]).map((pageBody, index) => ({ body: pageBody, index }));
}
