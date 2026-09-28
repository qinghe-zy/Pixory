import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import { createTimestamp } from '../../database/utils';
import { MemoryFacade } from './memoryFacade';
import type { MemoryRelationalStateRecord } from './memoryTypes';

type RelationalMetric = 'affinity' | 'trust' | 'tension' | 'familiarity';

const SIGNALS: Array<{ metric: RelationalMetric; pattern: RegExp; delta: number; weight: number }> = [
  { delta: 0.04, metric: 'affinity', pattern: /喜欢你|谢谢你|陪着我|想和你聊|好温柔/u, weight: 1 },
  { delta: 0.03, metric: 'trust', pattern: /相信你|放心|交给你|你理解我/u, weight: 1 },
  { delta: -0.05, metric: 'tension', pattern: /生气|失望|别烦我|不想聊|你不懂/u, weight: 1.2 },
  { delta: 0.02, metric: 'familiarity', pattern: /又来了|之前说过|老朋友|你还记得/u, weight: 0.8 },
];

export async function recordRelationalSignals(input: {
  space: PixorySpace;
  threadId: string;
  messageId: string;
  messageContent: string;
}): Promise<number> {
  const matched = SIGNALS.filter((signal) => signal.pattern.test(input.messageContent));
  if (matched.length === 0) {
    return 0;
  }
  const updates = await runWithDatabaseSpace(input.space, async (db) => {
    const now = createTimestamp();
    const records: MemoryRelationalStateRecord[] = [];
    for (const signal of matched) {
      const current = await db.getFirstAsync<{
        id: string;
        value: number;
        signalWeight: number;
        version: number;
        evidenceIdsJson: string;
        createdAt: string;
      }>(
        `SELECT id, value, signalWeight, version, evidenceIdsJson, createdAt
         FROM memory_relational_states
         WHERE space = ? AND scopeType = 'thread' AND scopeId = ?
           AND subjectEntityId = 'joint' AND metric = ?`,
        input.space,
        input.threadId,
        signal.metric
      );
      const priorWeight = Number(current?.signalWeight ?? 0);
      const nextWeight = Math.min(100, priorWeight + signal.weight);
      const priorValue = Number(current?.value ?? 0);
      const nextValue = Math.max(-1, Math.min(1, (priorValue * priorWeight + signal.delta * signal.weight) / Math.max(0.001, nextWeight)));
      let evidenceIds: string[] = [];
      try {
        const parsed = JSON.parse(current?.evidenceIdsJson ?? '[]');
        evidenceIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
      } catch {
        evidenceIds = [];
      }
      evidenceIds = [...new Set([...evidenceIds, input.messageId])].slice(-32);
      records.push({
        createdAt: current?.createdAt ?? now,
        decayHalfLifeDays: signal.metric === 'tension' ? 14 : 30,
        evidenceIdsJson: JSON.stringify(evidenceIds),
        id: current?.id ?? `mrelation_${input.space}_${input.threadId}_${signal.metric}`,
        lastEvidenceAt: now,
        metric: signal.metric,
        projectionVersion: 0,
        scopeId: input.threadId,
        scopeType: 'thread',
        signalWeight: nextWeight,
        space: input.space,
        subjectEntityId: 'joint',
        updatedAt: now,
        value: nextValue,
        version: current ? Number(current.version ?? 1) + 1 : 1,
      });
    }
    return records;
  });
  for (const relation of updates) {
    await MemoryFacade.upsertRelationalState(relation, {
      actorId: input.messageId,
      commandId: `relational-signal:${input.messageId}:${relation.metric}`,
      source: 'local_relational_signal',
    });
  }
  return matched.length;
}

export async function buildRelationalStateText(input: {
  db: import('expo-sqlite').SQLiteDatabase;
  space: PixorySpace;
  threadId: string;
  now?: string;
}): Promise<string> {
  const rows = await input.db.getAllAsync<{
    metric: RelationalMetric;
    value: number;
    decayHalfLifeDays: number;
    lastEvidenceAt: string | null;
  }>(
    `SELECT metric, value, decayHalfLifeDays, lastEvidenceAt
     FROM memory_relational_states
     WHERE space = ? AND scopeType = 'thread' AND scopeId = ?
       AND subjectEntityId = 'joint'`,
    input.space,
    input.threadId
  );
  const now = Date.parse(input.now ?? createTimestamp());
  const labels: Record<RelationalMetric, string> = {
    affinity: '亲近感',
    familiarity: '熟悉度',
    tension: '紧张度',
    trust: '信任度',
  };
  const lines = rows
    .map((row) => {
      const halfLife = Math.max(0.1, Number(row.decayHalfLifeDays ?? 30));
      const ageDays = row.lastEvidenceAt ? Math.max(0, (now - Date.parse(row.lastEvidenceAt)) / 86_400_000) : 0;
      const decayed = Number(row.value ?? 0) * Math.pow(0.5, ageDays / halfLife);
      return { label: labels[row.metric], value: decayed };
    })
    .filter((item) => Math.abs(item.value) >= 0.015)
    .slice(0, 4);
  if (lines.length === 0) {
    return '';
  }
  return `关系状态（仅作弱背景，需结合当前对话）：${lines.map((item) => `${item.label} ${item.value.toFixed(2)}`).join('；')}`;
}

export const MemoryRelationalStateService = {
  buildText: buildRelationalStateText,
  record: recordRelationalSignals,
};
