# SillyTavern Role Card Import Design

## Status

Approved design for an implementation plan. This document supersedes the draft in `report/implementation_plan.md` and narrows it into a shippable Pixory feature.

## Goal

Add a production-ready role card import experience for Pixory AI. Users can import SillyTavern-compatible character cards, save them into Pixory's local role library, and optionally start a normal AI chat immediately with the imported character.

This is an AI-first feature. It must not be constrained by the IP asset workflow, but it must preserve Pixory's local-first and Android-first reliability rules.

## Non-Goals

- No cloud role library, account system, sync, or remote parsing.
- No modification of the source PNG or JSON file.
- No full SillyTavern runtime in this version.
- No dynamic world-book keyword scanning.
- No regex scripts, macro engine, group chat behavior, or CHARX asset package handling.
- No forced changes to existing Pixory role cards.

## References

- Character Card V2 public spec: `spec: "chara_card_v2"` with role data under `data`, including `alternate_greetings`, `tags`, `creator`, `character_version`, `extensions`, and optional `character_book`.
- Character Card V3 public spec: supported as an import source. Pixory imports known V2-compatible role fields and preserves unknown V3 fields in the saved source JSON.

## Product Scope

The first shippable version supports:

- PNG role card import from embedded `chara` metadata.
- JSON role card import.
- Character Card V2.
- Character Card V3, with unknown fields preserved.
- Best-effort V1 flat JSON compatibility for common fields.
- Imported avatar image copied into Pixory private role avatar storage.
- Full original source JSON stored locally for future upgrades.
- Multiple greetings imported, with a preview-time default greeting selector.
- Enabled character-book entries statically merged into the generated Pixory prompt.
- A role library entry on the AI workbench, replacing the current recent-materials area.
- Materials remain available through the material list rather than a recent-materials block on the workbench.

## User Flows

### AI Workbench Entry

The AI workbench exposes a primary `角色库` entry where the current recent-materials block sits. Opening it shows the existing role editor/library screen, evolved into a role library surface.

From this entry, `保存并开始聊天` always creates a normal AI chat. It does not bind an IP or knowledge base by default.

### Session Settings Entry

The existing session settings role entry remains. When opened from a thread, the role library can still apply a saved role to the current session.

### Import Flow

1. User taps `导入角色卡`.
2. Pixory opens a document picker for PNG and JSON files.
3. Pixory parses the selected file locally.
4. Pixory shows an import preview.
5. User chooses one of:
   - `保存角色`
   - `保存并开始聊天`
   - `编辑后保存`

`保存并开始聊天` saves the role, creates a normal AI chat, applies the role, and inserts the selected default greeting as an assistant opening message when present.

`编辑后保存` fills the existing role editor with parsed fields so the user can adjust before saving.

### Plain PNG Fallback

If a selected PNG has no role metadata, Pixory offers a fallback path: use the PNG only as a role avatar and continue in the regular role editor. The app must clearly say that no character data was detected.

## UI Requirements

The interface should remain calm, dense, and mobile-first. Avoid theatrical copy such as "唤醒", "神经元", glow effects, or breathing animations.

Preferred labels:

- `导入角色卡`
- `解析角色卡中`
- `保存角色`
- `保存并开始聊天`
- `编辑后保存`
- `未检测到角色数据`
- `部分附加设定因长度限制未导入`

The import preview shows:

- Avatar preview.
- Name.
- Description or creator notes.
- Tags.
- Creator and character version when present.
- Greeting selector when more than one greeting is available.
- Prompt composition summary.
- Character-book merge status and truncation notice.
- A compact error or warning banner for non-fatal import issues.

## Data Model

Extend `AiRoleCardRecord` and `ai_role_cards` with backward-compatible fields:

- `firstMessage TEXT` nullable.
- `alternateGreetingsJson TEXT NOT NULL DEFAULT '[]'`.
- `sourceType TEXT` nullable.
- `sourceJson TEXT` nullable.

Recommended source type values:

- `sillytavern_png_v2`
- `sillytavern_png_v3`
- `sillytavern_json_v2`
- `sillytavern_json_v3`
- `tavern_json_v1`
- `pixory_manual`

Manual Pixory role cards do not need source fields. Existing cards continue to map safely with null/default values.

## Compatibility Rules

Existing user-created role cards must remain first-class:

- Old role rows with no new fields still load.
- Manual role save does not require `firstMessage`, `alternateGreetingsJson`, `sourceType`, or `sourceJson`.
- Applying an existing role continues to use `roleCard.prompt` as the system prompt.
- No assistant opening message is inserted unless the saved role explicitly has `firstMessage` and the current flow is creating a new chat from that role.
- Imported SillyTavern cards never rewrite existing roles unless the user manually edits and saves over a role in a future update flow.

Database migration must only add columns. It must not rebuild the role table, rewrite old prompts, or batch-update old cards.

## Parsing Design

### PNG Parser

Implement a small PNG chunk parser rather than scanning with regex.

Parser behavior:

