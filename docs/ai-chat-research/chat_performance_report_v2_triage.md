# Pixory AI 聊天性能报告 v2 核对表

> 核对日期：2026-08-13
>
> 核对对象：[chat_performance_report_v2.md](./chat_performance_report_v2.md)
>
> 设计说明：[2026-08-11-ai-chat-performance-optimization-design.md](../superpowers/specs/2026-08-11-ai-chat-performance-optimization-design.md)

## 标记说明

| 标记 | 含义 | 实施规则 |
|---|---|---|
| `已验证` | 当前源码中存在报告描述的热路径或复杂度问题 | 可进入第一波，但仍须先写测试和基准 |
| `部分成立` | 问题存在，但报告忽略了已有缓存、快路径或触发条件 | 只处理经测量确认的子问题 |
| `约束冲突` | 原修复方向会撤销既有稳定性设计或产品行为 | 禁止照抄；必须采用替代设计 |
| `不成立` | 当前源码或运行时证据直接否定报告根因 | 不修改生产逻辑，只补必要的回归证据 |
| `待 Android 基准` | 静态代码不足以证明用户可感知收益 | 达到设计文档的性能门槛后才实施 |
| `BLOCKED — 无可用 Android 设备` | 当前没有可用于设备端验收的 Android 设备或模拟器 | 不实施高风险流式、测量或手势重构；记录未验证场景 |
| `路线图候选` | 本轮不实施，尚未完成逐项验证 | 仅保留，不形成当前承诺 |

## 关键结论

- 原报告的 P0/P1 不能作为直接修改清单。按主标记归类，12 项中 4 项可确认存在明确热路径，4 项仅部分成立，3 项的原修复方向与现有稳定性约束冲突，1 项根因不成立；其中多项仍需 Android 真机基准决定是否实施。
- 报告中的收益数字没有配套基线、设备、数据集或采样方法，本轮不把这些数字当作验收标准。
- 当前聊天流式路径分为“位于最新消息处的实时路径”和“用户阅读历史时的分离回放路径”。报告把两者合并描述，夸大了 `AiChatScreen` 在正常实时生成时的重渲染范围。
- `AiChatComposer` 的隐藏文本测量是 2026-07-28 为规避 Android 受控输入漏发 `onContentSizeChange` 而引入的回归修复，不能直接改回原生事件。
- `AiMeasuredStreamBlock` 的 `measure()` 补测是 2026-07-12 为保持流式回放可见区高度稳定而加入的，删除前必须证明 `onLayout` 单源测量不会重新引入回放错位。

## 本轮验收证据

- 第二轮复审最终聚焦套件：146 通过、0 失败、1 跳过；完整 `pnpm test`：1018 通过、0 失败、15 跳过；`pnpm typecheck`、工作区 diff 和从 `5b73674` 起的完整分支 whitespace 检查通过。Node/SQLite 测试只证明语义、回归和有界 SQL 行为。
- 本机 Node `v24.13.1`（Windows）非门禁基准：`scratch/ai-chat-performance-before.json` 的 1MB 混合文本 token 估算中位数为 `6.815ms`，`scratch/ai-chat-performance-final.json` 为 `4.074ms`。二者仅用于确认低分配实现的方向；完整 streaming splitter 重放未改动，不以两次 wall-clock 差异推导收益。
- `adb devices` 未列出可用设备，因此 P0-1、P0-2、P0-4、P1-10、P1-11 和恢复桌宠前的 P1-12 设备端结论均为 `BLOCKED — 无可用 Android 设备`；具体场景见 [chat-performance-wave3-gate.md](./chat-performance-wave3-gate.md)。

## 第二轮全量复审纠偏

