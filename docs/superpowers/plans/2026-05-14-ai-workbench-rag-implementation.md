# Pixory AI Workbench RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full first-version Pixory AI workbench: normal chat, IP chat, knowledge-base chat, provider/model setup, role cards, local document ingestion/readers, retrieval, citations, streaming, and final Android verification.

**Architecture:** Build the AI feature as a local-first vertical slice under `src/ai`, with SQLite repositories, local file storage, provider adapters, retrieval services, and focused screens. The bottom `AI` tab becomes an AI workbench that routes into chat, provider setup, session configuration, IP selection, knowledge-base selection, document readers, and history. Keep provider keys in SecureStore, keep all chat/material/chunk/embedding data scoped to Pixory space, and treat external model calls as bounded context requests.

**Tech Stack:** Expo React Native, TypeScript, expo-sqlite, expo-file-system, expo-secure-store, expo-document-picker, existing `react-native-zip-archive` for DOCX text extraction, existing Android project for any native PDF reader dependency if required, Node `node:test` policy tests, Android emulator smoke tests.

---

## Scope and Execution Rule

This is intentionally a large one-run plan because the user wants a single `/goal` to execute the feature. The goal runner must still checkpoint after each task, run the listed verification, and commit completed slices frequently.

Pause and report instead of forcing through if any of these happen:

- A PDF reader/parser requires a native dependency that fails Android build.
- A provider API requires real credentials for verification and no mock/test path can cover the branch.
- A document parser cannot safely parse without corrupting or deleting the original document.
- Normal/personal space isolation becomes ambiguous.
- Existing user changes conflict with a planned file edit.

Do not implement image recognition, OCR, cloud sync, accounts, server-side knowledge bases, AI image generation, document editing, annotations, reply-length controls, or multi-IP comparison.

## File Structure

Create these focused modules:

- `src/ai/types.ts`: AI domain types, context types, provider/model metadata, role card types, message status, citation types, document statuses.
- `src/ai/aiConstants.ts`: built-in providers, default models, secure-store key builders, default prompts, protected material rules.
- `src/ai/promptBuilder.ts`: constructs normal-chat and material-bound prompts from session config, role cards, context summaries, and retrieved snippets.
- `src/ai/providerRegistry.ts`: provider detection, built-in provider metadata, model capability hints.
- `src/ai/providers/base.ts`: provider adapter interface and normalized stream events.
- `src/ai/providers/openAiCompatibleProvider.ts`: OpenAI-compatible adapter for DeepSeek, OpenAI, and custom providers.
- `src/ai/providers/geminiProvider.ts`: Gemini adapter.
- `src/ai/providers/claudeProvider.ts`: Claude adapter.
- `src/ai/secureAiSettingsService.ts`: SecureStore read/write/delete for provider API keys.
- `src/ai/aiProviderService.ts`: provider CRUD, key status, test connection, model sync orchestration.
- `src/ai/aiChatService.ts`: send/stream chat messages, stop/retry handling, message persistence.
- `src/ai/aiRetrievalService.ts`: keyword retrieval, embedding optional path, hybrid score merging.
- `src/ai/aiEmbeddingService.ts`: embedding generation orchestration and failure downgrade.
- `src/ai/aiDocumentService.ts`: import/copy/parse/chunk/index documents and generate IP materials.
- `src/ai/documentParsers/textParser.ts`: TXT parser.
- `src/ai/documentParsers/markdownParser.ts`: Markdown parser.
- `src/ai/documentParsers/docxParser.ts`: DOCX text parser using unzip + XML text extraction.
- `src/ai/documentParsers/pdfParser.ts`: PDF text extraction adapter or graceful no-text/unsupported state when parser dependency is unavailable.
- `src/ai/readers/readerTypes.ts`: document reader route params and locator types.
- `src/database/repositories/aiProviderRepository.ts`: provider/model non-sensitive settings.
- `src/database/repositories/aiThreadRepository.ts`: threads, messages, citations, prompt/model snapshots.
- `src/database/repositories/aiKnowledgeRepository.ts`: knowledge bases, documents, chunks, embeddings.
- `src/screens/AiHomeScreen.tsx`: replace placeholder with workbench.
- `src/screens/AiChatScreen.tsx`: chat UI.
- `src/screens/AiSessionConfigScreen.tsx`: skippable system prompt/role/model configuration.
- `src/screens/AiProviderSettingsScreen.tsx`: provider cards, key entry, test connection, model sync.
- `src/screens/AiModelPickerScreen.tsx`: concrete model selection and capability labels.
- `src/screens/AiRoleCardEditorScreen.tsx`: long role card editor and save flow.
- `src/screens/AiIpPickerScreen.tsx`: choose one IP and enable IP document scope.
- `src/screens/AiKnowledgeBaseScreen.tsx`: select/create knowledge base.
- `src/screens/AiMaterialImportScreen.tsx`: add text/documents/IP-generated material.
- `src/screens/AiMaterialListScreen.tsx`: material status and recent materials.
- `src/screens/AiDocumentReaderScreen.tsx`: TXT/Markdown/PDF/DOCX read-only viewer shell.
- `src/screens/AiHistoryScreen.tsx`: full history and filters.
- `tests/ai-schema-policy.test.cjs`: schema and repository export policy.
- `tests/ai-provider-policy.test.cjs`: provider/key/model capability policy.
- `tests/ai-rag-policy.test.cjs`: retrieval, citation, prompt boundary policy.
- `tests/ai-navigation-policy.test.cjs`: screen registration, tab route, context-switch policy.

Modify these existing files:

- `src/database/schema.ts`: add v17 migration for AI tables and bump `DATABASE_VERSION`.
- `src/database/db.ts`: run v17 migration.
- `src/database/index.ts`: export AI repositories and types.
- `src/services/fileStorageService.ts`: add AI document/material storage directories scoped by space.
- `App.tsx`: route AI workbench, chat, settings, pickers, readers, and history.
- `src/components/BottomTabBar.tsx`: keep AI tab route stable.
- Existing tests that assert route and tab policy, if they need to know new AI screens.

## Database Migration Target

Add `DATABASE_VERSION = 17` and `MIGRATION_STATEMENTS_V17` with these durable tables. Use `TEXT` IDs for AI records so local drafts, streamed messages, and future export/import can be stable before SQLite insert retries.

