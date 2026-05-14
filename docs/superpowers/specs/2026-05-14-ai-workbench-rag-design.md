# Pixory AI Workbench and Local RAG Design

Date: 2026-05-14

## Status

Approved design direction, pending implementation plan.

## Goal

Add an AI tab to Pixory that can work as a normal chat entry, an IP-aware assistant, and a local knowledge-base assistant. The feature must keep Pixory's Android-first and local-first product direction: user documents and metadata stay in local storage, structured records stay in SQLite, and external model APIs only receive the selected question plus bounded context.

## Product Shape

The AI tab opens an AI workbench, not directly a chat history list. The workbench presents three primary ways to start:

- Start a normal chat.
- Ask about one IP.
- Connect a knowledge base.

The workbench also contains:

- Recent Continue: resumes previous work with its original context.
- View All: opens the full AI session history.
- Knowledge Bases and Materials: opens document and material management.

The AI workbench must not display a default "not connected to knowledge base" status. The first screen should feel like a natural entry point, not an error or disconnected state.

## Context Types

The first version supports three conversation context types.

### Normal Chat

Normal chat has no bound Pixory data. It does not inject Pixory RAG rules, does not require citations, and behaves as a general AI chat entry. Users can configure the system prompt and role card freely.

### IP Chat

IP chat binds exactly one IP. The default IP context includes structured and textual metadata already present in Pixory:

- IP name and note.
- Groups and tags.
- Image notes.
- Original file names.
- Imported batch and time metadata.
- Favorite state and asset statistics.
- IP-owned documents when enabled.

The first version does not perform image recognition. It does not send images to a vision model, does not auto-generate image descriptions, and does not support real-time visual question answering. The data model must reserve future source types for generated image descriptions and vision providers.

### Knowledge Base Chat

Knowledge base chat binds exactly one knowledge base. A knowledge base can contain:

- Manual text.
- TXT.
- Markdown.
- PDF.
- DOCX.
- Generated material from an existing Pixory IP.

"Customer project" is treated as a knowledge base name or category, not as a separate project-management system.

## Session Naming and Resume

Pixory automatically creates short, readable conversation names.

- Normal chat: generated from the first user message, such as `整理导入计划`.
- IP chat: `IP name / short title`, such as `春日少女 IP / 筛选海报素材`.
- Knowledge base chat: `Knowledge base name / short title`, such as `论文知识库 / 总结第三章`.

If automatic naming fails, Pixory falls back to a simple context title: `普通聊天`, the IP name, or the knowledge base name.

Recent Continue restores a work session with its saved context, model, role card, and conversation state. It is not merely a flat chat-log list.

## Context Switching

The chat screen header displays the current context:

- `普通聊天`
- IP name
- Knowledge base name

The header or right-side menu allows users to:

- Switch to normal chat.
- Select an IP.
- Select a knowledge base.
- Disconnect the current material.
- Create a new knowledge base.
- Open session settings.

When the bound context object changes, Pixory creates a new session instead of mutating the existing thread. This applies to:

- Normal chat to IP chat.
- Normal chat to knowledge base chat.
- IP A to IP B.
- Knowledge base A to knowledge base B.
- IP or knowledge base chat back to normal chat.

The previous session remains in history. Pixory may offer to carry a short summary into the new session, but it must not blindly copy the full previous message history into a new material-bound context.

Changing model, role card, language, or system prompt stays in the current session and affects only later messages. Enabling or disabling documents for the same bound IP may stay in the current session, with the context change recorded.

## Chat Screen

The chat screen uses a familiar messaging skeleton:

- User messages on the right.
- AI messages on the left.
- Fixed bottom composer.
- Back navigation, context title, and right-side settings entry.
- Long-press or message actions for copy, retry, delete, and similar basics.

It must not visually copy WeChat. Pixory should keep its own calm, polished, mobile-first visual language.

AI messages support:

- Streaming generation.
- Stop generation while streaming.
- Retry on failure.
- Clickable citation sources.
- Optional collapsed thinking or reasoning section.

## Streaming and Thinking Content

AI replies stream into the message bubble when the selected provider supports streaming. The message state can be generating, completed, failed, or stopped.

For models that expose thinking, reasoning, or reasoning summaries, Pixory stores and displays it separately from the final answer.

- Thinking content appears in a collapsible section.
- It is not mixed into the final answer body.
- It is collapsed by default.
- If a provider exposes only a summary, the UI labels it as a thinking summary.
- If a provider does not expose thinking content, no thinking section is shown.

The provider layer normalizes provider-specific responses into internal fields such as `reasoningText`, `answerText`, `toolCalls`, `citations`, and `status`.

## Role Cards and System Prompts

The first version supports high-customization role cards inspired by role-play chat tools, but role setup must not block normal usage.

If the user does not configure anything, the chat works with a default assistant behavior.

