# AGENTS.md

## Project

Pixory is now centered on an Android-first companion-style AI chat experience.

The AI chat module is the product center of gravity: long-running companionship, role cards, memory, branchable conversations, local materials, IP/knowledge-base context, and a polished mobile chat workflow should guide product and engineering decisions.

The original IP asset manager remains important as a local material, metadata, and privacy foundation for the chat experience, but do not over-optimize new work around traditional gallery or archive management unless the user explicitly asks for it.

Pixory is not a cloud album, social app, generic image editor, or AI image generator by default.

Server-side AI infrastructure, AI gateways, prompt caching, semantic caching, provider routing, and observability may be introduced when explicitly requested for the AI chat roadmap. Do not treat the older "no server" asset-manager rule as blocking this new chat-first direction.

## Core Rules

- Build for Android first.
- Prioritize the companion AI chat module over classic local asset-management polish.
- Keep the chat experience emotionally coherent, fast, recoverable, and trustworthy.
- Treat conversation history, role cards, memory, branches, materials, and provider settings as first-class product data.
- Store local chat data, memory, role cards, material metadata, and asset metadata in SQLite unless a requested server architecture explicitly changes that boundary.
- API keys and sensitive settings must remain protected; on-device keys belong in SecureStore, and server-side keys must never be exposed to the mobile client.
- Personal space data must stay strongly isolated from normal space data.
- If adding server-side AI infrastructure, define privacy boundaries, cache scopes, retention, deletion behavior, and user-visible risk before implementation.
- Imported images and videos that are kept as Pixory materials must still be copied into app/private or managed local storage.
- Never compress, crop, overwrite, re-encode, or replace original imported assets unless the user explicitly requests a derived preview/export operation.
- Thumbnails and previews are allowed only as separate preview files.
- The UI must feel like a real polished mobile product, not an AI mockup.

## Recommended Stack

Use:

- Expo
- React Native
- TypeScript
- Expo Router
- SQLite
- Local file system storage
- SecureStore for local provider secrets
- Zustand or another lightweight state solution

For the mobile app, keep using the existing Expo / React Native stack unless a stronger reason exists.

For explicitly requested AI server work, prefer a small AI gateway architecture over broad backend rewrites. Add only the minimum server components needed for provider routing, prompt compilation, caching, observability, or secure key handling.

## AI Chat Mode

The default product mode is companion-style AI chat.

Important AI chat capabilities include:

- Multi-provider chat through user-configured or server-routed model providers.
- Role cards, role prompts, first messages, avatars, and per-session role configuration.
- Long-lived threads with local history, search, favorites, branch versions, and regeneration/edit routes.
- Deep memory that is user-controllable, scoped, undoable, and resistant to prompt injection.
- Thread, IP, and knowledge-base materials for RAG-style context.
- Prompt assembly that separates stable instructions, memory snapshots, retrieved context, conversation history, and the current user request.
- Streaming replies that remain recoverable if the app backgrounds, route changes, or generation is stopped.

Do not assume chat is a secondary feature. When tradeoffs appear, protect chat continuity, memory correctness, provider reliability, and user trust first.

## AI Cache Direction

When optimizing AI chat cost or latency, think in layers:

```txt
Exact cache
> Provider prompt caching / prefix caching
> Embedding and RAG retrieval cache
> Carefully scoped semantic cache
> Self-hosted KV cache only when explicitly requested
```

Cache rules:

- Normalize cache keys and include model, provider, prompt version, memory epoch, retrieval version, scope, and generation parameters when relevant.
- Keep stable prompt content at the front and dynamic content near the end.
- Do not put timestamps, request IDs, random values, or volatile retrieval results into reusable prompt prefixes.
- Cache low-risk deterministic sub-tasks first: title generation, summary compression, memory extraction, profile maintenance, embeddings, retrieval results, and FAQ-like answers.
- Do not default to semantic caching for private companion replies, role-play replies, or Personal space conversations.
- Semantic cache entries must be scoped by space, thread, role card, IP, knowledge base, branch route, memory version, and document version as applicable.
- Record cache observability when possible: exact hit, semantic hit, provider cached tokens, prompt tokens, completion tokens, latency, cost estimate, and miss reason.
- If a server AI gateway is introduced, keep cache retention, user deletion, Personal space isolation, and provider-key handling explicit.

