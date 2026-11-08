import { RagHub } from './core/hub';
import { RagComponentRegistry } from './core/registry';
import { LocalHybridRagProvider } from './providers/localProvider';
import { RecursiveTextSplitter } from './components/splitters/recursiveSplitter';
import { MarkdownTextSplitter } from './components/splitters/markdownSplitter';
import { TextDocumentParser } from './components/parsers/textParser';
import { MarkdownDocumentParser } from './components/parsers/markdownParser';
import { MemoryRagStore } from './components/stores/memoryStore';
import { MockRagEmbedder } from './components/embedders/mockEmbedder';
import { HybridRrfSearcher } from './components/searchers/hybridRrfSearcher';

/**
 * 工厂函数：创建一个已注册默认基础组件与本地驱动的 RagHub
 */
export function createDefaultRagHub(): RagHub {
  const registry = new RagComponentRegistry();

  // 1. 注册基础原子组件到中心
  const defaultSplitter = registry.register(new RecursiveTextSplitter());
  registry.register(new MarkdownTextSplitter());
  registry.register(new TextDocumentParser());
  registry.register(new MarkdownDocumentParser());
  const defaultStore = registry.register(new MemoryRagStore());
  const defaultEmbedder = registry.register(new MockRagEmbedder(16));
  const defaultSearcher = registry.register(new HybridRrfSearcher());

  // 2. 组装并注册默认内置本地驱动
  const defaultProvider = registry.register(
    new LocalHybridRagProvider({
      id: 'provider:local-hybrid',
      store: defaultStore,
      splitter: defaultSplitter,
      embedder: defaultEmbedder,
      searcher: defaultSearcher,
    })
  );

  const hub = new RagHub(registry);
  hub.setActiveProvider(defaultProvider.id);
  return hub;
}

/**
 * 全局预设单例（开箱即用）
 */
export const ragHub: RagHub = createDefaultRagHub();
