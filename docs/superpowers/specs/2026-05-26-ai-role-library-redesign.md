# AI Role And Material Library Redesign

Date: 2026-05-26
Status: Approved for planning

## Goal

Redesign Pixory AI role and material management so the AI workbench feels like a coherent mobile product surface instead of a collection of mixed utility screens.

The role library should:

- Display saved role cards in a compact, group-like list.
- Let users start a new chat from a role without opening details first.
- Still provide a detail page for checking long role content before use.
- Keep role creation and editing on a separate screen.
- Support importing role card files without exposing or emphasizing external tool names in UI copy.
- Preserve Pixory's calm, local-first, Android-first design language.

The material library should:

- Treat each chat thread as having its own material library.
- Use the global material library only as a grouped overview of all existing materials.
- Show global materials by owning conversation so users understand impact before reading or deleting.
- Move material entry points into chat drawer and session settings instead of AI home knowledge-base shortcuts.
- Support importing material from IP snapshots, system files, and manual text.
- Preserve local-only storage, private copied files, and explicit user control over material deletion.

## Current Context

The current `AiRoleCardEditorScreen` mixes several responsibilities:

- Manual role creation and editing.
- Role card import.
- Avatar selection.
- Saved role list.
- Applying a role to a thread.
- Starting a chat with a role.

This makes the screen feel less like a library and more like a development utility. The redesign separates the surfaces into library, detail, and editor flows.

The current avatar picker also limits IP image candidates with `images.slice(0, 12)`. The redesign removes that silent cap and replaces it with a scrollable four-row candidate area.

The current AI material flow still exposes `问问某个 IP`, `连接知识库`, a knowledge-base management screen, and a material list that can show recent or knowledge-base-owned materials. The database already supports `ai_documents.ownerType = 'thread'`, so the redesign can prioritize thread-owned material libraries without requiring a new table by default.

## User Decisions

The following decisions are fixed:

- Role library opens from the AI chat drawer.
- In the chat drawer, add `角色库` below `新聊天`.
- Role library list uses a compact left-image/right-info layout similar to the existing group overview page.
- The top-right role library action is a circular framed `+`.
- Pressing `+` opens the existing role creation flow, refactored as a dedicated create/edit screen.
- Role library cards show source tags as `自建` or `导入`.
- Do not mention or emphasize `SillyTavern`, `酒馆`, or other external role-card tools in visible UI.
- The library card body opens role details.
- A small right-side pill button labeled `开聊` starts a new chat directly with that role.
- Role details include collapsible long-content preview sections.
- Creating a role uses primary action `保存并开聊` and secondary action `仅保存`.
- Empty role library shows a real empty state with `新建角色` and `导入角色卡`.
- Self-built role avatar selection from IP images shows four rows by default and scrolls inside the candidate area.
- AI home keeps `开始聊天` and `角色库`, and removes `问问某个 IP` and `连接知识库`.
- The AI chat drawer action order becomes `新聊天`, `角色库`, `历史记录`, `总资料库`.
- The global material library shows all materials grouped by owning conversation and supports reading and multi-select deletion.
- Session settings add a current-thread `资料库` entry in the current-session card, alongside `模型账号`.
- Each conversation has its own material library for adding, reading, deleting, and multi-select deleting materials.
- Conversation material library uses a top-right framed `+` to add material.
- Adding material supports `从 IP 导入`, `从系统文件导入`, and `手动文本`.
- IP import creates a snapshot and supports manual refresh; it does not dynamically track IP changes.
- During implementation, UX and UI should be polished beyond the wireframe, using existing design tokens and calm Pixory styling.

## Navigation Model

Add a dedicated role library route, for example `ai-role-library`.

Expected routes:

- `ai-role-library`: saved role cards, empty state, create/import entry.
- `ai-role-card-detail`: role details, collapsible previews, direct new-chat action.
- `ai-role-card-editor`: create/edit/import role card, without embedded saved-role library list.
- `ai-global-material-library`: all materials grouped by owning conversation.
- `ai-thread-material-library`: current conversation's material library.
- `ai-material-import`: source picker/import flow for a target thread.

