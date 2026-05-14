import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';

import { deleteLocalFile, ensureLocalDirectory, getTempDir, joinStoragePath } from '../../services/fileStorageService';
import type { PixorySpace } from '../../database';
import type { ParsedDocumentText } from './textParser';

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractParagraphs(documentXml: string): string[] {
  const paragraphs = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((paragraph) => {
      const textNodes = paragraph.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [];
      return textNodes
        .map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, '')))
        .join('');
    })
    .map((text) => text.trim())
    .filter(Boolean);
}

export async function parseDocxText(input: { fileUri: string; space: PixorySpace }): Promise<ParsedDocumentText> {
  const tempRoot = getTempDir(input.space);
  await ensureLocalDirectory(tempRoot);
  const extractDir = `${joinStoragePath(tempRoot, `docx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)}/`;
  await ensureLocalDirectory(extractDir);

  try {
    await unzip(input.fileUri, extractDir);
    const documentXmlUri = joinStoragePath(joinStoragePath(extractDir, 'word'), 'document.xml');
    const info = await FileSystem.getInfoAsync(documentXmlUri);
    if (!info.exists || info.isDirectory) {
      return {
        text: '',
        metadata: {
          parser: 'docx',
          noExtractableText: true,
          message: 'DOCX body text was not found.',
        },
      };
    }

    const documentXml = await FileSystem.readAsStringAsync(documentXmlUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const paragraphs = extractParagraphs(documentXml);
    return {
      text: paragraphs.join('\n\n'),
      metadata: {
        parser: 'docx',
        paragraphCount: paragraphs.length,
        noExtractableText: paragraphs.length === 0,
      },
    };
  } finally {
    await deleteLocalFile(extractDir);
  }
}
