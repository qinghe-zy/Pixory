import { fromByteArray, toByteArray } from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';

import type { PixorySpace } from '../../database';
import { NodeDocxZipAdapter } from '../../services/sandbox/docx/docxZipAdapter';
import type { ParsedDocumentText } from './textParser';

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

export function parseSlideRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relMatches = relsXml.match(/<Relationship\s+[^>]*\/>/g) ?? [];
  for (const rel of relMatches) {
    const idMatch = rel.match(/Id="([^"]+)"/i);
    const targetMatch = rel.match(/Target="([^"]+)"/i);
    if (idMatch && targetMatch) {
      let target = targetMatch[1].replace(/\\/g, '/');
      if (target.startsWith('../')) {
        target = target.replace(/^\.\.\//, 'ppt/');
      } else if (!target.startsWith('ppt/') && !target.startsWith('/')) {
        target = `ppt/slides/${target}`;
      }
      map.set(idMatch[1], target);
    }
  }
  return map;
}

export function isOle2Binary(bytes: Uint8Array): boolean {
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

export function extractTextFromOle2Binary(bytes: Uint8Array): PptxSlide[] {
  const extractedLines: string[] = [];
  const minRunLength = 2;

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

    if (chars.length >= minRunLength) {
      const str = chars.join('').trim();
      if (
        str &&
        !/^(?:PowerPoint|Times New Roman|Arial|Calibri|SimSun|Songti|Microsoft|Wingdings|Tahoma)$/i.test(
          str
        )
      ) {
        extractedLines.push(str);
      }
    }
    i += 2;
  }

  const uniqueLines: string[] = [];
  for (const line of extractedLines) {
    if (uniqueLines.length === 0 || uniqueLines[uniqueLines.length - 1] !== line) {
      if (line.length > 1) {
        uniqueLines.push(line);
      }
    }
  }

  if (uniqueLines.length === 0) {
    return [
      {
        index: 1,
        title: '旧版 PowerPoint (PPT) 演示文稿',
        paragraphs: [
          '该文件为 Office 97-2003 二进制格式 (.ppt)，未提取到明文文本，建议在右上角菜单中选择使用外部办公应用打开。',
        ],
        tables: [],
      },
    ];
  }

  const slides: PptxSlide[] = [];
  const linesPerSlide = 8;
  for (let sIdx = 0; sIdx < uniqueLines.length; sIdx += linesPerSlide) {
    const chunk = uniqueLines.slice(sIdx, sIdx + linesPerSlide);
    const slideNumber = Math.floor(sIdx / linesPerSlide) + 1;
    slides.push({
      index: slideNumber,
      title: chunk[0] || `幻灯片 ${slideNumber}`,
      paragraphs: chunk,
      tables: [],
    });
  }

  return slides;
}

function isDarkHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// ---------------------------------------------------------------------------
// Theme Palette & Color Resolution (ppt/theme/theme1.xml)
// ---------------------------------------------------------------------------

export function getDefaultThemeMap(): Map<string, string> {
  const map = new Map<string, string>();
  map.set('dk1', '#000000');
  map.set('lt1', '#FFFFFF');
  map.set('dk2', '#1F497D');
  map.set('lt2', '#EEECE1');
  map.set('accent1', '#70AD47'); // Default PPT modern green
  map.set('accent2', '#ED7D31');
  map.set('accent3', '#A5A5A5');
  map.set('accent4', '#FFC000');
  map.set('accent5', '#4472C4');
  map.set('accent6', '#70AD47');
  map.set('hlink', '#0563C1');
  map.set('folHlink', '#954F72');
  return map;
}

