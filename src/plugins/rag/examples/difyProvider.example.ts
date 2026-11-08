/**
 * 示例：如何 50 行代码对接外部成熟 RAG 框架 (如 Dify 知识库)
 * 验证 RAG 插件的零业务耦合与一键热插拔特性
 */
import { PromptContextBuilder } from '../components/context/contextBuilder';
import type { IRagProvider } from '../provider';
import type {
  ContextBudget,
  IngestResult,
  PromptContextResult,
  RagDocument,
  RagSearchOptions,
  RagSnippet,
} from '../types';

export interface DifyProviderConfig {
  baseUrl: string;
  apiKey: string;
  datasetId: string;
}

export class DifyRagProvider implements IRagProvider {
  public readonly id = 'provider:dify';
  public readonly kind = 'provider' as const;

  constructor(private config: DifyProviderConfig) {}

  public async ingest(document: RagDocument): Promise<IngestResult> {
    const url = `${this.config.baseUrl}/datasets/${this.config.datasetId}/document/create_by_text`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: document.title,
        text: document.content,
        indexing_technique: 'high_quality',
        process_rule: { mode: 'automatic' },
      }),
    });
    const data = await res.json();
    return {
      documentId: data?.document?.id ?? document.id,
      chunkCount: data?.document?.word_count ? Math.ceil(data.document.word_count / 500) : 1,
      embeddedCount: 1,
      durationMs: 0,
    };
  }

  public async delete(documentId: string): Promise<boolean> {
    const url = `${this.config.baseUrl}/datasets/${this.config.datasetId}/documents/${documentId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    return res.ok;
  }

  public async search(query: string, options?: RagSearchOptions): Promise<RagSnippet[]> {
    const url = `${this.config.baseUrl}/datasets/${this.config.datasetId}/retrieve`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        retrieval_model: {
          search_method: 'hybrid_search',
          top_k: options?.topK ?? 5,
        },
      }),
    });
    const data = await res.json();
    const records = data?.records ?? [];

    return records.map((r: any) => ({
      chunkId: r.segment.id,
      documentId: r.segment.document_id,
      documentTitle: r.segment.document.name,
      text: r.segment.content,
      score: r.score,
      matchType: 'hybrid' as const,
    }));
  }

  public buildContext(snippets: RagSnippet[], budget?: ContextBudget): PromptContextResult {
    return PromptContextBuilder.buildContext(snippets, budget);
  }
}