- 对照报告、设计、实施计划和实际分支差异后，确认两项数据一致性缺陷：missing-embedding 补全成功时会先删除文档已有的同模型向量；批量 `replaceEmbeddings()` 遇到重复 `(chunkId, providerId, modelId)` 时会留下多条逻辑重复记录，偏离旧实现的 last-write-wins。两项均已先以失败测试复现，再做最小修复。
- 新增 `tests/ai-embedding-service-integration.test.cjs`，直接覆盖 service 层最多 3 个活跃 provider 请求、输入顺序、拒绝/空向量计数和已有向量保留；repository integration 在 normal/personal 两个物理数据库覆盖重复逻辑键。
- P0-6 原文声称的“400 组确定性随机 corpus”在上一轮测试中实际不存在；复审现已补齐 400 组旧二分裁剪等价对照及 1MB 混合语言 fixture。复审 benchmark 为 1MB `5.032ms`、23 code-unit 小输入 `0.121µs`（批量摊销中位数），均为本机 Node 方向性数据，不替代 Android。
- 上一轮完整分支差异仍有 11 处 Markdown 行尾空格，因此“`git diff --check` 已通过”的记录不准确；根因是只检查了未提交增量。本轮清理后将同时检查工作区和从基线到 HEAD 的完整差异。
- 功能矩阵上一轮把 embedding 路径写成“手动生成/不自动启动”，与源码不符：存在可用默认 Embedding 模型和密钥时，材料导入/重解析会自动尝试向量化；普通聊天不会无条件调用。该触发行为早于本性能分支，本轮只修正文档，不改变成本/隐私产品策略。

### 本轮未扩大的既有边界

- OpenAI/Gemini 内置 provider 可带默认 Embedding 模型；是否还需要独立的成本/隐私 opt-in 属于产品决策，不在本轮性能等价修复中擅自改变。
- `ownerEmbeddingAvailabilityCache` 的 false 结果最长保留约 5 分钟且生成后没有主动失效，是原报告 P3-25 的既有候选；本计划明令不实施 P2/P3，故只保留风险，不把它混入 P1 并发修复。
- 本性能 worktree 的 merge base 为 `5b73674`；复审时 `main` 已另有 12 个提交，并同时修改两个 Live2D 入口屏幕。当前分支关闭了运行时，但 `main` 尚未关闭；后续合并必须显式解冲突并重新验证，不能把本分支测试等同于 main 集成验收。

## P0 核对

| # | 报告项 | 标记 | 当前证据 | 决策 |
|---|---|---|---|---|
| P0-1 | 流式气泡 memo + 流式状态解耦 | `部分成立`、`BLOCKED — 无可用 Android 设备` | 正常 bottom-locked 路径通过 `aiStreamingMessageStore` 发布，不调用顶层 `setMessages`；`forceUpdateTailState()` 主要发生在用户离开底部后的 detached replay、测量和债务结算路径。两个 tail wrapper 确实未 `memo`，而 `visibleMessageState` 会随 `streamingTailVersion` 重新派生。 | 未取得 detached replay 的设备端 commit/耗时证据，不实施局部订阅或新 store；解除条件见 `chat-performance-wave3-gate.md`。 |
| P0-2 | 删除 `AiMeasuredStreamBlock` 双重测量 | `约束冲突`、`BLOCKED — 无可用 Android 设备` | `onLayout` 与 rAF `measure()` 共用去重、1dp 抑制和 4dp 累积校正；后者由提交 `c30c488` 为“保持流式回放可见时稳定”加入，并有策略测试固定。 | 保留双重测量；缺少 Android 回放、字体缩放和 promoted block 对照，禁止单源实验。 |
| P0-3 | `AiMessageContent` memo + 正则缓存 | `已实施` | 组件未 `React.memo`，`shouldRenderWholeRichHtml(content)` 每次渲染执行；但非流式 Markdown 已经用 `useMemo`，且存在 120 项 LRU 风格解析缓存；流式消息走轻量纯文本分支。 | 提交 `48e8d8c` 仅将 rich-HTML 判定按 `content` memo，未引入可能破坏内部反馈状态或 `trailingInline` 的组件 comparator；`tests/ai-chat-performance-hardening-policy.test.cjs` 已固定，Android profiler 仍未执行。 |
| P0-4 | Composer 改用 `onContentSizeChange` | `约束冲突`、`BLOCKED — 无可用 Android 设备` | 测量镜像由提交 `53f218c` 主动替换 `onContentSizeChange`；测试明确要求“controlled long text independently from native content-size events”。 | 不采用原建议；无设备时不得推测性改变 Composer，高频输入/粘贴/键盘场景待真机验证。 |
| P0-5 | generation job 改用主键查询 | `不成立` | `ai_generation_jobs.generationId` 声明为 `UNIQUE`。对当前 V55 schema 实测 `EXPLAIN QUERY PLAN` 返回 `SEARCH ai_generation_jobs USING INDEX sqlite_autoindex_ai_generation_jobs_2 (generationId=?)`，不存在报告所称全表扫描。 | 提交 `0e848ff` 以 `tests/ai-generation-repository-integration.test.cjs` 固定 query-plan 断言；保留语义清晰的 `generationId` 查询，无生产 SQL 改动。 |
| P0-6 | 优化 `estimatePromptTokens` | `已实施` | 原实现的 `value.match(CJK_CHAR_PATTERN)` 分配匹配数组，二分裁剪又对多个前缀重复扫描。 | 提交 `e6bb81c` 使用无数组单次扫描和单调前缀搜索；`tests/ai-context-budget-unit.test.cjs`、RAG/prompt-cache 策略及 400 组确定性随机 corpus 保持等价。本机 Node 基准从 `6.815ms` 到 `4.074ms`，仅作方向性证据，Android 收益未验证。 |

