import { aiRoleCardRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import type { AiBoundaryMode, AiRoleCardRecord } from './types';

export async function listRoleCards(space: PixorySpace): Promise<AiRoleCardRecord[]> {
  return runWithDatabaseSpace(space, (db) => aiRoleCardRepository.listActive(db, space));
}

export async function saveRoleCard(input: {
  space: PixorySpace;
  name: string;
  description?: string | null;
  prompt: string;
  boundaryMode?: AiBoundaryMode;
}): Promise<AiRoleCardRecord> {
  const id = `role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return runWithDatabaseSpace(input.space, (db) =>
    aiRoleCardRepository.create(db, {
      id,
      space: input.space,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      prompt: input.prompt,
      boundaryMode: input.boundaryMode ?? 'free',
    })
  );
}
