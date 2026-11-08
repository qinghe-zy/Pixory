import { fromByteArray, toByteArray } from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';

import type { PixorySpace } from '../../database';
import { NodeDocxZipAdapter } from '../../services/sandbox/docx/docxZipAdapter';
import type { ParsedDocumentText } from './textParser';

export interface ParsedDocxHtmlResult {
  html: string;
  text: string;
  headings: Array<{ level: number; text: string }>;
  paragraphCount: number;
  tableCount: number;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMediaMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function getZipEntry(
  entries: Map<string, Uint8Array> | undefined,
  targetPath: string
): Uint8Array | undefined {
  if (!entries) return undefined;
  const normalized = targetPath.replace(/\\/g, '/');
  if (entries.has(normalized)) return entries.get(normalized);
  const lower = normalized.toLowerCase();
  for (const [k, v] of entries.entries()) {
    if (k.replace(/\\/g, '/').toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

function parseDocxRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relMatches = relsXml.match(/<Relationship\s+[^>]*\/>/g) ?? [];
  for (const rel of relMatches) {
    const idMatch = rel.match(/Id="([^"]+)"/i);
    const targetMatch = rel.match(/Target="([^"]+)"/i);
    if (idMatch && targetMatch) {
      let target = targetMatch[1].replace(/\\/g, '/');
      if (target.startsWith('../')) {
        target = target.replace(/^\.\.\//, 'word/');
      } else if (!target.startsWith('word/') && !target.startsWith('/')) {
        target = `word/${target}`;
      }
      map.set(idMatch[1], target);
    }
  }
  return map;
}

async function readFileBytes(fileUri: string): Promise<Uint8Array> {
  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    !fileUri.startsWith('content://')
  ) {
    try {
      const fs = require('fs');
      const localPath = fileUri.replace(/^file:\/\//, '');
      if (fs.existsSync(localPath)) {
        return new Uint8Array(fs.readFileSync(localPath));
      }
    } catch {
      // Fall through to FileSystem
    }
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return toByteArray(base64);
}

// ---------------------------------------------------------------------------
// Multi-Level Numbering Engine (word/numbering.xml)
// ---------------------------------------------------------------------------

interface NumberingLevelDef {
  numFmt: string;
  lvlText: string;
  start: number;
}

interface NumberingState {
  numToAbstract: Map<string, string>;
  abstracts: Map<string, Map<number, NumberingLevelDef>>;
  counters: Map<string, number>;
}

function parseNumberingXml(numberingXml: string): NumberingState {
  const numToAbstract = new Map<string, string>();
  const abstracts = new Map<string, Map<number, NumberingLevelDef>>();
  const counters = new Map<string, number>();

  // 1. Parse abstractNum definitions
  const abstractMatches = numberingXml.match(/<w:abstractNum\s+[^>]*>[\s\S]*?<\/w:abstractNum>/g) ?? [];
  for (const absXml of abstractMatches) {
    const absIdMatch = absXml.match(/w:abstractNumId="([^"]+)"/i);
    if (!absIdMatch) continue;
    const absId = absIdMatch[1];
    const lvlMap = new Map<number, NumberingLevelDef>();

    const lvlMatches = absXml.match(/<w:lvl\s+[^>]*>[\s\S]*?<\/w:lvl>/g) ?? [];
    for (const lvlXml of lvlMatches) {
      const ilvlMatch = lvlXml.match(/w:ilvl="(\d+)"/i);
      if (!ilvlMatch) continue;
      const ilvl = parseInt(ilvlMatch[1], 10);

      const numFmtMatch = lvlXml.match(/<w:numFmt\s+[^>]*w:val="([^"]+)"/i);
      const numFmt = numFmtMatch ? numFmtMatch[1] : 'decimal';

      const lvlTextMatch = lvlXml.match(/<w:lvlText\s+[^>]*w:val="([^"]+)"/i);
      const lvlText = lvlTextMatch ? lvlTextMatch[1] : '%1.';

      const startMatch = lvlXml.match(/<w:start\s+[^>]*w:val="(\d+)"/i);
      const start = startMatch ? parseInt(startMatch[1], 10) : 1;

      lvlMap.set(ilvl, { numFmt, lvlText, start });
    }
    abstracts.set(absId, lvlMap);
  }

  // 2. Parse num instances
  const numMatches = numberingXml.match(/<w:num\s+[^>]*>[\s\S]*?<\/w:num>/g) ?? [];
  for (const numXml of numMatches) {
    const numIdMatch = numXml.match(/w:numId="([^"]+)"/i);
    const absRefMatch = numXml.match(/<w:abstractNumId\s+[^>]*w:val="([^"]+)"/i);
    if (numIdMatch && absRefMatch) {
      numToAbstract.set(numIdMatch[1], absRefMatch[1]);
    }
  }

  return { numToAbstract, abstracts, counters };
}

function toChineseNumber(n: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n <= 10) {
    if (n === 10) return '十';
    return digits[n] || String(n);
  }
  if (n < 20) return `十${digits[n % 10]}`;
  if (n < 100) return `${digits[Math.floor(n / 10)]}十${n % 10 !== 0 ? digits[n % 10] : ''}`;
  return String(n);
}

