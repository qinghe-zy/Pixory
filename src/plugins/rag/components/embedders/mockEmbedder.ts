import type { IRagEmbedder } from './types';

/**
 * 模拟向量生成器 (MockRagEmbedder)
 * 纯数学可重现的伪向量，用于离线单元测试、CI/CD 与本地开发，零外部网络开销
 */
export class MockRagEmbedder implements IRagEmbedder {
  public readonly id = 'embedder:mock';
  public readonly kind = 'embedder' as const;
  public readonly dimensions: number;

  constructor(dimensions = 16) {
    this.dimensions = dimensions;
  }

  public async embedQuery(text: string): Promise<number[]> {
    return this.hashTextToVector(text);
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashTextToVector(t));
  }

  private hashTextToVector(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      vector[i % this.dimensions] += (code % 31) - 15;
    }
    // L2 归一化
    let norm = 0;
    for (const val of vector) {
      norm += val * val;
    }
    norm = Math.sqrt(norm) || 1;
    return vector.map((v) => v / norm);
  }
}
