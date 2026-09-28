import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { AiReadableDocument, AiDocumentReaderLocator } from '../../ai/readers/readerTypes';
import { getAiMarkdownReaderHtml } from './aiMarkdownReaderTemplate';

interface AiMarkdownReaderProps {
  readable: Pick<AiReadableDocument, 'text'>;
  locator?: AiDocumentReaderLocator;
  onLinkPress?: (url: string) => void;
}

/**
 * Injects a `<mark>` wrapper around the N-th non-empty line in the raw
 * markdown so that the WebView can scroll to and highlight the paragraph
 * referenced by an AI citation (locator).
 */
function applyLocator(text: string, locator?: AiDocumentReaderLocator): string {
  if (locator?.paragraph === undefined) {
    return text;
  }
  const lines = text.split('\n');
  let pIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      pIndex += 1;
      if (pIndex === locator.paragraph) {
        lines[i] = `<mark id="locator-target" class="locator-highlight">${lines[i]}</mark>`;
        break;
      }
    }
  }
  return lines.join('\n');
}

export function AiMarkdownReader({ readable, locator, onLinkPress }: AiMarkdownReaderProps) {
  const rawText = readable.text || '暂无可阅读文本。';

  const htmlContent = useMemo(() => {
    const marked = applyLocator(rawText, locator);
    return getAiMarkdownReaderHtml(marked);
  }, [rawText, locator]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'linkPress' && data.url) {
        onLinkPress?.(data.url);
      }
    } catch (e) {
      // Ignore parse errors
    }
  };

  return (
    <View style={styles.wrap}>
      <WebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        javaScriptEnabled
        originWhitelist={['*']}
        showsVerticalScrollIndicator={false}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={handleMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#faf9f5', // match --canvas so there's no white flash
  },
});