After choosing a chat type and any required IP or knowledge base, Pixory opens a skippable session configuration screen. Users can see the system prompt that will be used before entering the chat.

Users can:

- Start immediately.
- Edit the current system prompt.
- Paste a long role description.
- Choose a saved role card.
- Save the current prompt as a reusable role card.
- Select model and provider.
- Set language or response behavior.
- Select knowledge boundary mode for material-bound chats.

Role cards are primarily free-form text. Structured fields are optional helpers, not rigid templates.

Suggested role-card metadata:

- Role name.
- Short description.
- Main role description text.
- Default language.
- Default model.
- Default knowledge-boundary mode.
- Tags.

The chat screen right-side settings entry reopens the current session configuration. Changes apply only to future messages. Messages should keep a snapshot of the model and prompt used for generation.

## Prompt Rules

Prompt behavior depends on the conversation context.

### Normal Chat Prompt

Normal chat does not inject Pixory material rules. It should not mention local knowledge boundaries, citations, or RAG. The user-editable system prompt and role card define the chat behavior.

Pixory still must not expose API keys, private local paths, or internal implementation details to the model.

### Material-Bound Prompt

IP and knowledge base chats add material-session constraints. These constraints are visible to the user in the configuration screen.

The editable part contains role/personality/language/style instructions. The material rules are presented separately as a protected section so users can understand them without accidentally breaking citation reliability.

Material-session constraints include:

- Use only the selected IP or knowledge base as Pixory-provided material.
- Do not claim to have read unselected materials.
- Do not fabricate citations.
- Use only Pixory-provided retrieved sources for citation display.
- Do not place full documents into context; use bounded snippets.
- If no relevant source is found, state that no citeable material was found.

Strict material mode adds:

- If the selected materials do not contain the answer, say so.
- Avoid unsupported extrapolation unless the user changes the mode.
- Prefer answers with citations.

## Provider and Model Configuration

The AI configuration center uses friendly provider cards rather than a raw API form.

First-version provider targets:

- DeepSeek.
- OpenAI / GPT.
- Gemini.
- Claude.
- OpenAI-compatible custom provider.

Each provider supports:

- API key entry with hide/show behavior.
- Base URL, prefilled for known providers and editable for custom providers.
- Test connection.
- Sync model list.
- Default chat model.
- Default embedding model if supported.

API keys are stored in system secure storage, not SQLite. Non-sensitive settings such as provider name, base URL, selected model, and capability metadata may be stored in SQLite or local settings.

Provider detection uses:

- Known base URLs where possible.
- Model-list APIs where available.
- Manual protocol selection as a fallback.

Model selection must show concrete model IDs and versions, not only provider names. A DeepSeek provider can expose `deepseek-v4-flash`, `deepseek-v4-pro`, and any other returned models. Models that support long context, thinking, tool calls, embedding, or vision should display capability labels when known.

Model variants with materially different context windows or modes must be visible as separate selectable options. For example, if a provider exposes a 1M-context model and a shorter-context model, the selector must show the 1M-context label on the specific model that supports it. Users should not have to know that a provider brand contains a special long-context version.

The first version must support one model per conversation. A session stores:

- Provider ID.
- Model ID.
- Model capability snapshot.

Each generated AI message also stores the actual model used.

Model lists use three fallback layers:

- Built-in recommended models and capability hints.
- Online model-list synchronization.
- Manual model ID entry and manual capability edits.

DeepSeek is treated as a chat provider. Embedding remains separately configured unless DeepSeek later exposes a documented embedding API.

## Embeddings and Retrieval

Chat provider and embedding provider are independent configuration areas.

Retrieval works without embeddings by using local keyword or full-text retrieval. When an embedding provider is configured, Pixory generates embeddings for chunks and upgrades to hybrid retrieval.

First-version retrieval behavior:

- Do not send whole documents to chat providers.
- Retrieve a small Top-K set of relevant chunks.
- Combine bounded retrieved snippets with the current question and context summary.
- Keep chat history bounded by recent turns and summaries.
- Degrade to keyword retrieval if embedding generation fails or is not configured.

Reply length controls are not part of the first version. Pixory follows the model's natural output behavior and the current system prompt. The data model may reserve future fields such as `maxOutputTokens`, `reasoningBudget`, and `responseStyle`.

## Knowledge Base and Document Processing

Document import flow:

1. User selects or creates a knowledge base.
2. User adds material by manual text, TXT, Markdown, PDF, DOCX, or from an existing IP.
3. Pixory copies imported files into app-private local storage.
4. Pixory extracts readable text.
5. Pixory chunks the extracted text.
6. Pixory builds keyword or full-text retrieval metadata.
7. If an embedding provider is configured, Pixory generates embeddings.
8. Material status becomes searchable.

Document statuses include:

- Pending.
- Parsing.
- Parsed.
- Chunked.
- Searchable.
- Embedding pending.
- Embedding ready.
- Failed.

PDF and DOCX image handling:

