import type { SQLiteDatabase } from 'expo-sqlite';

import { createTimestamp } from '../../database/utils';

export type CompanionChatArtifactKind = 'diary' | 'dream';

export const companionArtifactChatStateRepository = {
  async hide(
    db: SQLiteDatabase,
    input: {
      artifactKind: CompanionChatArtifactKind;
      artifactGroupId: string;
      threadId: string;
    },
  ): Promise<void> {
    const now = createTimestamp();
    await db.runAsync(
      `INSERT INTO companion_artifact_chat_states (
         artifactKind, artifactGroupId, threadId, hiddenAt, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(artifactKind, artifactGroupId, threadId) DO UPDATE SET
         hiddenAt = excluded.hiddenAt,
         updatedAt = excluded.updatedAt`,
      input.artifactKind,
      input.artifactGroupId,
      input.threadId,
      now,
      now,
      now,
    );
  },

  async listHiddenGroupIds(
    db: SQLiteDatabase,
    threadId: string,
    artifactKind: CompanionChatArtifactKind,
  ): Promise<Set<string>> {
    const rows = await db.getAllAsync<{ artifactGroupId: string }>(
      `SELECT artifactGroupId
       FROM companion_artifact_chat_states
       WHERE threadId = ? AND artifactKind = ?`,
      threadId,
      artifactKind,
    );
    return new Set(rows.map((row) => row.artifactGroupId));
  },

  async deleteGroupState(
    db: SQLiteDatabase,
    input: {
      artifactKind: CompanionChatArtifactKind;
      artifactGroupId: string;
    },
  ): Promise<void> {
    await db.runAsync(
      `DELETE FROM companion_artifact_chat_states
       WHERE artifactKind = ? AND artifactGroupId = ?`,
      input.artifactKind,
      input.artifactGroupId,
    );
  },
};