Entry points:

- AI chat drawer: `角色库`.
- AI chat drawer: `总资料库`.
- AI home role library entry, if retained, should open the same `ai-role-library` route.
- AI session settings current-session card: `资料库`, opening the current thread's material library.
- Existing session setting `角色显示 > 更换` should no longer open the mixed editor. If it remains, it should open role library or a dedicated selection mode, but the main default behavior for role selection is starting a new chat.

Primary navigation outcomes:

- `角色库 > 开聊`: create a new normal chat using the selected role.
- `角色库 > card body`: open role detail.
- `角色详情 > 开始新对话`: create a new normal chat using the selected role.
- `角色库 > + > 保存并开聊`: save the new role and create a new normal chat using it.
- `角色库 > + > 仅保存`: save the role and return to the role library.
- `角色详情 > 编辑`: open editor for that role.
- `聊天抽屉 > 总资料库`: open grouped global material overview.
- `会话设置 > 资料库`: open current thread material library.
- `对话资料库 > +`: choose material source.
- `对话资料库 > + > 从 IP 导入`: create or refresh a thread-owned IP snapshot material.
- `对话资料库 > + > 从系统文件导入`: import one or more local files into the current thread library.
- `对话资料库 > + > 手动文本`: add manual text material to the current thread library.
- `总资料库 > 对话卡片 > 管理`: open that thread's material library.
- `资料行 > 阅读`: open the existing document/text reader.

## AI Chat Drawer

The drawer action order should be:

1. `新聊天`
2. `角色库`
3. `历史记录`
4. `总资料库`

`角色库` should use a calm icon that reads as a role/persona library, such as `person-circle-outline`, `albums-outline`, or another existing Ionicons glyph that fits the visual style.

The drawer should close before navigating to the role library.

`总资料库` should also close the drawer before navigating to the global material library. It should use a calm library/document icon and should not be visually louder than `历史记录`.

## AI Home Simplification

AI home should become lighter and should stop exposing old material-specific entry points.

Keep:

- `开始聊天`
- `角色库`

Remove:

- `问问某个 IP`
- `连接知识库`

Material management should move to:

- Chat drawer `总资料库`
- Session settings `资料库`
- Per-thread material library

This keeps AI home focused on starting conversations and choosing roles, while material work happens in conversation context.

## Role Library Screen

The role library is a display-first screen.

Header:

- Title: `角色库`
- Subtitle: `选择角色开始新对话` or similar short text.
- Right action: circular framed `+`.

List item layout:

- Left: role avatar or neutral placeholder.
- Right: role name, source tag, short description, compact metadata.
- Far right: small pill button `开聊`.

Interaction:

- Press card body: open role detail.
- Press `开聊`: start a new chat with the role immediately.
- Press `+`: open role editor in create mode.

Source labels:

- Manual Pixory role: `自建`
- Imported role card: `导入`

Avoid source labels such as `酒馆角色` or external tool names.

Suggested metadata:

- Avatar state when useful, such as `头像开启`.
- Greeting count when useful, such as `2 个问候`.
- Recent update time.

The list should not become visually dominated by action buttons. `开聊` should be clear but light, closer to a small pill than a full-width CTA.

## Empty State

When there are no saved role cards:

- Show a designed empty state, not a blank list.
- Include a simple role/person icon or illustration.
- Title example: `还没有角色`
- Description example: `创建一个常用角色，或导入已有角色卡，之后可以从角色库快速开启新对话。`
- Primary action: `新建角色`
- Secondary action: `导入角色卡`

Both actions open the dedicated editor/import flow.

## Role Detail Screen

Role detail should help users inspect the role without forcing them to read every long field.

Header:

- Title: `角色详情`
- Subtitle: role name or `选择后开启新对话`.
- Right action: edit icon.

Default visible sections:

- Avatar
- Name
- Source label: `自建` or `导入`
- Tags
- Short description
- Collapsed `角色内容`
- Collapsed `首句与备用问候`