- Validate PNG signature.
- Walk chunks by length, type, data, and CRC boundaries.
- Read `tEXt` chunks with keyword `chara`.
- Best-effort support for `iTXt` when keyword is `chara`.
- Decode base64 payload into UTF-8 JSON.
- Enforce file and payload size limits before decoding.
- Return structured errors for invalid PNG, missing metadata, invalid base64, and invalid JSON.

The parser does not modify the PNG and does not depend on Node-native modules.

### JSON Parser

JSON import accepts:

- V2 wrapper: `spec: "chara_card_v2"` with `data`.
- V3 wrapper: `spec: "chara_card_v3"` with recognizable role data.
- V1 flat JSON as best-effort compatibility when common flat fields exist.

Unsupported or malformed files produce specific user-facing errors.

## Field Mapping

Pixory normalized fields:

- `name`: card name, falling back to `未命名角色`.
- `description`: creator notes or short role description.
- `prompt`: generated markdown prompt.
- `avatarUri`: copied local avatar URI for PNG imports or user-selected avatar for JSON imports.
- `tags`: imported tags when present.
- `firstMessage`: selected default greeting.
- `alternateGreetingsJson`: all available greetings, including `first_mes`.
- `sourceJson`: original parsed JSON.
- `sourceType`: import format and version.

Prompt composition order:

1. Role description.
2. Personality.
3. Scenario.
4. System prompt.
5. Post-history instructions.
6. Message examples.
7. Enabled character-book entries as `附加设定`.

Do not invent missing fields. Empty sections are omitted.

## Greetings

Collect greetings in this order:

1. `first_mes`
2. each non-empty `alternate_greetings` item

Deduplicate exact duplicates after trimming. The preview allows selecting one default greeting. The selected value is saved as `firstMessage`; the full list is saved as `alternateGreetingsJson`.

First version does not add greeting switching inside the chat screen.

## Character Book Handling

This version statically merges enabled entries into the generated prompt. It does not implement keyword-triggered dynamic lore.

Rules:

- Only entries where `enabled !== false` are candidates.
- Use entry `content`; include entry name/comment only as lightweight labels when helpful.
- Preserve original order where possible, falling back to insertion order.
- Apply a strict character budget to the merged section.
- If truncated, store the original source JSON and show a preview warning.

## Chat Creation Behavior

When `保存并开始聊天` is selected from the AI workbench:

- Save the imported role card.
- Create a normal chat route.
- Apply the role card to the new thread.
- If `firstMessage` is non-empty, insert it as an assistant message with completed status before user input.
- Do not bind IP or knowledge-base context.

When a role is saved from a session settings flow:

- Save/apply to the current thread.
- Do not insert a greeting into an existing thread.
- Future replies use the new role prompt.

## Error Handling

Show specific messages for:

- Unsupported file type.
- Invalid PNG.
- PNG has no role metadata.
- Invalid base64 role payload.
- Invalid JSON.
- Unsupported spec.
- Missing usable role content.
- Avatar copy failure.
- Prompt or world-book truncation.
- Database save failure.

For plain PNG fallback, the user can continue with avatar-only role creation.

## Storage and Privacy

- All parsing happens locally.
- Imported source JSON is stored only in local SQLite.
- Avatar images are copied into Pixory private app storage.
- The original imported file is not modified.
- No API call is made during import.
- Normal/personal space scoping must be preserved for role rows and avatar storage.

## Test Plan

Add parser unit tests for:

- Valid V2 JSON.
- Valid V3 JSON with unknown fields preserved.
- Best-effort V1 flat JSON.
- PNG with `tEXt` `chara`.
- PNG with missing `chara`.
- Invalid base64.
- Invalid JSON.
- Character-book truncation.
- Greeting deduplication and default selection.

Add policy tests for:

- AI workbench replaces recent materials with role library.
- Materials remain reachable through material list.
- Role editor exposes `导入角色卡`.
- Import preview exposes `保存角色`, `保存并开始聊天`, and `编辑后保存`.
- New role fields exist in schema, types, repository, and service.
- Existing manual roles still save without source fields.
- Applying old roles does not insert greetings.
- Starting chat from imported role inserts `firstMessage`.
- No network or cloud dependency is introduced.

Run:

- `pnpm typecheck`
- `pnpm test`
- `git diff --check`

Manual Android validation:

- Import PNG V2 card.
- Import JSON V2 card.
- Import V3 card with unknown fields.
- Import plain PNG and continue as avatar-only role.
- Save role only.
- Save and start chat with selected greeting.
- Apply imported role from existing session settings.
- Verify existing manual roles still load, edit, save, and apply.

## Open Risks

- Public V3 cards may vary in structure. Pixory should preserve unknown fields and import only recognized role fields.
- Static character-book merge can make prompts long. The implementation must enforce a budget and clearly show truncation.
- Opening-message insertion touches chat creation behavior. It must be isolated to new-chat-from-role flows.
- Existing uncommitted AI chat P0 fixes are unrelated and should not be mixed into this feature implementation commit unless intentionally batched later.

