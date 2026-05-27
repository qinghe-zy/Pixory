# AI Session Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear per-session AI model configuration so Pixory users can switch the current chat to another provider/model without affecting other chats or global defaults.

**Architecture:** Keep global defaults in provider settings, store per-session choices on `ai_threads.providerId` and `ai_threads.modelId`, and route every new send/regenerate/rewrite through one strict thread-model resolver. Invalid saved thread models and invalid global defaults must fail explicitly instead of silently falling back to another model.

**Tech Stack:** Expo React Native, TypeScript, SQLite repositories, existing AI provider service, existing policy tests under `tests/*.test.cjs`.

---

## Scope And Success Criteria

- AI provider settings page describes and edits the global default model for new chats.
- AI session settings page describes and edits the current chat model.
- "Follow global default" is a first-class session option and shows the current resolved global default label.
- Switching session model changes only the current thread row.
- `sendUserMessage`, `regenerateAssistantMessage`, and `rewriteUserMessage` all use the latest thread model configuration from SQLite.
- Failed replies can be regenerated with a newly selected session model.
- Invalid thread model and invalid global default are explicit blocking states.
- Existing historical chats with non-null `providerId`/`modelId` remain fixed to their saved model.
- Existing chats with null `providerId` and null `modelId` follow the global default.

---

## File Map

- Modify `src/ai/aiChatService.ts`
  - Add strict thread-model resolver types and helpers.
  - Update model label generation.
  - Update send/regenerate/rewrite flow to use latest thread config.
  - Add session model option loading helper if useful for UI.
- Modify `src/screens/AiSessionConfigScreen.tsx`
  - Add "当前会话模型" card.
  - Add model selection sheet/state.
  - Save selected `providerId`/`modelId` to current thread only.
  - Disable model switching while generation is active if the screen can receive that state; otherwise show copy explaining the next request behavior.
- Modify `src/screens/AiProviderSettingsScreen.tsx`
  - Change copy from generic model account wording to "全局默认模型".
  - Clarify that changes affect new sessions, not existing independent sessions.
- Modify or reuse `src/ai/aiProviderService.ts`
  - Reuse `listProviderCards(space)` for provider/model lists.
  - Add a tiny helper only if UI code would otherwise duplicate label logic.
- Modify `src/database/repositories/aiThreadRepository.ts`
  - No schema migration expected.
  - Confirm `providerId` and `modelId` remain nullable and patch updates stay incremental.
- Add or modify tests:
  - `tests/ai-session-model-policy.test.cjs`
  - `tests/ai-provider-policy.test.cjs`
  - `tests/ai-final-acceptance-policy.test.cjs`

---

## Task 1: Add Policy Tests For Ownership Semantics

**Files:**
- Create: `tests/ai-session-model-policy.test.cjs`
- Modify: `tests/ai-provider-policy.test.cjs`
- Modify: `tests/ai-final-acceptance-policy.test.cjs`

- [ ] **Step 1: Add a new policy test file**

Create `tests/ai-session-model-policy.test.cjs` with tests that lock the expected service and UI contracts:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('AI chat resolves the latest thread model instead of reusing message snapshots', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /type ResolvedThreadChatModel/);
  assert.match(service, /resolveThreadChatModel/);
  assert.match(service, /invalid_global_default/);
  assert.match(service, /invalid_thread_model/);
  assert.match(service, /thread\.providerId/);
  assert.match(service, /thread\.modelId/);
  assert.match(service, /regenerateAssistantMessage[\s\S]*findThreadById/);
  assert.match(service, /rewriteUserMessage[\s\S]*findThreadById/);
  assert.doesNotMatch(service, /const\s+modelId\s*=\s*message\.modelId/);
  assert.doesNotMatch(service, /const\s+providerId\s*=\s*message\.providerId/);
});

test('AI session settings exposes current session model and follow-global option', () => {
  const screen = read('src/screens/AiSessionConfigScreen.tsx');

  assert.match(screen, /当前会话模型/);
  assert.match(screen, /仅在当前会话生效/);
  assert.match(screen, /跟随全局默认/);
  assert.match(screen, /providerId:\s*null/);
  assert.match(screen, /modelId:\s*null/);
  assert.match(screen, /updateAiThreadSessionConfig/);
  assert.match(screen, /listProviderCards/);
  assert.match(screen, /模型配置已失效|当前会话模型已失效/);
});

