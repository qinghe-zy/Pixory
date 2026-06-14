# AGENTS.md

## Project

Pixory is an Android-first, local-only IP image asset manager.

It helps users organize image assets by IP, groups, tags, favorites, notes, and metadata while preserving the original image quality.

Pixory is not a cloud album, social app, AI image generator, image editor, or online sync product.

## Core Rules

- Build for Android first.
- The app must work fully offline.
- Do not add server, cloud storage, account system, sync, social features, or AI generation unless explicitly requested.
- Imported images must be copied into the app’s private local storage.
- Never compress, crop, overwrite, re-encode, or replace original images.
- Thumbnails are allowed only as separate preview files.
- Store structured metadata in SQLite.
- Store image files in the local file system.
- The UI must feel like a real polished mobile product, not an AI mockup.

## Recommended Stack

Use:

- Expo
- React Native
- TypeScript
- Expo Router
- SQLite
- Local file system storage
- Zustand or another lightweight state solution

Do not introduce backend frameworks or cloud services.

## Main Concepts

### IP

The top-level archive unit.

An IP may represent a character, visual identity, theme, brand image, or creative series.

### Group

A lightweight way to organize images inside an IP.

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

Each imported image should keep:

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

Batch import is a core feature.

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

Because the app is local-only, backup/export must preserve complete data.

A valid backup should include:

- SQLite database
- Original image folder
- Thumbnail folder
- Manifest file

Backups must include original images, not only thumbnails.

## Development Priority

When tradeoffs appear, follow this order:

```txt
Local reliability
> Original image safety
> Data consistency
> Simple UX
> Clean UI
> Future extensibility
```

Do not sacrifice original image safety or local data consistency for faster UI completion.

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
5. Automatically update every release-required file that must stay consistent with the chosen version, including version numbers, Android `versionCode`, remote update metadata, release notes, APK output filename references, README current-version text, website download/update pages, sitemap `lastmod`, and any release-facing documentation or JSON that the app reads at runtime. Do not rely on memory; inspect the current files and update all matching version sources together.
6. Before verification and APK build, clean release-interfering temporary artifacts:
   - Remove transient build/debug logs, stale local screenshots, temp exports, copied APK leftovers, cache snapshots, and one-off generated files that are not intended to be committed.
   - Review completed requirement documents, temporary implementation plans, acceptance drafts, or handoff notes that were created only to guide finished work. If they may confuse future release work, either delete them when they are disposable or move them into an explicit archive/completed location.
   - Do not delete durable project documentation such as `README.md`, `AGENTS.md`, `.impeccable.md`, `docs/update-version.json`, `docs/announcement.json`, or intentionally maintained product/spec documents.
   - Never remove user-made unrelated work just to make the tree clean; if uncertain whether a document is disposable, keep it and mention the uncertainty in the release report.
7. Before packaging, preflight Gitee Release publishing credentials:
   - Check for a usable `GITEE_TOKEN`, Gitee OpenAPI token, Gitee release-capable CLI, or authenticated browser/API path that can create a release and upload an APK.
   - If Gitee Git SSH push works but Release API/Web credentials are unavailable, continue only when the user explicitly accepts that Gitee Release creation will be deferred; otherwise stop before building so the release is not half-published.
   - Never print token values in logs or reports.
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
17. Push `main` to both release remotes:
    - `origin` / GitHub
    - `gitee` / `git@gitee.com:Qinghe_zy/pixory.git`
18. Create and push the version tag to both `origin` and `gitee`.
19. Create a GitHub Release and upload the APK for backup download and historical archive.
20. Create a Gitee Release for the same tag and upload the APK only when credentials are available and this release still requires Gitee mirroring; otherwise report Gitee Release as deferred.
21. Verify the official server APK direct URL, GitHub Release, latest release lists, remote `docs/update-version.json`, remote release-facing website pages, remote README, and local/remote branch sync for both remotes.
22. Ensure the app update popup defaults to the official website download section:
    - `app.json` `expo.extra.updateCheck.url` points to the Gitee raw `docs/update-version.json`.
    - `docs/update-version.json` `downloadUrl` points to `https://mist01.com/#download`.
    - The website download section exposes the official server direct APK as the primary action and GitHub Release as the backup/history action.
23. Report:
    - version
    - commit
    - tag
    - official server APK URL
    - GitHub release URL
    - Gitee release URL
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

- IP-based organization
- Local image management
- Lossless original preservation
- Batch import
- Groups and tags
- Image metadata
- Favorites
- Soft delete
- Clean mobile UI
- Offline-first reliability
