export interface ScopedLruCacheOptions {
  maxEntries: number;
  ttlMs: number;
  now?: () => number;
}

interface ScopedLruCacheEntry<T> {
  expiresAt: number;
  scope: string;
  value: T;
}

export class ScopedLruCache<T> {
  private readonly entries = new Map<string, ScopedLruCacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: ScopedLruCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
      throw new Error('ScopedLruCache maxEntries must be a positive integer.');
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error('ScopedLruCache ttlMs must be a positive finite number.');
    }

    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(scope: string, key: string): T | undefined {
    const compositeKey = this.createCompositeKey(scope, key);
    const entry = this.entries.get(compositeKey);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(compositeKey);
      return undefined;
    }

    this.entries.delete(compositeKey);
    this.entries.set(compositeKey, entry);
    return entry.value;
  }

  set(scope: string, key: string, value: T, ttlMs = this.ttlMs): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('ScopedLruCache entry ttlMs must be a positive finite number.');
    }

    this.pruneExpired();
    const compositeKey = this.createCompositeKey(scope, key);
    this.entries.delete(compositeKey);
    this.entries.set(compositeKey, {
      expiresAt: this.now() + ttlMs,
      scope,
      value,
    });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey == null) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }

  delete(scope: string, key: string): boolean {
    return this.entries.delete(this.createCompositeKey(scope, key));
  }

  clearScope(scope: string): void {
    for (const [compositeKey, entry] of this.entries) {
      if (entry.scope === scope) {
        this.entries.delete(compositeKey);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private createCompositeKey(scope: string, key: string): string {
    return JSON.stringify([scope, key]);
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [compositeKey, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(compositeKey);
      }
    }
  }
}
