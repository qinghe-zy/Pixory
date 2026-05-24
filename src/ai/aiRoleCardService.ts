import { aiRoleCardRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBoundaryMode, AiRoleCardRecord, AiRoleCardSourceType } from './types';

export async function listRoleCards(space: PixorySpace): Promise<AiRoleCardRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiRoleCardRepository.listActive(db, space));
}

export async function saveRoleCard(input: {
  space: PixorySpace;
  name: string;
  description?: string | null;
  prompt: string;
  firstMessage?: string | null;
  alternateGreetings?: string[];
  sourceType?: AiRoleCardSourceType | null;
  sourceJson?: string | null;
  boundaryMode?: AiBoundaryMode;
  avatarEnabled?: boolean;
  avatarUri?: string | null;
  tags?: string[];
}): Promise<AiRoleCardRecord> {
  const id = `role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return runWithDatabaseSpace(input.space, (db) =>
    aiRoleCardRepository.create(db, {
      id,
      space: input.space,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      prompt: input.prompt,
      firstMessage: input.firstMessage?.trim() || null,
      alternateGreetings: input.alternateGreetings ?? [],
      sourceType: input.sourceType ?? 'pixory_manual',
      sourceJson: input.sourceJson ?? null,
      boundaryMode: input.boundaryMode ?? 'free',
      avatarEnabled: input.avatarEnabled ?? false,
      avatarUri: input.avatarUri ?? null,
      tags: input.tags ?? [],
    })
  );
}

export async function deleteRoleCards(space: PixorySpace, roleCardIds: string[]): Promise<number> {
  return runWithDatabaseSpace(space, (db) => aiRoleCardRepository.archiveMany(db, roleCardIds));
}
