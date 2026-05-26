# AI Role Library Redesign

Date: 2026-05-26
Status: Approved for planning

## Goal

Redesign Pixory AI role management so the role library feels like a real mobile product surface instead of a mixed editor/list screen.

The role library should:

- Display saved role cards in a compact, group-like list.
- Let users start a new chat from a role without opening details first.
- Still provide a detail page for checking long role content before use.
- Keep role creation and editing on a separate screen.
- Support importing role card files without exposing or emphasizing external tool names in UI copy.
- Preserve Pixory's calm, local-first, Android-first design language.

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
- During implementation, UX and UI should be polished beyond the wireframe, using existing design tokens and calm Pixory styling.

## Navigation Model

Add a dedicated role library route, for example `ai-role-library`.

Expected routes:

- `ai-role-library`: saved role cards, empty state, create/import entry.
- `ai-role-card-detail`: role details, collapsible previews, direct new-chat action.
- `ai-role-card-editor`: create/edit/import role card, without embedded saved-role library list.

Entry points:

- AI chat drawer: `角色库`.
- AI home role library entry, if retained, should open the same `ai-role-library` route.
- Existing session setting `角色显示 > 更换` should no longer open the mixed editor. If it remains, it should open role library or a dedicated selection mode, but the main default behavior for role selection is starting a new chat.

Primary navigation outcomes:

- `角色库 > 开聊`: create a new normal chat using the selected role.
- `角色库 > card body`: open role detail.
- `角色详情 > 开始新对话`: create a new normal chat using the selected role.
- `角色库 > + > 保存并开聊`: save the new role and create a new normal chat using it.
- `角色库 > + > 仅保存`: save the role and return to the role library.
- `角色详情 > 编辑`: open editor for that role.

## AI Chat Drawer

The drawer action order should be:

1. `新聊天`
2. `角色库`
3. `历史记录`

`角色库` should use a calm icon that reads as a role/persona library, such as `person-circle-outline`, `albums-outline`, or another existing Ionicons glyph that fits the visual style.

The drawer should close before navigating to the role library.

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

## Data And Safety

This redesign does not require a schema change by default.

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

Keep each unit focused:

- Library lists and routes roles.
- Detail previews and starts chat.
- Editor creates, imports, updates, and saves.
- Chat drawer only exposes navigation actions.

## Verification

Manual verification should cover:

- Chat drawer shows `新聊天`, `角色库`, `历史记录` in order.
- Opening role library from drawer closes the drawer and navigates correctly.
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
- Typecheck and tests pass.

Android visual verification should use real role data, including:

- A self-built role with avatar.
- An imported role with long content.
- A role with multiple alternate greetings.
- An empty role library.

## Open Notes For Implementation

- The exact icon for `角色库` and `开聊` should be chosen during UI polish.
- The final list item dimensions should be adjusted on device so the `开聊` pill is readable without crowding role text.
- If session settings still need current-thread role replacement, it should be designed as a separate selection mode and not override the role library's default "start new chat" behavior.
