# AI Role Card Detail Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI role card detail page into a high-fidelity poster-style character dossier where the avatar image becomes a faded hero background and the lower content uses preview cards.

**Architecture:** Keep data and navigation behavior unchanged. Update the detail page presentation in `AiRoleCardDetailScreen.tsx`, evolve `AiRoleDetailSection.tsx` into a reusable dossier section, and add a source-level policy test to lock the new visual structure and prevent data-model drift.

**Tech Stack:** Expo React Native, TypeScript, Expo Image through `SecureImage`, Ionicons, Node built-in test runner, existing Pixory design tokens.

---

## File Structure

- Create: `tests/ai-role-detail-hero-redesign-policy.test.cjs`
  - Locks the redesign requirements through source assertions: large hero image, fade layers, existing fields only, section cards, no persistence changes.
- Modify: `src/components/ai/AiRoleDetailSection.tsx`
  - Converts the current plain divider section into a dossier preview section with optional icon, variant, footer, and preview-line behavior.
- Modify: `src/screens/AiRoleCardDetailScreen.tsx`
  - Replaces the small avatar row with the poster hero, keeps existing loading/error/action logic, renders redesigned sections and tags.

Out of scope for implementation:

- `src/ai/aiRoleCardService.ts`
- `src/database/repositories/aiRoleCardRepository.ts`
- `src/screens/AiRoleCardEditorScreen.tsx`
- `App.tsx`

---

### Task 1: Add Redesign Policy Test

**Files:**
- Create: `tests/ai-role-detail-hero-redesign-policy.test.cjs`

- [ ] **Step 1: Write the failing policy test**

Create `tests/ai-role-detail-hero-redesign-policy.test.cjs` with this complete content:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('role detail uses avatar as a faded poster hero without changing role data', () => {
  const detail = read('src/screens/AiRoleCardDetailScreen.tsx');
  const roleService = read('src/ai/aiRoleCardService.ts');
  const repository = read('src/database/repositories/aiRoleCardRepository.ts');

  assert.match(detail, /ROLE_HERO_HEIGHT/);
  assert.match(detail, /styles\.heroPoster/);
  assert.match(detail, /styles\.heroImageLayer/);
  assert.match(detail, /styles\.heroFadeRight/);
  assert.match(detail, /styles\.heroFadeBottom/);
  assert.match(detail, /styles\.heroActionWrap/);
  assert.match(detail, /card\.avatarEnabled && card\.avatarUri/);
  assert.match(detail, /SecureImage[\s\S]{0,220}contentFit="cover"[\s\S]{0,220}style=\{styles\.heroImage\}/);
  assert.match(detail, /numberOfLines=\{4\} style=\{styles\.heroDescription\}/);
  assert.match(detail, /headerDividerVisible=\{false\}/);
  assert.match(detail, /contentContainerStyle=\{styles\.screenContent\}/);

  assert.match(roleService, /description: input\.description\?\.trim\(\) \|\| null/);
  assert.match(repository, /avatarUri/);
  assert.doesNotMatch(roleService, /heroImage|displayIntro|detailIntro/);
  assert.doesNotMatch(repository, /heroImage|displayIntro|detailIntro/);
});

