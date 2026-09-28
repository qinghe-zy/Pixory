export type ComposerEntranceReason =
  | 'new_chat'
  | 'open_thread'
  | 'replace_current'
  | 'thread_ready'
  | 'title_update'
  | 'keyboard'
  | 'streaming'
  | 'composer_height'
  | 'drawer';

export interface ComposerEntranceDecisionInput {
  nextRouteKey?: string;
  playedRouteKeys: ReadonlySet<string>;
  previousRouteKey?: string;
  reason: ComposerEntranceReason;
}

export interface ComposerEntranceRun {
  key: string;
  token: number;
}

let runToken = 0;

export function shouldStartComposerEntrance({
  nextRouteKey,
  playedRouteKeys,
  previousRouteKey,
  reason,
}: ComposerEntranceDecisionInput): boolean {
  if (!nextRouteKey || playedRouteKeys.has(nextRouteKey)) {
    return false;
  }
  if (!(reason === 'new_chat' || reason === 'open_thread')) {
    return false;
  }
  return previousRouteKey !== nextRouteKey;
}

export function createComposerEntranceRun(key: string): ComposerEntranceRun {
  runToken += 1;
  return { key, token: runToken };
}

export function isCurrentComposerEntranceRun(run: ComposerEntranceRun | null, key: string, token: number): boolean {
  return Boolean(run && run.key === key && run.token === token);
}
