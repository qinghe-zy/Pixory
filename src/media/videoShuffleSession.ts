export function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export interface VideoShuffleSessionOptions {
  queueIds: number[];
  currentId?: number;
}

export class VideoShuffleSession {
  private queueIds: number[] = [];
  private playedIds: Set<number> = new Set();
  private candidates: number[] = [];
  private _previousId: number | null = null;
  private lastPlayedId: number | null = null;

  constructor(options: VideoShuffleSessionOptions) {
    this.reset(options);
  }

  get previousId(): number | null {
    return this._previousId;
  }

  setPrevious(id: number | null): void {
    this._previousId = id;
  }

  peekNext(): number | null {
    if (this.queueIds.length === 0) return null;
    if (this.candidates.length === 0) {
      this.rebuildRound();
    }
    return this.candidates.length > 0 ? this.candidates[0] : null;
  }

  commitNext(): number | null {
    const nextId = this.peekNext();
    if (nextId !== null) {
      this.markPlayed(nextId);
      this.lastPlayedId = nextId;
    }
    return nextId;
  }

  markPlayed(id: number): void {
    if (this.queueIds.includes(id)) {
      this.playedIds.add(id);
      this.candidates = this.candidates.filter(c => c !== id);
      this.lastPlayedId = id;
    }
  }

  /**
   * Synchronizes the shuffle session with the latest queue IDs.
   * Returns true if played history, candidates, or round order changed.
   */
  syncQueue(currentQueueIds: number[]): boolean {
    const oldQueueSet = new Set(this.queueIds);
    const newQueueSet = new Set(currentQueueIds);
    let changed = false;

    // Remove played IDs that are no longer in queue
    for (const playedId of this.playedIds) {
      if (!newQueueSet.has(playedId)) {
        this.playedIds.delete(playedId);
        changed = true;
      }
    }

    // Add new IDs to unplayed candidates (and shuffle them into existing)
    const newCandidates: number[] = [];
    for (const id of currentQueueIds) {
      if (!oldQueueSet.has(id)) {
        newCandidates.push(id);
      }
    }

    // Remove candidates that are no longer in queue
    const prevCandidateCount = this.candidates.length;
    this.candidates = this.candidates.filter(c => newQueueSet.has(c));
    if (this.candidates.length !== prevCandidateCount) {
      changed = true;
    }

    if (newCandidates.length > 0) {
      this.candidates.push(...newCandidates);
      fisherYatesShuffle(this.candidates);
      changed = true;
    }

    this.queueIds = [...currentQueueIds];

    if (this.queueIds.length > 0 && this.candidates.length === 0) {
      this.rebuildRound();
      changed = true;
    }

    return changed;
  }

  reset(options: VideoShuffleSessionOptions): void {
    this.queueIds = [...options.queueIds];
    this.playedIds.clear();
    this.candidates = [...this.queueIds];
    this._previousId = null;
    this.lastPlayedId = options.currentId ?? null;
    
    fisherYatesShuffle(this.candidates);

    if (this.lastPlayedId !== null) {
      this.markPlayed(this.lastPlayedId);
    }
  }

  get remainingCount(): number {
    return this.candidates.length;
  }

  get totalCount(): number {
    return this.queueIds.length;
  }

  getPlayedIds(): ReadonlySet<number> {
    return new Set(this.playedIds);
  }

  getCandidates(): readonly number[] {
    return [...this.candidates];
  }

  private rebuildRound(): void {
    this.playedIds.clear();
    this.candidates = [...this.queueIds];
    fisherYatesShuffle(this.candidates);

    // No consecutive repeat
    if (
      this.candidates.length > 1 && 
      this.lastPlayedId !== null && 
      this.candidates[0] === this.lastPlayedId
    ) {
      [this.candidates[0], this.candidates[1]] = [this.candidates[1], this.candidates[0]];
    }
  }
}
