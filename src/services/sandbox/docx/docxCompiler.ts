/**
 * docxCompiler.ts — 极简标准 OOXML DOCX 二进制编译器
 *
 * 核心功能：
 * 将大模型流式吐出的 Markdown / 纯文本，快速、高保真地编译打包为符合 ECMA-376 规范的标准 Word (.docx) ZIP 压缩包。
 * 彻底解决端侧生成文档打不开（0字0段文件损坏）以及外部 Office/WPS 报“文件已损坏”的结构性缺陷。
 */

import { NodeDocxZipAdapter } from './docxZipAdapter';

function escapeXml(str: string): string {
  return (str || '')
    // 过滤 XML 1.0 非法控制字符 (除 \t, \n, \r 之外的 0x00~0x1F)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function buildRunsXml(text: string, defaultSz = '24', defaultColor = '1E293B', isHeading = false): string {
  const tokens: string[] = [];
  const tagRegex = /(<del>[\s\S]*?<\/del>|<ins>[\s\S]*?<\/ins>)/gi;
  const parts = text.split(tagRegex);

  for (const part of parts) {
    if (!part) continue;
    if (/^<del>([\s\S]*)<\/del>$/i.test(part)) {
      const match = part.match(/^<del>([\s\S]*)<\/del>$/i);
      const inner = escapeXml(match ? match[1] : part);
      tokens.push(
        `<w:del w:id="${Math.floor(Math.random() * 100000)}" w:author="Pixory"><w:r><w:rPr><w:strike/><w:color w:val="DC2626"/></w:rPr><w:delText xml:space="preserve">${inner}</w:delText></w:r></w:del>`
      );
    } else if (/^<ins>([\s\S]*)<\/ins>$/i.test(part)) {
      const match = part.match(/^<ins>([\s\S]*)<\/ins>$/i);
      const inner = escapeXml(match ? match[1] : part);
      tokens.push(
        `<w:ins w:id="${Math.floor(Math.random() * 100000)}" w:author="Pixory"><w:r><w:rPr><w:color w:val="16A34A"/><w:highlight w:val="lightGreen"/></w:rPr><w:t xml:space="preserve">${inner}</w:t></w:r></w:ins>`
      );
    } else {
      const boldParts = part.split(/(\*\*[\s\S]*?\*\*)/g);
      for (const bp of boldParts) {
        if (!bp) continue;
        if (bp.startsWith('**') && bp.endsWith('**') && bp.length >= 4) {
          const innerBold = escapeXml(bp.slice(2, -2));
          tokens.push(
            `<w:r><w:rPr><w:b/><w:sz w:val="${defaultSz}"/><w:szCs w:val="${defaultSz}"/><w:color w:val="${defaultColor}"/></w:rPr><w:t xml:space="preserve">${innerBold}</w:t></w:r>`
          );
        } else {
          tokens.push(
            `<w:r><w:rPr>${isHeading ? '<w:b/>' : ''}<w:sz w:val="${defaultSz}"/><w:szCs w:val="${defaultSz}"/><w:color w:val="${defaultColor}"/></w:rPr><w:t xml:space="preserve">${escapeXml(bp)}</w:t></w:r>`
          );
        }
      }
    }
  }

  return tokens.join('');
}

/**
 * 将 Markdown / 纯文本字符串编译为合法的 .docx 二进制数据
 */
export async function compileMarkdownToDocx(
  markdownText: string,
  _title?: string
): Promise<Uint8Array> {
  const lines = (markdownText || '').replace(/\r\n/g, '\n').split('\n');
  const paragraphsXml: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      // 空行占位
      paragraphsXml.push('<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:p>');
      continue;
    }

    if (trimmed.startsWith('# ')) {
      const heading = trimmed.replace(/^#\s+/, '');
      const runs = buildRunsXml(heading, '36', '0F172A', true);
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr>${runs}</w:p>`
      );
    } else if (trimmed.startsWith('## ')) {
      const heading = trimmed.replace(/^##\s+/, '');
      const runs = buildRunsXml(heading, '30', '1E293B', true);
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="180" w:after="80"/></w:pPr>${runs}</w:p>`
      );
    } else if (trimmed.startsWith('### ')) {
      const heading = trimmed.replace(/^###\s+/, '');
      const runs = buildRunsXml(heading, '26', '334155', true);
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="120" w:after="60"/></w:pPr>${runs}</w:p>`
      );
    } else {
      // 常规段落
      const runs = buildRunsXml(trimmed, '24', '1E293B', false);
      paragraphsXml.push(
        `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="100"/></w:pPr>${runs}</w:p>`
      );
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphsXml.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const encoder = new TextEncoder();
  const entries = new Map<string, Uint8Array>();
  entries.set('[Content_Types].xml', encoder.encode(CONTENT_TYPES_XML));
  entries.set('_rels/.rels', encoder.encode(RELS_XML));
  entries.set('word/document.xml', encoder.encode(documentXml));

  const zipAdapter = new NodeDocxZipAdapter();
  return await zipAdapter.writeDocx(entries);
}
