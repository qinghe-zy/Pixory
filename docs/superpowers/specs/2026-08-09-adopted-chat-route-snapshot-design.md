# Adopted Chat Route Snapshot Design

## Goal

Make every entry into an AI chat thread render the same persisted adopted route that drives current conversation, artifacts, search and recent-thread metadata. A correct `threadId` must never render sibling messages or lose its own latest visible message because of prefetch or paging.

## Decision

Use one `AiAdoptedThreadRouteSnapshot` read model instead of independent branch lookups at each surface. The snapshot contains the thread route identity (`lineageVersion`, `branchScopes`, selection map and route hash), one SQL-filtered message page, and a separately calculated `hasEarlierMessages` value. `[]` remains an explicit base-route scope; only callers that intentionally need unrestricted data may pass `undefined` to low-level repository APIs.

The snapshot loader reads the persisted route, resolves its lineage, reads the route-scoped page, then rereads the route identity. If it changed during the read it retries once; the second result is returned with its route identity. This is bounded, keeps the existing SQLite API, and prevents an old prefetch from becoming a visible mixed-route page.

## Alternatives considered

1. Reload after showing the old prefetched page. Rejected because the user can see the wrong route and artifact placement before the correction.
2. Increase the global message-page size. Rejected because a sufficiently active sibling still displaces the adopted branch and the query remains semantically wrong.
3. Replace all history and branch SQL with one broad recursive query. Rejected for this change because it would combine unrelated persistence refactors. The snapshot loader plus route-scoped repository queries is smaller and independently testable.

## Data flow

`thread tap → prefetch snapshot → chat mount consumes snapshot → ref/state set synchronously → render → background snapshot refresh`

`normal mount / pagination / route checkout → snapshot loader → persisted adopted scopes → route-filtered stable page → identical artifact route identity`

`home/history → route-scoped terminal-message projection → one event supplies both sort time and preview`

## Scope

- Add the snapshot service and use it for chat loading and prefetch.
- Preserve `[]` as base route in chat reads and use rowid as the same-timestamp ordering tie-breaker.
- Derive recent-thread sort time and preview from the same visible terminal message.
- Make settings search/tree entry resolve persisted adopted scopes rather than fabricate an empty route.
- Put adopted-route and metadata writes in one SQLite transaction.

The branch tree remains a version graph; this change does not invent ordinary message-tail nodes. It must however load and highlight the persisted lineage rather than synthesize a route from independently newest roots.

## Acceptance criteria

1. Prefetch hit and cold load return the same route identity and page.
2. Empty persisted route loads base-only messages, never all siblings.
3. More than one page of newer unadopted messages cannot remove the adopted route tail.
4. Equal timestamps are ordered and paged by the same stable cursor.
5. Recent-thread time and preview refer to the same visible terminal message.
6. Search/tree settings entry starts from persisted adopted scopes.
7. A failed metadata write cannot leave a new adopted branch committed alone.
