import { runWithDatabaseSpace, runWithTransactionRetry, type PixorySpace } from '../../database';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listSystemAssistantIps, validateSystemAssistantIp } from './systemAssistantExecutor';
import { loadSystemTask, saveSystemTask, saveSystemTaskInDatabase } from './systemAssistantPersistence';
import { publishSystemTask } from './systemAssistantEvents';
import { withSystemTaskStep } from './systemAssistantRuntime';
import type { SelectedIpContext, SystemAssistantAction, SystemTaskSnapshot } from './systemAssistantTypes';
import { IP_SCOPED_SYSTEM_ROUTES } from './systemAssistantRegistry';
import { applySystemRoleDraft, retainSystemRoleDraft } from './systemAssistantRoleCreation';
import { recoverSystemRouteFromCatalog } from '../../services/searchActionCatalog';

const IP_REQUIRED_ROUTES = new Set(['ip-detail', 'import-images', 'import-batch-history']);

const GENERIC_SYSTEM_WORDS = new Set(['素材', '图片', '照片', '相册', '图库', '项目', '企划', 'ip', '全部', '所有', '卡片', '卡']);

export function recoverSystemAssistantActionFromIntent(
  requestText: string,
  replyText?: string,
  availableIps?: { name: string; id?: number }[],
  selectedIp?: SelectedIpContext | null
): SystemAssistantAction | null {
  const reply = (replyText ?? '').trim();
  const request = requestText.trim();
  const fullContext = `${request} ${reply}`.toLowerCase();

  // 1. If user has ALREADY selected an IP in previous turn (continuation turn)
  if (selectedIp) {
    if (/(?:导入|添加|上传).*(?:素材|图片|照片|图)/i.test(request) || /(?:导入|添加|上传).*(?:素材|图片|照片|图)/i.test(reply)) {
      return { type: 'navigate', route: 'import-images', ipName: selectedIp.ipNameSnapshot, ipId: selectedIp.ipId };
    }
    if (/(?:全部|所有)?(?:素材|图片|照片|相册|图库)/i.test(request) || /(?:全部|所有)?(?:素材|图片|照片|相册|图库)/i.test(reply)) {
      return { type: 'navigate', route: 'all-images', ipName: selectedIp.ipNameSnapshot, ipId: selectedIp.ipId };
    }
    return { type: 'navigate', route: 'ip-detail', ipName: selectedIp.ipNameSnapshot, ipId: selectedIp.ipId };
  }

  // 2. Direct card demand check (top priority when user explicitly demands card/selection)
  const isDirectCardDemand = /(?:卡片呢|发卡片|来个卡片|给我卡片|卡片在哪|怎么没(?:有)?卡片|为什么没(?:有)?卡片|弹出卡片|给我选(?:择)?卡|选(?:择)?卡|发选(?:择)?卡|要选(?:择)?卡|来个选(?:择)?卡|选择IP卡片?|弹卡片)/i.test(request);
  if (isDirectCardDemand) {
    return { type: 'select_ip' };
  }

  // 3. System function navigation recovery driven by unified SEARCHABLE_FEATURE_CATALOG
  const recoveredRoute = recoverSystemRouteFromCatalog(request, fullContext);
  if (recoveredRoute) {
    return { type: 'navigate', route: recoveredRoute };
  }

  // 3. Rename thread recovery
  const renameMatch = request.match(/(?:改名(?:为|成|叫)|修改(?:管家|自己|你的)?昵称(?:为|成|叫)?|把你的名字改(?:为|成|叫))\s*[「"“']?([^」"”'\n]{1,80})[」"”']?$/i)
    || reply.match(/(?:已?(?:将|把)?(?:昵称|名字)?修改为)\s*[「"“']?([^」"”'\n]{1,80})[」"”']?/i);
  if (renameMatch && renameMatch[1]?.trim()) {
    return { type: 'rename-thread', newTitle: renameMatch[1].trim() };
  }

  // 4. Select IP fallback
  const replyAsksIp = /(?:要打开|选择|确认|哪个|哪一个|具体哪).*(?:IP|企划|相册|素材|项目)|(?:IP|企划|相册|素材|项目).*(?:要打开|选择|确认|哪个|哪一个|在下方|选|列表)|(?:在下方选择)|未指定目标.*(?:IP|企划)|(?:请在下方|在下方).*(?:选择|选|查看|卡片)|(?:已|已经)?(?:为您)?(?:提供|生成|弹出)?(?:选择)?卡片/i.test(reply);
  if (replyAsksIp) {
    return { type: 'select_ip' };
  }

  // 5. If user specifically named an IP, do not synthesize bare select_ip (ignore generic system words)
  const hasSpecificIp = (availableIps ?? []).some(ip => ip.name && !GENERIC_SYSTEM_WORDS.has(ip.name.trim().toLowerCase()) && request.toLowerCase().includes(ip.name.toLowerCase()));
  if (hasSpecificIp) {
    return null;
  }

  const mentionsIpOrMaterial = /(?:打开|查看|进入|导入|管理|选|选择|浏览|查找|添加|上传).*(?:IP|企划|素材|相册|图片|照片|画册|项目)/i.test(request);
  const isDirectDemand = /^(?:打开|查看|进入|选|选择|选哪个|选哪张|卡片呢|打开啊|给我卡片|卡片|选择IP|选IP|看IP|相册|企划|素材|导入素材|导入图片|选择卡|选卡|项目)$/i.test(request);
  if (mentionsIpOrMaterial || isDirectDemand) {
    return { type: 'select_ip' };
  }
  return null;
}