## P1 核对

| # | 报告项 | 标记 | 当前证据 | 决策 |
|---|---|---|---|---|
| P1-7 | 嵌入生成并发批处理 | `已实施、复审修正` | 原 `generateMissingEmbeddingsForDocument()` 对每个 chunk 串行 `await adapter.embedText()`，失败只计数；完成后再统一写库。复审发现接入并发后仍保留了“先删文档全部同模型向量”的旧语句，会在仅查询缺失 chunk 的路径误删既有向量。 | 提交 `ee2df51` 提供有序 worker pool，`893959a` 以最多 3 个并发请求接入；复审移除全量删除，只 upsert 本轮成功结果。worker、service integration、RAG policy 和 knowledge SQLite integration 覆盖并发、顺序、失败/空向量、已有向量保留和批量写入。无真实 provider/Android 吞吐证据。 |
| P1-8 | KaTeX 编译缓存 | `已实施` | `AiMathBlock` 原在 render body 执行 `katex.renderToString()` 和 HTML 拼接，WebView 高度回传会触发 `setHeight()` 后重渲染。 | 提交 `3ec69c9` 将编译成功/失败与 HTML 结果按 `math` memo，高度更新不再重复编译；`tests/ai-chat-performance-hardening-policy.test.cjs` 已覆盖，WebView 设备端高度回传仍待验证。 |
| P1-9 | knowledge repository 批量删除/写入 | `已实施、复审修正` | 原 `deleteDocument()` 对每个 chunk 连续执行两次删除，`replaceEmbeddings()` 对每个 embedding 执行 delete + insert。复审确认批量 insert 在重复逻辑键输入下会留下多行，而旧循环语义是最后一条覆盖前一条。 | 提交 `73758f5` 改为 citation 子查询清理及最多 100 条一批的写入；复审在分批前按 `(chunkId, providerId, modelId)` 去重并保留最后输入。integration 固定 normal/personal 的 1000/250 条有界 statement 数、数据完整性和 last-write-wins，删除回归断言由 `b8bbec8` 同步更新。 |
| P1-10 | streaming splitter 增量解析 | `部分成立`、`BLOCKED — 无可用 Android 设备` | detached patch 会把完整 tail 重新传给 `splitStreamingTextIntoBlocks()`，函数重新扫描段落并重建 block；但稳定 blockId、soft segment、测量缓存、promotion 与 shrink debt 都依赖现有输出。 | 未进行 Android 长流等价与帧耗时采样；不实施增量状态机，须在门禁解除后单独立项。 |
| P1-11 | Drawer 迁移 Reanimated | `部分成立`、`BLOCKED — 无可用 Android 设备` | 抽屉用 `PanResponder` 在 JS 线程更新位置，风险描述成立；但迁移会同时影响遮罩、关闭阈值、无障碍和最近会话操作。 | 未验证拖动、scrim、按钮、最近会话操作和 Android 返回；不迁移手势。 |
| P1-12 | 所有 JS 动画开启 Native Driver | `不再适用（系统关闭）` | `resizeHandleOpacity` 与 `petPan` 均随桌宠运行时入口移除；聊天页不再加载模型、注册桌宠监听、创建桌宠动画或手势 responder。 | 提交 `fab5eac` 完全关闭桌宠入口，`tests/live2d-runtime-disabled-policy.test.cjs` 和聊天性能策略测试固定无运行时引用；恢复前须重新建立 Android 验收门禁。 |

