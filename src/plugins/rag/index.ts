/**
 * RAG 独立插件统一导出入口 (RAG Plugin Entry)
 *
 * 架构特性：
 * 1. 100% 独立于主工程任何业务逻辑，零耦合。
 * 2. 具备完整的“解析 -> 递归分块 -> 向量化 -> 混合检索 -> 上下文组装与引用”闭环。
 * 3. 统一组件注册中心（RagComponentRegistry）集中管理所有子组件。
 * 4. 支持通过 RagHub 一键热插拔切换底层驱动或接入 Dify/FastGPT 等成熟外部平台。
 * 5. 纯净跨环境：核心层零 React 强依赖，React Hook 独立位于子模块 ./react。
 */

// 导出所有核心类型与门面
export * from './types';
export * from './provider';
export * from './core/lifecycle';
export * from './core/errors';
export * from './core/registry';
export * from './core/hub';
export * from './instance';

// 导出具体实现组件
export * from './components/splitters/types';
export * from './components/splitters/recursiveSplitter';
export * from './components/splitters/markdownSplitter';
export * from './components/parsers/types';
export * from './components/parsers/textParser';
export * from './components/parsers/markdownParser';
export * from './components/stores/types';
export * from './components/stores/memoryStore';
export * from './components/stores/standaloneSqliteStore';
export * from './components/embedders/types';
export * from './components/embedders/mockEmbedder';
export * from './components/embedders/httpEmbedder';
export * from './components/searchers/cosine';
export * from './components/searchers/bm25';
export * from './components/searchers/hybridRrfSearcher';
export * from './components/context/contextBuilder';
export * from './providers/localProvider';
