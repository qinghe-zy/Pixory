/**
 * Builds a complete HTML document for the AiMarkdownReader WebView.
 *
 * The markdown content is safely injected via percent-encoding so that
 * no combination of backticks, dollars, angle brackets or other characters
 * in the source document can break the surrounding JavaScript or HTML.
 */
export function getAiMarkdownReaderHtml(markdownContent: string): string {
  // Percent-encode the markdown so it's inert inside the JS string literal.
  // decodeURIComponent runs inside the WebView at runtime.
  const encoded = encodeURIComponent(markdownContent);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet">

  <style>
    :root {
      --canvas: #faf9f5;
      --surface-card: #efe9de;
      --surface-dark: #181715;
      --ink: #141413;
      --body-strong: #252523;
      --body: #3d3d3a;
      --muted: #6c6a64;
      --primary: #cc785c;
      --primary-light: rgba(204, 120, 92, 0.12);
      --hairline: #e6dfd8;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 0;
      background-color: var(--canvas);
      color: var(--body);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* ── Layout ─────────────────────────────────────────── */

    .layout {
      display: flex;
      flex-direction: column;
      padding: 24px 20px 80px 20px;
    }

    /* ── Sidebar / TOC Bottom-Sheet ─────────────────────── */

    .sidebar {
      display: flex;
      flex-direction: column;
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 60vh;
      background: rgba(250, 249, 245, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid var(--hairline);
      border-top-left-radius: 24px;
      border-top-right-radius: 24px;
      z-index: 1000;
      transform: translateY(100%);
      transition: transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1);
      box-shadow: 0 -10px 40px rgba(0,0,0,0.08);
      padding: 0 20px;
    }

    .sidebar.mobile-open {
      transform: translateY(0);
    }

    .toc-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 0;
      padding-bottom: 20px;
      padding-top: 24px;
      letter-spacing: 0.05em;
      flex-shrink: 0;
    }

    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
      border-left: 2px solid var(--hairline);
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 40px;
    }

    .toc-list::-webkit-scrollbar { width: 4px; }
    .toc-list::-webkit-scrollbar-thumb { background-color: var(--hairline); border-radius: 4px; }

    .toc-list li { margin-bottom: 12px; }

    .toc-list a {
      text-decoration: none;
      color: var(--muted);
      font-size: 15px;
      transition: color 0.2s;
      display: block;
      padding-left: 16px;
      position: relative;
      line-height: 1.4;
    }

    .toc-list a.toc-h3 { padding-left: 32px; font-size: 14px; }
    .toc-list a:active { color: var(--ink); }
    .toc-list a.active { color: var(--primary); font-weight: 500; }
    .toc-list a.active::before {
      content: '';
      position: absolute;
      left: -2px;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: var(--primary);
    }

    /* ── FAB ────────────────────────────────────────────── */

    .mobile-toc-fab {
      position: fixed;
      bottom: 32px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: var(--surface-dark);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      z-index: 900;
      border: none;
      transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1), background-color 0.2s;
    }

    .mobile-toc-fab:active {
      transform: scale(0.95) !important;
      background: var(--ink);
    }

    .mobile-toc-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      z-index: 950;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.4s ease;
      display: none;
    }

    .mobile-toc-overlay.active {
      display: block;
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Markdown Body ──────────────────────────────────── */

    .markdown-body {
      font-size: 16px;
      line-height: 1.8;
      color: var(--body);
      max-width: 100%;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    /* Headings */
    .markdown-body h1, .markdown-body h2, .markdown-body h3,
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      color: var(--ink);
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      margin-top: 2em;
      margin-bottom: 1em;
      line-height: 1.3;
    }

    .markdown-body h1 { font-size: 2.2em; margin-top: 0.5em; letter-spacing: -0.02em; }
    .markdown-body h2 { font-size: 1.8em; border-bottom: 1px solid var(--hairline); padding-bottom: 0.3em; }
    .markdown-body h3 { font-size: 1.4em; }
    .markdown-body h4 { font-size: 1.2em; }
    .markdown-body h5 { font-size: 1.05em; }
    .markdown-body h6 { font-size: 1em; color: var(--muted); }

    /* Paragraph */
    .markdown-body p { margin-bottom: 1.5em; }

    /* Links */
    .markdown-body a {
      color: var(--primary);
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s;
    }
    .markdown-body a:active { border-bottom-color: var(--primary); }

    /* Inline code */
    .markdown-body code {
      font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.85em;
      background-color: rgba(0,0,0,0.04);
      padding: 0.2em 0.4em;
      border-radius: 4px;
      color: var(--body-strong);
    }

    /* Code blocks */
    .markdown-body pre {
      background-color: var(--surface-card);
      padding: 1.2em;
      border-radius: 8px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 1.5em;
      border: 1px solid var(--hairline);
    }

    .markdown-body pre code {
      background-color: transparent;
      padding: 0;
      font-size: 0.9em;
      color: var(--body);
      white-space: pre;
    }

    /* Blockquotes */
    .markdown-body blockquote {
      margin: 0 0 1.5em 0;
      padding: 0.5em 0 0.5em 1.2em;
      border-left: 3px solid var(--primary);
      color: var(--muted);
      font-style: italic;
    }

    .markdown-body blockquote p:last-child { margin-bottom: 0; }

    /* Lists */
    .markdown-body ul, .markdown-body ol {
      margin-bottom: 1.5em;
      padding-left: 1.5em;
    }

    .markdown-body li { margin-bottom: 0.5em; }

    /* Nested lists tighter spacing */
    .markdown-body li > ul, .markdown-body li > ol {
      margin-bottom: 0.25em;
      margin-top: 0.25em;
    }

    /* Task lists (GFM checkboxes) ── matching AiMessageContent ☑/☐ style */
    .markdown-body input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border: 2px solid var(--hairline);
      border-radius: 3px;
      vertical-align: middle;
      margin-right: 6px;
      position: relative;
      top: -1px;
    }

    .markdown-body input[type="checkbox"]:checked {
      background-color: var(--primary);
      border-color: var(--primary);
    }

    .markdown-body input[type="checkbox"]:checked::after {
      content: '✓';
      position: absolute;
      top: -2px;
      left: 1px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
    }

    .markdown-body li.task-list-item {
      list-style: none;
      margin-left: -1.5em;
      padding-left: 0;
    }

    /* Images */
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5em 0;
      display: block;
    }

    /* Tables ── matching AiMessageContent table styling */
    .markdown-body table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1.5em;
      font-size: 14px;
      display: block;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .markdown-body thead th {
      background-color: var(--surface-card);
      color: var(--ink);
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid var(--hairline);
      white-space: nowrap;
    }

    .markdown-body tbody td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--hairline);
      vertical-align: top;
    }

    .markdown-body tbody tr:last-child td {
      border-bottom: none;
    }

    /* Horizontal rules */
    .markdown-body hr {
      border: none;
      border-top: 1px solid var(--hairline);
      margin: 2em 0;
    }

    /* Bold / Strong */
    .markdown-body strong {
      color: var(--body-strong);
      font-weight: 600;
    }

    /* Italic / Emphasis */
    .markdown-body em {
      font-style: italic;
    }

    /* Strikethrough (GFM ~~ syntax) */
    .markdown-body del {
      text-decoration: line-through;
      color: var(--muted);
    }

    /* Mark / Highlight (== syntax via marked extension) */
    .markdown-body mark {
      background-color: var(--primary-light);
      color: inherit;
      border-radius: 2px;
      padding: 0 2px;
    }

    /* Definition lists (rendered as <dl>) */
    .markdown-body dl {
      margin-bottom: 1.5em;
    }

    .markdown-body dt {
      color: var(--ink);
      font-weight: 600;
      margin-top: 1em;
    }

    .markdown-body dd {
      margin-left: 1.5em;
      margin-bottom: 0.5em;
      color: var(--body);
    }

    /* Subscript / Superscript */
    .markdown-body sub { font-size: 0.75em; }
    .markdown-body sup { font-size: 0.75em; }

    /* Keyboard tag */
    .markdown-body kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 0.8em;
      line-height: 1;
      color: var(--body-strong);
      background-color: var(--surface-card);
      border: 1px solid var(--hairline);
      border-radius: 4px;
      box-shadow: 0 1px 0 var(--hairline);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    /* Abbreviations */
    .markdown-body abbr[title] {
      text-decoration: underline dotted;
      cursor: help;
    }

    /* Footnotes */
    .markdown-body .footnotes {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid var(--hairline);
      font-size: 0.9em;
      color: var(--muted);
    }

    .markdown-body .footnotes ol { padding-left: 1.2em; }

    /* Locator highlight for AI citation jumps */
    mark.locator-highlight {
      background-color: rgba(204, 120, 92, 0.18);
      color: inherit;
      border-radius: 4px;
      padding: 2px 0;
      transition: background-color 2s ease-out;
    }
  </style>
