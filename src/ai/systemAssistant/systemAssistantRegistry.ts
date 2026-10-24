import type { SystemAssistantAction } from './systemAssistantTypes';
import {
  buildIpScopedSystemRoutesSet,
  buildSystemAssistantRouteAliasesMap,
  buildSystemAssistantRoutesMap,
} from '../../services/searchActionCatalog';

// Derived automatically from SEARCHABLE_FEATURE_CATALOG so global search and system assistant stay in sync.
export const SYSTEM_ASSISTANT_ROUTES: Readonly<Record<string, string>> = buildSystemAssistantRoutesMap();

export const SYSTEM_ASSISTANT_ROUTE_ALIASES: Readonly<Record<string, string>> = buildSystemAssistantRouteAliasesMap();

const HARMLESS_EXTRA_KEYS = new Set(['label', 'action', 'title', 'desc', 'summary', 'reason', 'text', 'comment']);

export const IP_SCOPED_SYSTEM_ROUTES = buildIpScopedSystemRoutesSet();

export function normalizeSystemAssistantAction(input: Record<string, string>): SystemAssistantAction | null {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const k = key.toLowerCase().replace(/[-_]/g, '');
    if (k === 'type') normalized.type = value;
    else if (k === 'route' || k === 'routename' || k === 'targetroute') normalized.route = value;
    else if (k === 'ipname' || k === 'targetip' || k === 'ip') normalized.ipName = value;
    else if (k === 'ipid') normalized.ipId = value;
    else if (k === 'newtitle' || (k === 'title' && input.type === 'rename-thread') || (k === 'name' && input.type === 'rename-thread')) normalized.newTitle = value;
    else if (k === 'name') normalized.name = value;
    else if (k === 'description') normalized.description = value;
    else if (k === 'prompt') normalized.prompt = value;
    else if (k === 'firstmessage') normalized.firstMessage = value;
    else if (k === 'confirmed') normalized.confirmed = value;
    else normalized[key] = value;
  }
  const allowed = normalized.type === 'select_ip' ? ['type']
    : normalized.type === 'role-draft' ? ['type', 'name', 'description', 'prompt', 'firstMessage']
    : normalized.type === 'rename-thread' ? ['type', 'newTitle', 'confirmed'] : ['type', 'route', 'ipName', 'ipId'];

  for (const key of Object.keys(normalized)) {
    if (HARMLESS_EXTRA_KEYS.has(key.toLowerCase()) && !allowed.includes(key)) {
      delete normalized[key];
    }
  }

  if (Object.keys(normalized).some(field => !allowed.includes(field))) return null;
  if (normalized.type === 'select_ip') return { type: 'select_ip' };
  if (normalized.type === 'role-draft') {
    const name = normalized.name?.trim() ?? '';
    const description = normalized.description?.trim() ?? '';
    const prompt = normalized.prompt?.trim() ?? '';
    const firstMessage = normalized.firstMessage?.trim() ?? '';
    if (name.length > 80 || description.length > 1000 || prompt.length > 6000 || firstMessage.length > 2000) return null;
    // An initial question can legitimately have no established role details yet.
    return { type: 'role-draft', name, description, prompt, firstMessage };
  }
  if (normalized.type === 'rename-thread' && normalized.newTitle?.trim() && normalized.newTitle.length <= 80) {
    return { type: 'rename-thread', newTitle: normalized.newTitle.trim() };
  }
  if (normalized.type !== 'navigate') return null;
  if (normalized.route) {
    const raw = normalized.route.replace(/^\/+/, '').trim().toLowerCase();
    normalized.route = SYSTEM_ASSISTANT_ROUTE_ALIASES[raw] ?? raw;
  }
  if (!Object.hasOwn(SYSTEM_ASSISTANT_ROUTES, normalized.route)) return null;
  const ipId = normalized.ipId ? Number(normalized.ipId) : undefined;
  if (ipId !== undefined && (!Number.isSafeInteger(ipId) || ipId <= 0)) return null;
  return { type: 'navigate', route: normalized.route, ipId, ipName: normalized.ipName?.trim() || undefined };
}

export function systemActionTitle(action: SystemAssistantAction | null): string {
  if (!action || action.type === 'select_ip') return '选择 IP';
  if (action.type === 'role-draft') return '创建角色卡';
  return action.type === 'rename-thread' ? '修改伙伴昵称' : SYSTEM_ASSISTANT_ROUTES[action.route];
}
