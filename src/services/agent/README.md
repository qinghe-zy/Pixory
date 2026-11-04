# Agent Services Architecture

本目录承载智能文档 Agent 的核心编排与业务能力，遵循 FCIS（Functional Core, Imperative Shell）架构设计：

## 目录分层与依赖规则

1. **`kernel/` (纯函数内核)**:
   - 严禁导入 `expo-*`、`react-native*`、数据库实例或任何带副作用的模块。
   - 纯粹处理循环检测、Token 预算、上下文裁剪、前缀稳定、原子事务对齐等纯算法。
   - 输入输出只接受纯 TypeScript 类型、`Uint8Array`、`Int32Array` 与 JSON 结构。

2. **`tools/` (Agent 工具集)**:
   - 包含文档检测、读取、搜索、修补等标准工具定义与执行体。
   - 对接驱动层协议 `IDocumentDriver`，不直接耦合底层二进制。

3. **`vfs/` (虚拟文件系统与检查点)**:
   - 基于 CAS (Content-Addressed Storage) 的文档工作区。
   - 维护 Manifest 快照与 MVCC 版本树，杜绝数据库与磁盘文件脑裂。
   - 原件 100% 只读，派生文件独立管理。