test('role detail sections render dossier preview cards with icons and compact greeting previews', () => {
  const detail = read('src/screens/AiRoleCardDetailScreen.tsx');
  const section = read('src/components/ai/AiRoleDetailSection.tsx');

  assert.match(section, /iconName\?:/);
  assert.match(section, /variant\?: 'body' \| 'quote' \| 'list'/);
  assert.match(section, /footer\?: ReactNode/);
  assert.match(section, /styles\.iconBubble/);
  assert.match(section, /styles\.previewCard/);
  assert.match(section, /numberOfLines=\{expanded \? undefined : previewLines\}/);

  assert.match(detail, /title="角色指令"[\s\S]{0,180}iconName="book-outline"/);
  assert.match(detail, /title="默认开场白"[\s\S]{0,180}iconName="chatbubble-ellipses-outline"/);
  assert.match(detail, /title="更多开场白"[\s\S]{0,220}footer=\{moreGreetingsFooter\}/);
  assert.match(detail, /card\.alternateGreetings\.map/);
  assert.match(detail, /查看全部 \{card\.alternateGreetings\.length\} 条/);
  assert.match(detail, /styles\.tagSection/);
  assert.match(detail, /styles\.tagChip/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm test -- tests/ai-role-detail-hero-redesign-policy.test.cjs
```

Expected result before implementation:

```text
not ok ... role detail uses avatar as a faded poster hero without changing role data
not ok ... role detail sections render dossier preview cards with icons and compact greeting previews
```

- [ ] **Step 3: Commit the failing test**

Run:

```powershell
git add -- tests/ai-role-detail-hero-redesign-policy.test.cjs
git commit -m "test: cover ai role detail hero redesign"
```

Expected: a commit containing only the new test file.

---

### Task 2: Evolve `AiRoleDetailSection`

**Files:**
- Modify: `src/components/ai/AiRoleDetailSection.tsx`
- Test: `tests/ai-role-detail-hero-redesign-policy.test.cjs`

- [ ] **Step 1: Replace the section component with the dossier preview version**

Replace `src/components/ai/AiRoleDetailSection.tsx` with this complete implementation:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface AiRoleDetailSectionProps {
  title: string;
  previewLines?: number;
  iconName?: IoniconName;
  variant?: 'body' | 'quote' | 'list';
  footer?: ReactNode;
  children: ReactNode;
}

export function AiRoleDetailSection({
  title,
  previewLines = 4,
  iconName = 'document-text-outline',
  variant = 'body',
  footer,
  children,
}: AiRoleDetailSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const bodyStyle = [
    styles.body,
    variant === 'quote' && styles.quoteBody,
    variant === 'list' && styles.listBody,
  ];

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerCopy}>
          <View style={styles.iconBubble}>
            <Ionicons color={aiLightColors.coralActive} name={iconName} size={18} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Ionicons color={aiLightColors.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      <View style={styles.previewCard}>
        {typeof children === 'string' ? (
          <Text numberOfLines={expanded ? undefined : previewLines} style={bodyStyle}>
            {children}
          </Text>
        ) : (
          children
        )}
        {!expanded && footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    paddingTop: spacing[4],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  headerCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minWidth: 0,
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: '#F4E2D4',
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    flex: 1,
  },
  previewCard: {
    backgroundColor: 'rgba(255, 250, 242, 0.72)',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: 24,
  },
  quoteBody: {
    color: aiLightColors.dark,
    fontStyle: 'italic',
  },
  listBody: {
    color: aiLightColors.ink,
  },
  footer: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
});
```

- [ ] **Step 2: Run the focused policy test**

Run:

```powershell
pnpm test -- tests/ai-role-detail-hero-redesign-policy.test.cjs
```

Expected: first test still fails because the screen still has the old layout; second test should now pass its `AiRoleDetailSection` assertions but may still fail on screen assertions.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: no TypeScript errors from the `Ionicons` name type or style arrays.

- [ ] **Step 4: Commit the component change**

Run:

```powershell
git add -- src/components/ai/AiRoleDetailSection.tsx
git commit -m "feat: add dossier role detail sections"
```

Expected: a commit containing only the section component change.

---

### Task 3: Build Poster Hero In `AiRoleCardDetailScreen`

**Files:**
- Modify: `src/screens/AiRoleCardDetailScreen.tsx`
- Test: `tests/ai-role-detail-hero-redesign-policy.test.cjs`

- [ ] **Step 1: Add constants and helper text values**

In `src/screens/AiRoleCardDetailScreen.tsx`, after `getRoleCardSourceLabel`, add:

```tsx
const ROLE_HERO_HEIGHT = 560;

function getRoleCardMeta(card: AiRoleCardRecord): string {
  const avatarMeta = card.avatarEnabled && card.avatarUri ? '头像开启' : '无头像';
  const greetingMeta = card.firstMessage || card.alternateGreetings.length ? '有开场白' : '无开场白';
  return `${avatarMeta} · ${greetingMeta}`;
}
```

- [ ] **Step 2: Update scaffold props**

In the `AiLightScaffold` opening tag, add `contentContainerStyle` and hide the divider:

```tsx
<AiLightScaffold
  contentContainerStyle={styles.screenContent}
  headerDividerVisible={false}
  onBack={onBack}
  rightAction={card ? (
```

Keep the existing `onBack`, `rightAction`, `scrollable`, `subtitle`, and `title` behavior.

- [ ] **Step 3: Replace the existing hero JSX**

Replace the current `<View style={styles.hero}>...</View>` block with:

```tsx
<View style={styles.heroPoster}>
  {card.avatarEnabled && card.avatarUri ? (
    <View style={styles.heroImageLayer}>
      <SecureImage contentFit="cover" space={space} style={styles.heroImage} uri={card.avatarUri} />
      <View pointerEvents="none" style={styles.heroWarmOverlay} />
      <View pointerEvents="none" style={styles.heroFadeRight} />
      <View pointerEvents="none" style={styles.heroFadeBottom} />
    </View>
  ) : (
    <View style={styles.heroFallback}>
      <View style={styles.heroFallbackMoon} />
      <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize * 1.4} />
    </View>
  )}

  <View pointerEvents="none" style={styles.heroPaperMark} />

  <View style={styles.heroCopy}>
    <Text numberOfLines={2} style={styles.heroTitle}>{card.name}</Text>
    <Text style={styles.sourceBadge}>{getRoleCardSourceLabel(card)}</Text>
    {card.description ? <Text numberOfLines={4} style={styles.heroDescription}>{card.description}</Text> : null}
    <Text style={styles.meta}>{getRoleCardMeta(card)}</Text>
  </View>

  <View style={styles.heroActionWrap}>
    <AiLightButton
      disabled={starting}
      label={starting ? (mode === 'apply_to_thread' ? '正在应用' : '正在开聊') : (mode === 'apply_to_thread' ? '应用到当前会话' : '开始新对话')}
      loading={starting}
      onPress={() => void startChat()}
    />
  </View>
</View>
```

- [ ] **Step 4: Replace old hero styles with poster styles**

Remove the old `hero`, `cover`, `coverImage`, `titleRow`, `title`, `description`, and old `heroCopy` style objects. Add these style objects:

```tsx
screenContent: {
  paddingHorizontal: 0,
},
heroPoster: {
  backgroundColor: aiLightColors.canvas,
  borderRadius: radius.lg,
  height: ROLE_HERO_HEIGHT,
  justifyContent: 'flex-end',
  overflow: 'hidden',
  position: 'relative',
},
heroImageLayer: {
  ...StyleSheet.absoluteFillObject,
},
heroImage: {
  bottom: spacing[8],
  height: ROLE_HERO_HEIGHT - spacing[6],
  left: -spacing[8],
  position: 'absolute',
  width: '68%',
},
heroWarmOverlay: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(250, 249, 245, 0.14)',
},
heroFadeRight: {
  bottom: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: '58%',
  backgroundColor: 'rgba(250, 249, 245, 0.82)',
},
heroFadeBottom: {
  backgroundColor: 'rgba(250, 249, 245, 0.92)',
  bottom: 0,
  height: 118,
  left: 0,
  position: 'absolute',
  right: 0,
},
heroFallback: {
  ...StyleSheet.absoluteFillObject,
  alignItems: 'center',
  backgroundColor: aiLightColors.surface,
  justifyContent: 'center',
},
heroFallbackMoon: {
  backgroundColor: aiLightColors.card,
  borderRadius: radius.pill,
  height: 220,
  position: 'absolute',
  width: 220,
},
heroPaperMark: {
  backgroundColor: 'rgba(204, 120, 92, 0.08)',
  borderRadius: radius.pill,
  height: 260,
  left: -spacing[8],
  position: 'absolute',
  top: spacing[6],
  width: 260,
},
heroCopy: {
  alignItems: 'flex-start',
  gap: rhythm.cardContentGap,
  marginLeft: '45%',
  paddingBottom: spacing[22],
  paddingHorizontal: spacing[5],
  zIndex: 2,
},
heroTitle: {
  ...typography.textStyles.pageTitle,
  color: aiLightColors.ink,
  fontFamily: 'serif',
  fontSize: 48,
  fontWeight: '400',
  lineHeight: 56,
},
heroDescription: {
  ...typography.textStyles.body,
  color: aiLightColors.ink,
  lineHeight: 27,
},
heroActionWrap: {
  bottom: spacing[5],
  left: spacing[5],
  position: 'absolute',
  right: spacing[5],
  zIndex: 3,
},
```

Keep and reuse existing `sourceBadge`, `meta`, `status`, `emptyState`, `emptyText`, `iconButton`, and `pressed`, adjusting only if typecheck requires style ordering.

- [ ] **Step 5: Run the focused policy test**

Run:

```powershell
pnpm test -- tests/ai-role-detail-hero-redesign-policy.test.cjs
```

Expected: the first test should now pass its hero assertions. The second test may still fail on section usage until Task 4.

- [ ] **Step 6: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: no TypeScript errors. If React Native rejects `fontFamily: 'serif'` on iOS type inference, keep it because it is a string literal accepted by `TextStyle`; do not import new font libraries.

- [ ] **Step 7: Commit the hero change**

Run:

```powershell
git add -- src/screens/AiRoleCardDetailScreen.tsx
git commit -m "feat: add poster hero to role detail"
```

Expected: a commit containing only `AiRoleCardDetailScreen.tsx`.

---

### Task 4: Render Dossier Sections, Greeting Preview, And Tags

**Files:**
- Modify: `src/screens/AiRoleCardDetailScreen.tsx`
- Test: `tests/ai-role-detail-hero-redesign-policy.test.cjs`

- [ ] **Step 1: Add greeting preview values inside the `card` render branch**

Inside the `card` branch, before the returned `<View style={styles.content}>`, introduce these constants by wrapping the branch body with an IIFE or extracting a small local render helper. Prefer a local helper for readability:

```tsx
function renderCardDetail(card: AiRoleCardRecord) {
  const moreGreetingsText = card.alternateGreetings.map((greeting, index) => `• ${index + 1}. ${greeting}`).join('\n\n');
  const moreGreetingsFooter = (
    <Text style={styles.sectionFooterText}>
      查看全部 {card.alternateGreetings.length} 条
    </Text>
  );

  return (
    <View style={styles.content}>
      {/* existing hero and sections move here */}
    </View>
  );
}
```

Then change the `card` branch to:

```tsx
) : (
  renderCardDetail(card)
)}
```

Keep `renderCardDetail` inside `AiRoleCardDetailScreen` so it can access `starting`, `status`, `mode`, `space`, and `startChat` without new props.

- [ ] **Step 2: Update the role instruction section usage**

Replace the current role instruction section with:

```tsx
<AiRoleDetailSection iconName="book-outline" title="角色指令" previewLines={8}>
  {card.prompt || '暂无角色指令。'}
</AiRoleDetailSection>
```

- [ ] **Step 3: Update default greeting usage**

Replace the current default greeting section with:

```tsx
{card.firstMessage ? (
  <AiRoleDetailSection iconName="chatbubble-ellipses-outline" previewLines={4} title="默认开场白" variant="quote">
    {card.firstMessage}
  </AiRoleDetailSection>
) : null}
```

- [ ] **Step 4: Update more greetings usage**

Replace the current more greetings section with:

```tsx
{card.alternateGreetings.length ? (
  <AiRoleDetailSection footer={moreGreetingsFooter} iconName="chatbubbles-outline" previewLines={6} title="更多开场白" variant="list">
    {moreGreetingsText}
  </AiRoleDetailSection>
) : null}
```

`previewLines={6}` keeps the collapsed state close to a three-entry preview, while expansion shows the full `moreGreetingsText`.

- [ ] **Step 5: Move tags into a labelled lower section**

Replace the current tag row block with:

```tsx
{card.tags.length ? (
  <View style={styles.tagSection}>
    <View style={styles.tagHeader}>
      <View style={styles.tagIconBubble}>
        <Ionicons color={aiLightColors.coralActive} name="pricetag-outline" size={16} />
      </View>
      <Text style={styles.tagTitle}>标签</Text>
    </View>
    <View style={styles.tagRow}>
      {card.tags.map((tag) => (
        <Text key={tag} style={styles.tagChip}>{tag}</Text>
      ))}
    </View>
  </View>
) : null}
```

- [ ] **Step 6: Add lower-section styles**

Add these styles and remove the old `tag` style:

```tsx
sectionFooterText: {
  ...typography.textStyles.caption,
  color: aiLightColors.muted,
},
tagSection: {
  borderTopColor: aiLightColors.hairline,
  borderTopWidth: StyleSheet.hairlineWidth,
  gap: rhythm.cardContentGap,
  paddingTop: spacing[4],
},
tagHeader: {
  alignItems: 'center',
  flexDirection: 'row',
  gap: rhythm.inlineGap,
},
tagIconBubble: {
  alignItems: 'center',
  backgroundColor: '#F4E2D4',
  borderRadius: radius.pill,
  height: 36,
  justifyContent: 'center',
  width: 36,
},
tagTitle: {
  ...typography.textStyles.bodyStrong,
  color: aiLightColors.ink,
},
tagRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: spacing[1],
},
tagChip: {
  ...typography.textStyles.micro,
  backgroundColor: 'rgba(255, 250, 242, 0.78)',
  borderColor: aiLightColors.hairline,
  borderRadius: radius.pill,
  borderWidth: StyleSheet.hairlineWidth,
  color: aiLightColors.muted,
  overflow: 'hidden',
  paddingHorizontal: spacing[2],
  paddingVertical: spacing[1],
},
```

- [ ] **Step 7: Run the focused policy test**

Run:

```powershell
pnpm test -- tests/ai-role-detail-hero-redesign-policy.test.cjs
```

Expected:

```text
ok ... role detail uses avatar as a faded poster hero without changing role data
ok ... role detail sections render dossier preview cards with icons and compact greeting previews
```

- [ ] **Step 8: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 9: Commit the section rendering change**

Run:

```powershell
git add -- src/screens/AiRoleCardDetailScreen.tsx
git commit -m "feat: polish role detail dossier sections"
```

Expected: a commit containing the final detail screen section and tag changes.

---

### Task 5: Final Verification And Visual Check

**Files:**
- Verify: `src/screens/AiRoleCardDetailScreen.tsx`
- Verify: `src/components/ai/AiRoleDetailSection.tsx`
- Verify: `tests/ai-role-detail-hero-redesign-policy.test.cjs`

- [ ] **Step 1: Run full automated checks**

Run:

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected:

```text
pnpm typecheck exits 0
pnpm test exits 0
git diff --check exits 0
```

- [ ] **Step 2: Inspect git status**

Run:

```powershell
git status --short --branch
```

Expected: no unstaged implementation changes. If the plan file or temporary brainstorm files are present, do not include `.superpowers/` in commits because `.superpowers/` is ignored.

- [ ] **Step 3: Android visual smoke check when device or emulator is available**

Run:

```powershell
D:\Develop\Android\Sdk\platform-tools\adb.exe devices
```

If a device is listed, launch the app through the existing project workflow and inspect one imported role card with avatar. Acceptance criteria:

- hero uses the avatar as a large background image,
- image edges fade into the warm page background,
- title, badge, description, meta, and primary action are readable,
- action button does not overlap critical face area,
- sections preview and expand,
- tags wrap cleanly.

If no device is available, record that Android visual inspection was not performed.

- [ ] **Step 4: Final commit if any verification-only fixes were needed**

If Task 5 required a small fix, run:

```powershell
git add -- src/screens/AiRoleCardDetailScreen.tsx src/components/ai/AiRoleDetailSection.tsx tests/ai-role-detail-hero-redesign-policy.test.cjs
git commit -m "fix: finalize role detail hero polish"
```

Expected: only run this if there were actual fixes after Task 4.

---

## Self-Review Notes

- Spec coverage:
  - Poster hero: Task 3.
  - Avatar-as-background and fade edges: Task 3.
  - Existing fields only and no database changes: Task 1 policy assertions and file structure.
  - Dossier preview cards: Task 2 and Task 4.
  - Default greeting, more greetings, and tags: Task 4.
  - Android and verification: Task 5.
- Placeholder scan:
  - No task uses vague work descriptions as a substitute for code.
  - Each code-changing task includes exact code snippets or complete file content.
- Type consistency:
  - `iconName`, `variant`, and `footer` are defined in Task 2 and consumed in Task 4.
  - `ROLE_HERO_HEIGHT`, `heroImageLayer`, `heroFadeRight`, `heroFadeBottom`, and `heroActionWrap` are defined in Task 3 and checked in Task 1.
