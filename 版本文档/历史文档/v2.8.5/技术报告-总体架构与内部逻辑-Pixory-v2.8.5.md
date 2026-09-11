# Pixory 总体技术架构与内部逻辑设计报告

## 1. 报告范围

本文面向技术评审，描述 v2.8.5 稳定基线的客户端分层、数据边界、AI 生成链路、文件安全、Personal 隔离和故障恢复。文中将源码已实现逻辑与规划/待验证边界分开，避免把设计目标误写成上线事实。

## 2. 总体架构

~~~mermaid
flowchart TD
  UI[Expo Router / React Native UI] --> Store[Zustand 状态与屏幕状态]
  Store --> Domain[领域服务层]
  Domain --> Chat[线程与生成服务]
  Domain --> Memory[记忆与上下文服务]
  Domain --> Material[IP/文档/资产服务]
  Domain --> Privacy[空间与权限服务]
  Chat --> Prompt[Prompt Builder]
  Prompt --> Retrieval[材料检索 / 记忆检索]
  Chat --> Provider[AI Provider Adapter]
  Chat --> Recovery[生成恢复状态机]
  Domain --> DB[(SQLite normal/personal)]
  Material --> Files[(App-managed files)]
  Domain --> Diagnostics[诊断与指标]
  Diagnostics --> DB
~~~

### 2.1 分层职责

| 层 | 主要模块 | 规则 |
|---|---|---|
| 表现层 | screens、components、router | 只消费已校验的领域数据，不直接读文件路径或拼接提示词 |
| 状态层 | Zustand store、generation subscriptions | 管理可见状态、乐观状态和恢复后的重放 |
| 领域层 | chat、role、memory、material、backup、privacy services | 对外提供稳定函数，负责业务不变量 |
| AI 编排层 | promptBuilder、aiRetrievalService、memoryContextPlanService | 组装上下文、预算裁剪、引用和缓存元数据 |
| 基础设施层 | SQLite、文件系统、SecureStore、Android bridge | 处理持久化、加密凭据、系统任务和文件复制 |
| 质量层 | diagnostics、metrics、release workflow | 记录性能和故障，不采集正文和密钥 |

## 3. 数据与存储边界

### 3.1 SQLite

数据库启用 WAL 和外键，迁移版本持续演进。普通空间和 Personal 使用不同数据库文件，并通过空间注册表确保数据库句柄不会跨域复用。关键索引覆盖：

- 媒体：IP、媒体类型、删除状态、创建时间、主键。
- 最近查看：删除状态、最近查看时间、主键。
- 聊天：线程、创建时间、主键。
- 记忆：FTS、范围、状态和来源。

### 3.2 文件目录

~~~text
AppData/
├─ database/pixory.sqlite
├─ assets/originals/ip_{ipId}/
├─ thumbnails/ip_{ipId}/
├─ exports/
└─ temp/
~~~

Personal 使用对应的独立目录。原始文件、预览和缩略图不能互相替代。临时 URI 只在导入阶段使用，不能写入长期记录。

### 3.3 SecureStore

只存本地提供商密钥、Personal 认证材料和恢复密钥相关秘密。诊断、普通 SQLite 业务表和备份 Manifest 均不得写入密钥正文。

## 4. AI 生成内部逻辑

1. 屏幕提交用户消息，校验空间、线程、角色快照和并发任务。
2. 写入用户消息和生成占位消息，生成唯一 generationId。
3. 读取线程历史、摘要、记忆投影、运行时事件和已授权材料。
4. Prompt Builder 生成稳定块、动态块和缓存元数据。
5. 上下文预算服务按模型窗口裁剪，必需块不得删除。
6. Provider Adapter 发起流式请求，生成管理器建立恢复租约。
7. 流式运行时依据页面活跃度、尾部热区和设备压力合并 UI patch。
8. 定时或关键事件 flush 到 SQLite；终态后写入最终消息、指标和摘要。
9. 页面重进时从数据库恢复消息和状态，不依赖内存订阅。

## 5. 生成状态与并发

### 5.1 前台状态机

~~~text
created
  → local_persisted
  → request_started
  → first_byte
  → reasoning / answer
  → terminal
  → final_persisted
  → ui_stable
~~~

### 5.2 恢复状态机

~~~text
prepared → requesting → streaming → reconciling
                                ↘ recoverable_interrupted
                                  → retrying / continuing
                                  → completed / failed / stopped
~~~

同一空间与线程只允许一个活动任务。新任务启动前主动终止旧任务，旧任务的迟到 patch 会因 generationId 不匹配而被丢弃。

## 6. Personal 隔离

空间检查贯穿路由、数据库、文件、缓存、后台任务和诊断字段。锁定流程依次撤销任务 token、停止或等待任务、清理内存图像缓存、关闭数据库并重置导航状态。跨空间移动必须经过双重确认；绑定 IP/知识库的线程默认拒绝移动。

## 7. 导入与备份内部逻辑

导入采用“复制原文件→读取元数据→生成预览→事务写记录”的顺序。批量导入通过有界 worker 池控制并发，失败项与成功项分离记录。删除只更新 deleted 状态，清空回收站才物理删除。