async function savePendingTask(task: SystemTaskSnapshot, canExecute?: (db: SQLiteDatabase) => Promise<boolean>): Promise<void> {
  const latest = await loadSystemTask(task.space, task.assistantMessageId);
  if (latest && ['cancelled', 'completed', 'undone'].includes(latest.status)) return;
  if (latest?.generationId && task.generationId && latest.generationId !== task.generationId) return;
  if (!canExecute) { await saveSystemTask(task); return; }
  const saved = await runWithDatabaseSpace(task.space, async db => {
    let saved = false;
    const retryFn = typeof runWithTransactionRetry === 'function'
      ? runWithTransactionRetry
      : async <T>(d: SQLiteDatabase, f: (txn: SQLiteDatabase) => Promise<T>): Promise<T> => {
          let res: T;
          if (typeof d.withTransactionAsync === 'function') await d.withTransactionAsync(async () => { res = await f(d); });
          else res = await f(d);
          return res!;
        };
    await retryFn(db, async (txn: SQLiteDatabase) => {
      if (!await canExecute(txn)) return;
      await saveSystemTaskInDatabase(txn, task);
      saved = true;
    });
    return saved;
  });
  if (saved) publishSystemTask(task);
}

export async function ingestSystemAssistantAction(input: {
  space: PixorySpace; assistantMessageId: string; originMessageId: string; requestText: string;
  action: SystemAssistantAction | null; invalid?: boolean;
  replyText?: string;
  roleCollecting?: boolean;
  roleSaveAuthorized?: boolean;
  canExecute?: (db: SQLiteDatabase) => Promise<boolean>;
}): Promise<string | undefined> {
  if (input.canExecute && !await runWithDatabaseSpace(input.space, input.canExecute)) return;
  const previous = await loadSystemTask(input.space, input.assistantMessageId);
  const task: SystemTaskSnapshot = previous ?? {
    version: 1, taskId: `system-task:${input.assistantMessageId}`, assistantMessageId: input.assistantMessageId,
    originMessageId: input.originMessageId, requestText: input.requestText, space: input.space,
    action: null, selectedIp: null, status: 'planning', steps: [], error: null, undo: null,
    updatedAt: new Date().toISOString(),
  };
  const savePending = (next: SystemTaskSnapshot) => savePendingTask(next, input.canExecute);
  if (previous && ['cancelled', 'completed', 'undone'].includes(previous.status)) return;
  let action = input.action;
  if (!action && !input.roleCollecting) {
    const ips = await listSystemAssistantIps(input.space);
    action = recoverSystemAssistantActionFromIntent(input.requestText, input.replyText, ips, task.selectedIp);
  }
  task.action = action;
  if (input.roleCollecting && (input.invalid || !action)) {
    await retainSystemRoleDraft(task, input.canExecute).catch(() => {});
    await savePending(withSystemTaskStep(task, input.roleSaveAuthorized ? 'failed' : 'waiting_for_user',
      input.roleSaveAuthorized ? '角色卡未保存' : '等待补充设定'));
    return input.roleSaveAuthorized ? '角色卡暂未保存，设定已保留。' : undefined;
  }
  if (!action && input.invalid) {
    await savePending({ ...withSystemTaskStep(task, 'failed', '此操作暂不可用'), error: '此操作暂不可用，请重新描述请求。' });
    return;
  }
  if (!action) {
    if (task.status === 'planning') {
      await savePending({ ...task, status: 'completed', steps: withSystemTaskStep(task, 'completed', '已回复').steps });
    }
    return;
  }
  if (action.type === 'role-draft') {
    try {
      const { type: _type, ...draft } = action;
      const applied = await applySystemRoleDraft(task, draft, input.canExecute, input.replyText);
      if (applied.status === 'completed') return applied.createdRoleCard
        ? `已创建「${applied.createdRoleCard.name}」。` : '角色卡已创建。';
    } catch (error) {
      // Stopped, cancelled and replaced generations are expected lifecycle events.
      if (error && typeof error === 'object' && 'message' in error
        && /^角色创建任务已变化/.test(String(error.message))) return;
      await retainSystemRoleDraft(task, input.canExecute).catch(() => {});
      if (!input.roleSaveAuthorized) {
        await savePending(withSystemTaskStep(task, 'waiting_for_user', '等待补充设定'));
        return;
      }
      const message = '角色卡未能保存，设定已保留。';
      await savePending({ ...withSystemTaskStep(task, 'failed', '角色卡未保存'), error: message });
      return message;
    }
    return;
  }
  let ambiguousIp = false;
  if (action.type === 'select_ip' && task.selectedIp) {
    // If an IP is already selected, seamlessly transition to navigating to that IP's material list rather than failing.
    action = { type: 'navigate', route: 'all-images', ipName: task.selectedIp.ipNameSnapshot, ipId: task.selectedIp.ipId };
    task.action = action;
  }
  if (!task.selectedIp && action.type === 'navigate') {
    const ips = await listSystemAssistantIps(input.space);
    const matches = ips.filter(ip => action.ipName
      ? (ip.name.toLocaleLowerCase() === action.ipName.toLocaleLowerCase()
        || action.ipName.toLocaleLowerCase().includes(ip.name.toLocaleLowerCase())
        || ip.name.toLocaleLowerCase().includes(action.ipName.toLocaleLowerCase()))
      : task.requestText.toLocaleLowerCase().includes(ip.name.toLocaleLowerCase()));
    if (!IP_SCOPED_SYSTEM_ROUTES.has(action.route) && matches.length > 0) {
      await savePending({ ...withSystemTaskStep(task, 'failed', '此入口不支持 IP 范围'),
        error: '此入口不支持指定 IP，请使用素材列表或批量管理。' });
      return;
    }
    if (matches.length === 1) {
      try {
        task.selectedIp = await validateSystemAssistantIp(input.space, matches[0].id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '目标 IP 已失效，请重新选择。';
        await savePending({ ...withSystemTaskStep(task, 'failed', '目标 IP 失效'), error: errorMsg });
        return errorMsg;
      }
    }
    ambiguousIp = matches.length > 1;
    // Model-supplied numeric IDs are never trusted, including the legacy protocol.
    task.action = { type: 'navigate', route: action.route, ipName: action.ipName };
  }
  if (action.type === 'navigate' && !IP_SCOPED_SYSTEM_ROUTES.has(action.route)
    && (action.ipName || action.ipId || task.selectedIp)) {
    await savePending({ ...withSystemTaskStep(task, 'failed', '此入口不支持 IP 范围'),
      error: '此入口不支持指定 IP，请使用素材列表或批量管理。' });
    return;
  }
  const needsIp = action.type === 'select_ip'
    || (action.type === 'navigate' && (ambiguousIp || IP_REQUIRED_ROUTES.has(action.route) || Boolean(action.ipName) || Boolean(action.ipId)) && !task.selectedIp);
  task.requiresIp = needsIp || Boolean(task.selectedIp);
  await savePending(withSystemTaskStep(task, needsIp ? 'waiting_for_ip' : 'waiting_for_approval', needsIp ? '请选择目标 IP' : '等待确认'));
}
