# Repository Workflow

Pixory uses two layers of Git history so the public repository stays focused without taking away local version tracking.

## Public Branch

`main` is the public branch and is synchronized with the GitHub `origin` remote. It contains application source, formal tests, release configuration, website files, and maintained public documentation.

The public tree intentionally excludes agent configuration, internal process documents, one-off development tools, generated diagnostics, screenshots, logs, test output, and local archives.

## Private Local Branch

`local-work` is a local-only branch with no upstream remote. It may track `AGENTS.md`, `.codex/`, `.impeccable.md`, `版本文档/`, `LOCAL_UPDATES_LOG.md`, and `scripts/local/` so local development history remains searchable and recoverable.

Generated runtime files still belong in ignored local storage such as `.local/archive/`; they should not be committed even to `local-work`.

## Commit And Push Rules

1. Develop and commit local context on `local-work`.
2. Keep public product changes in commits that contain only public paths.
3. Switch to `main` before publishing and inspect `git diff --name-only origin/main..HEAD`.
4. Push only with `git push origin main`.
5. Never merge the full `local-work` branch into `main`, push `local-work`, use `git push --all`, use `git push --mirror`, bypass the pre-push hook, or push routine work to `gitee`.
6. Push release tags only from `main` after the release workflow succeeds.
7. Return to `local-work` after the public push.

The repository pre-push hook enforces this boundary by allowing only `main -> main` and version tags to `origin`, while rejecting private branches and other remotes.

## File Layout

```text
src/                         application source
tests/                       formal automated tests
scripts/                     maintained build, release, and benchmark scripts
scripts/local/               local-only one-off tools (private branch)
docs/                        public website, manuals, update metadata, and feature matrix
版本文档/                    internal version process documents (private branch)
.local/archive/              ignored local logs, screenshots, and generated exports
```
