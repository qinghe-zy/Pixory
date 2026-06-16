import { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import katex from 'katex';
import { aiLightColors } from './aiLightTheme';

const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css`;

export function AiMathBlock({ math }: { math: string }) {
  const [height, setHeight] = useState(60);
  const [error, setError] = useState<string | null>(null);

  let mathHtml = '';
  try {
    mathHtml = katex.renderToString(math, { displayMode: true, throwOnError: true });
  } catch (e: any) {
    mathHtml = `<div style="color: red;">${e.message}</div>`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="${KATEX_CSS}">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        body { margin: 0; padding: 12px; display: flex; justify-content: center; align-items: center; background: transparent; overflow-y: hidden; overflow-x: auto; }
        #math-container { max-width: 100%; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div id="math-container">${mathHtml}</div>
      <script>
        const container = document.getElementById('math-container');
        window.ReactNativeWebView.postMessage(Math.ceil(container.getBoundingClientRect().height));
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: Math.min(Math.max(40, height + 24), 400) }]}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={height + 24 > 400}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMessage={(event) => {
          const h = Number(event.nativeEvent.data);
          if (h && !isNaN(h)) setHeight(h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 8,
    backgroundColor: aiLightColors.card,
    borderRadius: 8,
    overflow: 'hidden',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
