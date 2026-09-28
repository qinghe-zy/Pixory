import { StyleSheet, View } from 'react-native';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { rhythm } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { AiTextReader } from './AiTextReader';

interface AiDocxReaderProps {
  readable: AiReadableDocument;
  locator?: AiDocumentReaderLocator;
}

export function AiDocxReader({ readable, locator }: AiDocxReaderProps) {
  return (
    <View style={styles.wrap}>
      <AiTextReader locator={locator} readable={readable} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: aiLightColors.canvas,
    gap: rhythm.listCardGap,
  },
});