Manifest V2 使用相对路径、大小和 SHA-256。恢复前做安全路径校验和空间预检，恢复过程中建立旧 ID 到新 ID 的映射，在事务中合并线程、消息、记忆、材料和关系，完成后重建 FTS。任一步失败均回滚，不覆盖现有原文件。

## 8. 接口与不变量

### 8.1 领域接口约束

- 服务函数必须显式接收 space 或数据库上下文。
- 所有生成更新必须携带 generationId、threadId 和时间。
- 所有检索结果必须携带 scope、source/version 和可解释分数。
- 所有文件删除函数必须区分软删除与物理删除。

### 8.2 关键不变量

1. 已持久化的用户消息不会因 UI 重建消失。
2. 已确认的记忆不可被普通自动抽取静默覆盖。
3. Personal 数据不能通过普通查询、搜索、备份或诊断读取。
4. 原始导入文件路径不能指向缩略图或临时 URI。
5. 非当前 generationId 的 patch 不得改变可见消息。

## 9. 故障处理

| 故障 | 本地动作 | 用户结果 |
|---|---|---|
| 提供商超时 | 标记 recoverable_interrupted，尝试一次续接/重试 | 显示继续或重试 |
| App 被杀 | 从持久化阶段恢复 | 重进线程后保留部分回答 |
| 数据库锁等待 | 记录等待指标，按事务重试策略处理 | 不丢数据，必要时提示稍后 |
| 文件复制失败 | 保留已复制文件和失败项 | 可重试，不产生伪成功记录 |
| Personal 锁定 | 撤销 token、关库、清缓存 | 后台任务不能继续写入 |
| 上下文超限 | 动态块优先裁剪 | 保留当前问题、摘要桥和安全块 |

## 10. 设计决策记录

| 决策 | 原因 | 代价 |
|---|---|---|
| SQLite 本地优先 | 低延迟、离线可用、隐私边界清晰 | 迁移和备份复杂 |
| 稳定/动态提示分层 | 提供商前缀缓存和可预测裁剪 | 需要维护版本与纯度检查 |
| 记忆不直接执行指令 | 防止提示注入和事实越权 | 需要额外的使用契约 |
| 软删除 | 防误删、便于恢复 | 需要回收站和清理策略 |
| 单线程单任务 | 保证消息顺序和恢复一致 | 并行生成场景受限 |

## 11. 当前未闭环项

- 真实设备导出→清空/重装→导入的全链路验证。
- AI 文档统一入口、术语更新和跨材料搜索。
- 服务端 AI 网关尚未立项，不应在客户端实现中预设云端持久化。
- Live2D 资源保留但不纳入稳定架构承诺。

## 12. 模块级内部接口

### 12.1 Chat Domain

输入是 space + threadId + userMessage + requestOptions，输出是本地消息 ID、generationId 和可订阅的状态流。Chat Domain 不负责直接拼接系统提示词，也不直接读文件；它调用 Prompt、Retrieval、Memory 和 Provider 领域接口。

关键不变量：

- threadId 必须属于传入 space；
- 当前分支必须存在且可从根消息追溯；
- 用户消息写入成功后才允许进入 Provider；
- generationId 在一个线程内唯一，且迟到事件不能覆盖新一代生成。

### 12.2 Prompt Domain

Prompt Domain 接收角色快照、授权材料、记忆计划、历史窗口、运行时事件和当前问题，输出：

~~~ts
type BuiltPrompt = {
  system: string;
  user: string;
  promptLayers: PromptLayer[];
  stableSystemBlocks: PromptBlock[];
  cacheMetadata: PromptCacheMetadata;
};
~~~

它不能执行工具、发送网络请求或写业务表；只负责可重复的编译、预算适配和来源元数据。

### 12.3 Memory Domain

Memory Domain 对外暴露“抽取、确认、冲突处理、检索、投影、撤销”接口。任何自动维护操作必须带 extractorVersion、projectionVersion 和 sourceMessageId；用户操作必须保留审计事件。

### 12.4 Material Domain

Material Domain 负责文件复制、元数据、缩略图、文档解析、分块、索引和引用。文件服务返回受管路径句柄，而不是允许 UI 保存任意 URI。

### 12.5 Diagnostics Domain

Diagnostics Domain 只接收结构化事件，做字段白名单、脱敏、批写、窗口聚合和保留清理。业务模块不得把异常对象直接序列化后写入诊断。

## 13. 关键时序

~~~mermaid
sequenceDiagram
  participant U as 用户
  participant UI as ChatScreen
  participant C as ChatService
  participant DB as SQLite
  participant P as PromptBuilder
  participant R as Retrieval/Memory
  participant A as Provider
  participant S as StreamingRuntime

  U->>UI: 点击发送
  UI->>C: sendMessage(space, thread, text)
  C->>DB: 写入 user message + assistant placeholder
  C->>R: 计划记忆与材料检索
  R-->>C: candidates + evidence + diagnostics
  C->>P: 编译稳定层/动态层
  P-->>C: BuiltPrompt + cacheMetadata
  C->>A: 发起流式请求
  A-->>C: first byte / delta
  C->>S: patch(generationId, delta)
  S-->>UI: 页面活跃时发布可见 patch
  C->>DB: 周期性 flush / terminal persist
  C-->>UI: ui_stable
