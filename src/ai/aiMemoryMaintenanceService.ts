import type { PixorySpace } from '../database';
import {
  isThreadMemoryMaintenanceActive,
  runUnifiedMemoryMaintenancePass,
  scheduleMemoryMaintenance,
} from './aiMemoryMaintenanceQueue';

export type CompanionMaintenanceReason = 'reply_completed' | 'leave_chat' | 'app_background';

export { isThreadMemoryMaintenanceActive, runUnifiedMemoryMaintenancePass, scheduleMemoryMaintenance };

export function scheduleCompanionMemoryMaintenance(input: {
  space: PixorySpace;
  threadId: string;
  reason: CompanionMaintenanceReason;
}): Promise<void> {
  return scheduleMemoryMaintenance(input);
}
