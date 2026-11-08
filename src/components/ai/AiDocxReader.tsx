import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { AiDocumentReaderLocator, AiReadableDocument } from '../../ai/readers/readerTypes';
import { UniversalDocumentViewer } from '../reader/UniversalDocumentViewer';
import { aiLightColors } from './aiLightTheme';

interface AiDocxReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

/**
 * Backwards-compatible DOCX reader component.
 * Directly backed by the unified UniversalDocumentViewer.
 */
export function AiDocxReader({ readable, locator }: AiDocxReaderProps) {
  return (
    <View style={[styles.wrap, { backgroundColor: aiLightColors.canvas }]}>
      <UniversalDocumentViewer
        locator={locator}
        source={{ type: 'record', readable }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
