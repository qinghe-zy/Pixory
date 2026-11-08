/**
 * 标准统一异常定义 (Standard RAG Exceptions)
 */

export class RagError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
    super(`[RAG:${code}] ${message}`);
    this.name = 'RagError';
  }
}

export class ComponentNotFoundError extends RagError {
  constructor(id: string) {
    super(`组件未找到: ${id}`, 'COMPONENT_NOT_FOUND');
    this.name = 'ComponentNotFoundError';
  }
}

export class ProviderNotActiveError extends RagError {
  constructor() {
    super('未设置生效的 RAG Provider，请先调用 setActiveProvider()', 'NO_ACTIVE_PROVIDER');
    this.name = 'ProviderNotActiveError';
  }
}

export class IngestionError extends RagError {
  constructor(message: string, cause?: unknown) {
    super(message, 'INGESTION_FAILED', cause);
    this.name = 'IngestionError';
  }
}

export class SearchTimeoutError extends RagError {
  constructor(timeoutMs: number) {
    super(`检索超时 (${timeoutMs}ms)`, 'SEARCH_TIMEOUT');
    this.name = 'SearchTimeoutError';
  }
}