Main action:

- `开始新对话`

Collapsible behavior:

- Long role prompt is collapsed by default.
- The collapsed state shows 2-3 lines plus an approximate length or a clear `展开` action.
- Expanded state shows full content and a `收起` action.
- Greeting section is collapsed by default and expands to show the first message plus alternate greetings.

This page may include additional metadata if useful, but it should stay calm and readable. Details should not crowd the primary action.

## Role Editor Screen

The editor becomes a dedicated create/edit surface.

Core fields:

- Name
- Description
- Role content
- Avatar
- Tags if already supported or low-risk to expose
- First message and alternate greetings, when imported or manually edited

Actions:

- Primary: `保存并开聊`
- Secondary: `仅保存`

Import:

- Provide a visible action such as `导入角色卡` or `从文件导入`.
- The UI should not explain or emphasize external formats by brand/tool name.
- Copy should be neutral, for example: `导入后可继续编辑名称、头像和角色内容。`
- Internally, existing PNG/JSON compatibility can remain.

Editing existing roles:

- The primary action may become `保存并开聊` if starting a new chat is still useful.
- A secondary `仅保存` remains available.
- Returning after `仅保存` should preserve the user's previous route when reasonable.

## Avatar Selection From IP

The self-built role avatar flow should support selecting from existing IP images.

Current limitation:

- The current implementation silently limits candidates to 12 images.

New behavior:

- Do not silently limit to 12.
- Show a candidate area with four visible rows by default.
- The candidate area scrolls internally when there are more images.
- Keep the editor page itself stable and avoid making the full page extremely long.
- Use existing image components and privacy handling.
- If performance becomes a concern, use lightweight pagination or incremental loading rather than rendering an unbounded grid at once.

## Session Settings Material Entry

The current-session card in session settings should expose the current thread material library.

Use the chosen layout:

- Top: `当前会话`, thread title, rename action.
- Meta row: space, material boundary mode, role summary, and material count such as `3 份资料`.
- Bottom action row: two same-level pill buttons, `模型账号` and `资料库`.

`资料库` opens the current thread's material library. If the thread does not exist yet, the app should first create or resolve the thread through the same safe path used before opening session settings.

The button row should avoid squeezing the thread title. The material count in the meta row should update after adding or deleting materials.

## Thread Material Library

Each conversation has its own material library.

Purpose:

- Manage only the current thread's materials.
- Add materials to the current thread.
- Read materials in the existing document/text reader.
- Delete one material.
- Multi-select delete materials.
- Refresh IP snapshot materials.

Header:

- Title: `资料库`
- Subtitle: current thread title or `当前对话`.
- Right action: circular framed `+`.

The `+` action opens a source picker with:

- `从 IP 导入`
- `从系统文件导入`
- `手动文本`

Material list rows should show:

- Title
- Source label: `从 IP 导入`, `从系统文件导入`, or `手动文本`
- Parser status, such as `可用`, `处理中`, or `失败`
- Updated time when useful
- Reading action
- Optional refresh action for IP snapshot materials

Delete behavior:

- Single delete removes the material record and local AI index for that thread.
- Multi-select delete uses a footer or action bar consistent with existing batch delete patterns.
- Deletion must not delete the user's original system file.
- Deletion may delete Pixory's private copied material file if the implementation already treats it as the managed material copy; this should be explicit in confirmation copy if done.

Empty state:

- Title example: `当前对话还没有资料`
- Description example: `添加 IP 信息、文件或手动文本后，AI 会优先参考这些资料回答。`
- Primary action: `添加资料`

## Adding Materials

Adding materials should be scoped to a target thread.

Supported sources:

- IP import
- System file import
- Manual text

System file import:

- Supports multiple file selection.
- Copies selected files into Pixory-controlled local storage.
- Parses supported text-like documents through the existing reader/parser pipeline.
- Shows import result counts for success and failed parsing.

Manual text:

