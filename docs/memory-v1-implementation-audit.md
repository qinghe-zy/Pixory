# Memory v1 实施审计

日期：2026-07-27  
基线：`D:\Project\pixory_research\reports\pixory-memory-system-implementation-spec-v1.md`

## 当前结论

Memory v1 的 P0 代码链路、类型检查和仓库自动化测试已闭合。全量测试已迁移到新契约，不再存在“为了旧版静态断言回退实现”的问题。

当前不能标记为发布验收完成：真实 Android V46→V48 升级、Personal 授权交互、provider cached tokens 对账，以及成本/TTFT/召回质量基线仍需要设备、provider 和对抗数据集。

## 交付范围

| Spec 主题 | 实施位置 | 结果 |
| --- | --- | --- |
| Claim/Event/Evidence/Outbox 账本 | `src/ai/memory/memoryFacade.ts`, `memoryEventRepository.ts`, `memoryProjectionService.ts` | 语义写入统一经过 Facade；命令 aggregate ID 与事件键均可确定性重放 |
| 全量 v1 DDL | `src/database/schema.ts` V47/V48，`src/database/db.ts` | claims、events、evidence、outbox、episode、关系、profile、看板、current-turn、ontology、embeddings、lineage、迁移记录均有 DDL/索引 |
| 可重建投影 | `memoryProjectionService.ts`, `tests/ai-memory-projection-rebuild-policy.test.cjs` | Claim、看板、FTS、episode、关系状态、profile 均可从事件重建；破坏性事件同步清理投影 |
| canonicalClaimId | `memoryCanonicalization.ts` | NFKC、中文空白、谓词别名、对象/时间归一化和固定 tuple SHA-256 |
| confidence / 三车道 | `memoryTypes.ts`, `memoryCalibrationService.ts`, `memoryFacade.ts` | band 控晋升，校准值只控排序；Confirmed importance ≥60、每作用域 64、回收到 80%、Working 14 天 TTL |
| 确认与安全治理 | `memoryTypes.ts`, `memoryFacade.ts` | 自动确认不产生 manual lock；`safety_pending` 只有用户可确认；冲突保留显式事件 |
| current-turn / 轻抽取 | `memoryIntentDetector.ts`, `memoryCurrentTurnRepository.ts`, `localFastExtractor.ts` | 回答落盘写观察，下一轮 drain；7 天/20 轮；短中文偏好与前置过敏表达有本地兜底 |
| 低误伤意图 | `memoryIntentDetector.ts`, `memoryRetrievalService.ts` | 普通“删除文件”“我现在去吃饭”不触发记忆破坏；模糊 forget 最多定位一条最近线程 Claim |
| 无 Embedding 检索 | `memoryRetrievalService.ts`, `contextCompiler.ts` | FTS/词面检索可独立运行；无词面或语义证据时禁止靠重要度/新近度注入无关记忆 |
| 生成侧使用契约 | `contextCompiler.ts`, `aiChatService.ts` | assert/hedge/ask-before-action/do-not-use；证据 ID；参考资料非指令 |
| ContextPlan / 缓存 | `memoryContextPlanService.ts`, `aiChatService.ts` | 回答快照保存 projection/lineage、候选/选中/遗漏、证据、segment hash、cache tier、provider cached tokens；Personal 不存完整 system prompt |
| 看板闭环 | `AiMemoryBoardScreen.tsx`, `aiMemoryService.ts` | 两区页面；编辑、确认、作用域、删除走 Facade 和 expectedVersion；usage touch 也收口到 Facade |
| 旧数据迁移 | `memoryMigrationService.ts`, `aiMemoryService.ts` | `ai_memories` 适配为 `mclaim_legacy_*`；旧自动记忆不直接升级 Confirmed；v1 读取失败可回退旧投影 |
| v2/v1/外部导入 | `nativeMemoryPackage*`, `legacyMemoryAdapter.ts`, `aiContinuityImport*` | v2/v1 零模型；外部文本为可选结构恢复 + 候选抽取 + 独立审核，模型输出再过 evidence/scope/manual-lock 代码校验；pending 审核同进程去重并由后续后台维护续跑，failed 不自动重试；迁移提示词只允许 user/assistant，违规 system 仍由解析器降为 untrusted context；Personal 每包授权 |
| 导入恢复/回滚 | `nativeMemoryPackageImportService.ts`, `aiContinuityImportService.ts`, `aiContinuityImportReviewService.ts` | 消息投影事务化；pending→accepted；中断可复用原分支重试；Claim/episode/关系/profile 全部映射并可事件化回滚；外部 profile 同步 v1 账本，review 映射按 session 隔离 |
| 删除/备份 | `memoryFacade.ts`, `backupService.ts` | Claim/看板/FTS/Embedding 同步清理、epoch 递增、删除证明；备份包含账本/current-turn/lineage/导入映射/删除证书 |
| 关系状态 | `memoryRelationalStateService.ts`, `aiMemoryService.ts` | 本地信号累积、证据上限、半衰期衰减、弱背景注入；写入与删除均进入事件账本 |