function formatListNumber(state: NumberingState, numId: string, ilvl: number): string {
  const absId = state.numToAbstract.get(numId);
  if (!absId) return '•';
  const lvlMap = state.abstracts.get(absId);
  const lvlDef = lvlMap?.get(ilvl);
  if (!lvlDef) return '•';

  if (lvlDef.numFmt === 'bullet') {
    return ilvl === 1 ? '◦' : ilvl >= 2 ? '▪' : '•';
  }

  const key = `${numId}_${ilvl}`;
  const current = (state.counters.get(key) ?? (lvlDef.start - 1)) + 1;
  state.counters.set(key, current);

  // Reset deeper child levels
  for (let deeper = ilvl + 1; deeper <= 9; deeper++) {
    state.counters.delete(`${numId}_${deeper}`);
  }

  let text = lvlDef.lvlText;
  for (let l = 0; l <= ilvl; l++) {
    const lKey = `${numId}_${l}`;
    const lVal = state.counters.get(lKey) ?? 1;
    const lDef = lvlMap?.get(l);
    let valStr = String(lVal);
    if (lDef && (lDef.numFmt.startsWith('chineseCounting') || lDef.numFmt === 'chineseLegalSimplified')) {
      valStr = toChineseNumber(lVal);
    } else if (lDef && lDef.numFmt === 'lowerLetter') {
      valStr = String.fromCharCode(96 + (((lVal - 1) % 26) + 1));
    } else if (lDef && lDef.numFmt === 'upperLetter') {
      valStr = String.fromCharCode(64 + (((lVal - 1) % 26) + 1));
    } else if (lDef && lDef.numFmt === 'lowerRoman') {
      const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
      valStr = romans[lVal - 1] || String(lVal);
    }
    text = text.replace(new RegExp(`%${l + 1}`, 'g'), valStr);
  }

  return text || '•';
}

// ---------------------------------------------------------------------------
// Run & Math Parsers
// ---------------------------------------------------------------------------

interface ParsedRun {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  color?: string;
  fontSize?: string;
  letterSpacing?: string;
  highlight?: string;
  vertAlign?: 'superscript' | 'subscript';
  fontFamily?: string;
  imageSrc?: string;
  mathHtml?: string;
}

function extractImageSrc(
  xmlFragment: string,
  relsMap?: Map<string, string>,
  entries?: Map<string, Uint8Array>
): string | undefined {
  if (!relsMap || !entries) return undefined;
  const blipMatch = xmlFragment.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/i);
  const vImgMatch = xmlFragment.match(/<v:imagedata\s+[^>]*r:id="([^"]+)"/i);
  const rId = blipMatch ? blipMatch[1] : vImgMatch ? vImgMatch[1] : null;
  if (!rId) return undefined;

  const targetPath = relsMap.get(rId);
  if (targetPath) {
    const bytes = getZipEntry(entries, targetPath);
    if (bytes) {
      const mime = getMediaMimeType(targetPath);
      return `data:${mime};base64,${fromByteArray(bytes)}`;
    }
  }
  return undefined;
}

function extractMathText(xmlFragment: string): string {
  const tMatches = xmlFragment.match(/<m:t(?:\s+[^>]*)?>([\s\S]*?)<\/m:t>/g) ?? [];
  if (tMatches.length === 0) {
    return escapeHtml(decodeXmlEntities(xmlFragment.replace(/<[^>]+>/g, ''))).trim();
  }
  return tMatches
    .map((t) => escapeHtml(decodeXmlEntities(t.replace(/<[^>]+>/g, ''))))
    .join(' ')
    .trim();
}

