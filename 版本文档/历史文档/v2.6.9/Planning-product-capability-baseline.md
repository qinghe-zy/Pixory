# Pixory 产品能力基线

- 基线日期：2026-07-13
- 适用版本：Pixory 2.6.5
- 基线提交：`876146d10b8cf775f584e35b83af95370fe82eb0`
- 功能状态索引：[`docs/feature-matrix.md`](feature-matrix.md)

## 1. 用途与边界

本文档保存本轮源码级扫描的事实、证据入口、产品结构观察和风险，用于后续版本做增量复核。它不是发布宣传文案，也不代表所有代码都已经在真实设备完成端到端验证。

Pixory 当前仍以 Android-first 的陪伴型 AI 聊天为产品中心，IP 素材库是本地资料和隐私基础。计划单独开发的新 AI 软件是另一个独立项目，不计入本基线，也不默认与 Pixory 互通数据。

桌宠代码虽然存在，但因缺少合适且权属清晰的正式素材，当前明确不予上线。

## 2. 扫描规模与证据

本轮按 `rg --files` 统计：

| 范围 | 文件数 | 说明 |
| --- | ---: | --- |
| `src/` | 306 | 应用源码总量 |
| `src/screens/` | 63 | 页面与主要用户入口 |
| `src/components/` | 89 | 通用组件与 AI 组件 |
| `src/ai/` | 66 | provider、prompt、memory、RAG、streaming 等 |
| `src/database/` | 19 | SQLite、repository 和迁移相关代码 |
| `src/services/` | 27 | 导入、备份、存储、更新等业务服务 |
| `tests/` | 67 | 逻辑测试与源码/策略契约测试 |

关键入口：

- 应用导航、空间锁定、外部 intent 与更新：`App.tsx`。
- AI 聊天主交互：`src/screens/AiChatScreen.tsx`。
- AI 核心能力：`src/ai/`、`src/components/ai/`、`src/screens/Ai*.tsx`。
- SQLite 与数据仓库：`src/database/`。
- 文件、备份、导入、隐私与存储：`src/services/`。
- 发布与对外文档：`app.json`、`android/`、`docs/`、`AGENTS.md`。

## 3. 已实现能力摘要

### 3.1 AI 聊天与模型

- DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude，多 provider 配置、模型验证、流式输出和按空间隔离的 SecureStore API Key。
- 长线程、停止、继续、重试、再生成、改写、已完成回复续答/历史回复分流、AI 帮答、图片多模态和文档附件上下文。
- stable/dynamic prompt 分层、角色 frame、记忆、检索资料、历史窗口、当前请求和上下文预算。
- generationId 隔离、外部 streaming store、合批 UI/SQLite 更新、tail replay、后台 flush、停止/失败/完成终态和恢复逻辑。

### 3.2 角色、连续性与记忆

- 手动角色卡以及 SillyTavern PNG/JSON V1/V2/V3 导入，保留 source JSON、头像、标签和首句。
- SillyTavern PNG 导出与续聊 Markdown 导出。
- 续聊 Markdown 会导出当前线程摘要、画像上下文、active memory 和上一轮对话；重新导入时可解析原生 payload，并经审读门禁分别写入 summary/profile/memory。这是现有的记忆导入导出路径，不是独立的任意记忆库格式。
- Pixory 原生续聊包精确导入、外部 TXT/Markdown 接回、模型辅助结构恢复、独立分支接续、审读门禁和 10 轮回退窗口。
- 全局、线程、角色、IP、知识库作用域记忆；手动与自动记忆、画像、摘要、维护队列、编辑、删除、过期标记和近期撤销。

### 3.3 资料、知识库与引用

- 手动文本、TXT、Markdown、PDF、DOCX，支持受管目录复制、解析、切片、embedding、keyword/hybrid retrieval 和阅读器。
- 线程材料、IP snapshot、知识库三种主要资料范围；严格资料模式、citation 对齐和原文片段阅读。
- 材料记录支持跨空间移动和删除；产品帮助文档支持应用内 Markdown 阅读与远程图片本地缓存。

### 3.4 分支、检索与使用分析

- 编辑/再生成产生消息版本和分支路线，支持路线树和采用主线。
- 当前路线聊天搜索、assistant 消息收藏、线程与总体 provider usage/cached token 统计。
- Markdown、代码、表格、数学、HTML/CSS WebView、图片画廊、citation 和 thinking block 渲染。

### 3.5 本地素材与隐私基础

- IP、分组、标签、图片/视频、收藏、最近查看、全局搜索、批量管理、重复检测、软删除回收站。
- 导入时复制原文件到应用目录，原图不压缩、不裁剪、不覆盖；缩略图与预览独立生成。
- normal/personal 双数据库和双文件根目录、密码、自动锁定、任务 token 与隐私渲染保护。
- Android 分享/open-with、资源包导入、存储统计、更新检查、公告、官网与 Android 发布流程。

## 4. 当前产品结构观察

这些是基于现有入口和信息架构的产品判断，不等于缺陷已经修复：

