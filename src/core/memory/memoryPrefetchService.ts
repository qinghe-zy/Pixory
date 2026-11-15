import {
  buildEntityCooccurrenceGraph,
  type EntityCooccurrenceGraph,
} from './memoryEntityGraphService';
import type { CompanionMemoryRecord } from './memoryTypes';

export type PrefetchSpace = 'normal' | 'personal';

export interface WarmedRoleMemoryContext {
  space: PrefetchSpace;
  roleCardId: string;
  l2Memories: CompanionMemoryRecord[];
  l1Slots: CompanionMemoryRecord[];
  l1Summaries?: CompanionMemoryRecord[];
  coreFacts: CompanionMemoryRecord[];
  graph: EntityCooccurrenceGraph;
  warmedAt: number;
  buildDurationMs: number;
}

export interface MemoryPrefetchDataSource {
  listMemories: (
    roleCardId: string,
    space: PrefetchSpace,
    tier: 'L2_EPISODIC' | 'L1_SLOT' | 'L1_SUMMARY'
  ) => Promise<CompanionMemoryRecord[]>;
  listCoreProfileFacts: (
    roleCardId: string,
    space: PrefetchSpace
  ) => Promise<CompanionMemoryRecord[]>;
}

const DEFAULT_PREFETCH_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_ROLES = 8;

const cache = new Map<string, WarmedRoleMemoryContext>();
const inFlight = new Map<string, Promise<WarmedRoleMemoryContext | null>>();
const invalidationEpochs = new Map<string, number>();

let defaultDataSource: MemoryPrefetchDataSource | null = null;
let cacheHits = 0;
let cacheMisses = 0;

function makeCacheKey(space: PrefetchSpace, roleCardId: string): string {
  return `${space}::${roleCardId}`;
}

function getEpoch(key: string): number {
  return invalidationEpochs.get(key) || 0;
}

function bumpEpoch(key: string): void {
  invalidationEpochs.set(key, getEpoch(key) + 1);
}

/**
 * 由仓储层单向注册默认数据源，保持预热服务零 SQLite 强耦合且杜绝循环依赖
 */
export function registerMemoryPrefetchDataSource(
  dataSource: MemoryPrefetchDataSource
): void {
  defaultDataSource = dataSource;
}

/**
 * 同步读取已预热且未过期的角色记忆上下文（零延迟命中）
 */
export function getWarmedMemoryContext(
  space: PrefetchSpace,
  roleCardId: string,
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_PREFETCH_TTL_MS
): WarmedRoleMemoryContext | null {
  if (!roleCardId) return null;
  const key = makeCacheKey(space, roleCardId);
  const entry = cache.get(key);
  if (!entry) {
    cacheMisses += 1;
    return null;
  }
  if (entry.space !== space || entry.roleCardId !== roleCardId) {
    cache.delete(key);
    cacheMisses += 1;
    return null;
  }
  if (nowMs - entry.warmedAt > ttlMs) {
    cache.delete(key);
    cacheMisses += 1;
    return null;
  }

  // LRU 刷新：删除后重新插入尾部
  cache.delete(key);
  cache.set(key, entry);
  cacheHits += 1;
  return entry;
}

/**
 * 异步预热指定角色在当前物理空间内的 L1/L2 记忆与实体共现图（带并发合流与写穿防过期世代锁）
 */
export async function warmRoleMemoryContext(
  space: PrefetchSpace,
  roleCardId: string,
  loaderOverride?: MemoryPrefetchDataSource
): Promise<WarmedRoleMemoryContext | null> {
  if (!roleCardId) return null;

  const existing = getWarmedMemoryContext(space, roleCardId);
  if (existing) {
    return existing;
  }

  const key = makeCacheKey(space, roleCardId);
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const dataSource = loaderOverride || defaultDataSource;
  if (!dataSource) {
    return null;
  }

  const startEpoch = getEpoch(key);
  const task = (async (): Promise<WarmedRoleMemoryContext | null> => {
    const t0 = Date.now();
    try {
      const [l2Memories, l1Slots, l1Summaries, coreFacts] = await Promise.all([
        dataSource.listMemories(roleCardId, space, 'L2_EPISODIC'),
        dataSource.listMemories(roleCardId, space, 'L1_SLOT'),
        dataSource.listMemories(roleCardId, space, 'L1_SUMMARY').catch(() => []),
        dataSource.listCoreProfileFacts(roleCardId, space),
      ]);

      // 若预热读取期间发生过写操作失效，则丢弃该陈旧快照，绝不回填脏缓存
      if (getEpoch(key) !== startEpoch) {
        return null;
      }

      const graph = buildEntityCooccurrenceGraph(l2Memories);
      const nowMs = Date.now();
      const context: WarmedRoleMemoryContext = {
        space,
        roleCardId,
        l2Memories,
        l1Slots,
        l1Summaries,
        coreFacts,
        graph,
        warmedAt: nowMs,
        buildDurationMs: Math.max(0, nowMs - t0),
      };

      if (cache.size >= MAX_CACHED_ROLES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }
      cache.set(key, context);
      return context;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/**
 * 在任何记忆增删改、折叠、替代后调用，立即使对应空间角色预热缓存失效并递进世代锁
 */
export function invalidateRoleMemoryPrefetch(
  space: PrefetchSpace,
  roleCardId: string
): void {
  if (!roleCardId) return;
  const key = makeCacheKey(space, roleCardId);
  bumpEpoch(key);
  cache.delete(key);
  inFlight.delete(key);
}

/**
 * 清空指定物理空间的全部预热缓存（如离开个人隐秘空间时即时擦除内存驻留）
 */
export function clearSpaceMemoryPrefetch(space: PrefetchSpace): void {
  const prefix = `${space}::`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) {
      inFlight.delete(key);
    }
  }
  for (const key of Array.from(invalidationEpochs.keys())) {
    if (key.startsWith(prefix)) {
      bumpEpoch(key);
    }
  }
}

export function clearAllMemoryPrefetch(): void {
  cache.clear();
  inFlight.clear();
  invalidationEpochs.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

export function getPrefetchTelemetry(): {
  cachedRoles: number;
  inFlightCount: number;
  hits: number;
  misses: number;
} {
  return {
    cachedRoles: cache.size,
    inFlightCount: inFlight.size,
    hits: cacheHits,
    misses: cacheMisses,
  };
}