- Lets the user provide a title and text.
- Saves the text as thread-owned material.
- Parses and indexes it for retrieval.

IP import:

- Creates a snapshot document from the selected IP's current data.
- Stores that snapshot in the current thread material library.
- Does not automatically track future IP changes.
- Shows source label `从 IP 导入`.
- Provides `刷新 IP 资料` for manually regenerating the snapshot and index.

IP snapshot content should include practical structured data that helps the AI answer:

- IP name and description.
- Counts for images, videos, groups, tags, and storage size when available.
- Group names and types.
- Tag usage overview.
- Recent import batches.
- A bounded list of asset filenames, media types, favorite status, and notes.

The first implementation can reuse and refine the existing `generateIpMaterial` behavior, but it should save the result under `ownerType = 'thread'` and the current thread id.

## Global Material Library

The global material library is an overview of all existing materials.

It is not a separate knowledge-base creation flow.

Header:

- Title: `总资料库`
- Subtitle or meta: total material count and conversation count.

Search:

- Provide a single search field.
- Search should match material titles and conversation names.
- Search results remain grouped by owning conversation.
- Do not add type filters in the first version.

Default layout:

- Each conversation is a light card.
- The card header shows conversation title, material count, recent update time, and a lightweight `管理 ›` action.
- The card body contains compact material rows.
- Each material row can open the reader.

This replaces the earlier fragmented layout where group title, metadata, action, material card, and reading action appeared as separate visual fragments.

Global deletion:

- The global material library supports multi-select deletion.
- Selection can happen at material-row level.
- Delete confirmation must state how many materials and how many conversations are affected.
- Deletion removes the selected material records and local indexes.
- Deletion should preserve user original system files.

Global management:

- Pressing `管理 ›` on a conversation card opens that thread's own material library.
- If the owning thread has been deleted or cannot be opened, the UI should still let the user read/delete orphaned material safely and show a clear ownership label such as `已删除会话`.

## Retrieval Behavior

Normal chats should be able to use their own thread material library.

Prompt/retrieval behavior should prefer the current thread's materials when present:

- For a normal chat with thread materials, retrieval should search `ownerType = 'thread'` and `ownerId = thread.id`.
- Existing knowledge-base and IP context types should not be the primary new user flow.
- If old knowledge-base or IP-bound threads exist, keep them readable and avoid breaking existing chats.

This may require updating prompt-building logic that currently retrieves by `contextType === 'ip' ? 'ip' : 'knowledge_base'`.

The redesigned user-facing flow is:

- Start a normal chat.
- Add materials to that chat.
- Ask questions in that chat using its materials.

The old `问问某个 IP` behavior is replaced by:

- Start/open a chat.
- Open its material library.
- Add IP snapshot material.
- Continue chatting with that material in context.

## Data And Safety

This redesign should not require a schema change by default for role cards or thread-owned materials.

Use existing role-card fields:

- `name`
- `description`
- `prompt`
- `avatarEnabled`
- `avatarUri`
- `firstMessage`
- `alternateGreetings`
- `sourceType`
- `tags`
- timestamps

Starting a new chat from a role should use existing role snapshot behavior so later edits do not mutate older chat records unexpectedly.

Imported avatar files must continue to be copied into Pixory-controlled local storage. Do not depend on temporary picker URIs as permanent references.

Use existing material fields:

- `ownerType`
- `ownerId`
- `sourceType`
- `title`
- `originalFilename`
- `localUri`
- `mimeType`
- `fileSize`
- `parserStatus`
- `parserError`
- `metadataJson`
- timestamps

Thread-owned materials should use:

- `ownerType = 'thread'`
- `ownerId = thread.id`

Imported system files must continue to be copied into Pixory-controlled local storage. Do not rely on unstable picker URIs.

Material deletion should be explicit and confirm scope. It should remove Pixory material records and indexes; original external system files remain untouched.

## Visual Direction

The UI should match Pixory's AI light surfaces while still following the broader project direction:

- Clean
- Calm
- Premium
- Practical
- Mobile-first
- Information-dense but not crowded

