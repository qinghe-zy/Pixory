# Provider Verification False-Negative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenAI-compatible model verification work with Expo native fetch responses whose `clone()` method is not implemented, without changing normal chat, model saving, or synchronization behavior.

**Architecture:** The request helper returns the response together with an optionally pre-read body. Verification consumes each successful candidate body once, reuses it for shape validation and final parsing, and preserves the root-to-`/v1` retry. The settings screen reloads persisted provider cards after either test outcome.

**Tech Stack:** TypeScript, Expo Fetch, React Native, Node test runner.

---

### Task 1: Reproduce the Expo response failure

**Files:**
- Create: `tests/ai-provider-openai-compatible-fetch-unit.test.cjs`
- Use: `tests/helpers/loadTypeScriptModule.cjs`
- Test: `tests/ai-provider-openai-compatible-fetch-unit.test.cjs`

- [ ] **Step 1: Write the failing unit tests**

Create an Expo-like response whose `clone()` throws `Not implemented` and whose `text()` may only be called once. Assert that DeepSeek-style verification succeeds and that an invalid root response still retries `/v1`.

```js
test('DeepSeek verification consumes an Expo response once without requiring Response.clone', async () => {
  const response = expoResponse(JSON.stringify({ id: 'chatcmpl-test', choices: [] }));
  const provider = loadProviderWithFetch(async () => response);
  await provider.verifyChatCompletion({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-chat',
  });
  assert.equal(response.reads, 1);
});

test('OpenAI-compatible verification retains root-to-v1 fallback after consuming each body once', async () => {
  const rootResponse = expoResponse('<html>gateway</html>');
  const v1Response = expoResponse(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
  const urls = [];
  const provider = loadProviderWithFetch(async (url) => {
    urls.push(url);
    return urls.length === 1 ? rootResponse : v1Response;
  });
  await provider.verifyChatCompletion({
    apiKey: 'test-key',
    baseUrl: 'https://example.com',
    modelId: 'model',
  });
  assert.deepEqual(urls, [
    'https://example.com/chat/completions',
    'https://example.com/v1/chat/completions',
  ]);
  assert.equal(rootResponse.reads, 1);
  assert.equal(v1Response.reads, 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/ai-provider-openai-compatible-fetch-unit.test.cjs
```

Expected: FAIL with `Not implemented` from `response.clone()`.

### Task 2: Consume verification bodies once

**Files:**
- Modify: `src/ai/providers/openAiCompatibleProvider.ts:35-83`
- Modify: `src/ai/providers/openAiCompatibleProvider.ts:305-359`
- Test: `tests/ai-provider-openai-compatible-fetch-unit.test.cjs`

- [ ] **Step 1: Introduce the fetch result envelope**

```ts
type OpenAiCompatibleFetchResult = {
  bodyText: string | null;
  response: Response;
};
```

- [ ] **Step 2: Replace `response.clone()` with one body read**

Change the helper callback to `(bodyText: string) => Promise<'bad_shape' | null>`, read `response.text()` only when body inspection is requested, and return `{ bodyText, response }`.

- [ ] **Step 3: Reuse the body in verification**

Destructure `{ bodyText, response }`, validate `bodyText` in the retry callback, then parse `bodyText ?? await response.text()` after `assertOkResponse`.

- [ ] **Step 4: Keep non-verification callers behaviorally unchanged**

`listModels`, `streamChat`, and `embedText` destructure only `{ response }`; do not change payloads, streaming parsing, reasoning events, tail behavior, or endpoint construction.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/ai-provider-openai-compatible-fetch-unit.test.cjs
```

Expected: 2 tests pass.

### Task 3: Refresh persisted card status after tests

**Files:**
- Modify: `src/screens/AiProviderSettingsScreen.tsx:347-362`
- Test: `tests/ai-provider-policy.test.cjs`

- [ ] **Step 1: Add a failing source-policy assertion**

Assert `testSelectedProvider()` awaits `loadProviders()` in a `finally` block after the verification attempt.

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```powershell
node --test tests/ai-provider-policy.test.cjs
```

Expected: FAIL because the test handler does not refresh after verification.

- [ ] **Step 3: Add the minimal refresh**

```ts
    try {
      await verifyCurrentProviderModel(selectedCard.provider.id, space);
      setStatus(...);
    } catch (error) {
      setStatus(...);
    } finally {
      await loadProviders();
    }
```

Do not change save, sync, default-model, API-key, or copy behavior.

- [ ] **Step 4: Run focused verification**

```powershell
node --test tests/ai-provider-openai-compatible-fetch-unit.test.cjs tests/ai-provider-policy.test.cjs
pnpm.cmd typecheck
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Commit only provider verification files**

```powershell
git add tests/ai-provider-openai-compatible-fetch-unit.test.cjs tests/ai-provider-policy.test.cjs src/ai/providers/openAiCompatibleProvider.ts src/screens/AiProviderSettingsScreen.tsx
git commit -m "fix: avoid native fetch clone during model verification"
```

