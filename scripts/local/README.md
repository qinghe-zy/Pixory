# Local Development Tools

This directory is tracked only on the private `local-work` branch. It is intentionally absent from the public `main` branch.

- `one-off/`: historical patch, migration, cleanup, and UI scratch scripts. Review the target file and run history before using one.
- `server/`: local server and deployment helpers that are not part of the application runtime.
- `assets/`: local asset preparation helpers, such as splash-image padding.

Do not add these paths to a public commit. Generated logs, screenshots, diagnostics, and test output belong under ignored `.local/archive/`, not here.
