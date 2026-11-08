import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiDocumentReaderLocator, AiReadableDocument } from '../../ai/readers/readerTypes';
import { UniversalDocumentViewer } from '../reader/UniversalDocumentViewer';

interface AiMarkdownReaderProps {
  readable: Pick<AiReadableDocument, 'text'> | AiReadableDocument;
  locator?: AiDocumentReaderLocator;
  onLinkPress?: (url: string) => void;
}

/**
 * Backwards-compatible Markdown reader component.
 * Directly backed by the unified UniversalDocumentViewer.
 */
export function AiMarkdownReader({ readable, locator, onLinkPress }: AiMarkdownReaderProps) {
  const isFullReadable = 'document' in readable && Boolean((readable as AiReadableDocument).document);

  const source = isFullReadable
    ? { type: 'record' as const, readable: readable as AiReadableDocument }
    : {
        type: 'uri' as const,
        uri: '',
        fileName: 'document.md',
        sourceType: 'markdown' as const,
        title: '文档',
        rawText: readable.text,
      };

  return (
    <View style={styles.wrap}>
      <UniversalDocumentViewer
        locator={locator}
        onLinkPress={onLinkPress}
        source={source}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
