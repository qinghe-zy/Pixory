# RAG 插件 (rag-core)

可移植、低耦合、提供一键插拔、统一组件管控的独立通用 RAG 插件模块。

## 特性

1. **统一组件注册中心（RagComponentRegistry）**：所有解析器、分块器、存储引擎、向量提供方统一受管与生命周期调度。
2. **一键热插拔（Hot-Swappable）**：定义 `IRagProvider`，一行代码全局无缝切换内置本地混合引擎或外部成熟平台（如 Dify/FastGPT）。
3. **100% 业务解耦**：无任何 Pixory 历史业务依赖，纯净通用，可无缝平移到任何新项目中。
4. **React 集成层**：内置 `useRagSearch` 与 `useRagIngest`，遵循 UX 4 态（Loading/Empty/Error/Success）与请求防竞态覆盖规范。

## 快速上手

```typescript
import { ragHub } from './index';

// 1. 摄入文档
await ragHub.ingest({
  id: 'doc-1',
  title: '产品规范',
  content: '主色采用墨蓝色...',
});

// 2. 检索
const results = await ragHub.search('主色是什么？');

// 3. 上下文装配
const context = ragHub.buildContext(results);
```

## React Hook 调用

```typescript
import { useRagSearch } from './react';

function SearchComponent() {
  const { query, setQuery, data, isLoading, isEmpty, error, retry } = useRagSearch({ autoSearch: true });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorView error={error} onRetry={retry} />;
  if (isEmpty) return <EmptyState />;
  return <ResultList items={data} />;
}
```
