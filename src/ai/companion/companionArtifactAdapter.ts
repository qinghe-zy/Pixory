import type { RoleDiaryRecord, RoleDiaryVersionRecord } from '../diary/diaryRepository';
import type { DreamRecord } from '../dream/dreamRepository';
import type { ThoughtRecord } from '../thought/thoughtRepository';

export type CompanionArtifactKind = 'diary' | 'dream' | 'thought';

export interface CompanionArtifactAdapterRecord {
  artifactId: string;
  body: string;
  createdAt: string;
  kind: CompanionArtifactKind;
  lineageVersion: number | null;
  roleCardId: string;
  sourceBranchRoute: string;
  sourceEventIds: string[];
  sourceThreadId: string;
  status: 'active' | 'stale_source' | 'soft_deleted';
}

export function adaptDiaryArtifact(item: { diary: RoleDiaryRecord; version: RoleDiaryVersionRecord }): CompanionArtifactAdapterRecord {
  return {
    artifactId: item.diary.id,
    body: item.version.body,
    createdAt: item.diary.updatedAt,
    kind: 'diary',
    lineageVersion: null,
    roleCardId: item.diary.roleCardId,
    sourceBranchRoute: item.diary.sourceBranchRouteJson,
    sourceEventIds: [],
    sourceThreadId: item.diary.sourceThreadId ?? '',
    status: 'active',
  };
}

export function adaptDreamArtifact(item: DreamRecord): CompanionArtifactAdapterRecord {
  return {
    artifactId: item.id,
    body: `${item.title}\n${item.body}`,
    createdAt: item.updatedAt,
    kind: 'dream',
    lineageVersion: item.lineageVersion,
    roleCardId: item.roleCardId,
    sourceBranchRoute: item.sourceBranchRouteHash,
    sourceEventIds: [],
    sourceThreadId: item.sourceThreadId,
    status: item.status,
  };
}

export function adaptThoughtArtifact(item: ThoughtRecord): CompanionArtifactAdapterRecord {
  return {
    artifactId: item.id,
    body: item.body,
    createdAt: item.createdAt,
    kind: 'thought',
    lineageVersion: item.lineageVersion,
    roleCardId: item.roleCardId,
    sourceBranchRoute: item.sourceBranchRouteHash,
    sourceEventIds: item.eventIds,
    sourceThreadId: item.sourceThreadId,
    status: item.status,
  };
}
