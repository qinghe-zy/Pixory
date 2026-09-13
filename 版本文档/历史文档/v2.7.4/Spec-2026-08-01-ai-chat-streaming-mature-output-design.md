# Pixory AI Chat Streaming Output Design From Mature References

Date: 2026-08-01
Status: Design written, ready for review
Scope: only the AI chat streaming display layer and its render contract; no prompt, memory, provider, dream, thought, diary, or persistence semantics are changed here.

## 1. Goal

Pixory should match the streaming behavior of mature chat products instead of inventing a local display rhythm.

The target feel is:

- visible text starts as soon as there is something readable,
- output arrives in semantic chunks, not per-character typing,
- the UI stays stable while the user scrolls history,
- hidden streaming content is measured and reserved before it becomes visible,
- thought and dream content remain separate lanes, not part of the main visible reply flow unless their own product rules say otherwise.

## 2. What Mature References Show

### 2.1 OpenAI streaming

OpenAI’s streaming docs describe SSE-based incremental output: the client can start printing or processing the beginning of the answer before the full response finishes.

The product implication is simple: visible text is an append-only stream, not a blocked final render.

Source:

- https://developers.openai.com/api/docs/guides/streaming-responses

### 2.2 Gemini streaming and thinking

Google Gemini exposes streaming as incremental deltas. For thinking models, it also separates visible output from thought summaries and thought signatures.

That tells us two important things:

- visible output and reasoning-related material are distinct surfaces,
- reasoning can be streamed without forcing the UI to imitate a typewriter.

Sources:

- https://ai.google.dev/gemini-api/docs/streaming
- https://ai.google.dev/gemini-api/docs/thinking
- https://ai.google.dev/api/generate-content

### 2.3 React Native virtualization

React Native’s `VirtualizedList` and `FlatList` docs make the tradeoff explicit: virtualization keeps memory bounded by replacing offscreen content with blank space, and batch/window knobs affect the balance between blank areas and responsiveness.

That means Pixory should not fight virtualization by rendering everything eagerly. It should reserve and promote only the tail region that the user is approaching.

Sources:

- https://reactnative.dev/docs/virtualizedlist
- https://reactnative.dev/docs/optimizing-flatlist-configuration

### 2.4 Latency research

Public latency research on LLM interaction points in the same direction: users care about first visible output and steady delivery cadence more than a fake per-token animation. Buffering should improve readability, not create waiting.

## 3. Pixory Design Conclusion

Pixory’s reply surface should follow three rules.

1. Stream semantically, not character-by-character.

   New visible content should appear as readable blocks, line groups, or sentence-sized fragments. A long reply may fill several lines quickly, but the user should not see a literal typing effect.

2. Keep one continuous assistant bubble.

   Mature chat apps do not usually split one reply into many message bubbles. Pixory should keep the reply visually continuous and use a light cursor or generation hint only if needed.

3. Make hidden tail content physically real before it is visible.

   If the user scrolls into generated history, they should hit measured, mounted content, not a blank reserved hole.

## 4. Render Contract

### 4.1 Visible lane

The visible lane should publish only readable units:

- completed sentence or paragraph chunks when available,
- small bounded fragments when the model is moving quickly,
- no per-token animation,
- no forced wait for punctuation if that would create noticeable lag.

### 4.2 Reasoning / thought lane

Thought content should remain a separate lane with its own presentation rules.

Pixory can show it in the inner-life surface or in a compact reasoning presentation, but it should not leak into the main user-facing reply flow unless the product rule explicitly asks for that.

### 4.3 Dream lane

Dream content is even more special than thought.

It should stay in its own dream surface and only enter later context if the dream-specific opt-in rule says so. The main reply renderer should not treat dream text as ordinary visible assistant output.

### 4.4 Measurement and reservation

The streaming view should reserve height for content that has already arrived but has not fully mounted yet.

Rules:

- measure real rendered height, do not guess from characters,
- keep reservation monotonic while the user is reading or dragging,
- only shrink when it is safe to do so,
- never let the first visible thing inside a tail region be blank spacer.

### 4.5 Width and alignment

All reply lanes should share the same horizontal rail derived from the composer shell, so the maximum width lines up with the input area.

That avoids the common bug where a short row is measured with one width and later replayed with another.

## 5. What We Do Not Do

- no per-character typewriter animation,
- no hard wait for sentence-ending punctuation,
- no fake overlay that pretends content exists before it is measured,
- no global disabling of virtualization,
- no mixing thought or dream content into the normal visible reply lane,
- no new prompt or cache semantics in this doc.

## 6. Expected User Experience

- On a fast model burst, several readable lines can appear in one visual flush.
- On a slow or irregular model, the UI still shows the earliest readable fragment instead of waiting too long.
- When the user scrolls up, the visible history stays fixed.
- When the user scrolls back down, the next thing they see is mounted content, not a blank gap.
- Thought and dream surfaces stay coherent with their own rules instead of being forced into the normal reply rhythm.

## 7. References

- OpenAI streaming responses: https://developers.openai.com/api/docs/guides/streaming-responses
- Gemini streaming: https://ai.google.dev/gemini-api/docs/streaming
- Gemini thinking: https://ai.google.dev/gemini-api/docs/thinking
- Gemini generate content: https://ai.google.dev/api/generate-content
- React Native VirtualizedList: https://reactnative.dev/docs/virtualizedlist
- React Native FlatList optimization: https://reactnative.dev/docs/optimizing-flatlist-configuration
- Human-LLM interaction latency study: https://arxiv.org/html/2604.06183v1
- Response latency and QoE paper: https://dl.acm.org/doi/10.1145/3719160.3736636
- Streaming LLM survey: https://arxiv.org/html/2603.04592v3

## 8. Hand-off

This note is the compact design reference.
The detailed implementation-oriented spec remains in the streaming-tail research docs and should be kept aligned with this conclusion.
