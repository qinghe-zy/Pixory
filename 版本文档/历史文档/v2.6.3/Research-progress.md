# AI Chat Streaming Tail Research Progress

## 2026-07-09
- Started research task for product-grade AI streaming scroll architecture.
- Scope: mature scroll anchoring, virtualized chat list behavior, height measurement cache, and AI streaming detachment.
- Collected first external sources: React Native ScrollView docs, TanStack Virtual Chat docs/blog, FlashList v2 docs/blog, react-native-streaming-message-list, and GetStream flat-list-mvcp.
- Moved external cloned repos to `D:\Project\PixoryStreamingResearch` to keep Pixory repository clean.
- Inspected `react-native-streaming-message-list` and `flat-list-mvcp` source; recorded architecture notes in findings.
- Inspected Vercel `ai-chatbot` scroll hooks and code block renderer; recorded bottom-follow and progressive-rich-rendering notes.
- Inspected Open WebUI chat scroll/Markdown code and LibreChat message scrolling, memoization, block Markdown, lazy highlighting, and layout reconciliation code.
- Wrote `docs/ai-chat-streaming-research/streaming-tail-occupancy-spec.md` as the product-grade architecture spec.
- Wrote `docs/ai-chat-streaming-research/implementation-plan.md` as a low-hallucination handoff plan with exact files, code steps, tests, forbidden shortcuts, and acceptance checks.
