import type { RagChunk } from '../../types';

export interface Bm25ScoredResult {
  chunk: RagChunk;
  score: number;
}

/**
 * 轻量工业级 BM25 全文检索评分器 (Okapi BM25 Scorer)
 * 纯 TypeScript 实现，支持中英文分词与 2-gram 滑窗匹配，免去外部数据库 FTS 依赖。
 */
export class Bm25Scorer {
  private k1 = 1.2;
  private b = 0.75;
  private docTokens = new Map<string, string[]>();
  private docLengths = new Map<string, number>();
  private avgDocLength = 0;
  private idfMap = new Map<string, number>();

  constructor(private chunks: RagChunk[]) {
    this.buildIndex();
  }

  /** 分词器：支持英文词汇与中文单字/二元分词 (2-gram) */
  public static tokenize(text: string): string[] {
    const normalized = text.toLowerCase();
    const tokens: string[] = [];
    const len = normalized.length;

    let wordBuffer = '';
    for (let i = 0; i < len; i++) {
      const char = normalized[i] ?? '';
      // 英文与数字
      if (/[a-z0-9_]/.test(char)) {
        wordBuffer += char;
      } else {
        if (wordBuffer.length > 0) {
          tokens.push(wordBuffer);
          wordBuffer = '';
        }
        // 中文字符 (CJK)
        if (/[\u4e00-\u9fa5]/.test(char)) {
          tokens.push(char);
          const nextChar = normalized[i + 1] ?? '';
          if (/[\u4e00-\u9fa5]/.test(nextChar)) {
            tokens.push(char + nextChar); // 2-gram 语义增强
          }
        }
      }
    }
    if (wordBuffer.length > 0) {
      tokens.push(wordBuffer);
    }
    return tokens;
  }

  private buildIndex(): void {
    let totalLength = 0;
    const docCount = this.chunks.length;
    const docFrequency = new Map<string, number>();

    for (const chunk of this.chunks) {
      const tokens = Bm25Scorer.tokenize(chunk.text);
      this.docTokens.set(chunk.id, tokens);
      this.docLengths.set(chunk.id, tokens.length);
      totalLength += tokens.length;

      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1);
      }
    }

    this.avgDocLength = docCount > 0 ? totalLength / docCount : 1;

    // 计算 IDF (带平滑)
    for (const [token, df] of docFrequency.entries()) {
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      this.idfMap.set(token, Math.max(0.01, idf));
    }
  }

  public score(query: string): Bm25ScoredResult[] {
    const queryTokens = Bm25Scorer.tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) {
      return [];
    }

    const results: Bm25ScoredResult[] = [];

    for (const chunk of this.chunks) {
      const tokens = this.docTokens.get(chunk.id) ?? [];
      const docLen = this.docLengths.get(chunk.id) ?? 1;

      // 统计词频 TF
      const tfMap = new Map<string, number>();
      for (const t of tokens) {
        tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
      }

      let score = 0;
      for (const qToken of queryTokens) {
        const tf = tfMap.get(qToken) ?? 0;
        if (tf === 0) continue;

        const idf = this.idfMap.get(qToken) ?? 0;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        results.push({ chunk, score });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