```sql
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY NOT NULL,
  providerType TEXT NOT NULL CHECK (providerType IN ('deepseek', 'openai', 'gemini', 'claude', 'openai_compatible', 'custom')),
  displayName TEXT NOT NULL,
  baseUrl TEXT,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai_compatible', 'gemini', 'anthropic')),
  chatEnabled INTEGER NOT NULL DEFAULT 1,
  embeddingEnabled INTEGER NOT NULL DEFAULT 0,
  visionEnabled INTEGER NOT NULL DEFAULT 0,
  defaultChatModelId TEXT,
  defaultEmbeddingModelId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_models (
  id TEXT PRIMARY KEY NOT NULL,
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  displayName TEXT NOT NULL,
  supportsChat INTEGER NOT NULL DEFAULT 1,
  supportsEmbedding INTEGER NOT NULL DEFAULT 0,
  supportsThinking INTEGER NOT NULL DEFAULT 0,
  supportsVision INTEGER NOT NULL DEFAULT 0,
  supportsTools INTEGER NOT NULL DEFAULT 0,
  contextWindowTokens INTEGER,
  capabilityJson TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('built_in', 'synced', 'manual')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (providerId, modelId),
  FOREIGN KEY (providerId) REFERENCES ai_providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_role_cards (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  defaultLanguage TEXT,
  defaultModelId TEXT,
  boundaryMode TEXT NOT NULL DEFAULT 'free' CHECK (boundaryMode IN ('free', 'prefer_material', 'strict_material')),
  tagsJson TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS ai_knowledge_bases (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS ai_threads (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  contextType TEXT NOT NULL CHECK (contextType IN ('normal', 'ip', 'knowledge_base')),
  boundIpId INTEGER,
  boundKnowledgeBaseId TEXT,
  includeIpDocuments INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  titleStatus TEXT NOT NULL DEFAULT 'fallback' CHECK (titleStatus IN ('fallback', 'generated', 'custom')),
  providerId TEXT,
  modelId TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  roleCardId TEXT,
  roleSnapshotJson TEXT NOT NULL DEFAULT '{}',
  systemPrompt TEXT NOT NULL DEFAULT '',
  materialRulesSnapshot TEXT,
  boundaryMode TEXT NOT NULL DEFAULT 'free' CHECK (boundaryMode IN ('free', 'prefer_material', 'strict_material')),
  summary TEXT,
  lastMessagePreview TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT,
  FOREIGN KEY (boundKnowledgeBaseId) REFERENCES ai_knowledge_bases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  threadId TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'queued', 'generating', 'completed', 'failed', 'stopped')),
  content TEXT NOT NULL DEFAULT '',
  reasoningText TEXT,
  errorMessage TEXT,
  providerId TEXT,
  modelId TEXT,
  modelSnapshotJson TEXT NOT NULL DEFAULT '{}',
  promptSnapshotJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  FOREIGN KEY (threadId) REFERENCES ai_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_documents (
  id TEXT PRIMARY KEY NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  ownerType TEXT NOT NULL CHECK (ownerType IN ('knowledge_base', 'ip', 'thread')),
  ownerId TEXT NOT NULL,
  sourceType TEXT NOT NULL CHECK (sourceType IN ('manual_text', 'txt', 'markdown', 'pdf', 'docx', 'ip_generated')),
  title TEXT NOT NULL,
  originalFilename TEXT,
  localUri TEXT,
  mimeType TEXT,
  fileSize INTEGER,
  parserStatus TEXT NOT NULL CHECK (parserStatus IN ('pending', 'parsing', 'parsed', 'chunked', 'searchable', 'embedding_pending', 'embedding_ready', 'failed')),
  parserError TEXT,
  metadataJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  documentId TEXT NOT NULL,
  space TEXT NOT NULL CHECK (space IN ('normal', 'personal')),
  ownerType TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  chunkIndex INTEGER NOT NULL,
  text TEXT NOT NULL,
  normalizedText TEXT NOT NULL,
  sourceLabel TEXT NOT NULL,
  locatorJson TEXT NOT NULL DEFAULT '{}',
  tokenEstimate INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (documentId) REFERENCES ai_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_embeddings (
  id TEXT PRIMARY KEY NOT NULL,
  chunkId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  modelId TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vectorJson TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (chunkId) REFERENCES ai_chunks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_message_citations (
  id TEXT PRIMARY KEY NOT NULL,
  messageId TEXT NOT NULL,
  sourceType TEXT NOT NULL CHECK (sourceType IN ('document_chunk', 'ip_metadata', 'image_note')),
  sourceId TEXT NOT NULL,
  label TEXT NOT NULL,
  locatorJson TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  FOREIGN KEY (messageId) REFERENCES ai_messages(id) ON DELETE CASCADE
);
```

