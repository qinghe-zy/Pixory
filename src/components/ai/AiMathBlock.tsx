import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import katex from 'katex';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

const MATH_BLOCK_MIN_HEIGHT = 48;
const MATH_BLOCK_MAX_HEIGHT = 400;
const MATH_BLOCK_VERTICAL_PADDING = spacing[3] * 2;
const KATEX_CORE_CSS = `
.katex{font:normal 1.12em KaTeX_Main,Times New Roman,serif;line-height:1.2;position:relative;text-indent:0;text-rendering:auto}
.katex *{border-color:currentColor}.katex-display{display:block;margin:0;text-align:center}.katex-display>.katex{display:block;text-align:center;white-space:nowrap}.katex-display>.katex>.katex-html{display:block;position:relative}
.katex .katex-mathml{border:0;clip:rect(1px,1px,1px,1px);height:1px;overflow:hidden;padding:0;position:absolute;width:1px}
.katex .base{position:relative;white-space:nowrap;width:min-content}.katex .base,.katex .strut{display:inline-block}
.katex .vlist-t{border-collapse:collapse;display:inline-table;table-layout:fixed}.katex .vlist-r{display:table-row}.katex .vlist{display:table-cell;position:relative;vertical-align:bottom}.katex .vlist>span{display:block;height:0;position:relative}.katex .vlist>span>span{display:inline-block}.katex .vlist>span>.pstrut{overflow:hidden;width:0}.katex .vlist-t2{margin-right:-2px}.katex .vlist-s{display:table-cell;font-size:1px;min-width:2px;vertical-align:bottom;width:2px}
.katex .mord,.katex .mop,.katex .mbin,.katex .mrel,.katex .mopen,.katex .mclose,.katex .mpunct,.katex .minner{display:inline-block}.katex .mspace{display:inline-block}.katex .msupsub{text-align:left}
.katex .sizing,.katex .fontsize-ensurer{display:inline-block}.katex .reset-size6.size3{font-size:.7em}.katex .mtight{font-size:.7em}
.katex .mfrac>span>span{text-align:center}.katex .frac-line{border-bottom-style:solid;display:inline-block;width:100%}.katex .sqrt>.root{margin-left:.2777777778em;margin-right:-.5555555556em}
.katex .svg-align{text-align:left}.katex svg{display:block;fill:currentColor;height:inherit;position:absolute;stroke:currentColor;width:100%}.katex svg path{stroke:none}
.katex .hide-tail{overflow:hidden;position:relative;width:100%}.katex .stretchy{display:block;overflow:hidden;position:relative;width:100%}
.katex .mtable .vertical-separator{display:inline-block;min-width:1px}.katex .mtable .arraycolsep{display:inline-block}.katex .mtable .col-align-c>.vlist-t{text-align:center}.katex .mtable .col-align-l>.vlist-t{text-align:left}.katex .mtable .col-align-r>.vlist-t{text-align:right}
.katex .mathnormal{font-style:italic}.katex .textbf{font-weight:700}.katex .textit{font-style:italic}.katex .mathbf{font-weight:700}.katex .mathrm{font-style:normal}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function AiMathBlock({ math }: { math: string }) {
  const [height, setHeight] = useState(60);

  let mathHtml = '';
  try {
    mathHtml = katex.renderToString(math, {
      displayMode: true,
      output: 'htmlAndMathml',
      throwOnError: true,
      trust: false,
    });
  } catch {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorLabel}>公式无法渲染</Text>
        <Text numberOfLines={2} style={styles.errorText}>{math}</Text>
      </View>
    );
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
      <style>
        * { box-sizing: border-box; }
        ${KATEX_CORE_CSS}
        html, body {
          margin: 0;
          padding: 0;
          background: transparent;
          color: ${escapeHtml(aiLightColors.ink)};
          font-family: serif;
          overflow: hidden;
          -webkit-text-size-adjust: 100%;
        }
        body {
          padding: ${spacing[3]}px;
        }
        #math-container {
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          text-align: center;
          -webkit-overflow-scrolling: touch;
        }
        .katex-display {
          margin: 0;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .katex {
          display: inline-block;
          max-width: 100%;
          font-size: 1.08em;
          line-height: 1.35;
          text-rendering: optimizeLegibility;
        }
        .katex-html {
          white-space: nowrap;
        }
        .katex-mathml {
          position: absolute;
          clip: rect(1px, 1px, 1px, 1px);
          padding: 0;
          border: 0;
          height: 1px;
          width: 1px;
          overflow: hidden;
        }
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
    <View style={[styles.container, { height: Math.min(Math.max(MATH_BLOCK_MIN_HEIGHT, height + MATH_BLOCK_VERTICAL_PADDING), MATH_BLOCK_MAX_HEIGHT) }]}>
      <WebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        bounces={false}
        domStorageEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mixedContentMode="never"
        onMessage={(event) => {
          const h = Number(event.nativeEvent.data);
          if (h && !isNaN(h)) setHeight(h);
        }}
        originWhitelist={['about:blank']}
        scrollEnabled={height + MATH_BLOCK_VERTICAL_PADDING > MATH_BLOCK_MAX_HEIGHT}
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        source={{ html, baseUrl: 'about:blank' }}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: rhythm.microGap,
    backgroundColor: aiLightColors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  errorContainer: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    marginVertical: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  errorLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  errorText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontFamily: typography.family.mono,
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