- The original document remains available for reading.
- AI retrieval uses extractable text only.
- Images inside PDF or DOCX are not visually understood.
- Captions or surrounding extracted text can be indexed if the parser extracts them.
- Scanned PDFs without extractable text show a clear unsupported or no-text status.
- OCR and vision are future extensions, not first-version requirements.

## Document Readers

Uploaded documents must be readable in Pixory. The document pipeline is not a black-box upload flow.

First-version readers:

- TXT: plain text reader.
- Markdown: rendered Markdown reader.
- PDF: PDF reader with page navigation and zoom.
- DOCX: read-only Word text/body reader.

Readers are read-only. The first version does not support editing, annotations, comments, or rich document management.

Citation sources can open the related reader:

- PDF citations open the page when possible.
- DOCX citations open near the paragraph when possible.
- Markdown and TXT citations open near the section or line/paragraph when possible.

For DOCX, complex styling, embedded media fidelity, headers, footers, and exact pagination are best-effort, not guaranteed.

## Citations

Pixory owns citation generation. The model does not invent citation records.

Retrieval returns source records, and Pixory attaches those records to the AI message. The UI displays citations from stored source metadata.

Examples:

- `角色设定说明.md · 第 3 段`
- `研究记录.pdf · 第 12 页`
- `春日少女 IP · 标签：春季 / 海报`
- `春日少女 IP · 图片备注：xxx.jpg`

Normal chat does not show citations.

If retrieval finds no relevant material, the reply can still proceed depending on the knowledge-boundary mode, but the UI must not show fake citations.

## Local Data Model

The implementation plan should refine table names and migrations, but the design expects these durable concepts:

- AI providers: non-sensitive provider configuration.
- AI provider models: synchronized and manually edited model metadata.
- AI role cards: reusable free-form role cards.
- AI threads: conversations with context type, bound object, provider, model, role snapshot, title, archive state, and timestamps.
- AI messages: user and AI messages with streaming/failure state, model snapshot, prompt snapshot, answer text, reasoning text, and citations.
- AI knowledge bases: local knowledge-base records with category/name and space.
- AI documents: imported or generated materials, owner type, file path, parser status, and source metadata.
- AI chunks: extractable text chunks with document or IP source references.
- AI embeddings: optional embedding vectors and provider/model metadata.

Document owner types:

- Knowledge base.
- IP.
- Thread, reserved for temporary session material.

Data must remain separated between normal and private spaces. AI keys are global provider settings, but chat records, knowledge bases, documents, chunks, and embeddings are space-scoped.

## Error Handling

Required error behavior:

- Missing chat API key: show setup guidance without losing typed input.
- Chat request failure: preserve the user message and failed AI placeholder; allow retry.
- Streaming disconnect: preserve partial content and show a failed or stopped state.
- Document parse failure: show failure status and allow retry or removal.
- Embedding failure: keep keyword retrieval available.
- Retrieval empty: state that no citeable material was found; do not fabricate sources.
- Model list sync failure: keep built-in and manually added models available.
- Provider unknown: treat as custom compatible provider when possible.

## Out of Scope for First Version

The first version does not include:

- Image recognition or vision chat.
- OCR for scanned PDFs or embedded images.
- AI image generation.
- Cloud sync, accounts, or server-side knowledge bases.
- Document editing, annotations, or comments.
- Customer project management as a separate entity.
- Complex tag taxonomies for AI materials.
- Reply-length UI controls.
- Multi-IP comparison in one chat.

## Verification Requirements

Implementation is not complete until these checks are possible:

- AI workbench opens from the bottom AI tab.
- The three entry paths work: normal chat, IP chat, knowledge base chat.
- Session configuration shows an editable system prompt and optional role card before chat starts.
- Chat screen can stream a response.
- Thinking or reasoning content appears separately and can collapse when provided by the model.
- Normal chat does not inject material-session rules.
- IP chat can use structured IP text and metadata.
- Knowledge base chat can import TXT, Markdown, PDF, and DOCX.
- Imported documents are copied to private storage before indexing.
- Materials progress through parse, chunk, and searchable states.
- Documents can be opened in read-only readers.
- Citations can open related document or IP sources when supported.
- Retrieval works without embeddings.
- Hybrid retrieval works when embedding provider settings are available.
- Provider setup supports DeepSeek, OpenAI/GPT, Gemini, Claude, and custom compatible providers.
- Model selection shows concrete model IDs and capability labels when known.
- One conversation can use a specific provider/model independent of other conversations.
- Role-card changes and model changes affect only future messages.
- Context object switching creates a new session.
- Recent Continue restores saved context, model, and role configuration.
- Full history can filter normal chat, IP chat, knowledge base chat, customer-project category, and archived sessions.
- API keys are not written to SQLite.
- Normal and private spaces remain isolated.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- Android simulator smoke test covers AI workbench, chat, provider setup, material import, reader opening, and citation navigation.
