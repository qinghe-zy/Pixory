import type { CompanionEventRecord } from './companionTypes';

export const COMPANION_RUNTIME_RESET_SUBTYPE = 'runtime_reset';

export function eventsAfterLatestCompanionReset(
  events: CompanionEventRecord[],
): CompanionEventRecord[] {
  let resetIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].subtype === COMPANION_RUNTIME_RESET_SUBTYPE) resetIndex = index;
  }
  return resetIndex < 0 ? events : events.slice(resetIndex + 1);
}
