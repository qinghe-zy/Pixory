# AI Role Card Detail Hero Redesign

## Goal

Redesign the AI role card detail page to closely match the provided second reference image: a high-fidelity character dossier page with a large image-led hero, softly faded image edges, warm paper-like background, prominent role identity, and preview-card sections for role instructions and greetings.

The redesign applies to `src/screens/AiRoleCardDetailScreen.tsx`.

## Confirmed Direction

- Use approach A: poster-like half-screen hero.
- Treat the role avatar image as a large hero background, not as a small thumbnail.
- Fade the image edges into the page with warm paper-color gradients and subtle overlays.
- Keep the page close to the reference image while still fitting Pixory's Android-first, local-only product style.
- Use existing role card fields only. Do not add database fields or change save/import logic.

## Data Sources

The page uses the current `AiRoleCardRecord` fields:

- `name` for the header and hero title.
- `sourceType` for the `自建` / `导入` badge.
- `avatarEnabled` and `avatarUri` for the hero image.
- `description` for the hero introduction text.
- `prompt` for the `角色指令` section.
- `firstMessage` for the `默认开场白` section.
- `alternateGreetings` for the `更多开场白` section.
- `tags` for the bottom tag row.

No new data model, repository, migration, or editor form field is required.

## Hero Design

The top of the detail page becomes a poster-style hero:

- The hero occupies the first major viewport area and visually replaces the current small-avatar row.
- `SecureImage` renders `card.avatarUri` in a large absolute-positioned layer.
- The image is blended into the page using layered gradients:
  - side fade into the page canvas,
  - bottom fade into the content area,
  - light warm overlay to prevent text collision,
  - optional subtle paper/moon-like shape using plain views and token colors.
- The hero shows:
  - back button,
  - edit button,
  - role name,
  - source badge,
  - short `description`,
  - avatar/greeting meta text,
  - primary action button.
- The primary action remains mode-aware:
  - `开始新对话` in library mode,
  - `应用到当前会话` in apply-to-thread mode.

The image should feel like a background illustration with softened edges. It should not look like a square card pasted into the page.

## Hero Fallback

If `avatarEnabled` is false or `avatarUri` is missing:

- Keep the same hero layout.
- Use a warm paper background, soft circular shape, and person icon or initial-like visual treatment.
- Do not leave a large blank area.
- Keep the role name, badge, description, meta text, and action button visible.

## Content Sections

The lower page uses dossier-style preview sections inspired by the reference:

### Role Instructions

- Always show the `角色指令` section.
- Use `card.prompt` as content.
- If empty, show `暂无角色指令。`.
- Default state shows a readable preview.
- Expanded state shows the full text.
- Header includes a lightweight icon and a chevron affordance.

### Default Greeting

- Show only when `card.firstMessage` exists.
- Use a quote-like preview card treatment.
- Default state previews a few lines.
- Expanded state shows the full greeting.

### More Greetings

- Show only when `card.alternateGreetings.length > 0`.
- Default state shows the first three greetings.
- Include a compact footer such as `查看全部 N 条`.
- Expanded state shows all greetings.

### Tags

- Move tags to the lower part of the page.
- Render tags as light chips similar to the reference.
- Allow wrapping.
- Do not add filtering, editing, or taxonomy behavior.

## Component Boundaries

The implementation should stay local and focused:

- Main page: `src/screens/AiRoleCardDetailScreen.tsx`.
- Existing component to evolve or reuse: `src/components/ai/AiRoleDetailSection.tsx`.
- Existing image component: `src/components/SecureImage.tsx`.
- Existing theme and tokens:
  - `src/components/ai/aiLightTheme.ts`,
  - `src/design/tokens/spacing.ts`,
  - `src/design/tokens/rhythm.ts`,
  - `src/design/tokens/radius.ts`,
  - `src/design/tokens/metrics.ts`,
  - `src/design/tokens/typography.ts`.

Do not touch role card persistence, chat creation behavior, import parsing, or the role library list unless a direct compile issue requires a small type-safe adjustment.

## Interaction Behavior

Existing behavior remains unchanged:

- Back returns to the previous route.
- Edit opens the existing role card editor.
- Starting a new chat still calls `onStartChatWithRole`.
- Applying to the current thread still calls `onApplyRoleToThread`.
- Section expand/collapse remains local UI state.
- Error and busy states continue to use the existing `status` and `starting` logic.

## Responsive And Android Requirements

The page must behave well on Android phone screens:

- Respect safe area and status bar spacing.
- Ensure back and edit buttons remain tappable.
- Keep touch targets at existing token sizes.
- Prevent role name, badge, and action button from overlapping the face or important image region.
- Clamp long `description` text in the hero.
- Prevent long English words or prompt text from overflowing cards.
- Keep the main action button visible and visually dominant in the first screen area.

The design should degrade gracefully when the avatar is a square crop, a face-only image, or a low-resolution imported role card image.

## Visual Style

The target style is warm, premium, and character-forward:

- Warm paper canvas.
- Soft coral primary action.
- Light cream cards.
- Thin hairline borders.
- Minimal shadow.
- Large serif role name.
- Soft faded image edges.

Avoid:

- heavy gradients,
- neon/cyber styling,
- glassmorphism,
- decorative clutter,
- dark cards,
- changing the page into a social profile page.

## Verification Plan

Implementation should be verified with:

- `pnpm typecheck`
- `pnpm test` or a focused relevant policy test if full tests are too slow
- `git diff --check`
- Android visual inspection with real role card data when possible

Visual acceptance checks:

- A role with avatar looks like an image-led poster hero.
- Image edges fade into the page background.
- Role title, badge, description, and primary action remain readable.
- Missing-avatar fallback still looks intentional.
- Long prompt and greeting sections preview cleanly and expand correctly.
- Tags wrap without layout breakage.

## Out Of Scope

- Adding a separate hero image field.
- Selecting a hero image from associated IP assets.
- Changing the role card editor.
- Changing role import behavior.
- Changing chat prompt construction.
- Adding remote assets, cloud sync, or AI image generation.