function parseMathFormula(mathXml: string): string {
  let res = mathXml;
  // Fractions <m:f>
  res = res.replace(
    /<m:f>[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/g,
    (_, num, den) => {
      const n = extractMathText(num);
      const d = extractMathText(den);
      return `<span class="pixory-docx-math-frac"><span class="pixory-docx-math-num">${n}</span><span class="pixory-docx-math-den">${d}</span></span>`;
    }
  );
  // Superscript <m:sSup>
  res = res.replace(
    /<m:sSup>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/g,
    (_, e, sup) => {
      return `${extractMathText(e)}<sup>${extractMathText(sup)}</sup>`;
    }
  );
  // Subscript <m:sSub>
  res = res.replace(
    /<m:sSub>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/g,
    (_, e, sub) => {
      return `${extractMathText(e)}<sub>${extractMathText(sub)}</sub>`;
    }
  );
  // Radical <m:rad>
  res = res.replace(/<m:rad>[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/g, (_, e) => {
    return `&radic;<span style="border-top:1px solid currentColor;padding:0 2px;">${extractMathText(e)}</span>`;
  });

  const parsed = extractMathText(res);
  return `<span class="pixory-docx-math">${parsed || escapeHtml(res.replace(/<[^>]+>/g, ''))}</span>`;
}

function parseRuns(
  paragraphXml: string,
  relsMap?: Map<string, string>,
  entries?: Map<string, Uint8Array>
): ParsedRun[] {
  // First, check for math formulas inside paragraph (<m:oMath>)
  const mathMatches = paragraphXml.match(/<m:oMath(?:\s+[^>]*)?>[\s\S]*?<\/m:oMath>/g) ?? [];
  const runs: ParsedRun[] = [];

  for (const mXml of mathMatches) {
    const mathHtml = parseMathFormula(mXml);
    const plainText = mXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    runs.push({
      text: plainText || ' [公式] ',
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      mathHtml,
    });
  }

  const runMatches = paragraphXml.match(/<w:r(?:\s+[^>]*)?>[\s\S]*?<\/w:r>/g) ?? [];

  for (const rXml of runMatches) {
    // Check for embedded drawing image
    const imageSrc = extractImageSrc(rXml, relsMap, entries);
    if (imageSrc) {
      runs.push({
        text: ' [插图] ',
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrike: false,
        imageSrc,
      });
      continue;
    }

    const rPrMatch = rXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[1] : '';

    const isBold = /<w:b(?:\s+w:val="(?:true|1)")?\s*\/>|<w:b\s*>/i.test(rPr);
    const isItalic = /<w:i(?:\s+w:val="(?:true|1)")?\s*\/>|<w:i\s*>/i.test(rPr);
    const isUnderline = /<w:u(?:\s+[^>]*val="[^none]"[^>]*)?\s*\/>/i.test(rPr);
    const isStrike = /<w:strike\s*\/>/i.test(rPr);

    const colorMatch = rPr.match(/<w:color\s+[^>]*w:val="([0-9a-fA-F]{6})"/i);
    const color = colorMatch ? `#${colorMatch[1]}` : undefined;

    // Font size: <w:sz w:val="28"/> -> 28 half-points = 14pt
    const szMatch = rPr.match(/<w:sz\s+[^>]*w:val="(\d+)"/i);
    const fontSize = szMatch ? `${parseInt(szMatch[1], 10) / 2}pt` : undefined;

    // Letter spacing: <w:spacing w:val="20"/> -> 20 twips = 1pt
    const spacingMatch = rPr.match(/<w:spacing\s+[^>]*w:val="(\d+)"/i);
    const letterSpacing = spacingMatch ? `${parseInt(spacingMatch[1], 10) / 20}pt` : undefined;

    // Highlight: <w:highlight w:val="yellow"/>
    const hlMatch = rPr.match(/<w:highlight\s+[^>]*w:val="([^"]+)"/i);
    const highlight = hlMatch && hlMatch[1] !== 'none' ? hlMatch[1] : undefined;

    // Vertical align (superscript / subscript)
    const vaMatch = rPr.match(/<w:vertAlign\s+[^>]*w:val="(superscript|subscript)"/i);
    const vertAlign = vaMatch ? (vaMatch[1].toLowerCase() as 'superscript' | 'subscript') : undefined;

    // Font family: <w:rFonts w:ascii="..." w:eastAsia="..."/>
    const rfMatch = rPr.match(/<w:rFonts\s+[^>]*w:(?:ascii|eastAsia)="([^"]+)"/i);
    const fontFamily = rfMatch ? rfMatch[1] : undefined;

    const tMatches = rXml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
    let text = '';
    for (const tNode of tMatches) {
      const rawText = tNode.replace(/<[^>]+>/g, '');
      text += decodeXmlEntities(rawText);
    }

    if (/<w:tab\s*\/>/i.test(rXml)) {
      text = `    ${text}`;
    }
    if (/<w:br\s*\/>/i.test(rXml)) {
      text = `${text}\n`;
    }

    if (text) {
      runs.push({
        text,
        isBold,
        isItalic,
        isUnderline,
        isStrike,
        color,
        fontSize,
        letterSpacing,
        highlight,
        vertAlign,
        fontFamily,
      });
    }
  }

  // Check drawing at paragraph level outside <w:r>
  if (runs.length === 0 || !runs.some((r) => r.imageSrc)) {
    const drawingMatches = paragraphXml.match(/<w:drawing[\s\S]*?<\/w:drawing>/g) ?? [];
    for (const dXml of drawingMatches) {
      const img = extractImageSrc(dXml, relsMap, entries);
      if (img) {
        runs.push({
          text: ' [插图] ',
          isBold: false,
          isItalic: false,
          isUnderline: false,
          isStrike: false,
          imageSrc: img,
        });
      }
    }
  }

  return runs;
}

function renderRunsToHtml(runs: ParsedRun[]): string {
  return runs
    .map((r) => {
      if (r.imageSrc) {
        return `<div class="pixory-docx-image-wrapper"><img src="${r.imageSrc}" class="pixory-docx-image" alt="插图" onerror="this.parentElement.style.display='none'" /></div>`;
      }
      if (r.mathHtml) {
        return r.mathHtml;
      }
      let content = escapeHtml(r.text);
      if (r.isBold) content = `<strong>${content}</strong>`;
      if (r.isItalic) content = `<em>${content}</em>`;
      if (r.isUnderline) content = `<u>${content}</u>`;
      if (r.isStrike) content = `<s>${content}</s>`;
      if (r.vertAlign === 'superscript') content = `<sup>${content}</sup>`;
      if (r.vertAlign === 'subscript') content = `<sub>${content}</sub>`;
      if (r.highlight) {
        const hlColor = r.highlight === 'yellow' ? 'rgba(255, 235, 59, 0.65)' : r.highlight;
        content = `<mark style="background-color:${hlColor};border-radius:2px;padding:0 2px;">${content}</mark>`;
      }
      const styles: string[] = [];
      if (r.color) styles.push(`color:${r.color}`);
      if (r.fontSize) styles.push(`font-size:${r.fontSize}`);
      if (r.letterSpacing) styles.push(`letter-spacing:${r.letterSpacing}`);
      if (r.fontFamily) styles.push(`font-family:'${r.fontFamily}', sans-serif`);
      if (styles.length > 0) {
        content = `<span style="${styles.join(';')}">${content}</span>`;
      }
      return content;
    })
    .join('');
}

function detectHeadingLevel(pPrXml: string): number | null {
  const styleMatch = pPrXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i);
  if (!styleMatch) return null;
  const val = styleMatch[1].toLowerCase().trim();

  if (/^(?:heading\s*1|title|1)$/i.test(val)) return 1;
  if (/^(?:heading\s*2|subtitle|2)$/i.test(val)) return 2;
  if (/^(?:heading\s*3|3)$/i.test(val)) return 3;
  if (/^(?:heading\s*4|4)$/i.test(val)) return 4;
  if (/^(?:heading\s*5|5)$/i.test(val)) return 5;
  if (/^(?:heading\s*6|6)$/i.test(val)) return 6;
  return null;
}

