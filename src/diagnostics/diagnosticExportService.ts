import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { zip } from 'react-native-zip-archive';
import { runWithDatabaseSpace } from '../database/db';
import { listDiagnosticEvents } from './diagnosticRepository';
import { summarizeDiagnosticEvents } from './diagnosticSummary';
import { buildDiagnosticArchitectureSnapshot } from './diagnosticArchitectureSnapshot';
import { getDroppedDiagnosticEventCount } from './diagnosticLogger';
import { hashPromptCacheText } from '../ai/aiPromptCache';
import { copyFileToSafWithProgress } from '../native/pixoryMediaModule';
import type { DiagnosticExportLevel, DiagnosticEventRecord } from './diagnosticTypes';

export interface DiagnosticExportOptions { space: 'normal' | 'personal'; level: DiagnosticExportLevel; threadId?: string; threadIds?: string[]; threadIdHash?: string; threadIdHashes?: string[]; from?: string; to?: string; includeResponseSnippets?: boolean; }
const SECRET_VALUE = /(Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[:=]\s*\S+|file:\/\/\/[^\s]+|[A-Za-z]:\\(?:[^\s\\]+\\)+[^\s]+)/gi;
function redactSecrets(value: unknown): unknown { if (Array.isArray(value)) return value.map(redactSecrets); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactSecrets(item)])); return typeof value === 'string' ? value.replace(SECRET_VALUE, '[REDACTED]') : value; }
function shouldPseudonymize(key: string): boolean { return key !== 'modelId' && (key === 'id' || key === 'traceId' || /(?:Id|Hash)$/.test(key)); }
async function hashIdentifier(salt: string, value: string): Promise<string> { return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${value}`)).slice(0, 24); }
async function pseudonymizeObject(value: unknown, salt: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => pseudonymizeObject(item, salt)));
  if (!value || typeof value !== 'object') return redactSecrets(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = shouldPseudonymize(key) && typeof item === 'string' ? await hashIdentifier(salt, item) : await pseudonymizeObject(item, salt);
  return output;
}
function toCsv(events: DiagnosticEventRecord[], predicate: (event: DiagnosticEventRecord) => boolean): string { const rows = events.filter(predicate).map((event) => ({ occurredAt: event.occurredAt, traceId: event.traceId, generationId: event.generationId ?? '', requestId: event.requestId ?? '', eventType: event.eventType, durationMs: event.durationMs ?? '' })); return ['occurredAt,traceId,generationId,requestId,eventType,durationMs', ...rows.map((row) => Object.values(row).map((value) => JSON.stringify(value)).join(','))].join('\n'); }
function assertStandardExportPrivacy(files: Record<string, string>): void { const combined = Object.values(files).join('\n'); if (/Authorization\s*[:=]|Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9_-]{8,}|data:image\/[a-z+.-]+;base64,/i.test(combined)) throw new Error('诊断包隐私扫描失败，已停止导出。'); }

export async function exportDiagnostics(input: DiagnosticExportOptions): Promise<string> {
  const raw = await runWithDatabaseSpace(input.space, async (db) => {
    const selectedThreadIds = input.threadIds?.length ? input.threadIds : input.threadId ? [input.threadId] : [];
    const selectedThreadHashes = input.threadIdHashes?.length ? input.threadIdHashes : selectedThreadIds.length ? selectedThreadIds.map((id) => hashPromptCacheText(`${input.space}:thread:${id}`)) : undefined;
    const events = await listDiagnosticEvents(db, input.space, { threadIdHash: input.threadIdHash, threadIdHashes: selectedThreadHashes, from: input.from, to: input.to });
    if (input.level !== 'deep') return { events, deepMessages: [], deepPromptSnapshots: [] };
    const filters = ["r.status = 'completed'"]; const args: string[] = [];
    if (selectedThreadIds.length) { filters.push(`r.threadId IN (${selectedThreadIds.map(() => '?').join(', ')})`); args.push(...selectedThreadIds); } if (input.from) { filters.push('s.createdAt >= ?'); args.push(input.from); } if (input.to) { filters.push('s.createdAt <= ?'); args.push(input.to); }
    const deepPromptSnapshots = await db.getAllAsync<any>(`SELECT r.id AS requestId, r.threadId, r.generationId, r.modelId, r.branchRouteHash, r.contextAssemblyProfileHash, s.sequence, s.role, s.messageId, s.renderedContent, s.sourceMessageVersionHash, s.createdAt FROM ai_prompt_requests r JOIN ai_prompt_snapshots s ON s.requestId = r.id WHERE ${filters.join(' AND ')} ORDER BY s.createdAt ASC, s.sequence ASC`, ...args);
    const messageFilters = ['1 = 1']; const messageArgs: string[] = [];
    if (selectedThreadIds.length) { messageFilters.push(`threadId IN (${selectedThreadIds.map(() => '?').join(', ')})`); messageArgs.push(...selectedThreadIds); } if (input.from) { messageFilters.push('createdAt >= ?'); messageArgs.push(input.from); } if (input.to) { messageFilters.push('createdAt <= ?'); messageArgs.push(input.to); }
    const deepMessages = await db.getAllAsync<any>(`SELECT id, threadId, role, content, ${input.includeResponseSnippets ? 'reasoningText' : 'NULL AS reasoningText'}, status, providerId, modelId, createdAt, completedAt FROM ai_messages WHERE ${messageFilters.join(' AND ')} ORDER BY createdAt ASC`, ...messageArgs);
    return { events, deepMessages, deepPromptSnapshots };
  });
  const exportSalt = `${input.space}:${Crypto.randomUUID()}`;
  const events = await Promise.all(raw.events.map((event) => pseudonymizeObject(event, exportSalt))) as DiagnosticEventRecord[];
  const deepPromptSnapshots = await Promise.all(raw.deepPromptSnapshots.map((item) => pseudonymizeObject(item, exportSalt)));
  const deepMessages = await Promise.all(raw.deepMessages.map((item) => pseudonymizeObject(item, exportSalt)));
  const root = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}pixory-diagnostics-${Date.now()}`; await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const summary = summarizeDiagnosticEvents(events); const droppedEventCount = getDroppedDiagnosticEventCount(input.space);
  const manifest = { schemaVersion: 1, exportLevel: input.level, space: input.space, eventCount: events.length, droppedEventCount, generatedAt: new Date().toISOString(), correlationSaltScope: 'single_export_only', filters: { threadSelected: Boolean(input.threadIds?.length || input.threadId || input.threadIdHash || input.threadIdHashes?.length), from: input.from ?? null, to: input.to ?? null }, completeness: { bufferedEventsFlushed: true, hasDroppedEvents: droppedEventCount > 0 } };
  const analysisReady = { manifest: 'manifest.json', summary: 'summary.md', architecture: 'architecture.json', keyMetrics: summary, integrity: manifest.completeness, files: { events: 'events.jsonl', generationSpans: 'generation-spans.csv', cacheRequests: 'cache-requests.csv', databaseSpans: 'database-spans.csv', screenSpans: 'screen-spans.csv', attachmentSpans: 'attachment-spans.csv', errors: 'errors.jsonl' } };
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify(manifest, null, 2), 'analysis-ready.json': JSON.stringify(analysisReady, null, 2), 'events.jsonl': events.map((event) => JSON.stringify(event)).join('\n'),
    'generation-spans.csv': toCsv(events, (event) => event.eventType.startsWith('generation_') || event.eventType.startsWith('first_')), 'cache-requests.csv': toCsv(events, (event) => event.eventType === 'provider_usage' || event.eventType === 'prompt_ready'), 'database-spans.csv': toCsv(events, (event) => event.eventType.startsWith('database_')), 'screen-spans.csv': toCsv(events, (event) => event.eventType.startsWith('screen_') || event.eventType.startsWith('navigation_')), 'attachment-spans.csv': toCsv(events, (event) => event.eventType.startsWith('attachment_')), 'errors.jsonl': events.filter((event) => event.eventType.includes('error') || event.eventType.endsWith('_failed')).map((event) => JSON.stringify(event)).join('\n'),
    'summary.md': `# Pixory 诊断摘要\n\n- 级别：${input.level}\n- 空间：${input.space}\n- 事件数：${events.length}\n- 丢失事件：${droppedEventCount}\n- P50：${summary.durationP50Ms ?? 'N/A'} ms\n- P90：${summary.durationP90Ms ?? 'N/A'} ms\n- P95：${summary.durationP95Ms ?? 'N/A'} ms\n`, 'architecture.json': JSON.stringify(buildDiagnosticArchitectureSnapshot({ space: input.space }), null, 2), 'README.md': '标准包只含脱敏结构化数据。关联标识使用本次导出专用盐，不能跨诊断包关联。深度包仅在用户逐次确认后生成。API key、Authorization、Cookie、Base64 和完整本机路径禁止导出。'
  };
  if (input.level === 'deep') { files['prompt-traces.jsonl'] = deepPromptSnapshots.map((item) => JSON.stringify(item)).join('\n'); files['conversation-snapshots.jsonl'] = deepMessages.map((item) => JSON.stringify(item)).join('\n'); files['retrieval-snapshots.jsonl'] = ''; files['response-snapshots.jsonl'] = deepMessages.filter((item: any) => item.role === 'assistant').map((item) => JSON.stringify(item)).join('\n'); files['CONSENT.md'] = '用户已逐次确认本次深度导出。内容限定在用户选择的空间、线程和时间范围；授权不会被记住。'; }
  if (input.level === 'standard') assertStandardExportPrivacy(files);
  for (const [name, text] of Object.entries(files)) await FileSystem.writeAsStringAsync(`${root}/${name}`, text);
  const checksums: string[] = []; for (const [name, text] of Object.entries(files)) checksums.push(`${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text)}  ${name}`); await FileSystem.writeAsStringAsync(`${root}/checksums.sha256`, checksums.join('\n'));
  const zipPath = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory) + 'Pixory-diagnostics-' + input.space + '-' + Date.now() + '.zip';
  const exportedZipPath = await zip(root, zipPath);
  const zipInfo = await FileSystem.getInfoAsync(exportedZipPath);
  if (!zipInfo.exists || (zipInfo.size ?? 0) <= 0) throw new Error('诊断包 ZIP 生成失败或为空。');
  return exportedZipPath;
}

export async function saveDiagnosticsToSystemDirectory(input: { zipUri: string; destinationDirectoryUri?: string | null }): Promise<string> {
  const permissions = input.destinationDirectoryUri
    ? { granted: true, directoryUri: input.destinationDirectoryUri }
    : await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(null);
  if (!permissions.granted) throw new Error('未选择诊断包保存目录。');
  const fileName = input.zipUri.split('/').pop() || `Pixory-diagnostics-${Date.now()}.zip`;
  await copyFileToSafWithProgress(input.zipUri, permissions.directoryUri, fileName, 'application/zip', `diagnostics-export-${Date.now()}`);
  return `${permissions.directoryUri}/${fileName}`;
}