</head>
<body>

  <div class="mobile-toc-overlay" id="mobile-toc-overlay"></div>
  <button class="mobile-toc-fab" id="mobile-toc-fab" aria-label="目录导览">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  </button>

  <div class="layout" id="main-layout">
    <div class="sidebar" id="sidebar">
      <div class="toc-title">目录导览</div>
      <ul id="toc" class="toc-list"></ul>
    </div>

    <div class="container">
      <div id="doc-content" class="markdown-body"></div>
    </div>
  </div>

  <script>
    // Safely decode the percent-encoded markdown injected at build time
    var RAW_MARKDOWN = decodeURIComponent("${encoded}");

    document.addEventListener('DOMContentLoaded', function() {
      // Configure marked for GFM features (tables, strikethrough, task lists)
      if (typeof marked !== 'undefined' && marked.use) {
        marked.use({
          gfm: true,
          breaks: false,
        });
      }

      var contentDiv = document.getElementById('doc-content');
      if (typeof marked !== 'undefined' && marked.parse) {
        contentDiv.innerHTML = marked.parse(RAW_MARKDOWN);
      } else {
        // Fallback: show raw text if marked.js failed to load (offline/slow network)
        var pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.fontFamily = 'inherit';
        pre.style.lineHeight = '1.8';
        pre.textContent = RAW_MARKDOWN;
        contentDiv.appendChild(pre);
      }

      // Scroll to locator highlight if present
      setTimeout(function() {
        var locatorTarget = document.getElementById('locator-target');
        if (locatorTarget) {
          locatorTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function() {
            locatorTarget.style.backgroundColor = 'transparent';
          }, 2500);
        }
      }, 300);

      // ── Generate TOC from h2/h3 ──
      var headings = contentDiv.querySelectorAll('h2, h3');
      var tocList = document.getElementById('toc');

      if (headings.length === 0) {
        document.getElementById('mobile-toc-fab').style.display = 'none';
      }

      headings.forEach(function(heading, index) {
        var id = 'heading-' + index;
        heading.id = id;
        heading.style.scrollMarginTop = '16px';
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + id;
        a.textContent = heading.textContent;
        if (heading.tagName.toLowerCase() === 'h3') {
          a.className = 'toc-h3';
        }
        li.appendChild(a);
        tocList.appendChild(li);
      });

      // ── Mobile TOC toggle ──
      var mobileFab = document.getElementById('mobile-toc-fab');
      var mobileOverlay = document.getElementById('mobile-toc-overlay');
      var sidebar = document.getElementById('sidebar');

      if (mobileFab && mobileOverlay && sidebar) {
        function toggleMobileToc() {
          sidebar.classList.toggle('mobile-open');
          mobileOverlay.classList.toggle('active');
          document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
          if (sidebar.classList.contains('mobile-open')) {
            var activeLink = document.querySelector('.toc-list a.active');
            if (activeLink) activeLink.scrollIntoView({ behavior: 'auto', block: 'center' });
          }
        }

        mobileFab.addEventListener('click', toggleMobileToc);
        mobileOverlay.addEventListener('click', toggleMobileToc);

        document.querySelectorAll('.toc-list a').forEach(function(a) {
          a.addEventListener('click', toggleMobileToc);
        });

        var lastScrollY = window.scrollY;
        var accumulatedScrollDown = 0;
        var fabOffset = 0;
        var maxFabOffset = 100;

        window.addEventListener('scroll', function() {
          var currentScrollY = Math.max(0, window.scrollY);
          var delta = currentScrollY - lastScrollY;

          if (delta > 0) {
            if (fabOffset > 0) {
              fabOffset += delta;
            } else {
              var prevAcc = accumulatedScrollDown;
              accumulatedScrollDown += delta;
              if (accumulatedScrollDown > 120) {
                fabOffset += (prevAcc < 120) ? (accumulatedScrollDown - 120) : delta;
              }
            }
          } else if (delta < 0) {
            accumulatedScrollDown = 0;
            fabOffset += delta;
          }

          if (fabOffset < 0) fabOffset = 0;
          if (fabOffset > maxFabOffset) fabOffset = maxFabOffset;
          if (currentScrollY <= 50) fabOffset = 0;

          mobileFab.style.transform = 'translateY(' + fabOffset + 'px)';
          lastScrollY = currentScrollY;
        }, { passive: true });
      }

      // ── ScrollSpy for TOC highlight ──
      var tocLinks = document.querySelectorAll('.toc-list a');
      var lastActiveId = '';
      function scrollSpy() {
        var current = '';
        for (var i = headings.length - 1; i >= 0; i--) {
          if (headings[i].getBoundingClientRect().top <= 120) {
            current = headings[i].id;
            break;
          }
        }
        if (!current && headings.length > 0) {
          current = headings[0].id;
        }
        if (current === lastActiveId) return;
        lastActiveId = current;

        tocLinks.forEach(function(a) {
          a.classList.remove('active');
          if (a.getAttribute('href') === '#' + current) {
            a.classList.add('active');
            var scrollContainer = document.querySelector('.toc-list');
            var sidebarEl = document.querySelector('.sidebar');
            if (scrollContainer && sidebarEl && sidebarEl.offsetParent !== null) {
              var linkRect = a.getBoundingClientRect();
              var containerRect = scrollContainer.getBoundingClientRect();
              if (linkRect.top < containerRect.top + 20) {
                scrollContainer.scrollTo({ top: scrollContainer.scrollTop + (linkRect.top - containerRect.top - 20), behavior: 'smooth' });
              } else if (linkRect.bottom > containerRect.bottom - 20) {
                scrollContainer.scrollTo({ top: scrollContainer.scrollTop + (linkRect.bottom - containerRect.bottom + 20), behavior: 'smooth' });
              }
            }
          }
        });
      }
      window.addEventListener('scroll', scrollSpy);
      scrollSpy();
    });
  <\/script>
</body>
</html>`;
}