// ---------------------------------------------------------------------------
// Text Box & Shape Content Extraction (<w:txbxContent>)
// ---------------------------------------------------------------------------

function extractTextBoxCallouts(
  blockXml: string,
  relsMap?: Map<string, string>,
  entries?: Map<string, Uint8Array>
): string[] {
  const txbxMatches = blockXml.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g) ?? [];
  const callouts: string[] = [];

  for (const txbx of txbxMatches) {
    const pMatches = txbx.match(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
    const lines: string[] = [];
    for (const pXml of pMatches) {
      const runs = parseRuns(pXml, relsMap, entries);
      if (runs.length > 0) {
        lines.push(renderRunsToHtml(runs));
      }
    }
    if (lines.length > 0) {
      callouts.push(
        `<div class="pixory-docx-callout"><div class="pixory-docx-callout-body">${lines.join('<br/>')}</div></div>`
      );
    }
  }

  return callouts;
}

// ---------------------------------------------------------------------------
// Robust Top-Level Block Scanner with Nesting Depth Tracking
// ---------------------------------------------------------------------------

const RE_OPEN_P = /<w:p(?:[\s\/>])/g;
const RE_OPEN_TBL = /<w:tbl(?:[\s\/>])/g;
const RE_OPEN_SDT = /<w:sdt(?:[\s\/>])/g;

function findNextOpenTag(xml: string, tag: string, fromIdx: number): number {
  const re = tag === 'p' ? RE_OPEN_P : tag === 'tbl' ? RE_OPEN_TBL : tag === 'sdt' ? RE_OPEN_SDT : new RegExp(`<w:${tag}(?:[\\s\\/>])`, 'g');
  re.lastIndex = fromIdx;
  const m = re.exec(xml);
  return m ? m.index : -1;
}