- 初始路由仍落在素材首页，底部导航为“首页 / 整理 / 聊天 / 我的”，AI 虽是战略中心但不是第一入口。
- AI 首页使用“AI 工作台”心智，集中角色、最近线程、IP 聊天、知识库、总资料和历史，能力丰富但首次理解成本较高。
- Provider、会话、隐私、备份和存储设置分散；“我的”页面仍较偏素材管理，统一设置入口尚未形成。
- 陪伴天数和里程碑入口位于关于页深处，还没有成为日常关系循环的一部分。
- 会话设置一次暴露较多高级选项。底层已经具备角色、记忆、关系历史和里程碑数据，但尚无顶层、用户可感知的“关系”产品实体。

## 5. 文档流现状与缺口

当前存在三条彼此独立的文档链路：

1. 产品帮助：`docs/manual.md` → 官网 `manual.html` 动态读取；应用内使用 `src/content/productManualMarkdown.ts` 内嵌副本，并缓存官网图片。
2. 用户 AI 资料：手动文本/TXT/MD/PDF/DOCX/IP snapshot → 受管复制 → 解析/切片/索引 → 线程/IP/知识库作用域 → 检索/citation/reader。
3. 工程和发布文档：`README.md`、`docs/feature-matrix.md`、本基线、发布页面与版本 JSON。

已经打通的是导入、私有目录复制、解析重试、切片、embedding、作用域绑定、检索、引用、阅读、移动和删除。尚未闭环的是：

- “资料、材料、资料库、总资料库、文档、附件”等术语和入口不统一。
- 缺少统一资料中心、待整理收件箱和跨线程/IP/知识库的全局资料搜索。
- 缺少内容 hash、文档版本、来源修改时间、更新检测和同步状态。
- citation 主要解决来源标记，页码/版本/检索理由等可解释性仍不足。
- 阅读器缺少直接引用到聊天、创建记忆、发起追问等后续动作。
- 产品帮助文档没有进入上下文帮助，也不自动成为系统知识库。
- AI 文档文件、聊天附件和角色头像尚未进入完整备份恢复链路。

未来建议使用统一“资料对象”组织生命周期：`收件箱 → 受管复制/hash/去重 → 解析/OCR → 作用域确认 → 索引 → 引用 → 版本更新 → 备份/恢复`。这是后续方向，不是当前已实现能力。

## 6. 已知高风险与验证限制

### 6.1 备份文件覆盖缺口

`fileStorageService` 已定义 `ai_documents` 与 `ai_role_avatars` 目录，线程附件也存入 AI 文档目录；但当前 `backupService` 创建普通/隐私备份时只复制数据库、原图和缩略图。结果是数据库记录可以恢复，关联 AI 文档、附件或角色头像文件却可能缺失。

在补齐文件清单、manifest、冲突处理和删除行为，并完成真实设备导出/恢复验证前，备份状态保持“部分实现”。

### 6.2 代码热点

- `App.tsx` 集中导航、空间、intent 和更新等多种职责，改动容易产生跨域回归。
- `AiChatScreen.tsx` 约 6745 行，是聊天生命周期、分支、流式 UI 和页面状态的主要风险热点。

后续改造应优先提取稳定边界、保持可回滚，避免在一次功能迭代中进行无关大重构。

### 6.3 测试证据边界

现有 67 个测试文件大量使用源码读取和正则断言来保护策略/结构契约，其中也包含解析器、store 等真实逻辑测试。它们适合阻止关键代码形态回退，但不能替代以下验证：

- 真实 SQLite 迁移与大数据量线程。
- Android 前后台、进程终止和流式恢复。
- 真实文件导入、备份、清空/重装、恢复和 URI 可用性。
- 不同 provider 的网络错误、限流、超时和流式协议差异。

### 6.4 AI 记忆上下文设计问题清单（追加审查：2026-07-26）

本节只记录当前源码审查发现的问题，不表示已经修复。问题关闭前，应补充对应实现、回归测试和验证证据。

