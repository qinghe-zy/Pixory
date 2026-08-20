export interface VideoPreloadPoolDependencies<TItem, TPlayer, TId extends string | number> {
  createPlayer: (item: TItem) => TPlayer;
  getItemId: (item: TItem) => TId;
  preparePlayer: (player: TPlayer, item: TItem) => Promise<unknown>;
  releasePlayer: (player: TPlayer) => void;
  setPlayerActive: (player: TPlayer, active: boolean) => void;
}

export interface VideoPreloadPoolUpdate<TItem, TId extends string | number> {
  currentId: TId;
  direction: -1 | 1;
  items: readonly TItem[];
}

const MAX_PREPARE_CONCURRENCY = 3;

interface VideoPreloadEntry<TItem, TPlayer, TId> {
  id: TId;
  item: TItem;
  player: TPlayer;
  released: boolean;
  status: 'idle' | 'preparing' | 'ready' | 'error';
}

export class VideoPreloadPool<TItem, TPlayer, TId extends string | number> {
  private disposed = false;
  private readonly entries = new Map<TId, VideoPreloadEntry<TItem, TPlayer, TId>>();
  private generation = 0;
  private residentIds: TId[] = [];

  constructor(private readonly dependencies: VideoPreloadPoolDependencies<TItem, TPlayer, TId>) {}

  get size(): number {
    return this.entries.size;
  }

  getResidentIds(): TId[] {
    return [...this.residentIds];
  }

  getPlayer(id: TId): TPlayer | undefined {
    return this.entries.get(id)?.player;
  }

  isReady(id: TId): boolean {
    return this.entries.get(id)?.status === 'ready';
  }

  adoptPlayer(item: TItem, player: TPlayer, ready = false): void {
    if (this.disposed) {
      this.dependencies.releasePlayer(player);
      return;
    }
    const id = this.dependencies.getItemId(item);
    const existing = this.entries.get(id);
    if (existing?.player === player) {
      existing.item = item;
      existing.status = ready ? 'ready' : existing.status;
      return;
    }
    if (existing) {
      this.releaseEntry(existing);
    }
    this.entries.set(id, {
      id,
      item,
      player,
      released: false,
      status: ready ? 'ready' : 'idle',
    });
  }

  getActivePlayer(): TPlayer | undefined {
    const currentId = this.residentIds[0];
    return currentId == null ? undefined : this.entries.get(currentId)?.player;
  }

  async update(update: VideoPreloadPoolUpdate<TItem, TId>): Promise<void> {
    if (this.disposed) {
      return;
    }
    const generation = ++this.generation;
    const desiredItems = resolveResidentItems(update, this.dependencies.getItemId);
    const desiredIds = desiredItems.map(this.dependencies.getItemId);
    const desiredIdSet = new Set(desiredIds);

    for (const [id, entry] of this.entries) {
      if (!desiredIdSet.has(id)) {
        this.releaseEntry(entry);
        this.entries.delete(id);
      }
    }

    for (const item of desiredItems) {
      const id = this.dependencies.getItemId(item);
      if (!this.entries.has(id)) {
        const player = this.dependencies.createPlayer(item);
        this.dependencies.setPlayerActive(player, false);
        this.entries.set(id, { id, item, player, released: false, status: 'idle' });
      }
    }

    this.residentIds = desiredIds;
    for (const [id, entry] of this.entries) {
      this.dependencies.setPlayerActive(entry.player, id === update.currentId);
    }

    let nextItemIndex = 0;
    const prepareNext = async (): Promise<void> => {
      while (!this.disposed && generation === this.generation) {
        const item = desiredItems[nextItemIndex];
        nextItemIndex += 1;
        if (!item) {
          return;
        }
        const id = this.dependencies.getItemId(item);
        const entry = this.entries.get(id);
        if (!entry || entry.released || entry.status === 'ready' || entry.status === 'preparing') {
          continue;
        }
        entry.status = 'preparing';
        try {
          await this.dependencies.preparePlayer(entry.player, item);
          if (!entry.released && this.entries.get(id) === entry) {
            entry.status = 'ready';
            entry.item = item;
          }
        } catch {
          if (!entry.released && this.entries.get(id) === entry) {
            entry.status = 'error';
          }
        }
      }
    };
    const workerCount = Math.min(MAX_PREPARE_CONCURRENCY, desiredItems.length);
    await Promise.all(Array.from({ length: workerCount }, () => prepareNext()));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    for (const entry of this.entries.values()) {
      this.releaseEntry(entry);
    }
    this.entries.clear();
    this.residentIds = [];
  }

  private releaseEntry(entry: VideoPreloadEntry<TItem, TPlayer, TId>): void {
    if (entry.released) {
      return;
    }
    entry.released = true;
    this.dependencies.setPlayerActive(entry.player, false);
    this.dependencies.releasePlayer(entry.player);
  }
}

function resolveResidentItems<TItem, TId extends string | number>(
  update: VideoPreloadPoolUpdate<TItem, TId>,
  getItemId: (item: TItem) => TId
): TItem[] {
  const currentIndex = update.items.findIndex((item) => getItemId(item) === update.currentId);
  if (currentIndex < 0) {
    return [];
  }

  // Keep fewer players warm to prevent OutOfMemoryError on Android devices
  // with strict 256MB heap limits. ExoPlayer instances are heavy.
  const prioritizedIndices = [
    currentIndex,
    currentIndex + update.direction,
  ];
  const residents: TItem[] = [];
  const residentIds = new Set<TId>();
  for (const index of prioritizedIndices) {
    const item = update.items[index];
    if (!item) {
      continue;
    }
    const id = getItemId(item);
    if (!residentIds.has(id)) {
      residentIds.add(id);
      residents.push(item);
    }
  }
  // Max 2 players resident
  return residents.slice(0, 2);
}