## 15 条工程不变量核对

| # | 结论 | 证据或边界 |
| --- | --- | --- |
| 1 | 代码已满足 | 原消息/导入原文作为 evidence/source 保留，投影不回写原文 |
| 2 | 代码已满足 | Claim、episode、关系、profile 的语义状态均由 `memory_events` 投影；`lastUsedAt` 仅是 Facade 内遥测触碰，不改变语义版本 |
| 3 | 代码已满足 | SQLite 行为测试验证全量重建与旧投影清除 |
| 4 | 代码已满足 | 业务模块不再直接写 v1 语义投影；Facade 是命令入口，ProjectionService 是事件消费者 |
| 5 | 代码已满足 | deleted/suppressed/superseded 同步移除看板与 FTS，检索/导出再按状态过滤 |
| 6 | 代码已满足 | manualLocked 的非用户修改/删除被拒绝；导入回滚显式作为用户操作 |
| 7 | 代码已满足 | canonical 唯一约束包含 scopeType/scopeId，不跨作用域自动合并 |
| 8 | 代码已满足 | 非事实 speechMode 不能自动晋升；本地明显玩笑/假设不抽取 |
| 9 | 代码已满足 | v2/v1 导入路径无 `callMemoryMaintenanceModel` |
| 10 | 代码已满足 | 外部审核只产生 proposal，最终写入经过校验与 Facade |
| 11 | 代码已满足 | reasoning/thinking 只保存/显示，不传给抽取、检索或普通 Prompt |
| 12 | 代码已满足 | ContextPlan 携带 projectionVersion/lineageVersion；分支切换同步递增 lineage |
| 13 | 代码已满足 | no-Embedding 策略测试覆盖检索、看板写入和删除不依赖向量 |
| 14 | 待真实测量 | 已有成本信封函数和调用计数点；仍需 7 天真实生成/维护成本数据验证 ≤15% |
| 15 | 待真实测量 | 同步关键路径只保留本地意图判断；仍需 Android 普通聊天 TTFT p95 验证 ≤基线×1.05 |

## Task 1–7 验收状态

| Task | 自动化结论 | 尚需环境验收 |
| --- | --- | --- |
| 1 数据库/账本 | DDL、索引、ontology、lineage、幂等键、投影重建测试通过 | V46→V48 真机升级与二次启动 |
| 2 抽取/队列 | current-turn、TTL、Personal gate、thinking 排除测试通过 | Android 后台/离开会话调度与 TTFT |
| 3 检索/Context | no-Embedding、无噪声准入、小上下文预算、ContextPlan 契约通过 | 真实 lexical recall@k 和 provider cache 对账 |
| 4 看板 | 两区 UI 与 Facade 写入契约、版本冲突路径通过 | Android 实机编辑/删除/作用域交互 |
| 5 三路导入 | v2/v1 零模型、Personal 授权、外部三阶段职责、原生恢复/幂等/全量回滚和 session 隔离通过 | 真实文件选择、授权拒绝/允许、页面刷新 |
| 6 删除/备份 | FTS/投影清理、删除证书、备份清单、回滚映射通过 | 真实备份恢复后重建和 deleted-memory revival 对抗 |
| 7 测试/观测 | TypeScript、45 项重点链路和 722 项全量测试通过；诊断纯函数可执行 | P0 合成对抗集与 7 天观测窗口 |

## 自动化验证

最近一次全量结果：

```text
pnpm typecheck
pnpm test

tests 722
pass 707
fail 0
skipped 15
```

45 项重点链路覆盖 schema、账本、投影重建、current-turn、检索、三路导入和连续性恢复。其中包含“外部迁移提示词仅允许 user/assistant transcript”、候选/审核职责分离、pending 审核恢复、外部 profile 账本同步和 session 级回滚隔离的回归测试。`git diff --check` 在最终文档更新后重新执行。

仓库没有 `lint` script；`pnpm lint` 会误调用 Android SDK 裸命令并输出 usage，因此不计为项目 lint 结果。当前可用的静态验证命令是 `pnpm typecheck`。

## 未完成的真实环境门槛

- Android 真机/模拟器执行 V46→V48 升级，并连续启动两次确认迁移幂等。
- 在 UI 上验证 Personal 外部导入拒绝、单包允许、撤销后再次拒绝。
- 使用真实 OpenAI-compatible provider 对账 ContextPlan 与 provider reported cached tokens。
- 运行 P0 合成对抗集，计算 lexical recall@k、误记率、stale/contradiction/scope leakage 和删除复活率。
- 收集普通聊天 TTFT p95 与滚动 7 天维护成本占比，达到 Spec 硬门槛后才能宣布发布验收完成。