## Main Concepts

### AI Thread

The main interaction unit for companion chat.

Each thread may have:

- Space: normal or personal
- Context type: normal, IP-bound, or knowledge-base-bound
- Role card and role snapshot
- Provider/model configuration
- Branch route and message versions
- Deep memory settings
- Local materials and citations
- Summary/profile/memory maintenance state

### Role Card

A reusable companion identity and behavior profile.

Role cards may include prompt, first message, alternate greetings, avatar, tags, boundary mode, default language, and model preference.

Role instructions are product-critical. Preserve them carefully during prompt assembly, session updates, imports, and cache optimization.

### Memory

Memory is scoped product data, not a loose text dump.

Memory may be global, thread, role, IP, or knowledge-base scoped. Automatic global memory should remain conservative. User-controlled memory editing, undo, stale marking, and scope visibility are important.

### Material / Knowledge

### IP

The top-level local material unit.

An IP may represent a character, visual identity, theme, brand image, creative series, or chat context source.

### Group

A lightweight way to organize assets inside an IP.

Default group types:

- Seasonal
- Scene
- Festival
- Usage
- Custom

### Tag

Tags are user-defined and simple.

Support creating, displaying, searching, filtering, adding, and removing tags.

Do not build complex tag categories, aliases, merge rules, or taxonomy systems by default.

### Image Asset

Each imported image or video material should keep enough metadata to support browsing, retrieval, backup, and chat citation.

For images, keep:

- Original file path
- Thumbnail file path
- IP ID
- Group ID
- Tags
- Original filename
- Internal filename
- Width
- Height
- MIME type
- File size
- Favorite status
- Note
- Created time
- Updated time
- Last viewed time
- Deleted state

## Storage Rules

Use a local structure similar to:

```txt
AppData/
├─ database/
│  └─ pixory.sqlite
├─ assets/
│  └─ originals/
│     └─ ip_{ipId}/
├─ thumbnails/
│  └─ ip_{ipId}/
├─ exports/
└─ temp/
```

Do not rely on temporary gallery URIs as permanent references.

## Image Import Rule

Batch import remains important when it supports chat materials, IP context, role assets, and local knowledge organization.

Correct import flow:

```txt
Select images
→ copy originals to local storage
→ read metadata
→ generate separate thumbnails
→ save records to SQLite
→ assign IP / group / tags
→ show import result
```

Forbidden behavior:

- Compressing originals
- Cropping originals
- Re-encoding originals
- Overwriting originals
- Using thumbnails as originals
- Depending on unstable external file URIs
- Physically deleting files without explicit confirmation

## UI Direction

The UI should be:

- Clean
- Calm
- Premium
- Practical
- Mobile-first
- Information-dense but not crowded
- Consistent across screens
- Light and refined
- Suitable for Android while keeping an iOS-like sense of polish

For AI chat screens specifically, prioritize:

- Calm, emotionally present conversation surfaces.
- Fast readable streaming without jitter.
- Clear model/provider/session state without visual noise.
- Trustworthy memory controls and transparent citations.
- Branch, regenerate, edit, favorite, and search flows that feel natural on mobile.
- Empty states that invite starting or continuing a meaningful chat, not generic feature promotion.

Avoid:

- Obvious AI-generated style
- Heavy gradients
- Neon or cyber style
- Excessive glassmorphism
- Decorative clutter
- Large meaningless cards
- Fake placeholder text
- Empty screens without designed empty states

For future page creation or page polish work, follow the reusable design context in:

```text
.impeccable.md
```

Default expectation:

- optimize one page around one primary visual focus
- reduce visual weight before adding decoration
- prefer token-level fixes before page-level one-offs
- all new UI components must use the shared design tokens from `src/design/tokens/` for spacing, rhythm, radius, color, typography, dimensions, and touch targets before introducing any local hard-coded values
- use `src/design/tokens/rhythm.ts` for new page/component vertical rhythm before adding ad-hoc `gap`, `rowGap`, `marginTop`, or `marginBottom`
- use `spacing`, `rhythm`, `metrics`, `radius`, `colors`, and `typography` tokens in component styles; only use literal values when a token cannot express the behavior, and leave a short code comment explaining why
- validate on Android screenshots with real data, not empty state only

