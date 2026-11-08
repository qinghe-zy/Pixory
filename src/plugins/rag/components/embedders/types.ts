import type { IRagComponent } from '../../core/lifecycle';

export interface IRagEmbedder extends IRagComponent {
  readonly kind: 'embedder';
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