Use shared tokens from `src/design/tokens/`:

- `spacing`
- `rhythm`
- `metrics`
- `radius`
- `colors` or AI light theme colors as appropriate
- `typography`

Avoid large decorative cards, heavy gradients, excessive glass effects, and UI copy that explains implementation details.

## Suggested Implementation Shape

Create or refactor toward these units:

- `AiRoleLibraryScreen`
- `AiRoleCardDetailScreen`
- `AiRoleCardEditorScreen`
- `AiRoleCardListItem` or equivalent reusable component
- `RoleContentPreview` or equivalent collapsible text component
- Avatar candidate picker section inside the editor
- `AiGlobalMaterialLibraryScreen`
- `AiThreadMaterialLibraryScreen`
- Material source picker/action sheet
- Thread material list row component
- Conversation material group card component

Keep each unit focused:

- Library lists and routes roles.
- Detail previews and starts chat.
- Editor creates, imports, updates, and saves.
- Chat drawer only exposes navigation actions.
- Global material library groups materials by conversation.
- Thread material library owns adding, reading, deleting, and refreshing thread materials.
- Import flow writes to the selected target owner, especially `thread`.
- Reader screens remain responsible for reading parsed document content.

## Verification

Manual verification should cover:

- Chat drawer shows `新聊天`, `角色库`, `历史记录`, `总资料库` in order.
- Opening role library from drawer closes the drawer and navigates correctly.
- Opening global material library from drawer closes the drawer and navigates correctly.
- AI home shows `开始聊天` and `角色库`, and no longer shows `问问某个 IP` or `连接知识库`.
- Session settings current-session card shows `模型账号` and `资料库` in the bottom action row.
- Session settings meta row shows current thread material count.
- Empty role library shows `新建角色` and `导入角色卡`.
- Role list shows `自建` / `导入`, not external tool names.
- Pressing card body opens role detail.
- Pressing `开聊` starts a new chat with that role.
- Role detail starts a new chat with the selected role.
- Long role content is collapsed by default and can expand/collapse.
- Greeting section is collapsed by default and can expand/collapse.
- Creating a role with `保存并开聊` saves the role and starts a new chat.
- Creating a role with `仅保存` saves and returns to the library.
- Importing a role card uses neutral UI copy.
- Avatar selection from IP images shows four rows and scrolls when there are more images.
- Current thread material library opens from session settings.
- Thread material library `+` opens source choices for IP, system files, and manual text.
- System file import supports selecting multiple files.
- IP import creates a thread-owned snapshot material.
- IP snapshot material can be manually refreshed.
- Thread material library supports reading, single delete, and multi-select delete.
- Global material library shows materials grouped by conversation cards.
- Global material library search matches material titles and conversation names while preserving grouping.
- Global material library supports multi-select delete with confirmation that names affected conversation count and material count.
- Material rows open the existing reader/text reader path.
- Normal chats with thread-owned materials retrieve from `ownerType = 'thread'`.
- Existing old IP or knowledge-base threads remain readable.
- Typecheck and tests pass.

Android visual verification should use real role data, including:

- A self-built role with avatar.
- An imported role with long content.
- A role with multiple alternate greetings.
- An empty role library.
- A chat with no materials.
- A chat with IP snapshot material.
- A chat with multiple imported files.
- A global material library containing materials from at least two conversations.
- A deleted or missing thread ownership edge case if local data can produce it.

## Open Notes For Implementation

- The exact icon for `角色库` and `开聊` should be chosen during UI polish.
- The final list item dimensions should be adjusted on device so the `开聊` pill is readable without crowding role text.
- If session settings still need current-thread role replacement, it should be designed as a separate selection mode and not override the role library's default "start new chat" behavior.
- The exact icon for `总资料库` should be chosen during UI polish.
- The first implementation should avoid rebuilding the old knowledge-base creation UI unless needed for backward compatibility.
- The material retrieval update is the highest-risk part because it changes how normal chats gather context.
