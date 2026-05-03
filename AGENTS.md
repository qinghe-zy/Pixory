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
│  └─ original/
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

For future page creation or page polish work, follow the reusable visual method in:

```text
docs/UI_PAGE_OPTIMIZATION_RULES.md
```

Default expectation:

- optimize one page around one primary visual focus
- reduce visual weight before adding decoration
- prefer token-level fixes before page-level one-offs
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
