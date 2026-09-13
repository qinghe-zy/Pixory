# Chat Composer Safe Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the chat composer in a stable vertical position across Android keyboard cycles, reduce only its external bottom gap, and move the header title slightly upward using the system font.

**Architecture:** Capture the chat screen's first resolved bottom safe-area inset and override only this screen's generic `AppScreen` bottom padding. Keep the composer's internal padding unchanged. Reduce the external page bottom offset by `spacing[2]` (8dp), reduce the chat header top offset by the same 8dp, and replace the title's display-font spread with explicit system-font-neutral typography at the same 14px size as conversation body text. Keep the model subtitle one step smaller at 12px.

**Tech Stack:** Expo, React Native, TypeScript, React Native Safe Area Context, Node test runner.

---

### Task 1: Add a failing layout-policy regression test

**Files:**
- Create: `tests/ai-chat-composer-safe-spacing-policy.test.cjs`
- Test: `src/screens/AiChatScreen.tsx`

- [x] **Step 1: Write the failing assertions**

Assert that the chat screen:

```js
assert.match(chat, /const initialBottomInsetRef = useRef\(insets\.bottom\)/);
assert.match(chat, /paddingBottom: initialBottomInsetRef\.current \+ layout\.pageBottomOffset - spacing\[2\]/);
assert.match(chat, /paddingTop: statusBarHeight \+ layout\.pageTopOffset - spacing\[2\]/);
assert.doesNotMatch(chat, /fontFamily:\s*aiLightDisplayFont/);
assert.match(chat, /fontSize: typography\.textStyles\.body\.fontSize/);
assert.match(chat, /lineHeight: typography\.textStyles\.body\.lineHeight/);
assert.match(composer, /paddingBottom: spacing\[2\]/);
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/ai-chat-composer-safe-spacing-policy.test.cjs
```

Expected: the test fails because the chat screen still uses dynamic `AppScreen` bottom padding, the original top offset, and the display font.

### Task 2: Implement stable chat-only spacing and title typography

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`
- Modify: `tests/ai-chat-fixes-policy.test.cjs`

- [x] **Step 1: Capture the first safe-area inset**

Immediately after `const insets = useSafeAreaInsets();`, add:

```ts
const initialBottomInsetRef = useRef(insets.bottom);
```

- [x] **Step 2: Override only the chat screen's external bottom padding**

Change the `AppScreen` content style to override the generic dynamic padding:

```tsx
contentStyle={[
  styles.drawerHost,
  {
    paddingBottom:
      initialBottomInsetRef.current +
      layout.pageBottomOffset -
      spacing[2],
  },
]}
```

This changes the external gap by 8dp while leaving `AiChatComposer`'s internal `paddingBottom: spacing[2]` untouched.

- [x] **Step 3: Reduce only the chat header top offset**

Change the screen content style to:

```tsx
style={[
  styles.screenContent,
  { paddingTop: statusBarHeight + layout.pageTopOffset - spacing[2] },
]}
```

- [x] **Step 4: Use system-font-neutral title styling**

Replace the title style's `typography.textStyles.navTitle` spread and `aiLightDisplayFont` override with explicit values:

```ts
title: {
  color: aiLightColors.ink,
  fontSize: typography.textStyles.body.fontSize,
  fontWeight: typography.textStyles.body.fontWeight,
  lineHeight: typography.textStyles.body.lineHeight,
  maxWidth: '90%',
}
```

The title reuses the body typography metrics (14px / 22px today), while the model subtitle remains the caption token (12px / 18px today).

- [x] **Step 5: Update existing policy assertions**

Update the chat layout policy test to require stable bottom padding, the 8dp external reduction, the 8dp top reduction, and no title display font.

### Task 3: Verify and document the scoped change

**Files:**
- Modify: `docs/feature-matrix.md`

- [x] **Step 1: Record the chat composer behavior**

Add that Android chat keeps the first bottom safe-area inset across keyboard cycles, reduces only the external composer gap by 8dp, preserves internal composer padding, and uses a 14px system-font-neutral title with a 12px model subtitle and an 8dp smaller header top offset.

- [x] **Step 2: Run focused verification**

```bash
node --test tests/ai-chat-composer-safe-spacing-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs
pnpm typecheck
git diff --check
```

- [x] **Step 3: Run the full suite**

```bash
pnpm test
```

Expected: all applicable tests pass with no new failures.

- [ ] **Step 4: Commit**

```bash
git add src/screens/AiChatScreen.tsx tests/ai-chat-composer-safe-spacing-policy.test.cjs tests/ai-chat-fixes-policy.test.cjs docs/feature-matrix.md docs/superpowers/plans/2026-07-29-chat-composer-safe-spacing-implementation.md
git commit -m "fix: stabilize chat composer safe spacing"
```
