import type { PixorySpace } from '../../database';

export type SystemAssistantAction =
  | { type: 'select_ip' }
  | { type: 'navigate'; route: string; ipName?: string; ipId?: number }
  | { type: 'rename-thread'; newTitle: string }
  | ({ type: 'role-draft' } & SystemRoleDraft);

export type SystemRoleDraft = {
  name: string;
  description: string;
  prompt: string;
  firstMessage: string;
};

export type SystemRoleCreationSession = {
  version: 1;
  space: PixorySpace;
  id: string;
  phase: 'collecting' | 'created';
  draft: SystemRoleDraft | null;
  lastUserMessageId: string;
  authorizedMessageId: string | null;
  roleCardId: string | null;
  updatedAt: string;
  generationId?: string;
  awaitingConfirmation?: boolean;
  paused?: boolean;
};

export type SystemTaskStatus = 'waiting_for_ip' | 'waiting_for_user' | 'planning' | 'waiting_for_approval'
  | 'executing' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'undoing' | 'undone';

export type SelectedIpContext = {
  ipId: number;
  ipNameSnapshot: string;
  space: PixorySpace;
  expiresAt: string;
};

export type SystemTaskStep = { label: string; at: string; status?: SystemTaskStatus };

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
  createdRoleCard?: { id: string; name: string; updatedAt: string; expiresAt: string } | null;
  updatedAt: string;
  generationId?: string;
};

export type SystemNavigationCommand = { route: string; ipId?: number };