| 编号 | 级别 | 状态 | 问题 | 证据入口与影响 |
| --- | --- | --- | --- | --- |
| AIMEM-001 | P1 | 待修复 | 默认历史窗口为 30 轮，但摘要压缩要到未压缩轮数超过 50 才触发；在 31～50 轮期间，早期对话可能既不在历史窗口也不在摘要中。用户把历史窗口调小后，缺口会进一步扩大。 | `src/ai/aiContextSettings.ts`、`src/ai/aiMemorySummaryService.ts`。会话事件、关系状态和情绪连续性可能丢失，FTS 只能按关键词偶然找回。 |
| AIMEM-002 | P1 | 待修复 | 自动画像、本地降级摘要和自动记忆会进入 `memory_snapshot` 的 System 前缀；当前安全说明不能阻止历史文本中的祈使句或提示注入内容在后续请求中获得更高通道优先级。 | `src/ai/promptBuilder.ts`、`src/ai/aiMemorySummaryService.ts`、`src/ai/aiMemoryProfileService.ts`。过去的对话内容可能污染角色规则、安全边界或当前回复行为。 |
| AIMEM-003 | P1 | 待修复 | 记忆来源分支的可见性只在来源消息属于当前线程时进行判断；来源属于其他线程时会直接视为可见。共享 IP/角色/知识库记忆因此缺少来源分支语义。 | `src/database/repositories/aiThreadRepository.ts` 中的 `buildMemorySourceVisibilityClause`。废弃分支产生的共享记忆可能进入其他线程。 |
| AIMEM-004 | P2 | 待修复 | 动态记忆检索存在两套实现；主聊天链路使用 `aiChatService.ts` 内的实现，而带有显式 scope 优先级的实现位于 `aiMemoryService.ts`，未成为唯一运行时入口。 | `src/ai/aiChatService.ts`、`src/ai/aiMemoryService.ts`。实际运行时可能让全局/低优先级记忆凭相关性或重要度挤过线程/IP 记忆；现有策略测试可能覆盖错实现。 |
| AIMEM-005 | P2 | 待修复 | 稳定记忆快照与动态记忆检索没有按记忆 ID 去重，同一条记忆可能在 System 稳定前缀和 User 动态上下文中重复注入。 | `src/ai/aiMemoryService.ts`、`src/ai/promptBuilder.ts`。浪费上下文预算，并放大某条记忆对模型行为的影响。 |
| AIMEM-006 | P2 | 待修复 | `profileText` 同时承担自动生成画像和用户手动画像文本；自动维护会覆盖该字段，下一次维护又会把生成文本作为“用户手动画像”输入。画像 JSON 也只做浅层校验。 | `src/ai/aiMemoryProfileService.ts`。用户确认内容与模型推断内容无法稳定区分，模型返回形状异常时维护任务可能失败。 |
| AIMEM-007 | P2 | 待修复 | 数据模型支持 role/knowledge_base 作用域，但常规记忆提示词和抽取链路只允许 ip/thread，记忆看板也没有对应的创建/治理入口。 | `src/ai/aiMemoryReconciliationService.ts`、`src/ai/aiMemoryCaptureService.ts`、`src/screens/AiMemoryBoardScreen.tsx`。作用域设计与实际产品能力不一致，相关字段主要停留在导入或边缘路径。 |
| AIMEM-008 | P2 | 待清理/确认 | `ai_thread_summaries` 会被维护流程写入，但主提示词实际读取的是 `ai_thread_summary_segments`；两套摘要模型的职责和生命周期没有完全收敛。 | `src/database/schema.ts`、`src/database/repositories/aiThreadRepository.ts`、`src/ai/aiMemoryCaptureService.ts`、`src/ai/aiMemoryService.ts`。增加维护复杂度，容易出现“已生成但未参与上下文”的假闭环。 |

## 7. 2026-07-13 验证基线

源码审计完成时已经执行：

- `pnpm typecheck`：通过。
- `pnpm test`：通过，646/646。
- `git diff --check`：通过。

本轮为文档固化，不修改产品行为；交付前仍需重新执行上述命令，避免应用内 TypeScript 手册字符串出现语法或转义错误。

文档固化完成后已重新验证：

- `docs/manual.md` 与应用内 `PRODUCT_MANUAL_MARKDOWN` 去除模板包装和反引号转义后，275 行正文完全一致。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，646/646。
- `git diff --check`：通过；仅提示 Git for Windows 后续可能把工作区 LF 转为 CRLF，没有空白错误。

## 8. 下次升级如何增量复核

### 8.1 确定范围

先读取本基线与功能矩阵，再执行：

```powershell
git diff --name-only 876146d10b8cf775f584e35b83af95370fe82eb0..HEAD
git log --oneline 876146d10b8cf775f584e35b83af95370fe82eb0..HEAD
```

如果本文件后续更新了“基线提交”，使用最新值替换命令中的提交。

### 8.2 按风险顺序核对

1. 数据库 schema/migration/repository 与 space 隔离。
2. AI prompt、memory、RAG、branch、streaming 与 provider。
3. 备份、导入导出、文件目录、删除和存储统计。
4. 页面、导航、空状态、设置入口和用户术语。
5. Native bridge、Android 配置、更新/公告/发布流程。
6. 对应测试、README、产品手册和发布说明。

### 8.3 证据标准

- 每个新增能力必须能指出用户入口、核心实现文件和验证方式。
- 代码存在但被 feature flag、素材、权限或发布决策阻断时，标记“实验/不上线”。
- 只有部分数据或文件被覆盖时，标记“部分实现”，不得用“完整”“全部”“无损迁移”等无边界表述。
- 运行时无法确认的行为标记“待验证”，不要根据文件名推断上线状态。

### 8.4 收尾验证

```powershell
pnpm typecheck
pnpm test
git diff --check
git status --short --branch
```

把新的验证数量、未验证设备路径、已知风险和最新基线提交更新到本文件。只有发生大规模架构重写、基线证据失效或无法确定增量范围时，才重新全仓扫描。
