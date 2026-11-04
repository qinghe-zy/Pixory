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
      const heading = escapeXml(trimmed.replace(/^#\s+/, ''));
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${heading}</w:t></w:r></w:p>`
      );
    } else if (trimmed.startsWith('## ')) {
      const heading = escapeXml(trimmed.replace(/^##\s+/, ''));
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="180" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/><w:color w:val="1E293B"/></w:rPr><w:t xml:space="preserve">${heading}</w:t></w:r></w:p>`
      );
    } else if (trimmed.startsWith('### ')) {
      const heading = escapeXml(trimmed.replace(/^###\s+/, ''));
      paragraphsXml.push(
        `<w:p><w:pPr><w:pStyle w:val="Heading3"/><w:spacing w:before="120" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="334155"/></w:rPr><w:t xml:space="preserve">${heading}</w:t></w:r></w:p>`
      );
    } else {
      // 常规段落
      const text = escapeXml(trimmed);
      paragraphsXml.push(
        `<w:p><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="100"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="1E293B"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
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
