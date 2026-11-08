import type { IRagEmbedder } from '../../plugins/rag';
import { aiProviderRepository, runWithDatabaseSpace, type PixorySpace } from '../../database';
import { settleWithConcurrency } from '../aiBoundedConcurrency';
import { getEmbeddingProviderForSpace } from '../aiEmbeddingService';
import { getAdapterForProvider } from '../aiProviderService';
import { getProviderApiKeyForSpace } from '../secureAiSettingsService';

const EMBEDDING_CONCURRENCY = 3;

/**
 * Pixory 动态嵌入适配器 (PixoryDynamicEmbedder)
 *
 * 核心特性：
 * 1. 动态感知：自动从设置界面（ai_providers）探测当前空间配置的默认 Embedding 模型。
 * 2. 零配置兜底：如果用户未配置 Embedding 模型或未填 API Key，resolvePixoryEmbedder 直接返回 undefined，
 *    使 RAG 自动无感降级为纯本地 Okapi BM25 模式，零网络请求、零报错、零费用。
 */
export class PixoryDynamicEmbedder implements IRagEmbedder {
  public readonly id = 'embedder:pixory-dynamic';
  public readonly kind = 'embedder' as const;
  public readonly dimensions: number;

  constructor(
    private space: PixorySpace,
    private providerId: string,
    private modelId: string,
    private apiKey: string,
    private baseUrl: string,
    dimensions = 1536
  ) {
    this.dimensions = dimensions;
  }

  public async embedQuery(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0] ?? [];
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const provider = await runWithDatabaseSpace(this.space, (db) =>
      aiProviderRepository.findProviderById(db, this.providerId)
    );
    if (!provider) {
      return texts.map(() => []);
    }

    const adapter = getAdapterForProvider(provider);
    const settled = await settleWithConcurrency(texts, EMBEDDING_CONCURRENCY, async (text) => {
      return adapter.embedText({
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        modelId: this.modelId,
        text,
      });
    });

    return settled.map((item) => (item.status === 'fulfilled' ? item.value : []));
  }
}

/**
 * 解析当前空间配置的有效 Embedding 模型
 * 若未配置或缺少 API Key，安全返回 undefined（激活纯 BM25 本地检索）
 */
export async function resolvePixoryEmbedder(
  space: PixorySpace
): Promise<IRagEmbedder | undefined> {
  try {
    const configured = await getEmbeddingProviderForSpace(space);
    if (!configured?.providerId || !configured?.modelId) {
      return undefined;
    }

    const apiKey = await getProviderApiKeyForSpace(space, configured.providerId);
    if (!apiKey) {
      return undefined;
    }

    const provider = await runWithDatabaseSpace(space, (db) =>
      aiProviderRepository.findProviderById(db, configured.providerId)
    );
    if (!provider) {
      return undefined;
    }

    const baseUrl = provider.embeddingBaseUrl ?? provider.baseUrl ?? '';

    return new PixoryDynamicEmbedder(
      space,
      configured.providerId,
      configured.modelId,
      apiKey,
      baseUrl
    );
  } catch {
    // 异常容错，静默降级为纯 BM25 模式
    return undefined;
  }
}
