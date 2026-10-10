import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PixorySpace } from '../database';
import { isSystemAssistantThread } from '../ai/systemAssistant/capabilityProfile';
import { subscribeSystemTasks } from '../ai/systemAssistant/systemAssistantEvents';
import { listSystemAssistantIps, renameSystemAssistant, undoSystemAssistantRename, validateSystemAssistantIp } from '../ai/systemAssistant/systemAssistantExecutor';
import { loadSystemTask, loadSystemTasks, saveSystemTask } from '../ai/systemAssistant/systemAssistantPersistence';
import { aiGenerationManager } from '../ai/aiGenerationManager';
import { createSystemAssistantRuntime } from '../ai/systemAssistant/systemAssistantRuntime';
import { navigateSystemAssistant, type SystemAssistantNavigationAdapter } from '../ai/systemAssistant/systemAssistantNavigation';
import type { SystemTaskSnapshot } from '../ai/systemAssistant/systemAssistantTypes';
import type { IpRecord } from '../database/types';

const EMPTY_TASKS: Record<string, SystemTaskSnapshot> = {};
const EMPTY_IPS: IpRecord[] = [];

export function useSystemAssistantAdapter(input: {
  threadId: string | null | undefined;
  isFocused?: boolean;
  space: PixorySpace;
  messageIds: string[];
  navigation: SystemAssistantNavigationAdapter;
  continueTask(task: SystemTaskSnapshot): Promise<void>;
  stopTask(task: SystemTaskSnapshot): Promise<void>;
  canContinue(): boolean;
  changed(): void;
  reportError(message: string): void;
}) {
  const enabled = Boolean(input.threadId && isSystemAssistantThread(input.threadId));
  const active = enabled && input.isFocused !== false;
  const current = useRef(input);
  current.current = input;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [tasks, setTasks] = useState<Record<string, SystemTaskSnapshot>>({});
  const [ips, setIps] = useState<IpRecord[]>([]);
  const [ipsSpace, setIpsSpace] = useState<PixorySpace | null>(null);
  const space = input.space;
  const idsKey = input.messageIds.join('|');
  const runtime = useMemo(() => {
    if (!enabled) return null;
    const isActive = () => mounted.current && current.current.space === space
      && current.current.threadId === 'pixory-system-assistant' && current.current.isFocused !== false;
    return createSystemAssistantRuntime({
      space,
      load: id => loadSystemTask(space, id), save: saveSystemTask,
      validateIp: id => validateSystemAssistantIp(space, id),
      continueTask: async task => {
        await current.current.continueTask(task);
        const settled = await loadSystemTask(space, task.assistantMessageId);
        if (settled?.status === 'planning') await saveSystemTask({ ...settled, status: 'failed',
          error: '任务未能继续，请重试。', updatedAt: new Date().toISOString() });
      },
      stopTask: task => current.current.stopTask(task),
      navigate: command => navigateSystemAssistant(current.current.navigation, command),
      rename: renameSystemAssistant, undoRename: undoSystemAssistantRename, isActive,
      canContinue: () => current.current.canContinue(), changed: () => current.current.changed(),
      hasActiveGeneration: messageId => aiGenerationManager.getActiveTaskForThread(space, 'pixory-system-assistant')?.assistantMessageId === messageId,
      reportError: message => current.current.reportError(message),
    });
  }, [enabled, space]);

  useEffect(() => {
    if (!enabled) { setTasks({}); setIps([]); return; }
    let live = true;
    const upsert = (task: SystemTaskSnapshot) => {
      if (!live) return;
      setTasks(previous => previous[task.assistantMessageId]?.updatedAt > task.updatedAt ? previous
        : { ...previous, [task.assistantMessageId]: task });
    };
    const unsubscribe = subscribeSystemTasks(space, upsert);
    setTasks({});
    return () => { live = false; unsubscribe(); };
  }, [enabled, space]);

  const waitingKey = Object.values(tasks).filter(task => task.space === space && task.status === 'waiting_for_ip')
    .map(task => `${task.assistantMessageId}:${task.updatedAt}`).join('|');
  useEffect(() => {
    if (!active) return;
    let live = true;
    let request = 0;
    const refresh = () => {
      const token = ++request;
      void listSystemAssistantIps(space).then(value => {
        if (live && token === request) { setIps(value); setIpsSpace(space); }
      }).catch(() => { if (live && token === request) { setIps([]); setIpsSpace(space); } });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { live = false; subscription.remove(); };
  }, [active, space, waitingKey]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    void loadSystemTasks(space, input.messageIds).then(async values => {
      if (!live) return;
      for (let i = 0; i < values.length; i++) {
        const task = values[i];
        if (!live) return;
        if (['planning', 'executing', 'undoing'].includes(task.status)) {
          await runtime?.recover(task.assistantMessageId);
          values[i] = await loadSystemTask(space, task.assistantMessageId) ?? task;
        }
      }
      if (!live) return;
      setTasks(previous => {
        const next = { ...previous };
        for (const value of values) {
          if (value && (!next[value.assistantMessageId] || next[value.assistantMessageId].updatedAt <= value.updatedAt)) next[value.assistantMessageId] = value;
        }
        return next;
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [active, space, idsKey, runtime]);

  const visibleTasks = useMemo(() => enabled
    ? Object.fromEntries(Object.entries(tasks).filter(([, task]) => task.space === space))
    : EMPTY_TASKS, [enabled, tasks, space]);
  return { tasks: visibleTasks, ips: enabled && ipsSpace === space ? ips : EMPTY_IPS, runtime };
}