## Empty States

Empty states must be treated as real product screens.

Important empty states include:

- No AI threads
- No role cards
- No chat search results
- No memories
- No materials
- No IPs
- No images
- No groups
- No tags
- No search results
- No favorites
- No recently viewed items
- Empty recycle bin

Each empty state should include:

- Simple icon or illustration
- Clear title
- Short explanation
- Primary action

## Deletion Rule

Deleting an image should use soft delete by default.

The app should:

1. Mark the image as deleted.
2. Move it to recycle bin state.
3. Allow restore.
4. Physically delete original and thumbnail files only when the user explicitly clears the recycle bin.

## Backup Principle

Because Pixory stores important local chat and material data, backup/export must preserve complete data.

A valid backup should include:

- SQLite database
- Original image folder
- Thumbnail folder
- AI documents/material files
- Role avatars and local role assets
- Manifest file

Backups must include chat data, memory-related records, original assets, and material files, not only thumbnails or rendered previews.

## Development Priority

When tradeoffs appear, follow this order:

```txt
Companion chat continuity and trust
> Privacy and Personal space isolation
> Memory, branch, and context correctness
> Provider reliability and recoverable generation
> Local data consistency
> Original asset safety
> Simple mobile UX
> Clean UI
> Future extensibility
```

Do not sacrifice chat continuity, memory correctness, privacy isolation, or local data consistency for faster UI completion. Do not damage original asset safety while adding chat features.

## Feature Matrix Maintenance

The project-wide feature inventory lives in:

```text
docs/feature-matrix.md
```

When adding, removing, renaming, or materially changing any user-visible feature, backend/service capability, repository data model, native bridge behavior, import/export flow, AI chat capability, privacy behavior, backup behavior, storage behavior, release workflow, or major test coverage area, update `docs/feature-matrix.md` in the same change.

Before packaging or writing release notes, review `docs/feature-matrix.md` against the changed files and tests. If the matrix is intentionally not updated, explain why in the final report.

## Release And Packaging Workflow

When the user says `打包`, `发布`, `上线`, `推送更新`, or asks to package the current Pixory build without adding more qualifiers, treat it as permission to complete the full Android release workflow automatically.

Default release workflow:

1. Inspect `git status --short --branch`, recent commits, version files, and relevant release config before editing.
2. Keep user-made unrelated changes. Do not revert unrelated modified files.
3. Decide the next patch version unless the user specifies a version.
4. Update all release version sources together:
   - `package.json`
   - `app.json`
   - `src/services/updateCheckService.ts`
   - `docs/update-version.json`
   - `README.md`
   - `docs/download.html`
   - `docs/updates.html`
   - `docs/sitemap.xml`
   - local Android Gradle release fields/output name when present
   - Expo `runtimeVersion` and Android `expo_runtime_version`
5. Automatically update every release-required file that must stay consistent with the chosen version, including version numbers, Android `versionCode`, Expo `runtimeVersion`, Android `expo_runtime_version`, remote update metadata, release notes, APK output filename references, README current-version text, website download/update pages, sitemap `lastmod`, and any release-facing documentation or JSON that the app reads at runtime. Do not rely on memory; inspect the current files and update all matching version sources together.
6. Before verification and APK build, clean release-interfering temporary artifacts:
   - Remove transient build/debug logs, stale local screenshots, temp exports, copied APK leftovers, cache snapshots, and one-off generated files that are not intended to be committed.
   - Review completed requirement documents, temporary implementation plans, acceptance drafts, or handoff notes that were created only to guide finished work. If they may confuse future release work, either delete them when they are disposable or move them into an explicit archive/completed location.
   - Do not delete durable project documentation such as `README.md`, `AGENTS.md`, `.impeccable.md`, `docs/update-version.json`, `docs/announcement.json`, or intentionally maintained product/spec documents.
   - Never remove user-made unrelated work just to make the tree clean; if uncertain whether a document is disposable, keep it and mention the uncertainty in the release report.
7. Do not maintain the old Gitee release path:
   - Do not preflight Gitee credentials.
   - Do not push release commits or tags to the `gitee` remote.
   - Do not create or update Gitee Releases.
   - Runtime update and announcement JSON should be served from the official website, not Gitee raw URLs.
