# AI Chat Message Favorites Design

## Goal

Add local favorite support for AI assistant messages. A user can star an AI reply from the same action row as copy and regenerate, view favorite AI messages in the existing Favorites Center, see the source chat name, and tap a favorite to return to the chat positioned on that message.

## Scope

This feature covers AI assistant replies only. User messages, system messages, memories, citations, images, and documents are out of scope for message favoriting.

The implementation must remain Android-first and local-only. It must not add cloud sync, accounts, remote AI calls, embeddings, or server state.

## Existing Context

Pixory already has:

- `FavoritesScreen`, currently focused on favorite image and video assets.
- `AiMessageBubble`, with the message action row for copy, regenerate, user edit, version controls, and time.
- `AiChatScreen`, with a search-target navigation path using `searchTargetMessageId`, `searchTargetKey`, and `searchTargetBranchScopes`.
- `ai_threads`, `ai_messages`, `ai_message_versions`, and branch route state in SQLite.

The new favorite jump should reuse the existing search-target scroll and highlight path instead of adding a separate message-positioning mechanism.

## User Experience

### Chat Bubble Action

For assistant messages, the action row shows a star button alongside copy and regenerate:

- Outline star means not favorited.
- Filled star means favorited.
- Tapping the star toggles the favorite state.
- The button is disabled only when that same assistant message is regenerating or when its own favorite toggle is pending.
- User messages do not show the favorite button.

The action order should keep the current row compact and predictable:

1. Copy
2. Favorite or unfavorite
3. Regenerate
4. Version control when available
5. Message time

### Favorites Center

The existing Favorites Center becomes a mixed local collection center. It keeps the current image favorite behavior and adds a compact segmented control with two modes: `图片` and `AI 消息`. The default mode remains `图片` so the current image workflow is unchanged.

For AI message favorites, each row displays:

- chat title;
- sender label `AI`;
- message snippet, limited to a compact preview;
- favorite time;
- version label when `messageVersionIndex` is greater than 1 or the source message has multiple versions.

Empty states remain explicit:

- no image favorites: current image empty state remains available;
- no AI message favorites: "还没有收藏 AI 消息";
- stale favorite target: thread/message deletion is normally handled by foreign-key cascade; if a saved version cannot be resolved, hide that row from the normal list and allow a future cleanup pass to remove it.

The segmented control is always visible in the Favorites Center, even when one mode is empty, so users can discover the AI message collection entry.

### Jump Back To Message

Tapping an AI message favorite opens the original AI chat and positions the list on that message. The target message is highlighted briefly.

If the message is not loaded in the first page, `AiChatScreen` keeps loading earlier messages and retries the scroll, using the existing search-target path.

If the saved favorite belongs to a branch route, the jump must pass the saved full branch scope list so the chat materializes the route that contains the favorited message. It must not silently jump to the current main route if that route cannot contain the target.

## Data Model

Use a dedicated SQLite table instead of adding an `isFavorite` flag to `ai_messages`.

Recommended table:

```sql
CREATE TABLE IF NOT EXISTS ai_message_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  threadId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  favoriteKey TEXT NOT NULL,
  branchRootMessageId TEXT,
  branchVersionIndex INTEGER,
  branchScopesJson TEXT NOT NULL DEFAULT '[]',
  messageVersionIndex INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_message_favorites_key
  ON ai_message_favorites(favoriteKey);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_space_created_at
  ON ai_message_favorites(space, createdAt);

CREATE INDEX IF NOT EXISTS idx_ai_message_favorites_thread
  ON ai_message_favorites(threadId, createdAt);
```

The table is independent because favoriting a message is user collection metadata, not part of the generated message itself. It also preserves branch and version context for reliable jump behavior.

`favoriteKey` is a deterministic normalized identity string built by the service from:

```txt
space | messageId | branchRootMessageId-or-main | branchVersionIndex-or-0 | stable branchScopesJson | messageVersionIndex-or-current
```

Using a plain text key avoids relying on SQLite expression indexes across Android SQLite versions.

### Favorite Identity

The first version should treat a favorite as "this visible assistant message in this branch context." Store:

- `messageId`: base message identity used for scrolling;
- `favoriteKey`: normalized identity for uniqueness and toggle lookup;
- `branchRootMessageId` and `branchVersionIndex`: the branch root pair for quick filtering and display;
- `branchScopesJson`: the full branch route scope list used for jump-back materialization, including nested branch selections;
- `messageVersionIndex`: the exact visible `AiMessageWithCitations.versionIndex` at favorite time.

Current code computes `AiMessageWithCitations.versionIndex` as:

- `1..n` for rows loaded from `ai_message_versions`;
- `versionTotal` for the current materialized `ai_messages` row.