export function parseThemeColors(themeXml: string): Map<string, string> {
  const map = getDefaultThemeMap();
  const clrSchemeMatch = themeXml.match(/<a:clrScheme\s+[^>]*>([\s\S]*?)<\/a:clrScheme>/i);
  if (!clrSchemeMatch) return map;
  const content = clrSchemeMatch[1];

  const keys = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  for (const key of keys) {
    const nodeMatch = content.match(new RegExp(`<a:${key}>([\\s\\S]*?)<\\/a:${key}>`, 'i'));
    if (nodeMatch) {
      const inner = nodeMatch[1];
      const srgb = inner.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
      if (srgb) {
        map.set(key, `#${srgb[1]}`);
      } else {
        const sys = inner.match(/<a:sysClr\s+[^>]*lastClr="([0-9a-fA-F]{6})"/i);
        if (sys) {
          map.set(key, `#${sys[1]}`);
        }
      }
    }
  }
  return map;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let val = t;
      if (val < 0) val += 1;
      if (val > 1) val -= 1;
      if (val < 1 / 6) return p + (q - p) * 6 * val;
      if (val < 1 / 2) return q;
      if (val < 2 / 3) return p + (q - p) * (2 / 3 - val) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function parseClrMap(xml: string): Record<string, string> {
  const map: Record<string, string> = {};
  const match = xml.match(/<p:clrMap\s+([^>]+)\/?>/i);
  if (!match) return map;
  const attrs = match[1];
  const attrRegex = /(\w+)="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrs)) !== null) {
    map[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return map;
}

export function resolveColorFromXml(
  xml: string,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): string | undefined {
  let hex: string | undefined = undefined;

  const srgbMatch = xml.match(/<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
  if (srgbMatch) {
    hex = `#${srgbMatch[1]}`;
  } else {
    const schemeMatch = xml.match(/<a:schemeClr\s+val="([^"]+)"/i);
    if (schemeMatch) {
      let key = schemeMatch[1].toLowerCase();
      if (clrMap && clrMap[key]) {
        key = clrMap[key].toLowerCase();
      }
      hex = themeMap.get(key) || '#70AD47';
    }
  }

  if (!hex) return undefined;

  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);

  // Check lumMod / lumOff / tint / shade in HSL space
  const lumModMatch = xml.match(/<a:lumMod\s+val="(\d+)"/i);
  const lumOffMatch = xml.match(/<a:lumOff\s+val="(\d+)"/i);
  const tintMatch = xml.match(/<a:tint\s+val="(\d+)"/i);
  const shadeMatch = xml.match(/<a:shade\s+val="(\d+)"/i);

  if (lumModMatch || lumOffMatch || tintMatch || shadeMatch) {
    let [h, s, l] = rgbToHsl(r, g, b);
    if (lumModMatch) {
      const mod = parseInt(lumModMatch[1], 10) / 100000;
      l = l * mod;
    }
    if (lumOffMatch) {
      const off = parseInt(lumOffMatch[1], 10) / 100000;
      l = Math.min(1, l + off);
    }
    if (tintMatch) {
      const tint = parseInt(tintMatch[1], 10) / 100000;
      l = l * tint + (1 - tint);
    }
    if (shadeMatch) {
      const shade = parseInt(shadeMatch[1], 10) / 100000;
      l = l * shade;
    }
    [r, g, b] = hslToRgb(h, s, Math.max(0, Math.min(1, l)));
  }

  // Check alpha: <a:alpha val="60000"/> -> 60%
  const alphaMatch = xml.match(/<a:alpha\s+val="(\d+)"/i);
  if (alphaMatch) {
    const val = parseInt(alphaMatch[1], 10);
    const alpha = Math.max(0, Math.min(1, val / 100000));
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function resolveShapeFillStyle(
  spXml: string,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): string | undefined {
  const rawSpPr = spXml.match(/<p:spPr(?:\s+[^>]*)?>([\s\S]*?)<\/p:spPr>/i)?.[1] ?? spXml;

  // 物理剔除 <a:ln>（边框）与 <a:effectLst>（阴影效果），防止误抓里面的边框/效果色
  const cleanSpPr = rawSpPr
    .replace(/<a:ln\b[\s\S]*?<\/a:ln>/gi, '')
    .replace(/<a:ln\b[^>]*\/>/gi, '')
    .replace(/<a:effectLst\b[\s\S]*?<\/a:effectLst>/gi, '');

  if (/<a:noFill\s*\/>/i.test(cleanSpPr)) return undefined;

  // 优先级 1：直接纯色填充
  const solidFill = cleanSpPr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/i);
  if (solidFill) {
    return resolveColorFromXml(solidFill[1], themeMap, clrMap);
  }

  // 优先级 2：渐变填充（还原多色标线性渐变）
  const gradFill = cleanSpPr.match(/<a:gradFill(?:\s+[^>]*)?>([\s\S]*?)<\/a:gradFill>/i);
  if (gradFill) {
    const stops: string[] = [];
    const gsRegex = /<a:gs\s+[^>]*pos="(\d+)"[^>]*>([\s\S]*?)<\/a:gs>/gi;
    let match: RegExpExecArray | null;
    while ((match = gsRegex.exec(gradFill[1])) !== null) {
      const pos = Math.round(parseInt(match[1], 10) / 1000);
      const col = resolveColorFromXml(match[2], themeMap, clrMap);
      if (col) stops.push(`${col} ${pos}%`);
    }
    if (stops.length >= 2) {
      const linMatch = gradFill[1].match(/<a:lin\s+[^>]*ang="(\d+)"/i);
      const deg = linMatch ? (Math.round(parseInt(linMatch[1], 10) / 60000) + 90) % 360 : 135;
      return `linear-gradient(${deg}deg, ${stops.join(', ')})`;
    } else if (stops.length === 1) {
      return stops[0].split(' ')[0];
    }
  }

  // 优先级 3：提取 <p:style><a:fillRef idx="...">（idx="0" 代表无填充）
  const styleMatch = spXml.match(/<p:style>([\s\S]*?)<\/p:style>/i);
  if (styleMatch) {
    const fillRef = styleMatch[1].match(/<a:fillRef\s+[^>]*idx="(\d+)"[^>]*>([\s\S]*?)<\/a:fillRef>/i);
    if (fillRef && fillRef[1] !== '0') {
      return resolveColorFromXml(fillRef[2], themeMap, clrMap);
    }
  }

  return undefined;
}

export function resolveShapeStrokeColor(
  spXml: string,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): string | undefined {
  const lnMatch = spXml.match(/<a:ln\b[\s\S]*?>([\s\S]*?)<\/a:ln>/i);
  if (!lnMatch) return undefined;
  if (/<a:noFill\s*\/>/i.test(lnMatch[1])) return undefined;
  return resolveColorFromXml(lnMatch[1], themeMap, clrMap);
}

// ---------------------------------------------------------------------------
// 2D Spatial Geometry Engine Types & Coordinate Resolution
// ---------------------------------------------------------------------------

export interface PptxSpatialBox {
  left: string;
  top: string;
  width: string;
  height: string;
}

export interface PptxSpatialElement {
  type: 'text' | 'image' | 'table' | 'shape';
  box?: PptxSpatialBox;
  bg?: string;
  borderColor?: string;
  html: string;
  zIndex?: number;
}

export interface PptxSlide {
  index: number;
  title: string;
  paragraphs: string[];
  tables: string[][][];
  images?: string[];
  bgColor?: string;
  notes?: string;
  spatialElements?: PptxSpatialElement[];
  aspectRatio?: string;
  logicalWidth?: number;
  logicalHeight?: number;
}

export interface ParsedPptxResult {
  text: string;
  slides: PptxSlide[];
  slideCount: number;
  aspectRatio?: string;
  logicalWidth?: number;
  logicalHeight?: number;
  metadata: {
    parser: 'pptx';
    format?: 'legacy_ppt' | 'ooxml_pptx';
    slideCount: number;
    paragraphCount: number;
    noExtractableText: boolean;
    failed?: boolean;
    message?: string;
  };
}

export function parsePresentationDimensions(presentationXml: string): {
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  aspectRatio: string;
} {
  let cx = 12192000;
  let cy = 6858000;

  const cxMatch = presentationXml.match(/<p:sldSz\s+[^>]*cx="(\d+)"/i);
  const cyMatch = presentationXml.match(/<p:sldSz\s+[^>]*cy="(\d+)"/i);
  if (cxMatch && cyMatch) {
    const parsedCx = parseInt(cxMatch[1], 10);
    const parsedCy = parseInt(cyMatch[1], 10);
    if (parsedCx > 0 && parsedCy > 0) {
      cx = parsedCx;
      cy = parsedCy;
    }
  }

  // Exact mathematical alignment: 1pt = 12700 EMU -> logical width in pt (1px = 1pt on canvas)
  const logicalWidth = Math.round(cx / 12700);
  const logicalHeight = Math.round(cy / 12700);

  const ratio = cx / cy;
  let aspectRatio = '16 / 9';
  if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16 / 9';
  else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4 / 3';
  else if (Math.abs(ratio - 16 / 10) < 0.1) aspectRatio = '16 / 10';
  else aspectRatio = `${logicalWidth} / ${logicalHeight}`;

  return { width: cx, height: cy, logicalWidth, logicalHeight, aspectRatio };
}

export function parseSpatialBox(
  xfrmXml: string,
  slideWidth: number,
  slideHeight: number
): PptxSpatialBox | undefined {
  const xMatch = xfrmXml.match(/<a:off\s+[^>]*x="(-?\d+)"/i);
  const yMatch = xfrmXml.match(/<a:off\s+[^>]*y="(-?\d+)"/i);
  const cxMatch = xfrmXml.match(/<a:ext\s+[^>]*cx="(\d+)"/i);
  const cyMatch = xfrmXml.match(/<a:ext\s+[^>]*cy="(\d+)"/i);

  if (!xMatch || !yMatch || !cxMatch || !cyMatch) return undefined;

  const x = parseInt(xMatch[1], 10);
  const y = parseInt(yMatch[1], 10);
  const cx = parseInt(cxMatch[1], 10);
  const cy = parseInt(cyMatch[1], 10);

  if (cx <= 0 || cy <= 0) return undefined;

  const left = Math.max(0, Math.min(100, (x / slideWidth) * 100));
  const top = Math.max(0, Math.min(100, (y / slideHeight) * 100));
  const width = Math.max(0.5, Math.min(100, (cx / slideWidth) * 100));
  const height = Math.max(0.5, Math.min(100, (cy / slideHeight) * 100));

  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
    width: `${width.toFixed(2)}%`,
    height: `${height.toFixed(2)}%`,
  };
}

// ---------------------------------------------------------------------------
// SVG & Custom Vector Geometry Rendering
// ---------------------------------------------------------------------------

function generateSvgForShape(
  prst: string | undefined,
  custGeomXml: string | undefined,
  fillColor: string,
  strokeColor?: string
): string | undefined {
  let fillAttr = `fill="${fillColor}"`;
  let defsHtml = '';

  if (fillColor.startsWith('linear-gradient')) {
    const gradId = `shapeGrad_${Math.random().toString(36).substring(2, 8)}`;
    const stopsMatch = fillColor.match(/linear-gradient\((?:(\d+)deg,\s*)?([\s\S]*)\)/);
    if (stopsMatch) {
      const stopsStr = stopsMatch[2];
      const stopParts = stopsStr.split(/,\s*(?=[a-zA-Z#])/);
      let stopsXml = '';
      for (const sp of stopParts) {
        const lastSpace = sp.lastIndexOf(' ');
        if (lastSpace !== -1) {
          const c = sp.substring(0, lastSpace).trim();
          const p = sp.substring(lastSpace + 1).trim();
          stopsXml += `<stop offset="${p}" stop-color="${c}"/>`;
        }
      }
      defsHtml = `<defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">${stopsXml}</linearGradient></defs>`;
      fillAttr = `fill="url(#${gradId})"`;
    }
  }

  if (custGeomXml) {
    const pathMatch = custGeomXml.match(/<a:path\s+[^>]*w="(\d+)"\s+h="(\d+)"/i);
    const w = pathMatch ? parseInt(pathMatch[1], 10) : 100;
    const h = pathMatch ? parseInt(pathMatch[2], 10) : 100;

    const dCommands: string[] = [];
    const moveMatches = custGeomXml.match(/<a:moveTo>\s*<a:pt\s+x="(-?\d+)"\s+y="(-?\d+)"/g) ?? [];
    for (const m of moveMatches) {
      const match = m.match(/x="(-?\d+)"\s+y="(-?\d+)"/);
      if (match) dCommands.push(`M ${match[1]} ${match[2]}`);
    }
    const lineMatches = custGeomXml.match(/<a:lnTo>\s*<a:pt\s+x="(-?\d+)"\s+y="(-?\d+)"/g) ?? [];
    for (const l of lineMatches) {
      const match = l.match(/x="(-?\d+)"\s+y="(-?\d+)"/);
      if (match) dCommands.push(`L ${match[1]} ${match[2]}`);
    }
    if (custGeomXml.includes('<a:close/>') || custGeomXml.includes('<a:close />')) {
      dCommands.push('Z');
    }

    if (dCommands.length > 0) {
      const strokeAttr = strokeColor ? ` stroke="${strokeColor}" stroke-width="1"` : '';
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${defsHtml}<path d="${dCommands.join(' ')}" ${fillAttr}${strokeAttr}/></svg>`;
    }
  }

  if (prst === 'rtTriangle') {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${defsHtml}<polygon points="0,0 100,0 0,100" ${fillAttr}/></svg>`;
  } else if (prst === 'triangle') {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${defsHtml}<polygon points="50,0 100,100 0,100" ${fillAttr}/></svg>`;
  } else if (prst === 'parallelogram') {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${defsHtml}<polygon points="25,0 100,0 75,100 0,100" ${fillAttr}/></svg>`;
  }

  return undefined;
}

function parsePptxParagraphsHtml(
  txBodyXml: string,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): { html: string; text: string } {
  const pMatches = txBodyXml.match(/<a:p(?:\s+[^>]*)?>[\s\S]*?<\/a:p>/g) ?? [];
  const linesHtml: string[] = [];
  const linesText: string[] = [];

  // 检查 bodyPr 中的自动缩字 (normAutofit)
  let fontScale = 1.0;
  const normAutofitMatch = txBodyXml.match(/<a:normAutofit(?:\s+[^>]*fontScale="(\d+)")?[^>]*\/?>/i);
  if (normAutofitMatch) {
    if (normAutofitMatch[1]) {
      fontScale = parseInt(normAutofitMatch[1], 10) / 100000;
    } else {
      // 空标签 <a:normAutofit/> 预收敛系数 0.88
      fontScale = 0.88;
    }
  }

  for (const pXml of pMatches) {
    const pPrMatch = pXml.match(/<a:pPr>([\s\S]*?)<\/a:pPr>/);
    const pPr = pPrMatch ? pPrMatch[1] : '';

    const algnMatch = pPr.match(/algn="(ctr|r|just|l)"/i);
    let align = 'left';
    if (algnMatch) {
      if (algnMatch[1] === 'ctr') align = 'center';
      else if (algnMatch[1] === 'r') align = 'right';
      else if (algnMatch[1] === 'just') align = 'justify';
    }

    const lvlMatch = pPr.match(/lvl="(\d+)"/i);
    const lvl = lvlMatch ? parseInt(lvlMatch[1], 10) : 0;
    const indentStyle = lvl > 0 ? `padding-left:${lvl * 1.2}em;` : '';

    const rMatches = pXml.match(/<a:r(?:\s+[^>]*)?>[\s\S]*?<\/a:r>/g) ?? [];
    const runSpans: string[] = [];
    const runTexts: string[] = [];

    for (const rXml of rMatches) {
      const rPrMatch = rXml.match(/<a:rPr\s+([\s\S]*?)(?:\/?>|<\/a:rPr>)/);
      const rPr = rPrMatch ? rPrMatch[1] : '';

      // Direct logical canvas pt to px alignment (1px == 1pt) with normAutofit scaling
      const szMatch = rPr.match(/sz="(\d+)"/i);
      const isTitleShape = /type="(?:title|ctrTitle)"/i.test(txBodyXml);
      const defaultPt = isTitleShape ? 28 : 16.5;
      const rawSz = szMatch ? parseInt(szMatch[1], 10) : defaultPt * 100;
      const effectivePx = Math.max(11, Math.round((rawSz / 100) * fontScale));
      const fontSize = `${effectivePx}px`;

      const isBold = /b="1"/i.test(rPr);
      const isItalic = /i="1"/i.test(rPr);

      const color = resolveColorFromXml(rPr, themeMap, clrMap);

      const tMatches = rXml.match(/<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/g) ?? [];
      let text = '';
      for (const tNode of tMatches) {
        text += decodeXmlEntities(tNode.replace(/<[^>]+>/g, ''));
      }

      if (text) {
        let content = escapeHtml(text);
        if (isBold) content = `<strong>${content}</strong>`;
        if (isItalic) content = `<em>${content}</em>`;

        const styles: string[] = [];
        if (color) styles.push(`color:${color}`);
        if (fontSize) styles.push(`font-size:${fontSize}`);

        const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';
        runSpans.push(`<span${styleAttr}>${content}</span>`);
        runTexts.push(text);
      }
    }

    if (runSpans.length > 0) {
      const pStyle = `text-align:${align};${indentStyle}`;
      linesHtml.push(`<div class="pptx-p" style="${pStyle}">${runSpans.join('')}</div>`);
      linesText.push(runTexts.join(''));
    }
  }

  return {
    html: linesHtml.join(''),
    text: linesText.join(' '),
  };
}

// ---------------------------------------------------------------------------
// Group Shape Recursive Matrix Unrolling (<p:grpSp>)
// ---------------------------------------------------------------------------

function parseGroupShapes(
  grpXml: string,
  slideWidth: number,
  slideHeight: number,
  relsMap: Map<string, string>,
  entries: Map<string, Uint8Array>,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): PptxSpatialElement[] {
  const elements: PptxSpatialElement[] = [];
  const xfrmMatch = grpXml.match(/<p:grpSpPr>[\s\S]*?<a:xfrm>([\s\S]*?)<\/a:xfrm>/i);
  if (!xfrmMatch) return elements;

  const grpXfrm = xfrmMatch[1];
  const offMatch = grpXfrm.match(/<a:off\s+[^>]*x="(-?\d+)"\s+y="(-?\d+)"/i);
  const extMatch = grpXfrm.match(/<a:ext\s+[^>]*cx="(\d+)"\s+cy="(\d+)"/i);
  const chOffMatch = grpXfrm.match(/<a:chOff\s+[^>]*x="(-?\d+)"\s+y="(-?\d+)"/i);
  const chExtMatch = grpXfrm.match(/<a:chExt\s+[^>]*cx="(\d+)"\s+cy="(\d+)"/i);

  if (!offMatch || !extMatch) return elements;

  const grpX = parseInt(offMatch[1], 10);
  const grpY = parseInt(offMatch[2], 10);
  const grpCx = parseInt(extMatch[1], 10);
  const grpCy = parseInt(extMatch[2], 10);

  const chX = chOffMatch ? parseInt(chOffMatch[1], 10) : grpX;
  const chY = chOffMatch ? parseInt(chOffMatch[2], 10) : grpY;
  const chCx = chExtMatch && parseInt(chExtMatch[1], 10) > 0 ? parseInt(chExtMatch[1], 10) : grpCx;
  const chCy = chExtMatch && parseInt(chExtMatch[2], 10) > 0 ? parseInt(chExtMatch[2], 10) : grpCy;

  const scaleX = grpCx / chCx;
  const scaleY = grpCy / chCy;

  const childSpMatches = grpXml.match(/<p:sp(?:\s+[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const childSp of childSpMatches) {
    const cXfrm = childSp.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
    if (!cXfrm) continue;
    const cOff = cXfrm[1].match(/<a:off\s+[^>]*x="(-?\d+)"\s+y="(-?\d+)"/i);
    const cExt = cXfrm[1].match(/<a:ext\s+[^>]*cx="(\d+)"\s+cy="(\d+)"/i);
    if (!cOff || !cExt) continue;

    const rawChildX = parseInt(cOff[1], 10);
    const rawChildY = parseInt(cOff[2], 10);
    const rawChildCx = parseInt(cExt[1], 10);
    const rawChildCy = parseInt(cExt[2], 10);

    const mappedX = grpX + (rawChildX - chX) * scaleX;
    const mappedY = grpY + (rawChildY - chY) * scaleY;
    const mappedCx = rawChildCx * scaleX;
    const mappedCy = rawChildCy * scaleY;

    const left = Math.max(0, Math.min(100, (mappedX / slideWidth) * 100));
    const top = Math.max(0, Math.min(100, (mappedY / slideHeight) * 100));
    const width = Math.max(0.5, Math.min(100, (mappedCx / slideWidth) * 100));
    const height = Math.max(0.5, Math.min(100, (mappedCy / slideHeight) * 100));

    const box: PptxSpatialBox = {
      left: `${left.toFixed(2)}%`,
      top: `${top.toFixed(2)}%`,
      width: `${width.toFixed(2)}%`,
      height: `${height.toFixed(2)}%`,
    };

    const spPr = childSp.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? '';
    const bg = resolveShapeFillStyle(childSp, themeMap, clrMap);
    const borderColor = resolveShapeStrokeColor(childSp, themeMap, clrMap);

    const txBody = childSp.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1];
    if (txBody) {
      const parsedTx = parsePptxParagraphsHtml(txBody, themeMap, clrMap);
      if (parsedTx.html) {
        elements.push({
          type: 'text',
          box,
          bg,
          borderColor,
          html: parsedTx.html,
        });
      }
    } else if (bg) {
      const prst = spPr.match(/<a:prstGeom\s+[^>]*prst="([^"]+)"/i)?.[1];
      const custGeom = spPr.match(/<a:custGeom>([\s\S]*?)<\/a:custGeom>/)?.[1];
      const svg = generateSvgForShape(prst, custGeom, bg, borderColor);
      elements.push({
        type: 'shape',
        box,
        bg: svg ? undefined : bg,
        borderColor,
        html: svg || '',
      });
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Slide Master & Layout Inheritance (slideMaster -> slideLayout)
// ---------------------------------------------------------------------------

function parseMasterShapes(
  slideRelsXml: string,
  entries: Map<string, Uint8Array>,
  slideWidth: number,
  slideHeight: number,
  themeMap: Map<string, string>,
  clrMap?: Record<string, string>
): PptxSpatialElement[] {
  const masterElements: PptxSpatialElement[] = [];
  const textDecoder = new TextDecoder('utf-8');

  const layoutRelMatch = slideRelsXml.match(/Target="([^"]*slideLayout[^"]*)"/i);
  if (!layoutRelMatch) return masterElements;

  let layoutTarget = layoutRelMatch[1].replace(/\\/g, '/');
  if (layoutTarget.startsWith('../')) {
    layoutTarget = layoutTarget.replace(/^\.\.\//, 'ppt/');
  } else if (!layoutTarget.startsWith('ppt/')) {
    layoutTarget = `ppt/slideLayouts/${layoutTarget}`;
  }

  let activeTheme = themeMap;
  let activeClrMap = clrMap;

  const layoutBytes = getZipEntry(entries, layoutTarget);
  let layoutXml = '';
  let masterTarget = '';
  if (layoutBytes) {
    layoutXml = textDecoder.decode(layoutBytes);
    const layoutRelsPath = layoutTarget.replace(/slideLayouts\/([^/]+)$/, 'slideLayouts/_rels/$1.rels');
    const layoutRelsBytes = getZipEntry(entries, layoutRelsPath);
    if (layoutRelsBytes) {
      const layoutRelsXml = textDecoder.decode(layoutRelsBytes);
      const masterRelMatch = layoutRelsXml.match(/Target="([^"]*slideMaster[^"]*)"/i);
      if (masterRelMatch) {
        masterTarget = masterRelMatch[1].replace(/\\/g, '/');
        if (masterTarget.startsWith('../')) {
          masterTarget = masterTarget.replace(/^\.\.\//, 'ppt/');
        } else if (!masterTarget.startsWith('ppt/')) {
          masterTarget = `ppt/slideMasters/${masterTarget}`;
        }
      }
    }
  }

  // 1. Shapes from slideMaster (only background decorations without <p:ph>)
  if (masterTarget) {
    const masterRelsPath = masterTarget.replace(/slideMasters\/([^/]+)$/, 'slideMasters/_rels/$1.rels');
    const masterRelsBytes = getZipEntry(entries, masterRelsPath);
    if (masterRelsBytes) {
      const masterRelsXml = textDecoder.decode(masterRelsBytes);
      const themeRelMatch = masterRelsXml.match(/Target="([^"]*theme\d+\.xml)"/i);
      if (themeRelMatch) {
        let themeTarget = themeRelMatch[1].replace(/\\/g, '/');
        if (themeTarget.startsWith('../')) {
          themeTarget = themeTarget.replace(/^\.\.\//, 'ppt/');
        } else if (!themeTarget.startsWith('ppt/')) {
          themeTarget = `ppt/theme/${themeTarget}`;
        }
        const customThemeBytes = getZipEntry(entries, themeTarget);
        if (customThemeBytes) {
          activeTheme = parseThemeColors(textDecoder.decode(customThemeBytes));
        }
      }
    }

    const masterBytes = getZipEntry(entries, masterTarget);
    if (masterBytes) {
      const masterXml = textDecoder.decode(masterBytes);
      const parsedClrMap = parseClrMap(masterXml);
      if (Object.keys(parsedClrMap).length > 0) {
        activeClrMap = { ...(activeClrMap || {}), ...parsedClrMap };
      }

      const masterShapes = masterXml.match(/<p:sp(?:\s+[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [];
      for (const spXml of masterShapes) {
        if (/<p:ph(?:\s|\/|>)/i.test(spXml)) continue;
        const xfrmMatch = spXml.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
        const box = xfrmMatch ? parseSpatialBox(xfrmMatch[1], slideWidth, slideHeight) : undefined;
        if (!box) continue;

        const bg = resolveShapeFillStyle(spXml, activeTheme, activeClrMap);
        const stroke = resolveShapeStrokeColor(spXml, activeTheme, activeClrMap);
        if (!bg) continue;

        const spPr = spXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? '';
        const prst = spPr.match(/<a:prstGeom\s+[^>]*prst="([^"]+)"/i)?.[1];
        const custGeom = spPr.match(/<a:custGeom>([\s\S]*?)<\/a:custGeom>/)?.[1];
        const svg = generateSvgForShape(prst, custGeom, bg, stroke);

        masterElements.push({
          type: 'shape',
          box,
          bg: svg ? undefined : bg,
          borderColor: stroke,
          html: svg || '',
          zIndex: 1,
        });
      }
    }
  }

  // 2. Shapes from slideLayout (without <p:ph>)
  if (layoutXml) {
    const layoutShapes = layoutXml.match(/<p:sp(?:\s+[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [];
    for (const spXml of layoutShapes) {
      if (/<p:ph(?:\s|\/|>)/i.test(spXml)) continue;
      const xfrmMatch = spXml.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
      const box = xfrmMatch ? parseSpatialBox(xfrmMatch[1], slideWidth, slideHeight) : undefined;
      if (!box) continue;

      const bg = resolveShapeFillStyle(spXml, activeTheme, activeClrMap);
      const stroke = resolveShapeStrokeColor(spXml, activeTheme, activeClrMap);
      if (!bg) continue;

      const spPr = spXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/)?.[1] ?? '';
      const prst = spPr.match(/<a:prstGeom\s+[^>]*prst="([^"]+)"/i)?.[1];
      const custGeom = spPr.match(/<a:custGeom>([\s\S]*?)<\/a:custGeom>/)?.[1];
      const svg = generateSvgForShape(prst, custGeom, bg, stroke);

      masterElements.push({
        type: 'shape',
        box,
        bg: svg ? undefined : bg,
        borderColor: stroke,
        html: svg || '',
        zIndex: 2,
      });
    }
  }

  return masterElements;
}

export function extractSlideContent(
  slideXml: string,
  slideIndex: number,
  relsMap: Map<string, string>,
  entries: Map<string, Uint8Array>,
  slideWidth = 12192000,
  slideHeight = 6858000,
  aspectRatio = '16 / 9',
  themeMap?: Map<string, string>,
  masterShapes?: PptxSpatialElement[],
  logicalWidth = 960,
  logicalHeight = 540,
  clrMap?: Record<string, string>
): PptxSlide {
  const activeTheme = themeMap ?? getDefaultThemeMap();

  // Title Detection
  let title = '';
  const titleShapeMatch = slideXml.match(
    /<p:sp>[\s\S]*?<p:ph\s+[^>]*type="(?:title|ctrTitle)"[\s\S]*?<\/p:sp>/i
  );
  if (titleShapeMatch) {
    const tNodes = titleShapeMatch[0].match(/<a:t[^>]*>[\s\S]*?<\/a:t>/g) ?? [];
    const detected = tNodes
      .map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (detected) {
      title = detected;
    }
  }

  const spatialElements: PptxSpatialElement[] = [];
  if (masterShapes && masterShapes.length > 0) {
    spatialElements.push(...masterShapes);
  }

  const paragraphs: string[] = [];
  const tables: string[][][] = [];
  const images: string[] = [];

  // 1. Shapes & Text Boxes (<p:sp>)
  const shapeMatches = slideXml.match(/<p:sp(?:\s+[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const spXml of shapeMatches) {
    const xfrmMatch = spXml.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
    const box = xfrmMatch ? parseSpatialBox(xfrmMatch[1], slideWidth, slideHeight) : undefined;

    const spPrMatch = spXml.match(/<p:spPr>([\s\S]*?)<\/p:spPr>/);
    const spPr = spPrMatch ? spPrMatch[1] : '';

    const bg = resolveShapeFillStyle(spXml, activeTheme, clrMap);
    const borderColor = resolveShapeStrokeColor(spXml, activeTheme, clrMap);

    const txBodyMatch = spXml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/);
    if (txBodyMatch) {
      const parsedTx = parsePptxParagraphsHtml(txBodyMatch[1], activeTheme, clrMap);
      if (parsedTx.text) {
        if (!title) {
          title = parsedTx.text;
        }
        paragraphs.push(parsedTx.text);
      }
      if (parsedTx.html) {
        const bodyPr = txBodyMatch[1].match(/<a:bodyPr\s+([^>]*)\/?>/i);
        const anchor = bodyPr ? bodyPr[1].match(/anchor="([^"]+)"/i)?.[1] : undefined;
        const justify = anchor === 'ctr' ? 'justify-content:center;' : anchor === 'b' ? 'justify-content:flex-end;' : '';

        spatialElements.push({
          type: 'text',
          box,
          bg,
          borderColor,
          html: `<div class="pptx-shape-text-inner" style="width:100%;height:100%;display:flex;flex-direction:column;${justify}">${parsedTx.html}</div>`,
          zIndex: 10,
        });
      }
    } else if (bg && box) {
      // Pure decorative background vector shape
      const prst = spPr.match(/<a:prstGeom\s+[^>]*prst="([^"]+)"/i)?.[1];
      const custGeom = spPr.match(/<a:custGeom>([\s\S]*?)<\/a:custGeom>/)?.[1];
      const svg = generateSvgForShape(prst, custGeom, bg, borderColor);
      spatialElements.push({
        type: 'shape',
        box,
        bg: svg ? undefined : bg,
        borderColor,
        html: svg || '',
        zIndex: 5,
      });
    }
  }

  // 2. Pictures (<p:pic>)
  const picMatches = slideXml.match(/<p:pic(?:\s+[^>]*)?>[\s\S]*?<\/p:pic>/g) ?? [];
  for (const picXml of picMatches) {
    const xfrmMatch = picXml.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
    const box = xfrmMatch ? parseSpatialBox(xfrmMatch[1], slideWidth, slideHeight) : undefined;

    const blipMatch = picXml.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/i);
    if (blipMatch) {
      const rId = blipMatch[1];
      const targetPath = relsMap.get(rId);
      if (targetPath) {
        const mediaBytes = getZipEntry(entries, targetPath);
        if (mediaBytes) {
          const mime = getMediaMimeType(targetPath);
          const dataUrl = `data:${mime};base64,${fromByteArray(mediaBytes)}`;
          images.push(dataUrl);
          spatialElements.push({
            type: 'image',
            box,
            html: `<img src="${dataUrl}" class="pptx-spatial-img" alt="插图" />`,
            zIndex: 8,
          });
        }
      }
    }
  }

  // 3. Graphic Frames & Tables (<p:graphicFrame>)
  const frameMatches = slideXml.match(/<p:graphicFrame(?:\s+[^>]*)?>[\s\S]*?<\/p:graphicFrame>/g) ?? [];
  for (const frameXml of frameMatches) {
    const xfrmMatch = frameXml.match(/<a:xfrm>([\s\S]*?)<\/a:xfrm>/);
    const box = xfrmMatch ? parseSpatialBox(xfrmMatch[1], slideWidth, slideHeight) : undefined;

    const tblMatch = frameXml.match(/<a:tbl[\s\S]*?<\/a:tbl>/);
    if (tblMatch) {
      const rowMatches = tblMatch[0].match(/<a:tr[\s\S]*?<\/a:tr>/g) ?? [];
      const rowsData: string[][] = [];
      const tableRowsHtml: string[] = [];

      for (let rIdx = 0; rIdx < rowMatches.length; rIdx++) {
        const trXml = rowMatches[rIdx];
        const cellMatches = trXml.match(/<a:tc[\s\S]*?<\/a:tc>/g) ?? [];
        const rowCellsText: string[] = [];
        const rowCellsHtml: string[] = [];

        for (const tcXml of cellMatches) {
          const textNodes = tcXml.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/g) ?? [];
          const cellText = textNodes
            .map((n) => decodeXmlEntities(n.replace(/<[^>]+>/g, '')))
            .join('')
            .trim();
          rowCellsText.push(cellText);
          const tag = rIdx === 0 ? 'th' : 'td';
          rowCellsHtml.push(`<${tag}>${escapeHtml(cellText) || '&nbsp;'}</${tag}>`);
        }

        if (rowCellsText.length > 0) {
          rowsData.push(rowCellsText);
          tableRowsHtml.push(`<tr>${rowCellsHtml.join('')}</tr>`);
        }
      }

      if (rowsData.length > 0) {
        tables.push(rowsData);
        spatialElements.push({
          type: 'table',
          box,
          html: `<div class="pptx-spatial-table-wrapper"><table class="pptx-spatial-table"><tbody>${tableRowsHtml.join('')}</tbody></table></div>`,
          zIndex: 9,
        });
      }
    }
  }

  // 4. Group Shapes (<p:grpSp>)
  const groupMatches = slideXml.match(/<p:grpSp(?:\s+[^>]*)?>[\s\S]*?<\/p:grpSp>/g) ?? [];
  for (const grpXml of groupMatches) {
    const grpElems = parseGroupShapes(grpXml, slideWidth, slideHeight, relsMap, entries, activeTheme);
    if (grpElems.length > 0) {
      spatialElements.push(...grpElems);
    }
  }

  // 5. Background Color
  let bgColor: string | undefined = undefined;
  const srgbMatch =
    slideXml.match(/<p:bg>[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i) ||
    slideXml.match(/<p:bgPr>[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
  if (srgbMatch) {
    bgColor = `#${srgbMatch[1]}`;
  } else {
    const bgScheme =
      slideXml.match(/<p:bg>[\s\S]*?<a:schemeClr\s+val="([^"]+)"/i) ||
      slideXml.match(/<p:bgPr>[\s\S]*?<a:schemeClr\s+val="([^"]+)"/i);
    if (bgScheme) {
      bgColor = activeTheme.get(bgScheme[1].toLowerCase());
    }
  }

  // 6. Speaker Notes
  let notes: string | undefined = undefined;
  for (const [_, target] of relsMap) {
    if (/notesSlide\d+\.xml$/i.test(target)) {
      const notesBytes = getZipEntry(entries, target);
      if (notesBytes) {
        const textDecoder = new TextDecoder('utf-8');
        const notesXml = textDecoder.decode(notesBytes);
        const noteTexts = (notesXml.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/g) ?? [])
          .map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, '')).trim())
          .filter((t) => t.length > 1 && !/^\d+$/.test(t));
        if (noteTexts.length > 0) {
          notes = noteTexts.join(' ');
        }
      }
    }
  }

  return {
    index: slideIndex,
    title: title || `幻灯片 ${slideIndex}`,
    paragraphs:
      paragraphs.length > 0
        ? paragraphs
        : images.length > 0
          ? ['此幻灯片主要为图片或图表（已提取展示）']
          : ['此幻灯片主要为图片或图表'],
    tables,
    images: images.length > 0 ? images : undefined,
    bgColor,
    notes,
    spatialElements: spatialElements.length > 0 ? spatialElements : undefined,
    aspectRatio,
    logicalWidth,
    logicalHeight,
  };
}

export function renderPptxSlidesHtml(slides: PptxSlide[], slideCount?: number): string {
  const total = slideCount ?? slides.length;
  return slides
    .map((slide) => {
      const bgStyle = slide.bgColor ? `background-color: ${slide.bgColor};` : 'background-color: #FFFFFF;';
      const isDark = slide.bgColor && isDarkHexColor(slide.bgColor);
      const textClass = isDark ? 'pptx-theme-dark' : '';
      const aspectRatio = slide.aspectRatio || '16 / 9';
      const logicalWidth = slide.logicalWidth || 960;
      const logicalHeight = slide.logicalHeight || 540;

      // 2D Spatial Elements
      let spatialContentHtml = '';
      if (slide.spatialElements && slide.spatialElements.length > 0) {
        spatialContentHtml = slide.spatialElements
          .map((el) => {
            const posStyles: string[] = [];
            if (el.box) {
              posStyles.push(`left:${el.box.left}`);
              posStyles.push(`top:${el.box.top}`);
              posStyles.push(`width:${el.box.width}`);
              posStyles.push(`height:${el.box.height}`);
            }
            if (el.bg) {
              if (el.bg.startsWith('linear-gradient')) {
                posStyles.push(`background:${el.bg}`);
              } else {
                posStyles.push(`background-color:${el.bg}`);
              }
            }
            if (el.borderColor) posStyles.push(`border:1px solid ${el.borderColor}`);
            if (typeof el.zIndex === 'number') posStyles.push(`z-index:${el.zIndex}`);

            const styleAttr = posStyles.length > 0 ? ` style="${posStyles.join(';')}"` : '';
            return `<div class="pptx-spatial-elem pptx-spatial-${el.type}"${styleAttr}>${el.html}</div>`;
          })
          .join('\n');
      }

      // Hidden elements for backward test compatibility
      const imagesHtml =
        Array.isArray(slide.images) && slide.images.length > 0
          ? `<div class="pptx-slide-images-grid" style="display:none;">${slide.images
              .map(
                (imgUrl, imgIdx) =>
                  `<div class="pptx-slide-image-item"><img src="${imgUrl}" class="pptx-slide-image" alt="插图 ${imgIdx + 1}" /></div>`
              )
              .join('')}</div>`
          : '';

      const notesHtml = slide.notes
        ? `<div class="pptx-slide-notes"><span class="pptx-notes-label">演说者备注</span>${escapeHtml(slide.notes)}</div>`
        : '';

      return `<div class="pptx-slide-canvas pptx-slide-card ${textClass}" data-slide-index="${slide.index}" data-logical-width="${logicalWidth}" data-logical-height="${logicalHeight}" style="--slide-aspect: ${aspectRatio};">
        <div class="pptx-slide-canvas-inner pptx-spatial-stage" style="width: var(--logical-w, ${logicalWidth}px); height: var(--logical-h, ${logicalHeight}px); aspect-ratio: ${aspectRatio}; ${bgStyle}">
          ${spatialContentHtml}
        </div>
        <div class="pptx-slide-index-watermark">${slide.index} / ${total}</div>
        ${imagesHtml}
        ${notesHtml}
      </div>`;
    })
    .join('\n');
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

export async function parsePptx(input: {
  fileUri: string;
  space: PixorySpace;
}): Promise<ParsedPptxResult> {
  try {
    const bytes = await readFileBytes(input.fileUri);

    // 1. 若为旧版 Office 97-2003 二进制格式 (.ppt)，通过 OLE2 文本扫描器直接提取可读幻灯片正文
    if (isOle2Binary(bytes)) {
      const slides = extractTextFromOle2Binary(bytes);
      const textBlocks = slides.map((s) => `## 第 ${s.index} 页：${s.title}\n\n${s.paragraphs.join('\n\n')}`);
      return {
        text: textBlocks.join('\n\n---\n\n'),
        slides,
        slideCount: slides.length,
        metadata: {
          parser: 'pptx',
          format: 'legacy_ppt',
          slideCount: slides.length,
          paragraphCount: slides.reduce((acc, s) => acc + s.paragraphs.length, 0),
          noExtractableText: false,
        },
      };
    }

    const adapter = new NodeDocxZipAdapter();
    const entries = await adapter.readEntries(bytes);
    const textDecoder = new TextDecoder('utf-8');

    // 2. Read theme colors from ppt/theme/theme1.xml & slideMaster clrMap
    let themeMap = getDefaultThemeMap();
    const themeBytes = getZipEntry(entries, 'ppt/theme/theme1.xml');
    if (themeBytes) {
      themeMap = parseThemeColors(textDecoder.decode(themeBytes));
    }

    let clrMap: Record<string, string> | undefined = undefined;
    const master1Bytes = getZipEntry(entries, 'ppt/slideMasters/slideMaster1.xml');
    if (master1Bytes) {
      clrMap = parseClrMap(textDecoder.decode(master1Bytes));
    }

    // 3. Read presentation dimensions from ppt/presentation.xml
    let slideWidth = 12192000;
    let slideHeight = 6858000;
    let logicalWidth = 960;
    let logicalHeight = 540;
    let aspectRatio = '16 / 9';
    const presBytes = getZipEntry(entries, 'ppt/presentation.xml');
    if (presBytes) {
      const presXml = textDecoder.decode(presBytes);
      const dims = parsePresentationDimensions(presXml);
      slideWidth = dims.width;
      slideHeight = dims.height;
      logicalWidth = dims.logicalWidth;
      logicalHeight = dims.logicalHeight;
      aspectRatio = dims.aspectRatio;
    }

    // 4. Find all slide XMLs in ppt/slides/
    const slideKeys: string[] = [];
    for (const key of entries.keys()) {
      if (/^ppt\/slides\/slide\d+\.xml$/i.test(key)) {
        slideKeys.push(key);
      }
    }

    slideKeys.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    if (slideKeys.length === 0) {
      for (const key of entries.keys()) {
        if (/slide\d+\.xml$/i.test(key)) {
          slideKeys.push(key);
        }
      }
      slideKeys.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
    }

    const slides: PptxSlide[] = [];

    for (let i = 0; i < slideKeys.length; i++) {
      const slideKey = slideKeys[i];
      const slideBytes = entries.get(slideKey);
      if (slideBytes) {
        const xml = textDecoder.decode(slideBytes);

        // Find and parse rels for this slide
        const lastSlash = slideKey.lastIndexOf('/');
        const dir = lastSlash !== -1 ? slideKey.substring(0, lastSlash) : 'ppt/slides';
        const fileName = lastSlash !== -1 ? slideKey.substring(lastSlash + 1) : slideKey;
        const relsKey = `${dir}/_rels/${fileName}.rels`;
        let relsMap = new Map<string, string>();
        let relsXml = '';
        const relsBytes = getZipEntry(entries, relsKey);
        if (relsBytes) {
          relsXml = textDecoder.decode(relsBytes);
          relsMap = parseSlideRels(relsXml);
        }

        // Master inheritance shapes
        const masterShapes = relsXml
          ? parseMasterShapes(relsXml, entries, slideWidth, slideHeight, themeMap, clrMap)
          : [];

        const slide = extractSlideContent(
          xml,
          i + 1,
          relsMap,
          entries,
          slideWidth,
          slideHeight,
          aspectRatio,
          themeMap,
          masterShapes,
          logicalWidth,
          logicalHeight,
          clrMap
        );
        slides.push(slide);
      }
    }

    if (slides.length === 0) {
      slides.push({
        index: 1,
        title: '演示文稿概览',
        paragraphs: ['此演示文稿未提取到标准幻灯片内容。'],
        tables: [],
        aspectRatio,
        logicalWidth,
        logicalHeight,
      });
    }

    const textBlocks: string[] = [];
    for (const slide of slides) {
      const lines = [`## 第 ${slide.index} 页：${slide.title}`];
      if (slide.paragraphs.length > 0) {
        lines.push(slide.paragraphs.join('\n\n'));
      }
      if (slide.tables.length > 0) {
        for (const tbl of slide.tables) {
          lines.push(tbl.map((r) => r.join(' | ')).join('\n'));
        }
      }
      if (slide.notes) {
        lines.push(`> 演说者备注：${slide.notes}`);
      }
      textBlocks.push(lines.join('\n\n'));
    }

    return {
      text: textBlocks.join('\n\n---\n\n'),
      slides,
      slideCount: slides.length,
      aspectRatio,
      logicalWidth,
      logicalHeight,
      metadata: {
        parser: 'pptx',
        format: 'ooxml_pptx',
        slideCount: slides.length,
        paragraphCount: slides.reduce((acc, s) => acc + s.paragraphs.length, 0),
        noExtractableText: slides.every((s) => s.paragraphs.length === 0),
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'PPTX 解析未知错误';
    return {
      text: `演示文稿读取失败：${errorMsg}`,
      slides: [
        {
          index: 1,
          title: '演示文稿读取失败',
          paragraphs: [errorMsg, '建议在右上角菜单中选择使用外部办公应用打开原文件。'],
          tables: [],
          aspectRatio: '16 / 9',
          logicalWidth: 960,
          logicalHeight: 540,
        },
      ],
      slideCount: 1,
      aspectRatio: '16 / 9',
      logicalWidth: 960,
      logicalHeight: 540,
      metadata: {
        parser: 'pptx',
        slideCount: 1,
        paragraphCount: 1,
        noExtractableText: true,
        failed: true,
        message: errorMsg,
      },
    };
  }
}

export async function parsePptxText(input: {
  fileUri: string;
  space: PixorySpace;
}): Promise<ParsedDocumentText> {
  const parsed = await parsePptx(input);
  return {
    text: parsed.text,
    metadata: {
      ...parsed.metadata,
      pageCount: parsed.slideCount,
    },
  };
}
