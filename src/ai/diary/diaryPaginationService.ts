export interface DiaryPageContent {
  body: string;
  index: number;
}

function splitLongParagraph(paragraph: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let rest = paragraph.trim();
  while (rest.length > maxCharacters) {
    const preferred = rest.slice(0, maxCharacters);
    const boundary = Math.max(preferred.lastIndexOf('。'), preferred.lastIndexOf('！'), preferred.lastIndexOf('？'), preferred.lastIndexOf('，'));
    const splitAt = boundary >= Math.floor(maxCharacters * 0.55) ? boundary + 1 : maxCharacters;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function paginateDiaryText(body: string, maxCharactersPerPage = 220): DiaryPageContent[] {
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const units = paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph, maxCharactersPerPage));
  const pages: string[] = [];
  let page = '';
  for (const unit of units) {
    const joined = page ? `${page}\n\n${unit}` : unit;
    if (page && joined.length > maxCharactersPerPage) {
      pages.push(page);
      page = unit;
    } else {
      page = joined;
    }
  }
  if (page) pages.push(page);
  return (pages.length > 0 ? pages : [body.trim()]).map((pageBody, index) => ({ body: pageBody, index }));
}
