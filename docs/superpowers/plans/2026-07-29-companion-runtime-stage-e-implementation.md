# Companion Runtime Stage E Implementation Plan

> Final implementation stage. Build persisted chat-generation recovery first, then the versioned Android direct-speech bridge and hold interaction. Use TDD and one centralized review after both frameworks.

**Goal:** Make ordinary assistant generation recoverable across process death without duplicate replies, and replace the one-shot speech activity with cancellable Android `SpeechRecognizer` input that prefers on-device recognition.

## Framework 1: Persisted generation recovery

- [x] Add V55 `ai_generation_jobs` and `ai_generation_events` with explicit states, attempt identity, non-secret request snapshot, prompt/cache/branch/lineage identity, partial output, sequence, lease/heartbeat, bounded retry/continuation and content-free diagnostics.
- [x] Add repository/unit/SQLite tests for prepared-before-request ordering, legal transitions, event sequencing, lease takeover, idempotent terminal settlement, orphan placeholder handling and normal/Personal physical isolation.
- [x] Create `prepared` after the user message/assistant placeholder and before any Provider call; transition to `requesting`, then `streaming` on the first delta, and persist partial content/cursor with the existing batching cadence.
- [x] Set message content/citation/usage and job terminal state in the same final transaction; failure, timeout and explicit stop must also settle the matching job exactly once.
- [x] Replace unconditional startup stopping with reconcile: mark expired nonterminal jobs recoverable, never steal a live lease, retry the same placeholder once when no partial exists, or continue from persisted partial without reasoning and with overlap de-duplication.
- [x] Preserve the original role/provider/model/branch snapshot, re-read secrets from SecureStore, stop visibly when overlap cannot be reconciled, and never exceed one automatic retry plus one continuation.
- [x] Start normal reconcile after DB initialization and Personal reconcile only after successful unlock; manager remains process-global and single-flight.

## Framework 2: Android direct speech input

- [x] Add typed JS speech capability/start/stop/cancel/event contracts independent of chat Provider/model settings.
- [x] Replace `RecognizerIntent` UI flow with direct `SpeechRecognizer`; on API 31+ prefer `createOnDeviceSpeechRecognizer` when available, otherwise use system recognition with offline preference and truthful capability metadata.
- [x] Emit ready/partial/final/error/end events and map permission denied, permanent denial, unavailable, busy, timeout, no-match/no-speech, cancel and missing Activity to distinct local states.
- [x] Release the recognizer on cancel, page leave, app background, message send and native host destruction.
- [x] Add composer microphone interaction: long press starts, release stops and writes only final text; upward slide or visible cancel aborts without changing the draft; accessible tap toggles listening.
- [x] Add the missing versioned `PixoryShareActivity.kt` template, register it in the plugin copy list, run Expo prebuild, and compile Kotlin from the generated Android project.
- [x] Update feature matrix and native/UI policy tests, including no-model speech independence and on-device fallback wording.

## Stage E verification and commit

- [x] Run new generation SQLite/unit tests and speech/native policy tests.
- [x] Run `npx expo prebuild --platform android --no-install`, Kotlin/Android compile, `pnpm typecheck`, `pnpm test`, and `git diff --check`.
- [x] Perform the centralized Stage E review, document device-only limitations, and create one Stage E commit.

## Rollback boundary

Reverting the Stage E commit removes V55 recovery jobs/events and direct speech input while leaving completed messages intact. Nonterminal V55 rows are additive and ignored by earlier code; the prior one-shot speech method remains available only as a compatibility fallback in the native module.