~~~

任何箭头失败都必须有本地状态：DB 失败进入持久化错误；检索失败退回无检索或关键词模式；Provider 失败进入 recoverable_interrupted；UI 不活跃只暂停发布，不暂停必要持久化。

### 13.1 Personal 锁定

~~~mermaid
sequenceDiagram
  participant U as 用户
  participant P as PersonalService
  participant T as TaskToken
  participant J as BackgroundJobs
  participant DB as Personal DB
  participant C as MemoryCache
  U->>P: 锁定
  P->>T: invalidate()
  P->>J: requestStopOrQuiesce()
  J-->>P: tasks settled / recoverable
  P->>C: clear personal memory
  P->>DB: close()
  P-->>U: 返回普通空间
~~~

如果任务在等待状态而非可安全停止，锁定流程先撤销 token，再等待任务到达 checkpoint；超时则留下可恢复状态，不能强行继续写入。

## 14. 一致性与事务模型

### 14.1 消息写入

用户消息、助手占位消息、分支版本和 generation 初始记录必须在同一事务内完成。流式正文采用增量更新，但最终状态、完成时间、错误原因和摘要桥必须在终态事务内一致提交。

### 14.2 导入写入

文件复制不放进 SQLite 事务，但必须有 staging 记录。数据库事务只提交已完成复制和校验的文件。事务提交后再异步生成可选预览；若预览失败，原文件仍是有效资产。

### 14.3 备份恢复写入

恢复过程按“基础实体→关系→多态 JSON 引用→FTS 重建”顺序执行。所有导入 ID 映射写入导入会话表，失败时按会话清理新记录和新文件，不删除目标空间已有内容。

## 15. 迁移策略

1. 每个 migration 必须可重复执行，先判断版本下限或字段/索引是否存在。
2. 新字段提供默认值，避免旧记录在读取时出现 undefined 业务分支。
3. 大表迁移分阶段执行，迁移期间不启动依赖新字段的后台任务。
4. 迁移失败保留原数据库副本和版本号，下一次启动可继续或回滚。
5. migration 完成后写入 schemaVersion 和诊断事件，便于定位“只在新安装失败/只在升级失败”。

## 16. 性能复杂度与上限

| 操作 | 目标复杂度/上限 | 设计原因 |
|---|---|---|
| 图片分页 | O(pageSize)，约 48 项 | 不扫描累计列表 |
| 图片阅读器锚点 | O(anchorWindow)，约 81 项 | 保持首屏和前后翻页 |
| 视频播放器池 | 最多 5 个槽位 | 控制解码和内存 |
| 记忆候选 | 最多 20 评估、6 注入 | 控制 prompt 和排序成本 |
| 材料检索 | 默认最多 6 个片段 | 控制上下文噪音 |
| 导入文件 worker | 最多 4 个 | 防止磁盘和内存争用 |
| 诊断事件 | 最多 20,000 条或 7 天 | 控制本地增长 |

## 17. 故障定位方法

### 17.1 用户说“消息丢了”

依次检查：消息是否写入、generationId 是否存在、最后一次 flush 时间、终态是否提交、线程/分支是否匹配。不能先从 UI 快照判断，因为 UI 可能因刷新暂时覆盖未落库内容。

### 17.2 用户说“角色变了”

检查 roleSnapshot hash、prompt layer versions、当前分支、记忆 projectionVersion、retrieval scope 和是否误启用实验模式。若 stable_role hash 不变而回答变化，应进一步检查 Provider、模型参数和动态层。

### 17.3 用户说“Personal 内容出现在普通空间”

立即停止相关任务，检查 route space、database handle 注册、文件目录、缓存 key、诊断 payload 和备份类型。该问题属于 P0，不能以清缓存或刷新页面作为关闭条件。

## 18. 架构取舍说明

### 18.1 双数据库与单库空间字段

单一数据库增加 space 字段可以减少连接和迁移对象，但任何遗漏空间过滤条件的查询都可能造成跨空间读取。Pixory 采用普通空间与 Personal 分库、分文件目录，并要求领域接口显式携带 space，以形成数据库、文件、路由和服务接口的纵深隔离。该方案增加了备份、迁移和跨空间移动的复杂度，但更符合私密数据的风险等级。

### 18.2 页面失焦与生成任务生命周期

页面失焦只表示当前页面不应继续执行高频可见渲染，并不等于用户放弃生成。因此系统暂停 UI patch 发布，但继续执行必要的网络接收和本地持久化，用户返回后可以恢复完整内容。只有用户主动停止、空间锁定或生命周期策略明确要求时才终止请求。

### 18.3 有界并发与全量并发

SQLite 单连接事务、文件 IO、视频解码和 Personal 锁定具有顺序或资源限制。系统只对边界明确、可取消且互不覆盖的任务采用有界并发；涉及事务一致性、同一线程写入和空间关闭的操作采用队列或顺序执行，以确保失败可回滚、状态可解释。
