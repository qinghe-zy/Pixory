import type { SQLiteDatabase } from 'expo-sqlite';
import type { PixorySpace } from '../../database';
import { settingsRepository } from '../../database/repositories/settingsRepository';
import { SYSTEM_ASSISTANT_THREAD_ID } from './capabilityProfile';
import { SystemAssistantProtocol, sanitizeSystemAssistantContent } from './systemAssistantProtocol';
import type { SystemTaskSnapshot } from './systemAssistantTypes';

// Migrate only legacy assistant rows. Keep pending cards as data, never execute on read.
export async function migrateSystemAssistantHistory(db: SQLiteDatabase, space: PixorySpace): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; content: string; createdAt: string }>(
    "SELECT id, content, createdAt FROM ai_messages WHERE threadId = ? AND role = 'assistant' AND (content LIKE '%<system_action%' OR reasoningText IS NOT NULL)",
    SYSTEM_ASSISTANT_THREAD_ID,
  );
  for (const row of rows) {
    await db.withTransactionAsync(async () => {
      const parser = new SystemAssistantProtocol();
      const content = parser.push(row.content) + parser.finish();
      const key = `systemAssistantTask:v1:${row.id}`;
      const existing = await settingsRepository.getValue(db, key);
      if (!existing && (parser.actions.length || parser.invalid)) {
        const origin = await db.getFirstAsync<{ id: string; content: string }>(
          "SELECT id, content FROM ai_messages WHERE threadId = ? AND role = 'user' AND createdAt <= ? ORDER BY createdAt DESC, id DESC LIMIT 1",
          SYSTEM_ASSISTANT_THREAD_ID, row.createdAt,
        );
        const action = parser.actions[0] ?? null;
        const confirmed = /confirmed\s*=\s*["']true["']/.test(row.content);
        const task: SystemTaskSnapshot = {
          version: 1, taskId: `system-task:${row.id}`, assistantMessageId: row.id,
          originMessageId: origin?.id ?? '', requestText: origin?.content ?? '', space,
          action, selectedIp: null, status: confirmed ? 'completed' : 'expired',
          steps: [{ label: confirmed ? '历史操作已确认' : '历史任务需重新确认', at: row.createdAt }],
          error: confirmed ? null : '历史任务需重新确认目标后继续。', undo: null, updatedAt: row.createdAt,
        };
        await settingsRepository.setValue(db, key, JSON.stringify(task));
      }
      await db.runAsync('UPDATE ai_messages SET content = ?, reasoningText = NULL WHERE id = ?', content.trimEnd(), row.id);
      await db.runAsync('UPDATE ai_message_fts SET content = ? WHERE id = ?', content.trimEnd(), row.id);
    });
  }
  const versions = await db.getAllAsync<{ id: string; content: string }>(
    "SELECT id, content FROM ai_message_versions WHERE threadId = ? AND role = 'assistant' AND (content LIKE '%<system_action%' OR reasoningText IS NOT NULL)",
    SYSTEM_ASSISTANT_THREAD_ID,
  );
  for (const version of versions) {
    await db.withTransactionAsync(async () => {
      const content = sanitizeSystemAssistantContent(version.content);
      await db.runAsync('UPDATE ai_message_versions SET content = ?, reasoningText = NULL WHERE id = ?', content, version.id);
      await db.runAsync('UPDATE ai_message_version_fts SET content = ? WHERE id = ?', content, version.id);
    });
  }
}
