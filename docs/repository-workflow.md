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
3. During an iteration, “提交” means a local Git commit only. `.githooks/post-commit` appends each local commit to `LOCAL_UPDATES_LOG.md` and `版本文档/当前版本文档/版本过程索引.md`.
4. Before an iteration starts, run `scripts/version-document-workflow.ps1 -Action InitializeCycle` to create the required PRD, TDD, Test Report, external release notes, and internal release notes templates.
5. For each requirement or hot update, run `scripts/version-document-workflow.ps1 -Action AppendUpdate` or `scripts/record-hot-update.ps1 -Summary "..."`. Resolve conflicts by updating the current-valid section and recording the replacement in the change record.
6. Run `scripts/version-document-workflow.ps1 -Action ValidateCurrent` before packaging. `PreviewRelease` repeats this validation.
7. Switch to `main` before publishing and inspect `git diff --name-only origin/main..HEAD`.
8. Run `pnpm release:android` only on `main`. It performs Gradle clean/build, archives the current version documents, creates the next current-document set, then invokes `scripts/release-handoff.ps1` to commit public files, create the version tag, and push GitHub.
9. Push routine work only with `git push origin main`.
10. Never merge the full `local-work` branch into `main`, push `local-work`, use `git push --all`, use `git push --mirror`, bypass the pre-push hook, or push routine work to `gitee`.
11. Push release tags only from `main` after the release workflow succeeds.
12. Return to `local-work` after the public push.

The repository pre-push hook enforces this boundary by allowing only `main -> main` and version tags to `origin`, while rejecting private branches and other remotes.

## File Layout

```text
src/                         application source
tests/                       formal automated tests
scripts/                     maintained build, release, and benchmark scripts
scripts/local/               local-only one-off tools (private branch)
scripts/version-document-workflow.ps1  initialize, validate, append, preview, and archive version documents
scripts/record-hot-update.ps1          append hot-update events to the current version documents
scripts/release-handoff.ps1            public release commit, tag, and GitHub push
scripts/README.md                       public script catalog and Android packaging entrypoint
PRD.md                                  public cross-version product requirements SSOT and roadmap
docs/                        public website, manuals, update metadata, and feature matrix
版本文档/                    internal version process documents (private branch)
.local/archive/              ignored local logs, screenshots, and generated exports
```

## Required Version Documents

Every iteration must keep these five documents in `版本文档/当前版本文档/` and evolve them throughout the cycle:

- `PRD.md`: the SSOT for scope and business rules; include positive/exception flows, state transitions, and highlighted post-review changes.
- `TDD.md`: implementation design; include architecture/sequence diagrams when useful, rate limiting/degradation, transaction consistency, migration, and data-safety evaluation.
- `Test-Report.md`: quantitative execution rate, residual bug rate, severity distribution, release decision, and Known Issues.
- `Release-Notes-External.md`: plain-language user-facing notes.
- `Release-Notes-Internal.md`: support/operations impact, migration concerns, FAQ, and response guidance.

`Tracking-Plan.md` and `DB-Schema.md` are added when analytics events or database changes are introduced. Only the current-valid section is normative; superseded rules must be removed from active content and recorded in the change record with reason, impact, and stakeholder notification.

The root `PRD.md` is the public cross-version product requirements document. During packaging, `version-document-workflow.ps1` synchronizes it from the current cycle `版本文档/当前版本文档/PRD.md`, preserves its rigorous section structure, and updates the marked roadmap section. The root document is staged by `release-handoff.ps1` and enters GitHub only with the packaging release commit.
