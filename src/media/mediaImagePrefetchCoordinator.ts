import type { PixorySpace } from '../database';
import {
  buildPrefetchIndices,
  resolveMediaPrefetchWindow,
  type MediaMemoryPressure,
  type MediaScrollDirection,
} from './mediaPrefetchPolicy';

const MAX_ENCODED_PREFETCH_CONCURRENCY = 4;
const MAX_DECODE_CONCURRENCY = 2;

export interface MediaPrefetchItem {
  id: number;
  originalFileUri: string;
}

export interface ReleasableImageRef {
  release?: () => void;
}

export interface MediaImagePrefetchDependencies {
  decodeImage: (uri: string) => Promise<ReleasableImageRef>;
  onDecoded?: (uri: string) => void;
  prefetchEncoded: (uri: string, cachePolicy: 'memory' | 'memory-disk') => Promise<unknown>;
}

export interface MediaImagePrefetchTarget {
  direction: MediaScrollDirection;
  index: number;
  items: readonly MediaPrefetchItem[];
  memoryPressure?: MediaMemoryPressure;
  space: PixorySpace;
  velocity: number;
}

interface PrefetchJob {
  generation: number;
  uri: string;
}

export class MediaImagePrefetchCoordinator {
  private activeDecodeCount = 0;
  private activeEncodedCount = 0;
  private decodeQueue: PrefetchJob[] = [];
  private readonly decodedRefs = new Map<string, ReleasableImageRef>();
  private desiredDecodedUris = new Set<string>();
  private desiredEncodedUris = new Set<string>();
  private disposed = false;
  private encodedQueue: Array<PrefetchJob & { cachePolicy: 'memory' | 'memory-disk' }> = [];
  private readonly encodedInFlightUris = new Set<string>();
  private readonly encodedReadyUris = new Set<string>();
  private generation = 0;

  constructor(private readonly dependencies: MediaImagePrefetchDependencies) {}

  updateTarget(target: MediaImagePrefetchTarget): void {
    if (this.disposed) {
      return;
    }

    const generation = ++this.generation;
    const window = resolveMediaPrefetchWindow({
      direction: target.direction,
      memoryPressure: target.memoryPressure ?? 'normal',
      velocity: target.velocity,
    });
    const encodedIndices = buildPrefetchIndices({
      currentIndex: target.index,
      direction: target.direction,
      itemCount: target.items.length,
      kind: 'encoded',
      window,
    });
    const decodedIndices = buildPrefetchIndices({
      currentIndex: target.index,
      direction: target.direction,
      itemCount: target.items.length,
      kind: 'decoded',
      window,
    });

    const encodedUris = uniqueUris(target.items, encodedIndices);
    const decodedUris = uniqueUris(target.items, decodedIndices);
    this.desiredEncodedUris = new Set(encodedUris);
    this.desiredDecodedUris = new Set(decodedUris);
    for (const uri of this.encodedReadyUris) {
      if (!this.desiredEncodedUris.has(uri)) {
        this.encodedReadyUris.delete(uri);
      }
    }
    this.releaseDecodedRefsOutside(this.desiredDecodedUris);

    const cachePolicy = target.space === 'personal' ? 'memory' : 'memory-disk';
    this.encodedQueue = encodedUris
      .filter((uri) => !this.encodedReadyUris.has(uri) && !this.encodedInFlightUris.has(uri))
      .map((uri) => ({ cachePolicy, generation, uri }));
    this.decodeQueue = decodedUris
      .filter((uri) => !this.decodedRefs.has(uri))
      .map((uri) => ({ generation, uri }));

    this.pumpEncodedQueue();
    this.pumpDecodeQueue();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.encodedQueue = [];
    this.decodeQueue = [];
    this.desiredEncodedUris.clear();
    this.desiredDecodedUris.clear();
    this.encodedReadyUris.clear();
    this.releaseDecodedRefsOutside(new Set());
  }

  private pumpEncodedQueue(): void {
    while (!this.disposed && this.activeEncodedCount < MAX_ENCODED_PREFETCH_CONCURRENCY) {
      const job = this.encodedQueue.shift();
      if (!job) {
        return;
      }
      if (job.generation !== this.generation) {
        continue;
      }

      this.activeEncodedCount += 1;
      this.encodedInFlightUris.add(job.uri);
      void this.dependencies.prefetchEncoded(job.uri, job.cachePolicy)
        .then((result) => {
          if (!this.disposed && result !== false && this.desiredEncodedUris.has(job.uri)) {
            this.encodedReadyUris.add(job.uri);
          }
        })
        .catch(() => {
          // Prefetch is speculative and must never make the reader fail.
        })
        .finally(() => {
          this.encodedInFlightUris.delete(job.uri);
          this.activeEncodedCount -= 1;
          this.pumpEncodedQueue();
        });
    }
  }

  private pumpDecodeQueue(): void {
    while (!this.disposed && this.activeDecodeCount < MAX_DECODE_CONCURRENCY) {
      const job = this.decodeQueue.shift();
      if (!job) {
        return;
      }
      if (job.generation !== this.generation || this.decodedRefs.has(job.uri)) {
        continue;
      }

      this.activeDecodeCount += 1;
      void this.dependencies.decodeImage(job.uri)
        .then((imageRef) => {
          if (
            this.disposed
            || job.generation !== this.generation
            || !this.desiredDecodedUris.has(job.uri)
          ) {
            imageRef.release?.();
            return;
          }
          this.decodedRefs.get(job.uri)?.release?.();
          this.decodedRefs.set(job.uri, imageRef);
          this.dependencies.onDecoded?.(job.uri);
        })
        .catch(() => {
          // A decode miss falls back to the regular Image render path.
        })
        .finally(() => {
          this.activeDecodeCount -= 1;
          this.pumpDecodeQueue();
        });
    }
  }

  private releaseDecodedRefsOutside(keepUris: ReadonlySet<string>): void {
    for (const [uri, imageRef] of this.decodedRefs) {
      if (!keepUris.has(uri)) {
        imageRef.release?.();
        this.decodedRefs.delete(uri);
      }
    }
  }
}

function uniqueUris(items: readonly MediaPrefetchItem[], indices: readonly number[]): string[] {
  const uris = indices
    .map((index) => items[index]?.originalFileUri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  return [...new Set(uris)];
}
