import type { IRagEmbedder } from './types';

export interface HttpEmbedderOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  dimensions?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * 通用 HTTP 向量客户端 (HttpRagEmbedder)
 * 兼容 OpenAI、SiliconFlow、Ollama、LocalAI、vLLM 等所有标准 /v1/embeddings 接口
 */
export class HttpRagEmbedder implements IRagEmbedder {
  public readonly id = 'embedder:http';
  public readonly kind = 'embedder' as const;
  public readonly dimensions: number;

  constructor(private options: HttpEmbedderOptions) {
    this.dimensions = options.dimensions ?? 1536;
  }

  public async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    const first = results[0];
    if (!first) {
      throw new Error('未返回有效的向量结果');
    }
    return first;
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/embeddings`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    };
    if (this.options.apiKey) {
      headers.Authorization = `Bearer ${this.options.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.options.model,
          input: texts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Embedding 请求失败 (${response.status}): ${errText}`);
      }

      const json = await response.json();
      if (!Array.isArray(json?.data)) {
        throw new Error('Embedding 返回数据格式不合法，缺少 data 数组');
      }

      // 按 index 排序确保对应顺序
      const sorted = json.data.sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
      return sorted.map((item: any) => item.embedding);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Embedding 请求超时 (${this.options.timeoutMs ?? 10000}ms)`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
