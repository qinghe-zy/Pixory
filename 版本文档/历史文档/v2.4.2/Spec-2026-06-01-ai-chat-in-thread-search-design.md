# AI Chat In-Thread Search Design

## Goal

Add a full-page search experience for an AI chat thread that searches the currently active branch route, shows all matching chat messages in a result list, and returns to the chat positioned on the selected message.

## Scope

This version implements local keyword and fuzzy matching only. It does not call a remote model, consume AI quota, create embeddings, or search every branch. The search scope is the current visible branch route for the active thread.

## User Experience

The AI chat header gains a compact search icon. The icon is disabled when there is no thread yet. Tapping it opens a dedicated chat search page with a back button and a search input at the top.

The search page displays all result rows for the current route, loaded in pages so long chats stay responsive. Each result row shows:

- sender label: "你" or "AI";
- a compact snippet containing the matched content;
- highlighted matched terms;
- message time;
- version label when the message has versions.

Tapping a result returns to the chat page and automatically scrolls to that message. If the target message is not currently loaded in the chat page, the chat page keeps loading earlier messages and retries the scroll. When the message is found, it is briefly highlighted.

Empty states are explicit:

- no query: "输入关键词搜索当前路线";
- no results: "当前路线没有找到相关聊天";
- search unavailable: "当前还没有可搜索的聊天" when no thread id exists.

## Search Semantics

Search is local and deterministic:

- case-insensitive for Latin text;
- Chinese continuous text can match directly;
- whitespace, newlines, and common punctuation are normalized;
- multi-word queries split into terms and require every term to appear in the normalized content;
- matching is performed against the current materialized branch content, so selected historical versions are searched with the same text the user sees on the current route.

The first release searches the current route only. A future "all branches / semantic search" mode can add a second tab or segmented control, but it must label results that require branch switching and remain opt-in.

## Data Flow

The search route carries:

- `space`;
- `threadId`;
- `contextTitle`;
- `contextType`;
- `branchScopes`.

`AiChatScreen` opens the search route using the current persisted branch scopes. `AiChatSearchScreen` calls a new service method that loads current-route messages, applies local fuzzy matching, and returns paged results. The screen keeps loading more results until there are no more matches.

When the user selects a result, `App.tsx` returns to the previous chat route with `searchTargetMessageId` and `searchTargetKey`. The chat screen sets a pending scroll target, uses its existing scroll retry path, and flashes the target message.

## Reliability Rules

- The search page must never create an empty chat thread.
- Search must not change the current branch route.
- Search must not trigger AI generation, embeddings, remote calls, or memory maintenance beyond normal route leave behavior.
- The chat page must not fall back to stale `activeThreadId` when resolving a returned target.
- Hidden branch messages must not appear in current-route search results.

## Testing

Policy tests should cover:

- route registration and header search entry;
- search route carries branch scopes and opens without creating a thread;
- service exposes local fuzzy current-route search;
- search screen renders all loaded results and a "load more" path;
- selecting a result returns to chat and sets a pending target;
- chat reuses the existing load-earlier retry scroll path and highlights the target.

Verification commands:

- `node --test tests/ai-chat-search-policy.test.cjs`
- `node --test tests/ai-chat-fixes-policy.test.cjs tests/ai-navigation-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs`
- `pnpm typecheck`
- `pnpm test`
