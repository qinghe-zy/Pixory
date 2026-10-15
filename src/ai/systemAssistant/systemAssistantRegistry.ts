import type { SystemAssistantAction } from './systemAssistantTypes';

// Keep this list limited to the system assistant prompt, not every application route.
export const SYSTEM_ASSISTANT_ROUTES: Readonly<Record<string, string>> = {
  'lock-personal-space': '锁定隐私空间', 'storage-usage': '存储空间', trash: '回收站',
  'create-ip': '新建 IP', 'ip-detail': '打开 IP', 'import-images': '导入素材',
  'duplicate-review': '检查重复素材', 'quick-organize': '未整理素材',
  'batch-manage-images': '批量管理', 'tags-overview': '标签管理',
  'global-groups': '全部分组', favorites: '我的收藏', 'all-images': '全部素材',
  'ai-role-card-editor': '新建角色卡', 'ai-role-library': '角色库',
  'ai-provider-settings': '模型与 API 设置', backup: '数据备份',
  'import-batch-history': '导入记录', settings: '系统设置',
  'product-doc': '产品说明', about: '关于',
};

export const IP_SCOPED_SYSTEM_ROUTES = new Set(['ip-detail', 'import-images', 'all-images',
  'quick-organize', 'batch-manage-images', 'import-batch-history']);

export function normalizeSystemAssistantAction(input: Record<string, string>): SystemAssistantAction | null {
  const allowed = input.type === 'select_ip' ? ['type']
    : input.type === 'role-draft' ? ['type', 'name', 'description', 'prompt', 'firstMessage']
    : input.type === 'rename-thread' ? ['type', 'newTitle', 'confirmed'] : ['type', 'route', 'ipName', 'ipId'];
  if (Object.keys(input).some(field => !allowed.includes(field))) return null;
  if (input.type === 'select_ip') return { type: 'select_ip' };
  if (input.type === 'role-draft') {
    const name = input.name?.trim() ?? '';
    const description = input.description?.trim() ?? '';
    const prompt = input.prompt?.trim() ?? '';
    const firstMessage = input.firstMessage?.trim() ?? '';
    if (name.length > 80 || description.length > 1000 || prompt.length > 6000 || firstMessage.length > 2000) return null;
    // An initial question can legitimately have no established role details yet.
    return { type: 'role-draft', name, description, prompt, firstMessage };
  }
  if (input.type === 'rename-thread' && input.newTitle?.trim() && input.newTitle.length <= 80) {
    return { type: 'rename-thread', newTitle: input.newTitle.trim() };
  }
  if (input.type !== 'navigate' || !Object.hasOwn(SYSTEM_ASSISTANT_ROUTES, input.route)) return null;
  const ipId = input.ipId ? Number(input.ipId) : undefined;
  if (ipId !== undefined && (!Number.isSafeInteger(ipId) || ipId <= 0)) return null;
  return { type: 'navigate', route: input.route, ipId, ipName: input.ipName?.trim() || undefined };
}

export function systemActionTitle(action: SystemAssistantAction | null): string {
  if (!action || action.type === 'select_ip') return '选择 IP';
  if (action.type === 'role-draft') return '创建角色卡';
  return action.type === 'rename-thread' ? '修改伙伴昵称' : SYSTEM_ASSISTANT_ROUTES[action.route];
}