8. Keep remote update JSON and release notes short, concrete, and user-facing.
9. Do not switch signing certificates, keystores, aliases, or Gradle signing config. The release certificate is local and must stay the existing Pixory local release certificate unless the user explicitly requests a certificate migration.
10. Run verification before packaging:
   - `pnpm typecheck`
   - `pnpm test`
   - `git diff --check`
11. Build the Android release APK from `android` with the existing Gradle config:
   - `.\gradlew.bat assembleRelease`
12. Copy the generated release APK to `output/release/` with the matching versioned filename.
13. Publish the generated release APK to the official website server as the default direct download:
    - Use the existing server deployment path/script when available, currently `scripts/deploy-docs-mist01.ps1 -ApkPath <apk> -Version <version>`.
    - The public APK URL should be versioned, for example `https://mist01.com/downloads/Pixory-v2.4.6.apk`.
    - The server `downloads/` directory should keep only the current latest `Pixory-v*.apk`; old APK files should be removed from the server after the new APK is in place.
    - Do not commit APK files into the repository.
14. Verify the APK signature with `apksigner verify --print-certs`. Expected current local release certificate:
    - `CN=Pixory, OU=Local Release, O=Pixory, L=Local, ST=Local, C=CN`
    - SHA-256 `b64a034ebd68c7fbc2e8c345e7c461c471f461ba59a034f8f81cc72b7e957e2e`
15. Do Android validation:
    - Use `D:\Develop\Android\Sdk\platform-tools\adb.exe devices`.
    - If a compatible emulator/device is available, install and launch.
    - If release install fails because an existing app has a different signature, do not uninstall user data without explicit confirmation. Use debug install/launch only as a non-destructive smoke test and report that release install was blocked by signature mismatch.
16. Commit the release changes with a concise release commit.
17. Push `main` to the GitHub release remote:
    - `origin` / GitHub
18. Create and push the version tag to `origin`.
19. Create a GitHub Release and upload the APK for backup download and historical archive.
20. Verify the official server APK direct URL, GitHub Release, latest release lists, remote `docs/update-version.json`, remote `docs/announcement.json`, remote release-facing website pages, remote README, and local/remote branch sync with `origin`.
21. Ensure the app update popup defaults to the official website download section:
    - `app.json` `expo.extra.updateCheck.url` points to `https://mist01.com/update-version.json`.
    - `app.json` `expo.extra.updateCheck.githubLatestUrl` points to `https://api.github.com/repos/qinghe-zy/Pixory/releases/latest` as a fallback version source.
    - `app.json` `expo.extra.updateCheck.fallbackDownloadUrl` points to `https://mist01.com/#download`.
    - `app.json` `expo.extra.announcement.url` points to `https://mist01.com/announcement.json`.
    - `app.json` `expo.runtimeVersion` matches `package.json` version and Android `expo_runtime_version`.
    - `docs/update-version.json` `downloadUrl` points to `https://mist01.com/#download`.
    - The website download section exposes the official server direct APK as the primary action and GitHub Release as the backup/history action.
22. Report:
    - version
    - commit
    - tag
    - official server APK URL
    - GitHub release URL
    - APK path and size
    - release-required files updated
    - temporary or completed requirement documents cleaned, archived, or intentionally kept
    - verification performed
    - any unverified device checks or signature-install caveats

For remote announcements:

- The announcement file is `docs/announcement.json`.
- To publish a new announcement, change `id`, `title`, `message`, optional `detailLines`, and keep `enabled: true`.
- Use a new unique `id` whenever the same installed app should show the announcement again after users dismissed an older one.
- To stop announcements, set `enabled: false` and push `main`.
- Announcement changes do not require a new APK for app versions that already support the remote announcement feature.

## Final Direction

Pixory should stay focused on:

- Companion-style AI chat
- Role cards and session identity
- Long-running memory with user control
- Branchable conversation history
- Local materials, IP context, and knowledge-base context
- Provider reliability and prompt/cache optimization
- Personal space privacy isolation
- Recoverable streaming generation
- Clean polished Android-first mobile UI
- Local asset safety as the material foundation