function extractTopLevelBlocks(xml: string): string[] {
  const blocks: string[] = [];
  let i = 0;

  while (i < xml.length) {
    const nextP = findNextOpenTag(xml, 'p', i);
    const nextTbl = findNextOpenTag(xml, 'tbl', i);
    const nextSdt = findNextOpenTag(xml, 'sdt', i);

    const candidates = [
      { type: 'p', idx: nextP },
      { type: 'tbl', idx: nextTbl },
      { type: 'sdt', idx: nextSdt },
    ]
      .filter((c) => c.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (candidates.length === 0) break;
    const start = candidates[0].idx;
    const tag = candidates[0].type;
    const closeTag = `</w:${tag}>`;

    let depth = 0;
    let pos = start;
    let end = -1;

    while (pos < xml.length) {
      const nextOpen = findNextOpenTag(xml, tag, pos);
      const nextClose = xml.indexOf(closeTag, pos);
      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3 + tag.length;
      } else {
        depth--;
        pos = nextClose + closeTag.length;
        if (depth <= 0) {
          end = pos;
          break;
        }
      }
    }

    if (end !== -1) {
      const block = xml.substring(start, end);
      if (tag === 'sdt') {
        const sdtContentMatch = block.match(/<w:sdtContent>([\s\S]*?)<\/w:sdtContent>/);
        if (sdtContentMatch) {
          blocks.push(...extractTopLevelBlocks(sdtContentMatch[1]));
        }
      } else {
        blocks.push(block);
      }
      i = end;
    } else {
      i = start + 3 + tag.length;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Table Parser with Vertical Rowspan (vMerge) and Colgroup Widths
// ---------------------------------------------------------------------------

interface ParsedTableCell {
  text: string;
  html: string;
  colSpan: number;
  rowSpan: number;
  vMerge: 'restart' | 'continue' | null;
  skip: boolean;
  styles: string[];
}

function parseTableGridColWidths(tblXml: string): string[] {
  const gridMatch = tblXml.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/);
  if (!gridMatch) return [];
  const colMatches = gridMatch[1].match(/<w:gridCol\s+[^>]*w:w="(\d+)"/g) ?? [];
  const widths = colMatches.map((m) => {
    const val = m.match(/w:w="(\d+)"/);
    return val ? parseInt(val[1], 10) : 0;
  });
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return [];
  return widths.map((w) => `${((w / total) * 100).toFixed(1)}%`);
}

function parseTableBlock(
  tblXml: string,
  relsMap?: Map<string, string>,
  entries?: Map<string, Uint8Array>
): { html: string; text: string } {
  const colWidths = parseTableGridColWidths(tblXml);
  const colGroupHtml =
    colWidths.length > 0
      ? `<colgroup>${colWidths.map((w) => `<col style="width:${w};" />`).join('')}</colgroup>`
      : '';

  const trMatches = tblXml.match(/<w:tr(?:\s+[^>]*)?>[\s\S]*?<\/w:tr>/g) ?? [];
  const matrix: ParsedTableCell[][] = [];

  for (let rIdx = 0; rIdx < trMatches.length; rIdx++) {
    const trXml = trMatches[rIdx];
    const tcMatches = trXml.match(/<w:tc(?:\s+[^>]*)?>[\s\S]*?<\/w:tc>/g) ?? [];
    const row: ParsedTableCell[] = [];

    for (const tcXml of tcMatches) {
      const tcPrMatch = tcXml.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/);
      const tcPr = tcPrMatch ? tcPrMatch[1] : '';

      // Colspan / gridSpan
      const gridSpanMatch = tcPr.match(/<w:gridSpan\s+[^>]*w:val="(\d+)"/i);
      const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

      // vMerge state
      let vMerge: 'restart' | 'continue' | null = null;
      if (/<w:vMerge\s+[^>]*w:val="restart"/i.test(tcPr)) {
        vMerge = 'restart';
      } else if (/<w:vMerge(?:\s*\/>|\s+[^>]*w:val="continue")/i.test(tcPr) || /<w:vMerge\s*\/>/i.test(tcPr)) {
        vMerge = 'continue';
      }

      // Shading / Cell background color
      const shdMatch = tcPr.match(/<w:shd\s+[^>]*w:fill="([0-9a-fA-F]{6})"/i);
      const cellBg = shdMatch && shdMatch[1].toLowerCase() !== 'auto' ? `#${shdMatch[1]}` : undefined;

      // Vertical alignment
      const vAlignMatch = tcPr.match(/<w:vAlign\s+[^>]*w:val="([^"]+)"/i);
      const vAlign = vAlignMatch ? vAlignMatch[1].toLowerCase() : undefined;

      const styles: string[] = [];
      if (cellBg) styles.push(`background-color:${cellBg}`);
      if (vAlign) styles.push(`vertical-align:${vAlign}`);

      // Parse inner paragraphs
      const pMatches = tcXml.match(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
      const cellRunHtmls: string[] = [];
      const cellRunTexts: string[] = [];

      for (const pXml of pMatches) {
        const runs = parseRuns(pXml, relsMap, entries);
        if (runs.length > 0) {
          cellRunHtmls.push(renderRunsToHtml(runs));
          cellRunTexts.push(runs.map((r) => r.text).join(''));
        }
      }

      row.push({
        text: cellRunTexts.join(' ').trim(),
        html: cellRunHtmls.join('<br/>') || '&nbsp;',
        colSpan,
        rowSpan: 1,
        vMerge,
        skip: false,
        styles,
      });
    }

    if (row.length > 0) {
      matrix.push(row);
    }
  }

  // Pass 1: Build logical 2D grid to accurately track physical column alignment across colspans
  const grid: (ParsedTableCell | undefined)[][] = [];
  for (let r = 0; r < matrix.length; r++) {
    grid[r] = [];
  }
  for (let r = 0; r < matrix.length; r++) {
    let colIdx = 0;
    for (const cell of matrix[r]) {
      while (grid[r][colIdx] !== undefined) colIdx++;
      for (let s = 0; s < cell.colSpan; s++) {
        grid[r][colIdx + s] = cell;
      }
      colIdx += cell.colSpan;
    }
  }

  // Resolve vMerge spanning across rows in the logical column grid
  const totalLogicalCols = grid.reduce((max, r) => Math.max(max, r.length), 0);
  for (let c = 0; c < totalLogicalCols; c++) {
    for (let r = 0; r < grid.length; r++) {
      const cell = grid[r][c];
      if (cell && cell.vMerge === 'restart' && !cell.skip) {
        let span = 1;
        for (let nextR = r + 1; nextR < grid.length; nextR++) {
          const nextCell = grid[nextR][c];
          if (nextCell && nextCell.vMerge === 'continue') {
            span++;
            nextCell.skip = true;
          } else {
            break;
          }
        }
        cell.rowSpan = span;
      }
    }
  }

  // Pass 2: Render rows into HTML
  const rowsHtml: string[] = [];
  const rowsText: string[] = [];

  for (let r = 0; r < matrix.length; r++) {
    const isHeaderRow = r === 0;
    const tag = isHeaderRow ? 'th' : 'td';
    const cellsHtml: string[] = [];
    const cellsText: string[] = [];

    for (let c = 0; c < matrix[r].length; c++) {
      const cell = matrix[r][c];
      if (cell.skip) continue;

      const rAttr = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '';
      const cAttr = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
      const sAttr = cell.styles.length > 0 ? ` style="${cell.styles.join(';')}"` : '';

      cellsHtml.push(`<${tag}${rAttr}${cAttr}${sAttr}>${cell.html}</${tag}>`);
      if (cell.text) {
        cellsText.push(cell.text);
      }
    }

    if (cellsHtml.length > 0) {
      rowsHtml.push(`<tr>${cellsHtml.join('')}</tr>`);
      rowsText.push(cellsText.join(' | '));
    }
  }

  return {
    html: `<div class="pixory-docx-table-wrapper"><table class="pixory-docx-table">${colGroupHtml}<tbody>${rowsHtml.join('\n')}</tbody></table></div>`,
    text: rowsText.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Document Converter
// ---------------------------------------------------------------------------

function isLikelyCodeLine(line: string, fontFamily?: string, pStyle?: string): boolean {
  if (!line || !line.trim()) return false;
  const trimmed = line.trim();

  // 1. Monospaced font family
  if (fontFamily && /(?:consolas|courier|menlo|monaco|monospace|source\s*code)/i.test(fontFamily)) {
    return true;
  }

  // 2. Explicit style name
  if (pStyle && /(?:code|listing|preformatted|source)/i.test(pStyle)) {
    return true;
  }

  // 3. Syntax keywords
  if (
    /^(?:import\s+|package\s+|public\s+|private\s+|protected\s+|class\s+|abstract\s+|interface\s+|enum\s+|struct\s+|void\s+|return\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|case\s+|break;|default:|const\s+|let\s+|var\s+|function\s+|def\s+|\/\*|\/\/|\*|@\w+)/.test(
      trimmed
    )
  ) {
    return true;
  }

  // 4. Common variable declarations and type prefixes: String name, int count, boolean flag
  if (
    /^(?:boolean|byte|char|short|int|long|float|double|string|void|auto|val|final)\s+[a-zA-Z_$]/i.test(
      trimmed
    )
  ) {
    return true;
  }

  // 5. Line ends with semicolon, braces, or closing parenthesis
  if (/[;{}]$/.test(trimmed)) {
    return true;
  }

  // 6. Common code expressions (method calls, assignments, operators)
  if (
    /^(?:this\.|super\.|System\.out\.|console\.)/.test(trimmed) ||
    /(?:=|\!=|==|->|\.get\(|\.set\(|new\s+)/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function formatCodeBlock(lines: string[]): string {
  let braceDepth = 0;
  const formattedLines: string[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
        formattedLines.push('');
      }
      continue;
    }

    // Determine indent depth: if line begins with closing brace, indent it to outer scope
    const leadingCloses = trimmed.startsWith('}') || trimmed.startsWith(');') ? 1 : 0;
    const currentIndentDepth = Math.max(0, braceDepth - leadingCloses);

    // Preserve existing leading spaces if any (>=2); otherwise reconstruct auto-indent
    const leadingSpacesMatch = raw.match(/^[ \t]+/);
    let lineOut = '';
    if (leadingSpacesMatch && leadingSpacesMatch[0].length >= 2) {
      lineOut = escapeHtml(raw);
    } else {
      const indent = '    '.repeat(currentIndentDepth);
      lineOut = `${indent}${escapeHtml(trimmed)}`;
    }

    formattedLines.push(lineOut);

    // Adjust brace depth for subsequent lines
    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;
    braceDepth = Math.max(0, braceDepth + (opens - closes));
  }

  // Trim trailing blank lines
  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
    formattedLines.pop();
  }

  return `<pre class="pixory-docx-code-block"><code>${formattedLines.join('\n')}</code></pre>`;
}

export function convertDocxXmlToSemanticHtml(
  documentXml: string,
  entries?: Map<string, Uint8Array>
): ParsedDocxHtmlResult {
  const bodyMatch = documentXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : documentXml;

  // 1. Extract relationships
  let relsMap = new Map<string, string>();
  if (entries) {
    const relsBytes = getZipEntry(entries, 'word/_rels/document.xml.rels');
    if (relsBytes) {
      const textDecoder = new TextDecoder('utf-8');
      relsMap = parseDocxRels(textDecoder.decode(relsBytes));
    }
  }

  // 2. Extract numbering definitions
  let numberingState: NumberingState = {
    numToAbstract: new Map(),
    abstracts: new Map(),
    counters: new Map(),
  };
  if (entries) {
    const numBytes = getZipEntry(entries, 'word/numbering.xml');
    if (numBytes) {
      const textDecoder = new TextDecoder('utf-8');
      numberingState = parseNumberingXml(textDecoder.decode(numBytes));
    }
  }

  // 3. Extract top-level blocks with depth tracking
  const blocks = extractTopLevelBlocks(bodyXml);

  const pages: string[][] = [[]];
  const textParagraphs: string[] = [];
  const headings: Array<{ level: number; text: string }> = [];
  let paragraphCount = 0;
  let tableCount = 0;

  let inMultiColumn = false;
  const columnBuffer: string[] = [];
  const codeBlockBuffer: string[] = [];
  let currentBraceScope = 0;
  let pendingCodeBlankLines = 0;

  function currentFragmentTarget(): string[] {
    return pages[pages.length - 1];
  }

  function flushCodeBlock() {
    if (codeBlockBuffer.length > 0) {
      const codeHtml = formatCodeBlock(codeBlockBuffer);
      currentFragmentTarget().push(codeHtml);
      codeBlockBuffer.length = 0;
      currentBraceScope = 0;
      pendingCodeBlankLines = 0;
    }
  }

  function flushColumnBuffer() {
    flushCodeBlock();
    if (columnBuffer.length > 0) {
      currentFragmentTarget().push(`<div class="pixory-docx-multicolumn">${columnBuffer.join('\n')}</div>`);
      columnBuffer.length = 0;
    }
  }

  for (const blockXml of blocks) {
    // Check for explicit page breaks (<w:br w:type="page"/> or <w:lastRenderedPageBreak/> or <w:pageBreakBefore/>)
    const hasPageBreak =
      /<w:br\s+[^>]*w:type="page"/i.test(blockXml) ||
      /<w:lastRenderedPageBreak(?:\s|\/|>)/i.test(blockXml) ||
      /<w:pageBreakBefore(?:\s|\/|>)/i.test(blockXml);

    if (hasPageBreak && currentFragmentTarget().length > 0) {
      flushColumnBuffer();
      flushCodeBlock();
      pages.push([]);
    }

    if (blockXml.startsWith('<w:tbl')) {
      tableCount++;
      flushColumnBuffer();
      flushCodeBlock();
      const parsedTable = parseTableBlock(blockXml, relsMap, entries);
      if (parsedTable.html) {
        currentFragmentTarget().push(parsedTable.html);
      }
      if (parsedTable.text) {
        textParagraphs.push(parsedTable.text);
      }
    } else {
      // Paragraph <w:p>
      paragraphCount++;
      const pPrMatch = blockXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
      const pPrXml = pPrMatch ? pPrMatch[1] : '';

      // Check section multi-column layout
      const colsMatch = pPrXml.match(/<w:cols\s+[^>]*w:num="([2-4])"/i);
      if (colsMatch) {
        inMultiColumn = true;
      } else if (pPrXml.includes('<w:sectPr') && !pPrXml.includes('w:cols')) {
        inMultiColumn = false;
        flushColumnBuffer();
      }

      const headingLevel = detectHeadingLevel(pPrXml);

      // Check list numbering (<w:numPr>)
      const numPrMatch = pPrXml.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/);
      let listPrefix: string | null = null;
      let listIndentLevel = 0;
      if (numPrMatch) {
        const ilvlMatch = numPrMatch[1].match(/<w:ilvl\s+[^>]*w:val="(\d+)"/i);
        const numIdMatch = numPrMatch[1].match(/<w:numId\s+[^>]*w:val="(\d+)"/i);
        const ilvl = ilvlMatch ? parseInt(ilvlMatch[1], 10) : 0;
        listIndentLevel = ilvl;
        if (numIdMatch) {
          listPrefix = formatListNumber(numberingState, numIdMatch[1], ilvl);
        } else {
          listPrefix = '•';
        }
      }

      // Check blockquote border (<w:pBdr><w:left>)
      const hasQuoteBorder = /<w:pBdr>[\s\S]*?<w:left/i.test(pPrXml);

      // Paragraph layout styles
      const jcMatch = pPrXml.match(/<w:jc\s+[^>]*w:val="([^"]+)"/i);
      let alignStyle = '';
      const jc = jcMatch ? jcMatch[1].toLowerCase() : '';
      if (jc === 'center') alignStyle = 'text-align:center;';
      else if (jc === 'right') alignStyle = 'text-align:right;';
      else if (jc === 'both' || jc === 'justify') alignStyle = 'text-align:justify;';

      const indMatch = pPrXml.match(/<w:ind\s+[^>]*w:(?:firstLine|firstLineChars)="(\d+)"/i);
      let indentStyle = '';
      if (indMatch && jc !== 'center' && headingLevel === null && !listPrefix) {
        const val = parseInt(indMatch[1], 10);
        if (val >= 200 || indMatch[0].includes('firstLineChars')) {
          indentStyle = 'text-indent:2em;';
        }
      }

      // Left indent (w:left in twips)
      const leftIndMatch = pPrXml.match(/<w:ind\s+[^>]*w:left="(\d+)"/i);
      let leftMarginStyle = '';
      if (leftIndMatch && headingLevel === null && !listPrefix) {
        const twips = parseInt(leftIndMatch[1], 10);
        const px = Math.min(60, Math.round((twips / 20) * 1.333));
        if (px > 0) {
          leftMarginStyle = `padding-left:${px}px;`;
        }
      }

      const spacingMatch = pPrXml.match(/<w:spacing\s+[^>]*w:line="(\d+)"/i);
      let lineSpacingStyle = '';
      if (spacingMatch) {
        const lineVal = parseInt(spacingMatch[1], 10);
        if (lineVal > 0) {
          lineSpacingStyle = `line-height:${(lineVal / 240).toFixed(2)};`;
        }
      }

      const pStyles = [alignStyle, indentStyle, leftMarginStyle, lineSpacingStyle].filter(Boolean).join('');
      const pStyleAttr = pStyles ? ` style="${pStyles}"` : '';

      // Check text box callouts
      const callouts = extractTextBoxCallouts(blockXml, relsMap, entries);

      const runs = parseRuns(blockXml, relsMap, entries);
      const fullText = runs.map((r) => r.text).join('');
      const trimmedText = fullText.trim();
      const runHtml = renderRunsToHtml(runs);

      if (!trimmedText && callouts.length === 0) {
        // If inside an open code scope, keep empty line in code
        if (currentBraceScope > 0 && codeBlockBuffer.length > 0) {
          codeBlockBuffer.push('');
        } else if (codeBlockBuffer.length > 0) {
          pendingCodeBlankLines++;
        }
        continue;
      }

      if (trimmedText) {
        textParagraphs.push(trimmedText);
      }

      // Check font family or pStyle for code detection
      const firstFont = runs.find((r) => r.fontFamily)?.fontFamily;
      const pStyleVal = pPrXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i)?.[1];

      // Code Block State Machine
      const isCode =
        headingLevel === null &&
        !listPrefix &&
        !hasQuoteBorder &&
        (isLikelyCodeLine(trimmedText, firstFont, pStyleVal) ||
          (currentBraceScope > 0 && trimmedText.length < 120));

      if (isCode) {
        if (pendingCodeBlankLines > 0) {
          codeBlockBuffer.push('');
          pendingCodeBlankLines = 0;
        }
        codeBlockBuffer.push(fullText);
        const opens = (trimmedText.match(/\{/g) ?? []).length;
        const closes = (trimmedText.match(/\}/g) ?? []).length;
        currentBraceScope = Math.max(0, currentBraceScope + (opens - closes));
        continue;
      } else {
        pendingCodeBlankLines = 0;
        flushCodeBlock();
      }

      let fragment = '';
      if (headingLevel !== null) {
        headings.push({ level: headingLevel, text: trimmedText });
        fragment = `<h${headingLevel} class="pixory-docx-h${headingLevel}"${pStyleAttr}>${runHtml}</h${headingLevel}>`;
      } else if (listPrefix) {
        const indentMargin = listIndentLevel > 0 ? ` style="margin-left:${(listIndentLevel * 1.5).toFixed(1)}em;"` : '';
        fragment = `<div class="pixory-docx-list-item"${indentMargin}><span class="pixory-docx-num-badge">${escapeHtml(listPrefix)}</span><span class="pixory-docx-list-content">${runHtml}</span></div>`;
      } else if (hasQuoteBorder) {
        fragment = `<blockquote class="pixory-docx-blockquote"${pStyleAttr}><p>${runHtml}</p></blockquote>`;
      } else {
        fragment = `<p class="pixory-docx-p"${pStyleAttr}>${runHtml}</p>`;
      }

      if (callouts.length > 0) {
        fragment = `${callouts.join('\n')}\n${fragment}`;
      }

      if (inMultiColumn) {
        columnBuffer.push(fragment);
      } else {
        currentFragmentTarget().push(fragment);
      }
    }
  }

  flushColumnBuffer();
  flushCodeBlock();

  // Remove trailing empty pages if any
  const nonEmptyPages = pages.filter((p) => p.length > 0);
  const totalPages = Math.max(1, nonEmptyPages.length);

  // Wrap each page in A4 paper sheet container (.pixory-docx-page)
  const renderedPagesHtml = nonEmptyPages.map((pageFragments, pageIdx) => {
    const pageNum = pageIdx + 1;
    const footerHtml =
      totalPages > 1
        ? `<div class="pixory-docx-page-footer">第 ${pageNum} 页 / 共 ${totalPages} 页</div>`
        : '';
    return `<div class="pixory-docx-page" data-page="${pageNum}">
      <div class="pixory-docx-page-content">
        ${pageFragments.join('\n')}
      </div>
      ${footerHtml}
    </div>`;
  });

  const finalHtml = renderedPagesHtml.join('\n');

  // Fallback: If no blocks were matched, extract bare text from documentXml
  let resolvedHtml = finalHtml;
  if (!resolvedHtml || !resolvedHtml.trim()) {
    const rawMatches = documentXml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
    const bareTexts = rawMatches
      .map((n) => decodeXmlEntities(n.replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean);
    const fallbackFragments: string[] = [];
    for (const t of bareTexts) {
      textParagraphs.push(t);
      fallbackFragments.push(`<p class="pixory-docx-p">${escapeHtml(t)}</p>`);
    }
    resolvedHtml = `<div class="pixory-docx-page" data-page="1"><div class="pixory-docx-page-content">${fallbackFragments.join('\n')}</div></div>`;
  }

  return {
    html: resolvedHtml,
    text: textParagraphs.join('\n\n'),
    headings,
    paragraphCount,
    tableCount,
  };
}

function isOle2Binary(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

function extractTextFromOle2Doc(bytes: Uint8Array): string[] {
  const extracted: string[] = [];
  let i = 0;
  while (i < bytes.length - 3) {
    const chars: string[] = [];
    while (i < bytes.length - 1) {
      const low = bytes[i];
      const high = bytes[i + 1];
      const code = (high << 8) | low;
      const isAsciiPrintable = high === 0 && ((low >= 32 && low <= 126) || low === 10 || low === 13);
      const isCjk =
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3000 && code <= 0x303f) ||
        (code >= 0xff00 && code <= 0xffef);
      if (isAsciiPrintable || isCjk) {
        chars.push(String.fromCharCode(code));
        i += 2;
      } else {
        break;
      }
    }
    if (chars.length >= 3) {
      const str = chars.join('').trim();
      if (
        str &&
        !/^(?:WordDocument|Times New Roman|Arial|Calibri|SimSun|Songti|Microsoft|Normal|Heading)$/i.test(
          str
        )
      ) {
        extracted.push(str);
      }
    }
    i += 2;
  }
  return extracted;
}

export async function parseDocxToHtml(input: {
  fileUri: string;
  space: PixorySpace;
}): Promise<ParsedDocxHtmlResult> {
  const bytes = await readFileBytes(input.fileUri);

  // 1. 若为旧版 Office 97-2003 二进制格式 (.doc)，提取可读文本
  if (isOle2Binary(bytes)) {
    const lines = extractTextFromOle2Doc(bytes);
    const html = lines.map((l) => `<p class="pixory-docx-p">${escapeHtml(l)}</p>`).join('\n');
    return {
      html: html || '<p class="pixory-docx-p">（旧版 .doc 格式未提取到明文文本，建议使用外部办公应用打开）</p>',
      text: lines.join('\n\n'),
      headings: [],
      paragraphCount: lines.length,
      tableCount: 0,
    };
  }

  const adapter = new NodeDocxZipAdapter();
  const entries = await adapter.readEntries(bytes);

  const docXmlBytes = getZipEntry(entries, 'word/document.xml');
  if (!docXmlBytes) {
    throw new Error('未找到 word/document.xml，文件可能不是有效的 DOCX 文档');
  }

  const textDecoder = new TextDecoder('utf-8');
  const documentXml = textDecoder.decode(docXmlBytes);
  return convertDocxXmlToSemanticHtml(documentXml, entries);
}

export async function parseDocxText(input: {
  fileUri: string;
  space: PixorySpace;
}): Promise<ParsedDocumentText> {
  try {
    const res = await parseDocxToHtml(input);
    return {
      text: res.text,
      metadata: {
        parser: 'docx',
        paragraphCount: res.paragraphCount,
        tableCount: res.tableCount,
        headingCount: res.headings.length,
        noExtractableText: res.text.trim().length === 0,
      },
    };
  } catch (error) {
    return {
      text: '',
      metadata: {
        parser: 'docx',
        failed: true,
        message: error instanceof Error ? error.message : 'DOCX parsing failed',
      },
    };
  }
}
