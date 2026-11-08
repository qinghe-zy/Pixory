import { ComponentNotFoundError, ProviderNotActiveError } from './errors';
import { RagComponentRegistry } from './registry';
import type { IRagProvider } from '../provider';
import type {
  ContextBudget,
  IngestResult,
  PromptContextResult,
  RagDocument,
  RagSearchOptions,
  RagSnippet,
} from '../types';

/**
 * 统一调度中枢 (RagHub)
 * 宿主应用唯一需要直接交互的顶层门面，支持一键插拔、全局切换引擎、集中生命周期管控
 */
export class RagHub {
  private activeProviderId: string | null = null;

  constructor(public readonly registry: RagComponentRegistry = new RagComponentRegistry()) {}

  /** 注册并激活指定的 Provider */
  public registerAndActivate(provider: IRagProvider): void {
    this.registry.register(provider);
    this.setActiveProvider(provider.id);
  }

  /** 一键切换当前激活的 Provider */
  public setActiveProvider(providerId: string): void {
    const provider = this.registry.get<IRagProvider>(providerId);
    if (!provider || provider.kind !== 'provider') {
      throw new ComponentNotFoundError(`找不到 Provider 实例: ${providerId}`);
    }
    this.activeProviderId = providerId;
  }

  /** 获取当前激活的 Provider 实例 */
  public getActiveProvider(): IRagProvider {
    if (!this.activeProviderId) {
      // 尝试自动寻找第一个注册的 provider
      const providers = this.registry.getByKind<IRagProvider>('provider');
      if (providers.length > 0 && providers[0]) {
        this.activeProviderId = providers[0].id;
        return providers[0];
      }
      throw new ProviderNotActiveError();
    }
    const provider = this.registry.get<IRagProvider>(this.activeProviderId);
    if (!provider) {
      throw new ProviderNotActiveError();
    }
    return provider;
  }

  /** 1. 知识库摄入 */
  public async ingest(document: RagDocument): Promise<IngestResult> {
    return this.getActiveProvider().ingest(document);
  }

  /** 2. 批量知识库摄入 */
  public async ingestBatch(documents: RagDocument[]): Promise<IngestResult[]> {
    const provider = this.getActiveProvider();
    if (typeof provider.ingestBatch === 'function') {
      return provider.ingestBatch(documents);
    }
    const results: IngestResult[] = [];
    for (const doc of documents) {
      results.push(await provider.ingest(doc));
    }
    return results;
  }

  /** 3. 删除文档 */
  public async delete(documentId: string): Promise<boolean> {
    return this.getActiveProvider().delete(documentId);
  }

  /** 4. 混合/语义搜索 */
  public async search(query: string, options?: RagSearchOptions): Promise<RagSnippet[]> {
    return this.getActiveProvider().search(query, options);
  }

  /** 5. 上下文与引用装配 */
  public buildContext(snippets: RagSnippet[], budget?: ContextBudget): PromptContextResult {
    return this.getActiveProvider().buildContext(snippets, budget);
  }

  /** 释放所有受管资源 */
  public async dispose(): Promise<void> {
    await this.registry.clear();
    this.activeProviderId = null;
  }
}