Therefore the favorite identity stores the visible `versionIndex`, not "only older versions." If a favorited current version later becomes historical after regeneration, listing can resolve it through `ai_message_versions` once that row exists.

If the user later selects another version and stars it, the database distinguishes it by `messageVersionIndex`. Toggling applies to that exact visible version and branch identity.

When listing favorites, the displayed content should match the favorited visible version:

- if `messageVersionIndex` points to an older row in `ai_message_versions`, use that version content;
- if `messageVersionIndex` equals the current computed `versionTotal`, use the current `ai_messages.content`;
- if neither source resolves, hide the stale favorite from the normal list.

## Repository And Service API

Add repository functions under the AI thread repository boundary:

- `favoriteAssistantMessage(db, input)`: inserts the favorite after verifying the message exists, belongs to the thread, and has role `assistant`.
- `unfavoriteAssistantMessage(db, input)`: removes the favorite for the same message and branch/version identity.
- `listFavoriteAssistantMessages(db, { space, limit, offset })`: returns favorite rows joined with `ai_threads` and `ai_messages`, ordered by favorite time descending.
- `findFavoriteAssistantMessageState(db, input)`: lets the chat screen mark visible assistant messages as favorited.

Add service wrappers in `aiChatService` so screens do not directly compose SQL.

The service must reject user/system messages. It should fail softly at the UI layer with a short error message if the target is stale.

## Navigation Flow

Extend the Favorites route with an AI-message open callback:

```ts
onOpenAiMessageFavorite(favorite)
```

The callback builds an `ai-chat` route with:

- `space`;
- `threadId`;
- `contextTitle` from the source thread title;
- `contextType`, `ipId`, `knowledgeBaseId`, and `includeIpDocuments` from the source thread;
- `searchTargetMessageId`;
- fresh `searchTargetKey`;
- `searchTargetBranchScopes` parsed from `branchScopesJson`.

This reuses existing chat scroll and highlight behavior.

The implementation must update these integration points explicitly:

- `FavoritesScreenProps`: add AI favorite loading support and `onOpenAiMessageFavorite`.
- `AppRoute`: keep the existing `{ name: 'favorites'; space }` route shape unless a start mode is added later, but render `FavoritesScreen` with the AI open callback.
- `App.tsx` favorites render branch: convert the selected favorite row into an `ai-chat` route with the source thread fields listed above.
- `AiChatScreen` route props: continue using the existing `searchTargetMessageId`, `searchTargetKey`, and `searchTargetBranchScopes`; do not add a parallel favorite-specific target prop.

## State And Loading

`AiChatScreen` should load favorite state for visible messages after messages are loaded. The state can be kept as a map keyed by the favorite identity:

```ts
messageId:branchRootMessageId:branchVersionIndex:messageVersionIndex
```

The favorite toggle should update optimistically only if the repository call succeeds quickly and can be reverted on error. A simpler first release can reload favorite state after each toggle, because the action is local SQLite and low-cost.

Do not let favorite loading change message ordering, current branch, selected version, generation state, or scroll position.

## Reliability Rules

- Only assistant messages can be favorited.
- Favorite actions must not trigger AI generation, memory maintenance, embeddings, or network calls.
- The normal and personal spaces must remain isolated.
- Deleted threads or messages must not leave broken tappable rows.
- Jumping from a favorite must preserve the branch route recorded at favorite time.
- Image favorite behavior must remain unchanged.
- The feature must work offline and persist across app restarts.

## Testing

Policy tests should cover:

- schema adds `ai_message_favorites`, `favoriteKey`, normal-column unique index, and bumps database version;
- repository/service rejects non-assistant messages;
- chat bubble exposes a favorite action only for assistant messages and places it with copy/regenerate;
- chat screen passes current full branch scope list and visible version identity when toggling favorite;
- Favorites Center loads AI message favorites with chat title;
- Favorites Center always exposes the `图片` and `AI 消息` segmented modes;
- tapping an AI favorite opens `ai-chat` with `searchTargetMessageId` and `searchTargetBranchScopes`;
- App route wiring passes `onOpenAiMessageFavorite` into `FavoritesScreen`;
- existing image favorite UI remains present.

Verification commands:

- `node --test tests/ai-message-favorites-policy.test.cjs`
- `node --test tests/ai-chat-search-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs tests/ai-branch-tree-navigation-policy.test.cjs`
- `pnpm typecheck`
- `pnpm test`

## Non-Goals

- Favoriting user messages.
- Semantic or AI-powered favorite search.
- Cross-device sync.
- Exporting favorites.
- Changing the existing image asset favorite storage model.
- Redesigning the full Favorites Center beyond the minimal mixed-content support needed for AI message favorites.
