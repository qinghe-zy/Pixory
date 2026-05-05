export interface PersonalTaskToken {
  readonly sessionId: string;
  readonly generation: number;
  readonly isActive: () => boolean;
  active: boolean;
}

export function createPersonalTaskToken(sessionId: string, generation: number): PersonalTaskToken {
  let active = true;

  return {
    active,
    sessionId,
    generation,
    isActive() {
      return this.active;
    },
  };
}

export function invalidatePersonalTaskToken(token: PersonalTaskToken | null): void {
  if (!token) {
    return;
  }

  token.active = false;
}

export function assertPersonalTaskActive(taskToken?: PersonalTaskToken | null): void {
  if (taskToken && !taskToken.isActive()) {
    throw new Error('Personal task is no longer active.');
  }
}
