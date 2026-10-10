import type { SystemNavigationCommand } from './systemAssistantTypes';

export type SystemAssistantNavigationAdapter = {
  createIp?: () => void;
  importImages?: (ipId: number) => void;
  ipDetail?: (ipId: number) => void;
  storage?: () => void;
  trash?: () => void;
  lockPersonal?: () => void;
  global?: (route: string, params: Record<string, string | number>) => void;
};

export function navigateSystemAssistant(adapter: SystemAssistantNavigationAdapter, command: SystemNavigationCommand): void {
  const required = command.route === 'create-ip' ? adapter.createIp
    : command.route === 'import-images' ? adapter.importImages
    : command.route === 'ip-detail' ? adapter.ipDetail
    : command.route === 'storage-usage' ? adapter.storage
    : command.route === 'trash' ? adapter.trash
    : command.route === 'lock-personal-space' ? adapter.lockPersonal : adapter.global;
  if (!required) throw new Error('此操作入口暂不可用。');
  if (command.route === 'create-ip') adapter.createIp?.();
  else if (command.route === 'import-images' && command.ipId) adapter.importImages?.(command.ipId);
  else if (command.route === 'ip-detail' && command.ipId) adapter.ipDetail?.(command.ipId);
  else if (command.route === 'storage-usage') adapter.storage?.();
  else if (command.route === 'trash') adapter.trash?.();
  else if (command.route === 'lock-personal-space') adapter.lockPersonal?.();
  else adapter.global?.(command.route, command.ipId ? { ipId: command.ipId } : {});
}
