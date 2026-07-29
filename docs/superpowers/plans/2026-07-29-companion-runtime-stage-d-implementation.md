# Companion Runtime Stage D Implementation Plan

> Execute citation integrity first, then managed-file backup/restore. Use TDD and one centralized review after each framework.

**Goal:** Replace “show every retrieved source” with answer-level citations and upgrade backup packages to a hash-verified relative-path Manifest V2 that includes AI documents, chat attachments and role avatars.

## Framework 1: Answer-level citations

- [x] Add pure streaming-marker tests covering split markers, unknown IDs, incomplete tails, multiple claims, literal brackets, stopped/failed output and lexical support checks.
- [x] Add V54 citation provenance fields and repository round-trip/space/branch/source-version tests.
- [x] Assign deterministic per-request `S1…Sn` registry entries after final retrieval ordering and include those IDs plus marker instructions only in dynamic retrieval context.
- [x] Parse citation markers during streaming so incomplete/control text never reaches the UI or persisted answer.
- [x] At terminal persistence, accept only closed registry IDs whose source/chunk is still visible and unchanged and whose preceding claim has local lexical support; save claim offsets, excerpt hash, document version, status/reason and used time.
- [x] Persist zero citations when the model emits no marker; never fall back to all snippets. Preserve valid closed markers for stopped/failed replies.
- [x] Review cache purity, continuation offsets, branch/source edits, no raw marker flash, no unused source display and citation navigation compatibility.

## Framework 2: AI managed-file Manifest V2

- [x] Add manifest policy/types and pure tests for normalized relative paths, traversal rejection, SHA-256/size verification, duplicate-content mapping, required-file failures and space isolation.
- [x] Enumerate image originals/previews plus AI documents, message attachments and role avatars from the selected physical-space database; never enumerate the other space.
- [x] Copy each unique content hash once under `files/`, retain every logical reference, and verify every copied file before reporting success.
- [x] Write Manifest V2 with only relative backup paths and content-free logical metadata; keep database export compatibility metadata separately.
- [x] During merge restore, validate manifest/version/space/hash into a space-local staging area, allocate managed target URIs, import database records, rewrite document/attachment/avatar URIs transactionally, and clean staging on success or failure.
- [x] Never overwrite an existing target logical record’s edited URI; report imported records, restored files, missing required files, hash failures and rewrite failures.
- [x] Ensure Personal plaintext staging is created only under the Personal task and encrypted-pack staging is cleaned after successful pack creation.
- [x] Update backup UI result contracts and feature matrix; retain backward import support for V1 packages.
- [x] Review normal/Personal isolation, zip traversal, rollback behavior, dedupe, original preservation and realistic restore-open checks.

## Stage D verification and commit

- [x] Run all new citation/backup tests plus affected chat, streaming, retrieval, branch, import, privacy and backup suites.
- [x] Run `pnpm typecheck`, `pnpm test`, and `git diff --check`.
- [x] Record device limitations, centralized review findings and one Stage D commit.

## Centralized Stage D review

- Citation review fixed content-hash validation for current IP metadata, de-duplicated repeated markers, rejected out-of-range continuation offsets, and confirmed that unknown/incomplete markers never reach UI or SQLite.
- Backup review fixed same-content/different-extension aliases, removed absolute source URIs from V2 JSON, clears unrestorable SecureStore key references, deletes incomplete backup directories, and always removes Personal plaintext/encrypted staging (including failure paths).
- Restore keeps legacy V1 import support, validates the complete V2 package before file staging, uses content-addressed target files, and performs `INSERT OR IGNORE` inside the existing SQLite transaction so target edits remain authoritative.
- `pnpm typecheck`, affected suites and `git diff --check` pass. The full suite has one expected Stage E failure because `PixoryShareActivity.kt` is not yet present; Stage E owns that native bridge. No Android device is connected, so destructive reinstall/restore-open acceptance remains explicitly unverified rather than simulated.

## Rollback boundary

Reverting the Stage D commit removes V54 citation provenance, marker parsing, registry validation and Manifest V2 managed-file packaging/restoration. Existing additive V54 columns remain harmless to earlier builds; legacy backup import remains supported.