test('AI provider settings labels model selection as global default only', () => {
  const screen = read('src/screens/AiProviderSettingsScreen.tsx');

  assert.match(screen, /全局默认模型/);
  assert.match(screen, /新创建会话的默认选择/);
  assert.match(screen, /不会影响已有独立设置的会话/);
});

test('AI session model resolver documents invalid and partial-null cases', () => {
  const service = read('src/ai/aiChatService.ts');

  assert.match(service, /provider_default/);
  assert.match(service, /global_default/);
  assert.match(service, /thread_model/);
  assert.match(service, /thread\.providerId == null|!thread\.providerId/);
  assert.match(service, /thread\.modelId == null|!thread\.modelId/);
  assert.match(service, /supportsChat/);
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:

```powershell
pnpm test tests/ai-session-model-policy.test.cjs
```

Expected: fails because the new resolver/UI strings do not exist yet.

- [ ] **Step 3: Extend existing acceptance tests**

Add checks to existing tests so the release-facing behavior stays documented:

```js
assert.match(sessionConfig, /当前会话模型/);
assert.match(providerSettings, /全局默认模型/);
assert.match(service, /invalid_global_default/);
assert.match(service, /invalid_thread_model/);
```

- [ ] **Step 4: Commit tests**

```powershell
git add tests/ai-session-model-policy.test.cjs tests/ai-provider-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
git commit -m "test: define ai session model ownership"
```

---

## Task 2: Implement Strict Thread Model Resolution

**Files:**
- Modify: `src/ai/aiChatService.ts`

- [ ] **Step 1: Add resolver result types near existing AI service interfaces**

Add:

```ts
type ThreadModelSource = 'global_default' | 'provider_default' | 'thread_model';

type ResolvedThreadChatModel =
  | {
      status: 'ready';
      apiKey: string | null;
      modelId: string;
      provider: AiProviderRecord;
      source: ThreadModelSource;
    }
  | { status: 'invalid_global_default'; message: string }
  | { status: 'invalid_thread_model'; message: string; providerId?: string | null; modelId?: string | null };
```

Import `AiProviderRecord` if it is not already available from `./types`.

- [ ] **Step 2: Replace the current fallback resolver**

Replace the current `resolveThreadProvider` behavior. The new function must not use `?? providers[0]` for invalid saved thread providers.

```ts
async function resolveThreadChatModel(space: PixorySpace, thread: AiThreadRecord): Promise<ResolvedThreadChatModel> {
  await ensureBuiltInProviders(space);
  return runWithDatabaseSpace(space, async (db) => {
    const providers = await aiProviderRepository.listProviders(db);

    async function resolveProviderModel(provider: AiProviderRecord, modelId: string | null, source: ThreadModelSource): Promise<ResolvedThreadChatModel> {
      const models = await aiProviderRepository.listModels(db, provider.id);
      const selectedModel = modelId
        ? models.find((model) => model.modelId === modelId && model.supportsChat)
        : null;
      if (modelId && !selectedModel) {
        return {
          status: source === 'global_default' ? 'invalid_global_default' : 'invalid_thread_model',
          message: source === 'global_default' ? '全局默认模型已失效，请重新配置。' : '当前会话模型已失效，请重新选择模型。',
          providerId: provider.id,
          modelId,
        } as ResolvedThreadChatModel;
      }
      const fallbackModel = provider.defaultChatModelId
        ? models.find((model) => model.modelId === provider.defaultChatModelId && model.supportsChat)
        : null;
      const resolvedModel = selectedModel ?? fallbackModel ?? models.find((model) => model.supportsChat) ?? null;
      if (!resolvedModel) {
        return {
          status: source === 'global_default' ? 'invalid_global_default' : 'invalid_thread_model',
          message: source === 'global_default' ? '全局默认模型已失效，请重新配置。' : '当前会话模型已失效，请重新选择模型。',
          providerId: provider.id,
          modelId,
        } as ResolvedThreadChatModel;
      }
      return {
        status: 'ready',
        apiKey: await getProviderApiKey(provider.id),
        modelId: resolvedModel.modelId,
        provider,
        source,
      };
    }

    if (thread.providerId) {
      const provider = providers.find((item) => item.id === thread.providerId) ?? null;
      if (!provider) {
        return {
          status: 'invalid_thread_model',
          message: '当前会话模型已失效，请重新选择模型。',
          providerId: thread.providerId,
          modelId: thread.modelId,
        };
      }
      return resolveProviderModel(provider, thread.modelId, thread.modelId ? 'thread_model' : 'provider_default');
    }

    const defaultProviderId = await settingsRepository.getDefaultAiProviderId(db);
    const provider = defaultProviderId ? providers.find((item) => item.id === defaultProviderId) ?? null : providers[0] ?? null;
    if (!provider) {
      return { status: 'invalid_global_default', message: '全局默认模型已失效，请重新配置。' };
    }
    return resolveProviderModel(provider, null, 'global_default');
  });
}
```

Before implementing, simplify the cast if TypeScript accepts the union without it. Keep the final code idiomatic and type-safe.

- [ ] **Step 3: Update `streamAssistantReply`**

Replace:

```ts
const { provider, modelId, apiKey } = await resolveThreadProvider(input.space, input.thread);
```

with:

```ts
const resolvedModel = await resolveThreadChatModel(input.space, input.thread);
if (resolvedModel.status !== 'ready') {
  await markAssistantFailed(input.space, input.assistantMessageId, resolvedModel.message);
  input.onMessagePatch?.({
    id: input.assistantMessageId,
    status: 'failed',
    content: '',
    reasoningText: null,
    errorMessage: resolvedModel.message,
    completedAt: new Date().toISOString(),
  });
  input.onUpdated?.();
  return;
}
const { apiKey, modelId, provider } = resolvedModel;
```

Keep the existing API key error branch, but change copy to:

```ts
const apiKeyMessage = '当前模型账号不可用，请检查 API key 或切换当前会话模型。';
```

- [ ] **Step 4: Run focused tests**

```powershell
pnpm test tests/ai-session-model-policy.test.cjs
pnpm typecheck
```

Expected: policy tests still fail on UI strings, typecheck passes for the service resolver.

- [ ] **Step 5: Commit resolver**

```powershell
git add src/ai/aiChatService.ts
git commit -m "feat: resolve ai thread model strictly"
```

---

## Task 3: Ensure Regenerate And Rewrite Use Latest Thread Config

**Files:**
- Modify: `src/ai/aiChatService.ts`

- [ ] **Step 1: Audit generation entry points**

Confirm these functions read the latest thread before calling `streamAssistantReply`:

- `sendUserMessage`
- `regenerateAssistantMessage`
- `rewriteUserMessage`
- `retryAssistantMessage` if it delegates to regenerate

- [ ] **Step 2: Patch stale-thread paths**

In each entry point, immediately before `streamAssistantReply`, reload the thread from SQLite:

```ts
const latestThread = await runWithDatabaseSpace(input.space, (db) => aiThreadRepository.findThreadById(db, thread.id));
if (!latestThread || latestThread.space !== input.space) {
  throw new Error('AI thread was not found.');
}
await streamAssistantReply({
  ...,
  thread: latestThread,
});
```

Do not read `providerId` or `modelId` from assistant message records or message version snapshots for the next request.

- [ ] **Step 3: Add an explicit policy assertion**

In `tests/ai-session-model-policy.test.cjs`, keep:

```js
assert.match(service, /regenerateAssistantMessage[\s\S]*findThreadById/);
assert.match(service, /rewriteUserMessage[\s\S]*findThreadById/);
assert.doesNotMatch(service, /const\s+modelId\s*=\s*message\.modelId/);
```

- [ ] **Step 4: Verify**

```powershell
pnpm test tests/ai-session-model-policy.test.cjs
pnpm typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/ai/aiChatService.ts tests/ai-session-model-policy.test.cjs
git commit -m "fix: regenerate with latest session model"
```

---

## Task 4: Add Session Model Option Data For UI

**Files:**
- Modify: `src/ai/aiChatService.ts`
- Reuse: `src/ai/aiProviderService.ts`

- [ ] **Step 1: Add UI option interfaces**

In `aiChatService.ts`, add:

```ts
export interface AiSessionModelOption {
  disabled?: boolean;
  hasApiKey: boolean;
  label: string;
  modelId: string;
  providerId: string;
  providerLabel: string;
}

export interface AiThreadSessionModelConfig {
  currentLabel: string;
  currentStatus: 'follow_default' | 'fixed_provider' | 'fixed_model' | 'invalid';
  followDefaultLabel: string;
  options: AiSessionModelOption[];
  providerId: string | null;
  modelId: string | null;
}
```

- [ ] **Step 2: Add loader**

Add:

```ts
export async function loadThreadSessionModelConfig(space: PixorySpace, threadId: string): Promise<AiThreadSessionModelConfig | null> {
  const [thread, cards, defaultLabel] = await Promise.all([
    runWithDatabaseSpace(space, (db) => aiThreadRepository.findThreadById(db, threadId)),
    listProviderCards(space),
    getCurrentChatModelLabel(space, null),
  ]);
  if (!thread || thread.space !== space) {
    return null;
  }
  const options = cards.flatMap((card) =>
    card.models
      .filter((model) => model.supportsChat)
      .map((model) => ({
        hasApiKey: card.hasApiKey,
        label: model.displayName,
        modelId: model.modelId,
        providerId: card.provider.id,
        providerLabel: card.provider.displayName,
      }))
  );
  const currentOption = thread.providerId && thread.modelId
    ? options.find((option) => option.providerId === thread.providerId && option.modelId === thread.modelId) ?? null
    : null;
  const providerOnlyCard = thread.providerId && !thread.modelId
    ? cards.find((card) => card.provider.id === thread.providerId) ?? null
    : null;
  const currentStatus = !thread.providerId
    ? 'follow_default'
    : currentOption
      ? 'fixed_model'
      : providerOnlyCard
        ? 'fixed_provider'
        : 'invalid';
  return {
    currentLabel:
      currentStatus === 'follow_default'
        ? `跟随全局默认（当前：${defaultLabel}）`
        : currentOption
          ? `${currentOption.providerLabel} · ${currentOption.label}`
          : providerOnlyCard
            ? `${providerOnlyCard.provider.displayName} · 默认模型`
            : '模型配置已失效',
    currentStatus,
    followDefaultLabel: `跟随全局默认（当前：${defaultLabel}）`,
    options,
    providerId: thread.providerId,
    modelId: thread.modelId,
  };
}
```

Adjust labels to match local style after compiling.

- [ ] **Step 3: Verify**

```powershell
pnpm typecheck
```

- [ ] **Step 4: Commit**

```powershell
git add src/ai/aiChatService.ts
git commit -m "feat: expose ai session model options"
```

---

## Task 5: Build Current Session Model UI

**Files:**
- Modify: `src/screens/AiSessionConfigScreen.tsx`

- [ ] **Step 1: Import model config loader**

Update the import from `../ai/aiChatService`:

```ts
import {
  applyRoleCardToThread,
  deleteAiThreads,
  loadThreadSessionConfig,
  loadThreadSessionModelConfig,
  renameAiThread,
  updateAiThreadSessionConfig,
} from '../ai/aiChatService';
```

- [ ] **Step 2: Add state**

Add near existing settings state:

```ts
const [sessionModelConfig, setSessionModelConfig] = useState<AiThreadSessionModelConfig | null>(null);
const [modelPickerVisible, setModelPickerVisible] = useState(false);
const [savingModel, setSavingModel] = useState(false);
```

Import the type or infer it from the loader. Prefer importing the exported type.

- [ ] **Step 3: Load model config with the rest of session settings**

Inside `reloadConfig`, after loading the thread config:

```ts
setSessionModelConfig(await loadThreadSessionModelConfig(space, threadId));
```

For no-thread state:

```ts
setSessionModelConfig(null);
```

- [ ] **Step 4: Add save handlers**

Add:

```ts
async function saveSessionModel(providerId: string | null, modelId: string | null) {
  if (!threadId || savingModel) {
    return;
  }
  setSavingModel(true);
  try {
    const updated = await updateAiThreadSessionConfig({
      avatarEnabled,
      boundaryMode,
      deepMemoryEnabled,
      modelId,
      providerId,
      replyPreference,
      roleInstructionWeight,
      space,
      systemPrompt,
      threadId,
    });
    if (!updated) {
      throw new Error('没有找到当前会话，模型未保存。');
    }
    setModelPickerVisible(false);
    setSessionModelConfig(await loadThreadSessionModelConfig(space, threadId));
    setStatus({ message: '已切换当前会话模型，可返回聊天重新生成上一条回复。', tone: 'success', title: '模型已更新' });
  } catch (error) {
    setStatus({ message: error instanceof Error ? error.message : '模型保存失败', tone: 'error', title: '保存失败' });
  } finally {
    setSavingModel(false);
  }
}
```

- [ ] **Step 5: Render the card**

Place this card after the "当前会话" summary card:

```tsx
<AiLightCard>
  <View style={styles.roleRow}>
    <View style={styles.summaryCopy}>
      <Text style={styles.sectionTitle}>当前会话模型</Text>
      <Text numberOfLines={1} style={styles.body}>
        {sessionModelConfig?.currentLabel ?? '加载中'}
      </Text>
      <Text style={styles.caption}>仅在当前会话生效。切换后，下一次发送或重新生成会使用新模型。</Text>
      {sessionModelConfig?.currentStatus === 'invalid' ? (
        <Text style={styles.maintenanceWarning}>模型配置已失效，请重新选择模型，或切换为跟随全局默认。</Text>
      ) : null}
    </View>
    <Pressable
      accessibilityRole="button"
      disabled={!threadId || saving || savingModel}
      onPress={() => setModelPickerVisible(true)}
      style={({ pressed }) => [styles.textAction, (!threadId || saving || savingModel) && styles.disabled, pressed && threadId && !saving && !savingModel && styles.pressed]}
    >
      <Text style={styles.textActionLabel}>{savingModel ? '保存中' : '更换'}</Text>
    </Pressable>
  </View>
</AiLightCard>
```

- [ ] **Step 6: Add picker dialog**

Use existing `AppDialog` style if there is no bottom sheet component in this screen:

```tsx
<AppDialog
  confirmLabel="关闭"
  onConfirm={() => setModelPickerVisible(false)}
  onDismiss={() => setModelPickerVisible(false)}
  title="当前会话模型"
  visible={modelPickerVisible}
>
  <View style={styles.modelPickerList}>
    <Pressable accessibilityRole="button" onPress={() => void saveSessionModel(null, null)} style={({ pressed }) => [styles.modelOption, pressed && styles.pressed]}>
      <Text style={styles.modelOptionTitle}>跟随全局默认</Text>
      <Text style={styles.caption}>{sessionModelConfig?.followDefaultLabel ?? '使用全局默认模型'}</Text>
    </Pressable>
    {sessionModelConfig?.options.map((option) => (
      <Pressable
        accessibilityRole="button"
        key={`${option.providerId}:${option.modelId}`}
        onPress={() => void saveSessionModel(option.providerId, option.modelId)}
        style={({ pressed }) => [styles.modelOption, pressed && styles.pressed]}
      >
        <Text style={styles.modelOptionTitle}>{option.providerLabel} · {option.label}</Text>
        <Text style={styles.caption}>{option.hasApiKey ? '可用于当前会话' : '未填写 API key'}</Text>
      </Pressable>
    ))}
  </View>
</AppDialog>
```

If `AppDialog` does not support children in the current implementation, use the existing local dialog pattern from nearby screens instead of adding a new dependency.

- [ ] **Step 7: Add styles**

Add compact styles using existing tokens:

```ts
modelPickerList: {
  gap: rhythm.microGap,
},
modelOption: {
  borderColor: aiLightColors.hairline,
  borderRadius: radius.md,
  borderWidth: StyleSheet.hairlineWidth,
  paddingHorizontal: spacing[3],
  paddingVertical: spacing[2],
},
modelOptionTitle: {
  ...typography.textStyles.body,
  color: aiLightColors.ink,
  fontWeight: '700',
},
```

- [ ] **Step 8: Verify**

```powershell
pnpm test tests/ai-session-model-policy.test.cjs
pnpm typecheck
```

- [ ] **Step 9: Commit**

```powershell
git add src/screens/AiSessionConfigScreen.tsx tests/ai-session-model-policy.test.cjs
git commit -m "feat: add per-session model picker"
```

---

## Task 6: Clarify Global Default Provider Settings

**Files:**
- Modify: `src/screens/AiProviderSettingsScreen.tsx`
- Modify: `tests/ai-provider-policy.test.cjs`

- [ ] **Step 1: Update page copy**

Find current copy around chat model/default model selection and change user-facing text to:

```text
全局默认模型
新创建会话的默认选择。修改此项不会影响已有独立设置的会话。
```

Keep API key/account setup copy where it still refers to credentials.

- [ ] **Step 2: Keep save behavior unchanged**

The provider settings screen should still call:

```ts
saveProviderDefaultModels(space, model.providerId, { defaultChatModelId: model.modelId });
```

Do not update any existing `ai_threads` rows from this screen.

- [ ] **Step 3: Verify policy**

```powershell
pnpm test tests/ai-provider-policy.test.cjs tests/ai-session-model-policy.test.cjs
```

- [ ] **Step 4: Commit**

```powershell
git add src/screens/AiProviderSettingsScreen.tsx tests/ai-provider-policy.test.cjs
git commit -m "copy: clarify global ai default model"
```

---

## Task 7: Refresh Chat Header Model Label After Returning From Settings

**Files:**
- Modify: `src/screens/AiChatScreen.tsx`

- [ ] **Step 1: Find settings return path**

Locate the route flow that opens and returns from `AiSessionConfigScreen`. The chat screen already has `reloadModelLabel(space, targetThreadId)`.

- [ ] **Step 2: Reload model label on focus or route return**

After returning from session settings, call:

```ts
void reloadModelLabel(activeThreadIdRef.current);
```

Also call `reloadMessages(activeThreadIdRef.current)` only if needed for visible state; avoid unnecessary list reloads.

- [ ] **Step 3: Verify policy**

Add a small assertion to an existing navigation/settings policy test:

```js
assert.match(chat, /reloadModelLabel\(activeThreadIdRef\.current\)/);
```

Only use this exact assertion if it matches the final implementation.

- [ ] **Step 4: Commit**

```powershell
git add src/screens/AiChatScreen.tsx tests/ai-navigation-policy.test.cjs
git commit -m "fix: refresh ai chat model label after settings"
```

---

## Task 8: Add Release Note Copy

**Files:**
- Modify release-facing notes only during next package/release if this is not being shipped immediately.
- Candidate files during release: `docs/update-version.json`, `docs/updates.html`, `README.md`.

- [ ] **Step 1: Prepare release note text**

Use this copy:

```text
本次更新引入独立的会话模型配置。此前的历史聊天会保留创建时的模型；如需跟随新的全局默认模型，可在聊天设置中切换为“跟随全局默认”。
```

- [ ] **Step 2: Do not edit release files unless packaging now**

If this implementation is only an OTA candidate and not a full APK release, keep this text in the implementation report and add it when the next `打包` workflow updates release files.

---

## Task 9: Full Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run focused tests**

```powershell
pnpm test tests/ai-session-model-policy.test.cjs tests/ai-provider-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs
```

Expected: all pass.

- [ ] **Step 2: Run full tests**

```powershell
pnpm test
```

Expected: all pass.

- [ ] **Step 3: Run typecheck**

```powershell
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run whitespace check**

```powershell
git diff --check
```

Expected: no whitespace errors. CRLF warnings are acceptable if they match existing repository behavior.

- [ ] **Step 5: Manual Android smoke checklist**

On an installed development or release build:

```text
1. Open an existing AI chat.
2. Open 会话设置.
3. Confirm 当前会话模型 is visible.
4. Choose 跟随全局默认 and save.
5. Return to chat and verify header model label updates.
6. Open 会话设置 again and choose a fixed model.
7. Trigger a failed response by removing API key or selecting a provider without API key.
8. Switch current session model to a valid model.
9. Tap failed message regenerate.
10. Confirm response continues in the same chat.
```

- [ ] **Step 6: Final commit if previous tasks were batched**

```powershell
git status --short --branch
git add src/ai/aiChatService.ts src/screens/AiSessionConfigScreen.tsx src/screens/AiProviderSettingsScreen.tsx src/screens/AiChatScreen.tsx tests/ai-session-model-policy.test.cjs tests/ai-provider-policy.test.cjs tests/ai-final-acceptance-policy.test.cjs tests/ai-navigation-policy.test.cjs
git commit -m "feat: support per-session ai model selection"
```

---

## Implementation Notes And Guardrails

- Do not add a server, account system, or cloud sync. This is local SQLite configuration plus existing provider API usage.
- Do not mutate all historical threads when global defaults change.
- Do not silently fall back from an invalid fixed session model to global default.
- Do not silently choose `providers[0]` when a configured default provider id is missing.
- Do not use message snapshots as the model source for future requests.
- Do not allow one generated answer to switch models midway.
- Keep UI compact and token-based; avoid a large marketing-style settings section.

---

## Self-Review

- Spec coverage: Covers global default, per-session model, follow-default, invalid global default, invalid thread model, API key failure, regenerate snapshot pollution, old data compatibility, and release note copy.
- Placeholder scan: No `TBD` or generic "handle edge cases" instructions remain; each task has exact files and commands.
- Type consistency: The resolver type is named `ResolvedThreadChatModel`, and all service tasks refer to the same name.
