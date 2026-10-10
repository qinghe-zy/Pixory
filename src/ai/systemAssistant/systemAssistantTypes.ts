import type { PixorySpace } from '../../database';

export type SystemAssistantAction =
  | { type: 'select_ip' }
  | { type: 'navigate'; route: string; ipName?: string; ipId?: number }
  | { type: 'rename-thread'; newTitle: string };

export type SystemTaskStatus = 'waiting_for_ip' | 'planning' | 'waiting_for_approval'
  | 'executing' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'undoing' | 'undone';

export type SelectedIpContext = {
  ipId: number;
  ipNameSnapshot: string;
  space: PixorySpace;
  expiresAt: string;
};

export type SystemTaskStep = { label: string; at: string };

export type SystemTaskSnapshot = {
  version: 1;
  taskId: string;
  assistantMessageId: string;
  originMessageId: string;
  requestText: string;
  space: PixorySpace;
  status: SystemTaskStatus;
  action: SystemAssistantAction | null;
  selectedIp: SelectedIpContext | null;
  requiresIp?: boolean;
  steps: SystemTaskStep[];
  error: string | null;
  undo: { previousName: string | null; appliedName: string; expiresAt: string } | null;
  updatedAt: string;
};

export type SystemNavigationCommand = { route: string; ipId?: number };