Required indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_ai_threads_space_updated_at ON ai_threads(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_threads_context ON ai_threads(space, contextType, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_created_at ON ai_messages(threadId, createdAt);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_space_updated_at ON ai_knowledge_bases(space, updatedAt);
CREATE INDEX IF NOT EXISTS idx_ai_documents_owner_status ON ai_documents(space, ownerType, ownerId, parserStatus);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_owner ON ai_chunks(space, ownerType, ownerId);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_index ON ai_chunks(documentId, chunkIndex);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_chunk ON ai_embeddings(chunkId);
CREATE INDEX IF NOT EXISTS idx_ai_citations_message ON ai_message_citations(messageId);
```

## Detailed Tasks

### Task 1: Policy Tests for Schema, Routes, Provider Boundaries

**Files:**
- Create: `tests/ai-schema-policy.test.cjs`
- Create: `tests/ai-provider-policy.test.cjs`
- Create: `tests/ai-rag-policy.test.cjs`
- Create: `tests/ai-navigation-policy.test.cjs`

- [ ] Add `tests/ai-schema-policy.test.cjs`.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'src/database/schema.ts'), 'utf8');
const db = fs.readFileSync(path.join(root, 'src/database/db.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/database/index.ts'), 'utf8');

test('AI migration bumps database version and creates core local tables', () => {
  assert.match(schema, /DATABASE_VERSION = 17/);
  for (const table of [
    'ai_providers',
    'ai_provider_models',
    'ai_role_cards',
    'ai_threads',
    'ai_messages',
    'ai_knowledge_bases',
    'ai_documents',
    'ai_chunks',
    'ai_embeddings',
    'ai_message_citations',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test('AI data model preserves space isolation and local document ownership', () => {
  assert.match(schema, /space TEXT NOT NULL CHECK \\(space IN \\('normal', 'personal'\\)\\)/);
  assert.match(schema, /ownerType TEXT NOT NULL CHECK \\(ownerType IN \\('knowledge_base', 'ip', 'thread'\\)\\)/);
  assert.match(schema, /parserStatus TEXT NOT NULL CHECK/);
});

test('database runner applies AI migration and exports AI repositories', () => {
  assert.match(db, /MIGRATION_STATEMENTS_V17/);
  assert.match(db, /currentVersion < 17/);
  assert.match(index, /aiProviderRepository/);
  assert.match(index, /aiThreadRepository/);
  assert.match(index, /aiKnowledgeRepository/);
});
```

- [ ] Add `tests/ai-provider-policy.test.cjs`.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const constantsPath = path.join(root, 'src/ai/aiConstants.ts');
const servicePath = path.join(root, 'src/ai/secureAiSettingsService.ts');
const registryPath = path.join(root, 'src/ai/providerRegistry.ts');

test('AI constants define required built-in providers without storing keys in SQLite', () => {
  const constants = fs.readFileSync(constantsPath, 'utf8');
  for (const provider of ['deepseek', 'openai', 'gemini', 'claude', 'openai_compatible']) {
    assert.match(constants, new RegExp(provider));
  }
  assert.match(constants, /secureStoreKeyForProvider/);
});

test('secure AI settings service uses expo-secure-store for API keys', () => {
  const service = fs.readFileSync(servicePath, 'utf8');
  assert.match(service, /expo-secure-store/);
  assert.match(service, /setProviderApiKey/);
  assert.match(service, /getProviderApiKey/);
  assert.match(service, /deleteProviderApiKey/);
});

test('provider registry exposes concrete model capabilities and long context labels', () => {
  const registry = fs.readFileSync(registryPath, 'utf8');
  assert.match(registry, /deepseek-v4-flash/);
  assert.match(registry, /deepseek-v4-pro/);
  assert.match(registry, /contextWindowTokens/);
  assert.match(registry, /supportsThinking/);
  assert.match(registry, /detectProviderType/);
});
```

- [ ] Add `tests/ai-rag-policy.test.cjs`.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const promptBuilder = () => fs.readFileSync(path.join(root, 'src/ai/promptBuilder.ts'), 'utf8');
const retrieval = () => fs.readFileSync(path.join(root, 'src/ai/aiRetrievalService.ts'), 'utf8');
const docService = () => fs.readFileSync(path.join(root, 'src/ai/aiDocumentService.ts'), 'utf8');

test('normal chat prompt avoids Pixory material rules', () => {
  const content = promptBuilder();
  assert.match(content, /buildNormalChatPrompt/);
  assert.match(content, /buildMaterialBoundPrompt/);
  assert.match(content, /MATERIAL_SESSION_RULES/);
});

test('retrieval uses bounded snippets and never whole documents', () => {
  const content = retrieval();
  assert.match(content, /DEFAULT_RETRIEVAL_LIMIT/);
  assert.match(content, /retrieveForThread/);
  assert.match(content, /keyword/);
  assert.match(content, /hybrid/);
});

test('document service supports required first-version sources and excludes OCR vision', () => {
  const content = docService();
  for (const source of ['manual_text', 'txt', 'markdown', 'pdf', 'docx', 'ip_generated']) {
    assert.match(content, new RegExp(source));
  }
  assert.doesNotMatch(content, /visionProvider\\.analyzeImage/);
  assert.doesNotMatch(content, /performOcr/);
});
```

- [ ] Add `tests/ai-navigation-policy.test.cjs`.

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const home = () => fs.readFileSync(path.join(root, 'src/screens/AiHomeScreen.tsx'), 'utf8');
const chat = () => fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');

test('AI routes are registered for workbench, chat, settings, history, materials, and readers', () => {
  for (const route of [
    'ai-chat',
    'ai-session-config',
    'ai-provider-settings',
    'ai-ip-picker',
    'ai-knowledge-base',
    'ai-material-import',
    'ai-material-list',
    'ai-document-reader',
    'ai-history',
  ]) {
    assert.match(app, new RegExp(route));
  }
});

test('AI workbench exposes the three first-version starts and no disconnected default warning', () => {
  const content = home();
  assert.match(content, /开始普通聊天/);
  assert.match(content, /问问某个 IP/);
  assert.match(content, /连接知识库/);
  assert.doesNotMatch(content, /当前未连接知识库/);
});

test('AI chat screen exposes context title, settings, streaming, thinking, and citations', () => {
  const content = chat();
  for (const expected of ['contextTitle', '会话设置', 'stream', 'thinking', 'citations']) {
    assert.match(content, new RegExp(expected));
  }
});
```

- [ ] Run policy tests and confirm they fail before implementation.

Run:

```powershell
pnpm test
```

Expected: FAIL because `src/ai/*`, AI tables, and AI screens do not exist yet.

- [ ] Commit tests.

```powershell
git add tests/ai-*.test.cjs
git commit -m "test: add AI workbench acceptance policies"
```

### Task 2: AI Types, Constants, Provider Registry, Secure Key Storage

**Files:**
- Create: `src/ai/types.ts`
- Create: `src/ai/aiConstants.ts`
- Create: `src/ai/providerRegistry.ts`
- Create: `src/ai/secureAiSettingsService.ts`

- [ ] Create `src/ai/types.ts` with the shared domain model.

```ts
import type { PixorySpace } from '../database';

export type AiProviderType = 'deepseek' | 'openai' | 'gemini' | 'claude' | 'openai_compatible' | 'custom';
export type AiProviderProtocol = 'openai_compatible' | 'gemini' | 'anthropic';
export type AiContextType = 'normal' | 'ip' | 'knowledge_base';
export type AiBoundaryMode = 'free' | 'prefer_material' | 'strict_material';
export type AiMessageRole = 'user' | 'assistant' | 'system';
export type AiMessageStatus = 'draft' | 'queued' | 'generating' | 'completed' | 'failed' | 'stopped';
export type AiDocumentOwnerType = 'knowledge_base' | 'ip' | 'thread';
export type AiDocumentSourceType = 'manual_text' | 'txt' | 'markdown' | 'pdf' | 'docx' | 'ip_generated';
export type AiDocumentStatus = 'pending' | 'parsing' | 'parsed' | 'chunked' | 'searchable' | 'embedding_pending' | 'embedding_ready' | 'failed';
export type AiCitationSourceType = 'document_chunk' | 'ip_metadata' | 'image_note';
export type AiModelSource = 'built_in' | 'synced' | 'manual';

export interface AiModelCapabilities {
  supportsChat: boolean;
  supportsEmbedding: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  contextWindowTokens?: number;
  labels: string[];
}

export interface AiProviderRecord {
  id: string;
  providerType: AiProviderType;
  displayName: string;
  baseUrl: string | null;
  protocol: AiProviderProtocol;
  chatEnabled: boolean;
  embeddingEnabled: boolean;
  visionEnabled: boolean;
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderModelRecord extends AiModelCapabilities {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  source: AiModelSource;
  createdAt: string;
  updatedAt: string;
}

export interface AiThreadRecord {
  id: string;
  space: PixorySpace;
  contextType: AiContextType;
  boundIpId: number | null;
  boundKnowledgeBaseId: string | null;
  includeIpDocuments: boolean;
  title: string;
  titleStatus: 'fallback' | 'generated' | 'custom';
  providerId: string | null;
  modelId: string | null;
  boundaryMode: AiBoundaryMode;
  systemPrompt: string;
  materialRulesSnapshot: string | null;
  summary: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AiCitationRecord {
  id: string;
  messageId: string;
  sourceType: AiCitationSourceType;
  sourceId: string;
  label: string;
  locator: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] Create `src/ai/aiConstants.ts` with provider presets, prompts, and secure key names.

```ts
import type { AiBoundaryMode, AiProviderProtocol, AiProviderType, AiModelCapabilities } from './types';

export const DEFAULT_AI_ROLE_PROMPT = '你是一个清晰、可靠、尊重用户意图的 AI 助手。回答时优先直接解决问题，必要时给出简洁的步骤。';

export const MATERIAL_SESSION_RULES = [
  '只能把当前已绑定的 IP 或知识库作为 Pixory 提供的资料来源。',
  '不要声称读取了未绑定的 IP、知识库、文档或图片。',
  '不要编造引用来源。',
  '引用只能来自 Pixory 检索返回的真实来源。',
  '不要把整篇文档当作上下文，只使用当前检索到的有限片段。',
  '如果没有找到可引用资料，需要说明未找到可引用资料。',
].join('\n');

export const STRICT_MATERIAL_RULES = [
  MATERIAL_SESSION_RULES,
  '严格资料模式下，如果资料没有答案，需要说明资料不足。',
  '严格资料模式下，不要做无来源的外延推断。',
].join('\n');

export const DEFAULT_BOUNDARY_MODE: AiBoundaryMode = 'free';

export interface BuiltInProvider {
  providerType: AiProviderType;
  displayName: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  chatEnabled: boolean;
  embeddingEnabled: boolean;
  visionEnabled: boolean;
}

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  { providerType: 'deepseek', displayName: 'DeepSeek', protocol: 'openai_compatible', baseUrl: 'https://api.deepseek.com', chatEnabled: true, embeddingEnabled: false, visionEnabled: false },
  { providerType: 'openai', displayName: 'OpenAI / GPT', protocol: 'openai_compatible', baseUrl: 'https://api.openai.com/v1', chatEnabled: true, embeddingEnabled: true, visionEnabled: true },
  { providerType: 'gemini', displayName: 'Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', chatEnabled: true, embeddingEnabled: true, visionEnabled: true },
  { providerType: 'claude', displayName: 'Claude', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', chatEnabled: true, embeddingEnabled: false, visionEnabled: true },
  { providerType: 'openai_compatible', displayName: 'OpenAI-compatible', protocol: 'openai_compatible', baseUrl: '', chatEnabled: true, embeddingEnabled: true, visionEnabled: false },
];

export function secureStoreKeyForProvider(providerId: string): string {
  return `pixory.ai.provider.${providerId}.apiKey`;
}

export function capabilityLabels(capabilities: AiModelCapabilities): string[] {
  const labels: string[] = [];
  if (capabilities.contextWindowTokens && capabilities.contextWindowTokens >= 1_000_000) labels.push('1M 上下文');
  if (capabilities.supportsThinking) labels.push('思考');
  if (capabilities.supportsEmbedding) labels.push('Embedding');
  if (capabilities.supportsVision) labels.push('Vision 预留');
  if (capabilities.supportsTools) labels.push('工具调用');
  return labels;
}
```

- [ ] Create `src/ai/providerRegistry.ts` with provider detection and built-in model hints.

```ts
import { BUILT_IN_PROVIDERS, capabilityLabels } from './aiConstants';
import type { AiProviderProtocol, AiProviderType, AiProviderModelRecord } from './types';

export function detectProviderType(baseUrl: string): AiProviderType {
  const normalized = baseUrl.toLowerCase();
  if (normalized.includes('api.deepseek.com')) return 'deepseek';
  if (normalized.includes('api.openai.com')) return 'openai';
  if (normalized.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (normalized.includes('api.anthropic.com')) return 'claude';
  return 'custom';
}

export function protocolForProvider(providerType: AiProviderType): AiProviderProtocol {
  return BUILT_IN_PROVIDERS.find((provider) => provider.providerType === providerType)?.protocol ?? 'openai_compatible';
}

export function builtInModelsForProvider(providerId: string, providerType: AiProviderType): AiProviderModelRecord[] {
  const now = new Date().toISOString();
  const build = (modelId: string, displayName: string, partial: Partial<AiProviderModelRecord>): AiProviderModelRecord => {
    const record: AiProviderModelRecord = {
      id: `${providerId}:${modelId}`,
      providerId,
      modelId,
      displayName,
      supportsChat: true,
      supportsEmbedding: false,
      supportsThinking: false,
      supportsVision: false,
      supportsTools: false,
      labels: [],
      source: 'built_in',
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    return { ...record, labels: capabilityLabels(record) };
  };

  if (providerType === 'deepseek') {
    return [
      build('deepseek-v4-flash', 'DeepSeek V4 Flash', { contextWindowTokens: 1_000_000, supportsThinking: true }),
      build('deepseek-v4-pro', 'DeepSeek V4 Pro', { contextWindowTokens: 1_000_000, supportsThinking: true }),
      build('deepseek-chat', 'DeepSeek Chat', { supportsThinking: false }),
      build('deepseek-reasoner', 'DeepSeek Reasoner', { supportsThinking: true }),
    ];
  }

  if (providerType === 'openai') {
    return [
      build('gpt-5.5', 'GPT-5.5', { contextWindowTokens: 1_000_000, supportsThinking: true, supportsVision: true, supportsTools: true }),
      build('gpt-5.4', 'GPT-5.4', { supportsThinking: true, supportsVision: true, supportsTools: true }),
      build('text-embedding-3-large', 'text-embedding-3-large', { supportsChat: false, supportsEmbedding: true }),
    ];
  }

  if (providerType === 'gemini') {
    return [
      build('gemini-2.5-flash', 'Gemini 2.5 Flash', { supportsThinking: true, supportsVision: true }),
      build('gemini-2.5-pro', 'Gemini 2.5 Pro', { supportsThinking: true, supportsVision: true }),
      build('text-embedding-004', 'Gemini Text Embedding', { supportsChat: false, supportsEmbedding: true }),
    ];
  }

  if (providerType === 'claude') {
    return [
      build('claude-sonnet-4.5', 'Claude Sonnet 4.5', { supportsThinking: true, supportsVision: true }),
      build('claude-haiku-4.5', 'Claude Haiku 4.5', { supportsThinking: true, supportsVision: true }),
    ];
  }

  return [];
}
```

- [ ] Create `src/ai/secureAiSettingsService.ts`.

```ts
import * as SecureStore from 'expo-secure-store';
import { secureStoreKeyForProvider } from './aiConstants';

export async function setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await deleteProviderApiKey(providerId);
    return;
  }
  await SecureStore.setItemAsync(secureStoreKeyForProvider(providerId), trimmed);
}

export async function getProviderApiKey(providerId: string): Promise<string | null> {
  return SecureStore.getItemAsync(secureStoreKeyForProvider(providerId));
}

export async function deleteProviderApiKey(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(secureStoreKeyForProvider(providerId));
}

export async function hasProviderApiKey(providerId: string): Promise<boolean> {
  return Boolean(await getProviderApiKey(providerId));
}
```

- [ ] Run provider policy test.

Run:

```powershell
pnpm test -- tests/ai-provider-policy.test.cjs
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/ai/types.ts src/ai/aiConstants.ts src/ai/providerRegistry.ts src/ai/secureAiSettingsService.ts tests/ai-provider-policy.test.cjs
git commit -m "feat: add AI provider domain foundation"
```

### Task 3: AI SQLite Migration and Repositories

**Files:**
- Modify: `src/database/schema.ts`
- Modify: `src/database/db.ts`
- Modify: `src/database/index.ts`
- Modify: `src/database/types.ts`
- Create: `src/database/repositories/aiProviderRepository.ts`
- Create: `src/database/repositories/aiThreadRepository.ts`
- Create: `src/database/repositories/aiKnowledgeRepository.ts`

- [ ] Add AI record types to `src/database/types.ts` by re-exporting or mirroring `src/ai/types.ts` where repository row mapping needs database-specific rows.

```ts
export type {
  AiBoundaryMode,
  AiCitationRecord,
  AiContextType,
  AiDocumentOwnerType,
  AiDocumentSourceType,
  AiDocumentStatus,
  AiMessageRole,
  AiMessageStatus,
  AiModelCapabilities,
  AiProviderModelRecord,
  AiProviderProtocol,
  AiProviderRecord,
  AiProviderType,
  AiThreadRecord,
} from '../ai/types';
```

- [ ] Add `MIGRATION_STATEMENTS_V17` to `src/database/schema.ts` using the SQL in the "Database Migration Target" section.
- [ ] Change `DATABASE_VERSION` from `16` to `17`.
- [ ] Import `MIGRATION_STATEMENTS_V17` in `src/database/db.ts`.
- [ ] Add this block after the v16 migration block:

```ts
    if (currentVersion < 17) {
      await database.execAsync(MIGRATION_STATEMENTS_V17);
    }
```

- [ ] Create repository files with small, explicit methods:

`aiProviderRepository.ts` must include:

```ts
export const aiProviderRepository = {
  async upsertProvider(db, provider) {},
  async listProviders(db) {},
  async findProviderById(db, providerId) {},
  async upsertModels(db, providerId, models) {},
  async listModels(db, providerId) {},
  async findModel(db, providerId, modelId) {},
};
```

`aiThreadRepository.ts` must include:

```ts
export const aiThreadRepository = {
  async createThread(db, input) {},
  async updateThread(db, threadId, patch) {},
  async listRecentThreads(db, space, limit) {},
  async listThreads(db, query) {},
  async createMessage(db, input) {},
  async updateMessage(db, messageId, patch) {},
  async listMessages(db, threadId) {},
  async replaceCitations(db, messageId, citations) {},
  async listCitations(db, messageId) {},
};
```

`aiKnowledgeRepository.ts` must include:

```ts
export const aiKnowledgeRepository = {
  async createKnowledgeBase(db, input) {},
  async listKnowledgeBases(db, space) {},
  async createDocument(db, input) {},
  async updateDocumentStatus(db, documentId, status, parserError) {},
  async listDocuments(db, query) {},
  async replaceChunks(db, documentId, chunks) {},
  async searchChunksByKeyword(db, query) {},
  async replaceEmbeddings(db, chunkEmbeddings) {},
};
```

Use the existing repository style: `createTimestamp()`, explicit SQL, small row-mapping helpers, and no React state access.

- [ ] Export repositories from `src/database/index.ts`.

```ts
export { aiProviderRepository } from './repositories/aiProviderRepository';
export { aiThreadRepository } from './repositories/aiThreadRepository';
export { aiKnowledgeRepository } from './repositories/aiKnowledgeRepository';
```

- [ ] Run schema policy test.

Run:

```powershell
pnpm test -- tests/ai-schema-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/database/schema.ts src/database/db.ts src/database/index.ts src/database/types.ts src/database/repositories/aiProviderRepository.ts src/database/repositories/aiThreadRepository.ts src/database/repositories/aiKnowledgeRepository.ts tests/ai-schema-policy.test.cjs
git commit -m "feat: add AI local database schema"
```

### Task 4: AI Storage Directories and Document Services

**Files:**
- Modify: `src/services/fileStorageService.ts`
- Create: `src/ai/aiDocumentService.ts`
- Create: `src/ai/documentParsers/textParser.ts`
- Create: `src/ai/documentParsers/markdownParser.ts`
- Create: `src/ai/documentParsers/docxParser.ts`
- Create: `src/ai/documentParsers/pdfParser.ts`

- [ ] Add AI directory helpers to `fileStorageService.ts`.

```ts
const AI_DOCUMENTS_DIR_NAME = 'ai_documents';

export function getAiDocumentsDir(space: PixorySpace = 'normal'): string {
  return normalizeDirectoryUri(joinPath(getStorageRootDir(space), AI_DOCUMENTS_DIR_NAME));
}

export function getAiKnowledgeBaseDocumentsDir(space: PixorySpace, knowledgeBaseId: string): string {
  return normalizeDirectoryUri(joinPath(getAiDocumentsDir(space), `kb_${knowledgeBaseId}`));
}

export function getAiIpDocumentsDir(space: PixorySpace, ipId: number): string {
  return normalizeDirectoryUri(joinPath(getAiDocumentsDir(space), `ip_${ipId}`));
}
```

Also add `getAiDocumentsDir(space)` to `ensureAppDirectories(space)`.

- [ ] Implement text and Markdown parsers as text readers.

```ts
export interface ParsedDocumentText {
  text: string;
  metadata: Record<string, unknown>;
}

export async function parsePlainText(content: string): Promise<ParsedDocumentText> {
  return { text: content.replace(/\r\n/g, '\n'), metadata: { parser: 'plain-text' } };
}
```

- [ ] Implement DOCX parser with `react-native-zip-archive`.

Use unzip to temp dir, read `word/document.xml`, strip tags, decode common XML entities, and join text nodes. Preserve original DOCX untouched.

- [ ] Implement PDF parser with an explicit adapter.

If a PDF text parser dependency is added and builds successfully, use it. If not, implement a safe first-version fallback:

```ts
export async function parsePdfText(): Promise<ParsedDocumentText> {
  return {
    text: '',
    metadata: {
      parser: 'pdf-fallback',
      noExtractableText: true,
      message: 'PDF text extraction is unavailable in this build. The document can still be opened in the reader when supported.',
    },
  };
}
```

This fallback can pass document import only if the UI clearly marks the PDF as not searchable until text extraction is supported. If the spec must require searchable PDF in this release and no parser builds, pause and report.

- [ ] Implement `aiDocumentService.ts`:

Required methods:

```ts
export async function importManualTextMaterial(input): Promise<AiDocumentRecord> {}
export async function importPickedDocument(input): Promise<AiDocumentRecord> {}
export async function generateIpMaterial(input): Promise<AiDocumentRecord> {}
export async function parseAndChunkDocument(input): Promise<void> {}
export async function listRecentMaterials(space: PixorySpace): Promise<AiDocumentRecord[]> {}
```

Chunking rule:

```ts
const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 160;
```

Use owner type `knowledge_base`, `ip`, or `thread`. Use `runWithDatabaseSpace(space, ...)` for database access. Copy imported files into app-private AI document directories before parsing.

- [ ] Run document/RAG policy test.

Run:

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
pnpm typecheck
```

Expected: PASS for the document source and no OCR/vision policy checks.

- [ ] Commit.

```powershell
git add src/services/fileStorageService.ts src/ai/aiDocumentService.ts src/ai/documentParsers tests/ai-rag-policy.test.cjs
git commit -m "feat: add AI document ingestion foundation"
```

### Task 5: Retrieval, Prompt Builder, Embedding Downgrade

**Files:**
- Create: `src/ai/promptBuilder.ts`
- Create: `src/ai/aiRetrievalService.ts`
- Create: `src/ai/aiEmbeddingService.ts`

- [ ] Implement `promptBuilder.ts`.

Required behavior:

```ts
export function buildNormalChatPrompt(input: { systemPrompt: string; rolePrompt?: string | null; userMessage: string }) {
  return {
    system: [input.systemPrompt, input.rolePrompt].filter(Boolean).join('\n\n'),
    materialRules: null,
    user: input.userMessage,
  };
}

export function buildMaterialBoundPrompt(input: {
  editablePrompt: string;
  materialRules: string;
  contextSummary: string;
  snippets: Array<{ label: string; text: string }>;
  userMessage: string;
}) {
  return {
    system: [input.editablePrompt, '资料规则：', input.materialRules].filter(Boolean).join('\n\n'),
    user: [
      input.contextSummary,
      '可引用资料片段：',
      ...input.snippets.map((snippet, index) => `[${index + 1}] ${snippet.label}\n${snippet.text}`),
      '用户问题：',
      input.userMessage,
    ].join('\n\n'),
  };
}
```

- [ ] Implement `aiRetrievalService.ts`.

Required constants and methods:

```ts
export const DEFAULT_RETRIEVAL_LIMIT = 6;
export type RetrievalMode = 'keyword' | 'hybrid';

export async function retrieveForThread(input): Promise<{
  mode: RetrievalMode;
  snippets: Array<{ chunkId: string; label: string; text: string; locator: Record<string, unknown>; score: number }>;
}> {}
```

Keyword retrieval should query `ai_chunks` with normalized LIKE terms, rank exact phrase matches, multiple term matches, and shorter chunks above weak matches. Hybrid mode can initially merge keyword scores with available vector cosine scores; if embeddings are absent or fail, return keyword mode.

- [ ] Implement `aiEmbeddingService.ts`.

Required behavior:

```ts
export async function generateMissingEmbeddingsForDocument(input): Promise<{ generated: number; failed: number }> {}
export async function tryEmbeddingRetrieval(input): Promise<Array<{ chunkId: string; score: number }>> {}
```

If no embedding provider is configured, return no vector results and do not fail the chat.

- [ ] Run RAG policy and typecheck.

```powershell
pnpm test -- tests/ai-rag-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/ai/promptBuilder.ts src/ai/aiRetrievalService.ts src/ai/aiEmbeddingService.ts
git commit -m "feat: add AI retrieval and prompt building"
```

### Task 6: Provider Services and Streaming Chat Adapters

**Files:**
- Create: `src/ai/providers/base.ts`
- Create: `src/ai/providers/openAiCompatibleProvider.ts`
- Create: `src/ai/providers/geminiProvider.ts`
- Create: `src/ai/providers/claudeProvider.ts`
- Create: `src/ai/aiProviderService.ts`
- Create: `src/ai/aiChatService.ts`

- [ ] Define provider adapter interface in `base.ts`.

```ts
export type AiStreamEvent =
  | { type: 'answer_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'completed'; finishReason?: string }
  | { type: 'error'; message: string };

export interface AiChatRequest {
  apiKey: string;
  baseUrl: string;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AiProviderAdapter {
  testConnection(input: { apiKey: string; baseUrl: string }): Promise<void>;
  listModels(input: { apiKey: string; baseUrl: string }): Promise<string[]>;
  streamChat(input: AiChatRequest, onEvent: (event: AiStreamEvent) => void): Promise<void>;
}
```

- [ ] Implement OpenAI-compatible adapter for DeepSeek/OpenAI/custom.

Use `fetch` with `/models` for model list and `/chat/completions` with `stream: true` for streaming where supported. Normalize reasoning deltas when provider returns them; otherwise append only answer deltas.

- [ ] Implement Gemini and Claude adapters with their provider-specific URLs and response normalization.

If model-list or streaming endpoints differ, wrap those differences inside the adapter. Surface failures through `AiStreamEvent` instead of throwing after partial response unless connection setup fails.

- [ ] Implement `aiProviderService.ts`.

Required methods:

```ts
export async function ensureBuiltInProviders(space: PixorySpace): Promise<void> {}
export async function saveProviderApiKey(providerId: string, apiKey: string): Promise<void> {}
export async function testProvider(providerId: string): Promise<void> {}
export async function syncProviderModels(providerId: string): Promise<{ synced: number; fallback: number }> {}
export async function listProviderCards(space: PixorySpace): Promise<Array<{ provider: AiProviderRecord; hasApiKey: boolean; models: AiProviderModelRecord[] }>> {}
```

- [ ] Implement `aiChatService.ts`.

Required methods:

```ts
export async function createThreadFromContext(input): Promise<AiThreadRecord> {}
export async function sendUserMessage(input): Promise<{ userMessageId: string; assistantMessageId: string }> {}
export async function retryAssistantMessage(input): Promise<void> {}
export async function stopStreamingMessage(input): Promise<void> {}
```

Persist user message first, create assistant placeholder with `generating`, stream answer/reasoning into it, then mark `completed`, `failed`, or `stopped`.

- [ ] Run typecheck and provider tests.

```powershell
pnpm test -- tests/ai-provider-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/ai/providers src/ai/aiProviderService.ts src/ai/aiChatService.ts
git commit -m "feat: add AI provider and chat services"
```

### Task 7: Route Registration and AI Workbench UI

**Files:**
- Modify: `App.tsx`
- Modify: `src/screens/AiHomeScreen.tsx`
- Create route placeholder screens needed by policy test.

- [ ] Register AI routes in `App.tsx`.

Add route keys:

```ts
| 'ai-chat'
| 'ai-session-config'
| 'ai-provider-settings'
| 'ai-model-picker'
| 'ai-role-card-editor'
| 'ai-ip-picker'
| 'ai-knowledge-base'
| 'ai-material-import'
| 'ai-material-list'
| 'ai-document-reader'
| 'ai-history'
```

Route params must include `space` where data is space-scoped.

- [ ] Replace `AiHomeScreen.tsx` placeholder with workbench.

Required visible entry text:

```tsx
<StartCard title="开始普通聊天" description="不连接资料，直接聊天" />
<StartCard title="问问某个 IP" description="选择一个 IP，让 AI 参考它的资料" />
<StartCard title="连接知识库" description="选择知识库或添加资料后开始" />
```

Do not include `当前未连接知识库`.

- [ ] Add Recent Continue, View All, and Knowledge Bases and Materials sections.

Use existing components/tokens: `ScreenScaffold`, `ContentCard`, `SectionHeader`, `colors`, `spacing`, `rhythm`. Keep cards practical and compact.

- [ ] Create placeholder route screens with real navigation stubs, not blank pages. Each screen should have a clear title and back path so route smoke tests can proceed.

- [ ] Run navigation policy and typecheck.

```powershell
pnpm test -- tests/ai-navigation-policy.test.cjs
pnpm typecheck
```

Expected: PASS after placeholders and workbench are present.

- [ ] Commit.

```powershell
git add App.tsx src/screens/AiHomeScreen.tsx src/screens/Ai*.tsx tests/ai-navigation-policy.test.cjs
git commit -m "feat: add AI workbench navigation shell"
```

### Task 8: Session Config, Role Card Editor, Provider Settings UI

**Files:**
- Create/complete: `src/screens/AiSessionConfigScreen.tsx`
- Create/complete: `src/screens/AiProviderSettingsScreen.tsx`
- Create/complete: `src/screens/AiModelPickerScreen.tsx`
- Create/complete: `src/screens/AiRoleCardEditorScreen.tsx`

- [ ] Implement session configuration screen.

It must show:

- Current context.
- Editable system prompt.
- Optional role card selector.
- Model selector.
- Boundary mode selector.
- Protected material rules for IP/knowledge-base chats.
- Start Chat button.

Normal chat must not show Pixory material rules.

- [ ] Implement role card editor with a large multiline description field.

Required behavior:

- User can paste long role description.
- User can save as reusable role card.
- User can apply only to current session.
- Default role exists implicitly; user can skip.

- [ ] Implement provider settings screen.

Provider cards must support:

- API key entry with hide/show.
- Base URL display/edit for compatible/custom.
- Test connection button.
- Sync models button.
- Default chat model row.
- Default embedding model row when supported.

- [ ] Implement model picker.

Show concrete model rows with capability chips:

- Context window label such as `1M 上下文`.
- Thinking.
- Embedding.
- Vision reserved.
- Tool calls.

- [ ] Run typecheck and provider policy test.

```powershell
pnpm test -- tests/ai-provider-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/screens/AiSessionConfigScreen.tsx src/screens/AiProviderSettingsScreen.tsx src/screens/AiModelPickerScreen.tsx src/screens/AiRoleCardEditorScreen.tsx
git commit -m "feat: add AI session and provider settings"
```

### Task 9: Chat UI, Streaming State, Thinking, Citations

**Files:**
- Complete: `src/screens/AiChatScreen.tsx`
- Create: `src/components/ai/AiMessageBubble.tsx`
- Create: `src/components/ai/AiCitationList.tsx`
- Create: `src/components/ai/AiThinkingBlock.tsx`
- Create: `src/components/ai/AiChatComposer.tsx`

- [ ] Build chat screen with messaging skeleton.

Required UI:

- Back button.
- Context title.
- Right-side `会话设置`.
- Message list.
- User bubbles on right.
- AI bubbles on left.
- Fixed composer.
- Streaming state.

- [ ] Implement thinking block.

Default collapsed. Visible only when `reasoningText` exists. Label as `思考过程` or `思考摘要` based on model metadata/provider event.

- [ ] Implement citations list.

Only show citations attached by Pixory records. Clicking citation navigates to document reader or source IP screen.

- [ ] Implement composer actions.

Minimum actions:

- Send.
- Stop generation when generating.
- Retry failed assistant message.

- [ ] Verify chat policy.

```powershell
pnpm test -- tests/ai-navigation-policy.test.cjs
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/screens/AiChatScreen.tsx src/components/ai
git commit -m "feat: add AI chat experience"
```

### Task 10: IP Chat and Context Switching

**Files:**
- Complete: `src/screens/AiIpPickerScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/ai/aiRetrievalService.ts`

- [ ] Implement IP picker screen.

Use `ipRepository` to list normal or personal IPs based on route `space`. User selects exactly one IP. Show toggles:

- Basic IP material enabled and non-removable.
- IP documents enabled when available.
- Image recognition disabled/reserved copy.

- [ ] Implement IP context summary.

Use existing repositories to collect:

- IP name/description.
- Groups.
- Tags.
- Image notes.
- Original filenames.
- Import batches/timing.
- Favorite counts.
- Asset statistics.

- [ ] Implement context switching rule.

When context object changes, create a new thread. Keep original session. Optionally copy short summary only.

- [ ] Add citation source records for IP metadata and image notes.

Labels must look like:

```text
春日少女 IP · 标签：春季 / 海报
春日少女 IP · 图片备注：xxx.jpg
```

- [ ] Run tests.

```powershell
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/screens/AiIpPickerScreen.tsx src/ai/aiChatService.ts src/ai/aiRetrievalService.ts
git commit -m "feat: add AI IP chat context"
```

### Task 11: Knowledge Base, Material Import, Material Status

**Files:**
- Complete: `src/screens/AiKnowledgeBaseScreen.tsx`
- Complete: `src/screens/AiMaterialImportScreen.tsx`
- Complete: `src/screens/AiMaterialListScreen.tsx`
- Modify: `src/ai/aiDocumentService.ts`

- [ ] Implement knowledge base list/create/select.

Support category/name. Customer project is a knowledge-base category, not a separate entity.

- [ ] Implement material import screen.

Supported starts:

- Manual text.
- TXT.
- Markdown.
- PDF.
- DOCX.
- From existing IP.

Use `expo-document-picker` for files. Copy into app-private storage before parsing.

- [ ] Implement material status list.

Show pending/parsing/parsed/chunked/searchable/embedding_pending/embedding_ready/failed. Failed rows show reason and retry/remove actions.

- [ ] Implement "recent materials" row on AI workbench.

It opens material list and shows recent titles such as role notes/research records/tag system when present.

- [ ] Run tests and typecheck.

```powershell
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/screens/AiKnowledgeBaseScreen.tsx src/screens/AiMaterialImportScreen.tsx src/screens/AiMaterialListScreen.tsx src/ai/aiDocumentService.ts src/screens/AiHomeScreen.tsx
git commit -m "feat: add AI knowledge base material flow"
```

### Task 12: Document Readers and Citation Navigation

**Files:**
- Complete: `src/screens/AiDocumentReaderScreen.tsx`
- Create: `src/ai/readers/readerTypes.ts`
- Create: `src/components/ai/AiMarkdownReader.tsx`
- Create: `src/components/ai/AiTextReader.tsx`
- Create: `src/components/ai/AiDocxReader.tsx`
- Create or integrate: `src/components/ai/AiPdfReader.tsx`

- [ ] Implement reader route params.

```ts
export interface AiDocumentReaderParams {
  documentId: string;
  space: PixorySpace;
  locator?: {
    page?: number;
    paragraph?: number;
    line?: number;
    chunkId?: string;
  };
}
```

- [ ] Implement TXT reader.

Read stored document or parsed chunk text. Scroll near line if locator exists.

- [ ] Implement Markdown reader.

Render headings, paragraphs, lists, code blocks using React Native text components. Keep it read-only.

- [ ] Implement DOCX reader.

Use parsed text/body produced by DOCX parser. Exact pagination and complex media are best-effort. Locate paragraph when locator exists.

- [ ] Implement PDF reader.

Preferred: use a build-safe PDF viewer dependency and verify Android build. If unavailable, provide a clear reader shell that can open file metadata and reports that in-app PDF rendering is blocked, then pause before claiming full PDF-reader acceptance complete.

- [ ] Wire citation clicks.

Document citation opens reader with locator. IP citation opens IP detail or related asset detail where possible.

- [ ] Run tests and Android build smoke if PDF dependency changed.

```powershell
pnpm typecheck
pnpm test
```

If native dependency changed:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Expected: PASS. If PDF native dependency fails build, pause and report.

- [ ] Commit.

```powershell
git add src/screens/AiDocumentReaderScreen.tsx src/ai/readers src/components/ai
git commit -m "feat: add AI document readers and citation navigation"
```

### Task 13: History, Recent Continue, Auto Titles, Archive

**Files:**
- Complete: `src/screens/AiHistoryScreen.tsx`
- Modify: `src/screens/AiHomeScreen.tsx`
- Modify: `src/ai/aiChatService.ts`
- Modify: `src/database/repositories/aiThreadRepository.ts`

- [ ] Implement automatic title generation.

Use lightweight local fallback first:

```ts
export function fallbackAiThreadTitle(input: { contextTitle: string; firstUserMessage: string; contextType: AiContextType }): string {
  const compact = input.firstUserMessage.replace(/\s+/g, ' ').slice(0, 18);
  if (input.contextType === 'normal') return compact || '普通聊天';
  return compact ? `${input.contextTitle} / ${compact}` : input.contextTitle;
}
```

If model title generation is added, it must be bounded and optional; fallback must always work.

- [ ] Implement Recent Continue.

Show latest threads with context title, generated title, updated time, and icon by context type.

- [ ] Implement full history filters.

Filters:

- All.
- Normal chat.
- IP chat.
- Knowledge base chat.
- Customer project category.
- Archived.

- [ ] Implement archive/unarchive actions.

Soft archive by setting `archivedAt`; do not delete messages or documents.

- [ ] Run tests and typecheck.

```powershell
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] Commit.

```powershell
git add src/screens/AiHistoryScreen.tsx src/screens/AiHomeScreen.tsx src/ai/aiChatService.ts src/database/repositories/aiThreadRepository.ts
git commit -m "feat: add AI history and resume flow"
```

### Task 14: Final Error States, Space Isolation, Full Verification

**Files:**
- Modify as needed across `src/ai`, `src/screens/Ai*.tsx`, and tests.
- Create: `tests/ai-final-acceptance-policy.test.cjs` if any final non-visual requirement is not covered.

- [ ] Verify missing API key path.

Expected: Chat screen or send action routes to setup guidance without losing typed input.

- [ ] Verify chat request failure path.

Expected: user message persists, assistant placeholder shows failed state, retry is available.

- [ ] Verify streaming disconnect path.

Expected: partial content remains and state becomes failed or stopped.

- [ ] Verify document parse failure path.

Expected: material row shows failed status, reason, retry, and removal.

- [ ] Verify embedding failure path.

Expected: keyword retrieval remains available.

- [ ] Verify retrieval empty path.

Expected: no fake citation; reply follows boundary mode.

- [ ] Verify normal/personal isolation.

Expected: threads, knowledge bases, documents, chunks, and embeddings are queried by `space`; provider keys are global but material data does not cross spaces.

- [ ] Run full static verification.

```powershell
pnpm typecheck
pnpm test
git diff --check
```

Expected: all pass.

- [ ] Run Android simulator smoke.

Use the available emulator/device. Verify:

- AI workbench opens from bottom tab.
- Normal chat starts and streams or mock-streams.
- Provider settings open, key field hides/shows, model list displays concrete models.
- Model switching persists per session.
- IP picker creates IP chat.
- Knowledge base create/import path works for manual text and at least one file type available on emulator.
- Material status updates.
- Document reader opens for imported material.
- Citation click opens reader or IP source.
- Recent Continue restores context.
- Main recoverable failure states are visible.

- [ ] Commit final fixes.

```powershell
git add src tests
git commit -m "fix: complete AI workbench verification"
```

## Final Acceptance Checklist for One `/goal`

The goal is complete only when every item below is true.

### Entry and Session Flow

- [ ] AI workbench opens from the bottom AI tab.
- [ ] The three entry paths work: normal chat, IP chat, knowledge base chat.
- [ ] Recent Continue restores existing sessions with saved context, model, role card, and conversation state.
- [ ] View All opens full session history.
- [ ] Full history filters normal chat, IP chat, knowledge base chat, customer-project category, and archived sessions.
- [ ] Conversation titles are generated automatically and remain short/readable.

### Chat Experience

- [ ] Normal chat sends a message, streams a reply, saves the session, and restores from Recent Continue.
- [ ] Chat header shows current context.
- [ ] Right-side settings opens session settings.
- [ ] Session config shows editable system prompt and optional role card before chat starts.
- [ ] User can stop generation where provider support allows.
- [ ] Thinking/reasoning content is separate and collapsible when provided.
- [ ] Normal chat does not inject material rules.
- [ ] One conversation uses a specific provider/model independently of other conversations.
- [ ] AI messages store actual model and prompt snapshot.

### Provider and Model Configuration

- [ ] DeepSeek, OpenAI/GPT, Gemini, Claude, and custom compatible providers are supported.
- [ ] API key input is friendly and supports hide/show.
- [ ] API keys are in SecureStore, not SQLite.
- [ ] Test connection is available.
- [ ] Model sync is available where supported.
- [ ] Manual model ID entry exists.
- [ ] Concrete model IDs and capability labels are visible.
- [ ] Long-context labels such as `1M 上下文` attach to the specific model variant that supports them.
- [ ] Different conversations can use different models from the same provider.

### Role Cards and System Prompts

- [ ] User can chat without configuring a role card.
- [ ] Skippable config screen shows current system prompt.
- [ ] Normal chat system prompt is freely editable without Pixory material rules.
- [ ] Material chats show editable role/personality prompt plus protected material rules.
- [ ] User can paste long role description.
- [ ] User can save current prompt as reusable role card.
- [ ] Role/model/language/system prompt changes affect only future messages.

### IP Chat

- [ ] IP chat uses IP name, notes, groups, tags, image notes, filenames, import timing, favorite state, and asset statistics.
- [ ] IP-owned documents can be enabled when available.
- [ ] No image recognition, OCR, generated image descriptions, or real-time vision chat is implemented.
- [ ] IP citations can point to tags, notes, image notes, or IP-owned documents.

### Knowledge Base and Documents

- [ ] Knowledge base chat imports TXT, Markdown, PDF, and DOCX or pauses with a documented parser/reader blocker before claiming completion.
- [ ] Manual text and generated material from an existing IP are supported.
- [ ] Imported documents are copied to private storage before indexing.
- [ ] Materials progress through parse, chunk, and searchable states.
- [ ] Parse failures show reason and retry/remove.
- [ ] TXT, Markdown, PDF, and DOCX readers are read-only.
- [ ] PDF/DOCX images remain in the readable original when supported by the reader but are not used for AI visual understanding.
- [ ] Citations open related document or IP sources when supported.

### RAG and Citations

- [ ] Retrieval works without embeddings.
- [ ] Hybrid retrieval works when embedding provider settings are available.
- [ ] Retrieval uses bounded Top-K snippets and does not send whole documents.
- [ ] Pixory creates citation records from retrieved sources; model-generated fake citations are not trusted.
- [ ] Material-bound replies display real citation sources when relevant sources are retrieved.
- [ ] Retrieval empty state does not create fake citations.
- [ ] Embedding failure degrades to keyword retrieval.

### Context Switching

- [ ] Context object switching creates a new session.
- [ ] Normal chat to IP chat keeps original normal chat and creates a material-bound session.
- [ ] Normal chat to knowledge base chat keeps original normal chat and creates a material-bound session.
- [ ] IP A to IP B creates a new session.
- [ ] Knowledge base A to knowledge base B creates a new session.
- [ ] IP/knowledge base chat back to normal chat creates a new session.
- [ ] Model/role/language/system prompt changes stay in current session and affect only future messages.

### Data Isolation and Safety

- [ ] Normal and private spaces remain isolated.
- [ ] Chat records, knowledge bases, documents, chunks, and embeddings are space-scoped.
- [ ] Global provider keys can be shared, but selected materials and retrieved data cannot cross spaces.
- [ ] Pixory does not send API keys, private local paths, unselected documents, or unselected IP data to model providers.
- [ ] Uploaded documents remain in app-private storage and do not rely on temporary external URIs.
- [ ] No cloud sync, accounts, server-side knowledge bases, or AI image generation are added.

### Failure Paths

- [ ] Missing chat API key shows setup guidance without losing typed input.
- [ ] Chat request failure preserves user message and failed assistant placeholder with retry.
- [ ] Streaming disconnect preserves partial content and shows failed/stopped state.
- [ ] Document parse failure is visible and recoverable.
- [ ] Embedding failure keeps keyword retrieval available.
- [ ] Retrieval empty state is visible and does not create fake citations.
- [ ] Model list sync failure keeps built-in and manual models available.
- [ ] Unknown providers can be treated as custom compatible providers when possible.

### Engineering Checks

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `git diff --check` passes.
- [ ] Android simulator smoke covers AI workbench, normal chat, provider setup, model switching, IP chat, knowledge-base chat, material import, reader opening, citation navigation, Recent Continue, and recoverable failure states.

## Plan Self-Review

Spec coverage:

- Product entry, recent resume, history, and session naming are covered by Tasks 7 and 13.
- Provider cards, SecureStore keys, model sync, concrete model variants, and per-session model selection are covered by Tasks 2, 6, and 8.
- Role cards, visible system prompts, ordinary-chat prompt freedom, and material-session protected rules are covered by Tasks 5 and 8.
- Streaming, stop/retry states, reasoning display, and citations are covered by Tasks 6 and 9.
- IP structured context, IP-owned documents, no image recognition, and IP citations are covered by Task 10.
- Knowledge bases, material import, document statuses, parsing, chunking, and read-only readers are covered by Tasks 4, 11, and 12.
- Keyword retrieval, embedding downgrade, hybrid retrieval, bounded Top-K snippets, and non-fabricated citations are covered by Task 5.
- Context-switching new-session rules are covered by Task 10 and validated again in Task 14.
- Normal/personal space isolation, app-private storage, API-key safety, and no cloud/server/account expansion are covered by Tasks 3, 4, and 14.
- Final static and Android verification are covered by Task 14 and the final checklist.

Known hard points:

- PDF parsing and in-app PDF reading are the highest implementation risk. The plan requires pausing and reporting if the selected dependency cannot build or cannot meet first-version reader/parser requirements.
- Real provider streaming can be tested only with valid user-configured API keys. The implementation must still provide mockable service boundaries and failure-path tests so the app can be verified without committing secrets.
- The plan deliberately keeps image recognition, OCR, and reply-length controls out of scope even though the data model reserves future extension points.

## Suggested `/goal` Prompt

Use this after reviewing the plan:

```text
/goal 按 docs/superpowers/specs/2026-05-14-ai-workbench-rag-design.md 和 docs/superpowers/plans/2026-05-14-ai-workbench-rag-implementation.md 一次性实现 Pixory AI 工作台第一版，直到最终验收清单全部满足。

执行规则：
1. 严格按 implementation plan 的 Task 1-14 顺序推进，每个 task 完成后运行该 task 的验证命令并提交。
2. 保持 Pixory Android-first、本地优先、普通/私密空间隔离、API key 不进 SQLite、文档先复制到 App 私有目录。
3. 不实现图片识别、OCR、AI 生成图片、云同步、账号、服务端知识库、文档编辑、批注、回复长度 UI、多 IP 对比。
4. 如果 PDF 阅读/解析需要新增原生依赖且 Android 构建失败，暂停并报告，不要假装完成。
5. 如果遇到用户未提交的无关改动，不要回滚；只在必要文件上最小修改。
6. 最终必须运行 pnpm typecheck、pnpm test、git diff --check，并做 Android 模拟器烟测。
```