## 建议实施波次

### Wave 0：基线与回归保护

- 固定 Android 测试数据：200 条消息、15K 字符富文本、1MB 混合语言 prompt、1000 个 knowledge chunks、持续 detached streaming。
- 记录 JS commit 次数、detached merge 耗时、布局测量差、输入框高度稳定性、SQL query plan、embedding 吞吐与错误分类。
- 所有后续优化都必须先有失败测试或基准，且保留现有流式回放 instrumentation。

### Wave 1：低风险、证据明确（已完成）

1. P0-6 token 估算低分配实现。
2. P1-8 KaTeX 编译 memoization。
3. P1-9 knowledge 批量删除与分批写入。
4. P0-3 中仅经基准确认的 rich-HTML 判定缓存/组件 props 稳定化。

### Wave 2：受控并发与局部渲染（部分完成）

1. P1-7 embedding provider-aware 有界并发已完成；重试/退避留在 P2。
2. P0-1 detached tail 的局部订阅、稳定回调和 wrapper memo 尚未实施；是否引入 `useSyncExternalStore` 必须由 Android Wave 0 数据决定。
3. P1-12 的独立 opacity 调整已被桌宠运行时整体关闭取代；不保留独立动画路径。

### Wave 3：高风险交互与流式架构（Android 门禁阻止）

1. P0-2 流式测量单源实验，仅在真机证据支持时落地。
2. P1-10 增量 splitter 与 append-only tail merge。
3. P1-11 Drawer 手势迁移。
4. pet PanResponder/Reanimated 统一迁移。

本轮未检测到可用 Android 设备，因此 P0-1、P0-2、P0-4、P1-10、P1-11 和完整 P1-12 迁移均不得开始。验收项和解除顺序见 [chat-performance-wave3-gate.md](./chat-performance-wave3-gate.md)。

## P2/P3 路线图标记

以下项目本轮统一标为 `路线图候选`，不进入当前实施承诺：角色卡聚合去除、`ai_chunks` FTS5、历史页虚拟化、键盘系统统一、tail Map 优化、跨空间迁移批量化、embedding 重试、native-stack/Expo Router 迁移、根状态下沉、首页刷新监听、分批导出、provider 流解析、Memory/Material 页面虚拟化、ThinkingBlock 动画与 FlashList 评估。

其中“订阅为 0 自动终止生成”与 Pixory 的可恢复/后台继续生成方向存在产品冲突，必须先明确后台生成策略，不能作为纯性能优化实施。导航迁移与根状态下沉属于独立架构项目，应另写规格与计划。

## 文档维护规则

- 实施某项后，把对应标记改为 `已实施`，补充提交 hash、测试命令、Android 验证设备和基准结果。
- 若 Android 基准未复现问题，把条目标为 `未复现`，保留证据，不做推测性修改。
- 用户可见行为、数据模型、隐私/备份边界发生变化时，同一提交更新 `docs/feature-matrix.md`；仅新增审阅/计划文档时不更新 feature matrix。
