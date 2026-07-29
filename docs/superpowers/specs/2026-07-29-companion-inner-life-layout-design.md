# Companion Inner Life Layout Design

**Goal:** Make the Android "内心独白" index feel like a compact continuation of chat instead of a sparse, unfinished screen.

## Scope

- Modify only `src/screens/CompanionInnerLifeScreen.tsx` and its focused layout-policy test.
- Preserve diary, thought, dream, refresh, deletion, restore, and reader-navigation behavior.
- Do not change the paused 2.7.1 release metadata or unrelated UI.

## Approved layout

1. The page owns its vertical rhythm instead of inheriting `AppScreen`'s generic section gap between every child.
2. The header keeps the existing 44dp touch targets and aligns with `CompanionRuntimeManagerScreen`.
3. Tabs follow the header with a tight tokenized gap; the content begins after `rhythm.heroToListGap`.
4. Lists retain their current cards. Empty, loading, and error states use the same content-start position instead of inheriting the generic page gap.
5. Empty states keep the existing per-tab single-line message. Loading remains a single line; errors retain retry.

## Verification

- A focused static test checks that the page disables inherited child gaps, uses the shared rhythm tokens, and keeps each empty state as a single line.
- Run the focused test, `pnpm typecheck`, and `git diff --check`.

## Non-goals

- No data-model, runtime, prompt, or navigation changes.
- No new illustration assets, animation, or page-wide design-system changes.
