# DeepSeek 缓存与情感上下文边界设计

日期：2026-07-29

状态：设计方向已确认，等待全部相关代码合并到 `main` 后重新审计并编写实施计划。

## 1. 文档目的

本文件保存 Pixory 针对 DeepSeek 流式聊天、Provider 前缀缓存、记忆三车道和情感运行时的已确认优化方向，避免后续代码合并或会话切换后丢失上下文。

本文是设计规格，不表示相关运行时代码已经实现。开始实施前，必须以最新 `main` 的源码、数据库 schema、测试和真实 DeepSeek 用量字段为准重新核对接入点。

## 2. 已确认目标

主目标是降低用户感知的首 Token 延迟，而不是单纯追求更高的缓存命中率。

缓存优化必须服从以下体验和正确性目标：

- 不破坏角色人设稳定性、一致性和长期沉浸感。
- 不削弱现有 Working / Confirmed / Archive 记忆治理结构。
- 不把实时情绪、关系状态或当前 stance 冻结为过期上下文。
- 不为了缓存命中而延迟 correction、boundary 或 repair 在当前轮生效。
- 不新增发送前远端情感分析或其他阻塞式模型调用。
- Personal space、普通空间、角色、线程和分支的隔离规则保持不变。
- Provider 缓存只复用输入前缀，不缓存私人陪伴回复作为最终答案。

命中率是解释性能和成本的诊断指标，不是可以凌驾于聊天质量之上的 KPI。

## 3. 当前代码事实

本节记录 2026-07-29 审查当前工作树得到的事实。代码合并后必须重新验证，不能把这里的路径和结论当作永久事实。

### 3.1 已有基础

- Prompt 已有稳定到动态的逻辑分层，并计算稳定前缀 hash。
- Confirmed 记忆已经作为稳定记忆前缀的主要来源，Working 和 Archive 不应直接进入稳定前缀。
- Provider 请求已经支持流式返回。
- OpenAI-compatible 路径已有部分 `stream_options.include_usage` 和缓存观察基础。
- 现有设计文档已经要求情绪变化不得改变 `stablePrefixHash`。

### 3.2 当前缺口

- `memory_snapshot` 仍可能混入 `companionMemoryPrefix`、自动画像、摘要或关系类动态信息；这些内容发生变化时会提前打断可复用前缀。
- 当前历史构建仍以数据库消息的原始 `message.content` 为主，而本轮 Provider 实际看到的用户输入可能包含动态记忆、检索上下文和回复约束包装。下一轮若不能重建完全一致的历史消息，DeepSeek 的逐轮公共前缀会在该位置中断。
- DeepSeek 原生缓存字段尚未形成可信、完整的观测闭环。未观测不能等同于命中为零。
- 稳定记忆和动态召回可能重复注入同一 claim，既浪费 Token，也会放大某条记忆对回复的影响。
- 当前完整四维情绪、关系投影和 stance planner 主要存在于运行时规格中；开始缓存实施前，需确认合并后的实际情感代码、表结构和请求接入点。

## 4. 方案比较

### 4.1 仅增加 DeepSeek 用量统计

优点是风险低，可以快速确认真实命中和 TTFT。缺点是只能看见问题，不能解决动态前缀污染或历史序列不连续。

该方案适合成为第一个可独立验证的交付步骤，但不应成为完整方案。

### 4.2 同时治理缓存边界与情感边界（推荐）

保留稳定人设和 Confirmed 记忆，把每轮变化的陪伴状态放在 Provider 可复用边界之后；同时让后续请求能够复现前一轮真正发送给 Provider 的规范化消息序列。

该方案直接服务 TTFT，并且与情感运行时的正确结构一致。它不会减少情感信息，只改变情感信息在请求中的位置和生命周期。

### 4.3 引入服务端 AI 网关

服务端可以进一步提供前缀感知路由、集中观测、密钥托管和统一成本分析，但会扩大隐私、部署和运维边界。当前阶段不采用；只有本地直连路径获得真实观测后，再单独评估。

## 5. 推荐上下文结构

Provider 可见请求按稳定到动态排列：

```text
stable_app_policy
stable_role
stable_material_rules
stable_tool_definitions
memory_snapshot
---------------- Provider 可复用边界
companion_runtime
temporal_open_loops
summary_bridge
dynamic_memory
retrieval_context
recent_history / canonical history
current_user_message
```

### 5.1 稳定区

稳定区只容纳生命周期明确、不会每轮变化的内容：

- 产品级安全、隐私和陪伴规则。
- 角色卡、人设、世界观、语言风格和稳定边界模式。
- 固定资料规则和稳定工具定义。
- Confirmed / Manual Locked 记忆。
- 受控摘要快照，但只能在 summary frontier 推进且正文实际变化时更新 epoch。

稳定区不得包含当前时间、请求 ID、随机值、当前情绪、临时关系姿态、检索片段、未确认画像或当前用户消息。

### 5.2 动态陪伴区

动态陪伴区保留每轮表达所需的全部实时状态：

- 当前情绪与四维 affect 投影。
- 角色级关系基线和当前 thread/branch overlay 合成的 stance。
- 当前用户情绪观察、memory echo、时间感、OpenLoop 和待修复状态。
- 未经用户确认的画像推断。
- 当前轮最多一个经过仲裁的可选情感话题。

这些内容移出稳定区不代表删除、降权或延迟。它们仍在每次请求中提供给模型，并且必须在相关事件发生的当前轮或下一允许轮次生效。

动态陪伴区通常控制在 120–220 tokens。超出预算时应按明确优先级裁剪低优先级可选话题，不能裁掉 correction、boundary、repair 或当前情绪响应所需信息。

### 5.3 记忆三车道保持不变

- Working：候选、未确认或仍需观察的记忆，不直接进入稳定前缀。
- Confirmed：用户确认或达到稳定准入条件的长期记忆，可以进入 `memory_snapshot`。
- Archive：已归档、失效、撤销或被替代的内容，不进入当前生成上下文。

缓存优化不得创建第四套记忆真相源。稳定快照和动态召回都必须引用现有 claim / event 权威数据，并按 claim ID 去重。

## 6. 情感系统影响分析

### 6.1 正向影响

把实时情绪和关系 stance 放到缓存边界之后，可以避免它们每轮改变 `stablePrefixHash`，同时保持即时表达。稳定人设与确认记忆继续约束模型，因此角色不会因情绪波动而丢失核心身份。

### 6.2 必须防止的错误优化

- 为追求命中率而减少或跳过动态 stance。
- 缓存上一轮情绪文本并在状态变化后继续复用。
- 把关系数值或当前情绪放入 cache key，造成每轮高基数失效。
- 把历史回复结果当作语义答案缓存复用。
- 为分析情绪增加发送前远端模型调用，反而扩大 TTFT。
- 用摘要替代 correction、boundary 或未解决 repair 的即时约束。

### 6.3 情感一致性规则

- 稳定人设决定角色“是谁”；动态 stance 决定角色“此刻怎样回应”。两者不能互相覆盖。
- 关系投影更新不得改变 `stablePrefixHash`，也不得递增 memory epoch。
- sibling branch 的情绪和关系 overlay 永不互见。
- 用户离线时长不降低 trust、affection、security 或关系阶段。
- correction、boundary 和 repair 优先于角色表演、可选话题和缓存收益。
- 情绪观察缺少 evidence、置信度不足或已经过期时，不得注入当前回复。

## 7. 历史连续性设计

DeepSeek 复用的是实际序列化请求的公共前缀，不理解 Pixory 内部的“稳定层”名称。要让命中随连续对话自然增长，下一轮历史必须能够复现上一轮 Provider 真正看到的用户消息和助手消息。

合并后应在以下两种实现中选择最小安全方案：

1. 持久化不可变的 Provider 可见消息 envelope，并在同一 provider/model/prompt version 下复用。
2. 使用版本化、确定性的 prompt compiler，从不可变 generation snapshot 重建完全一致的历史 envelope。

推荐优先复用合并后已有的 immutable conversation artifact / envelope 能力，避免另建平行存储。只有确认现有 artifact 无法表达 Provider 可见输入时，才新增最小字段。

历史连续性必须包含 provider、model、prompt version、branch route、message version 和 generation 参数边界。切换角色、模型、分支、消息版本或用户编辑历史后出现缓存失效属于正确行为，不能为了维持命中而复用旧序列。

不得持久化模型隐藏推理内容用于未来提示。只保存产品原本允许落库并可恢复的 Provider 可见输入、最终可见助手消息及必要 hash 元数据。

## 8. DeepSeek 可观测性

### 8.1 必须记录的时间点

- `sendPressedAt`：用户触发发送。
- `providerRequestStartedAt`：开始向 Provider 发请求。
- `firstStreamEventAt`：收到首个有效 SSE 事件。
- `firstReasoningDeltaAt`：收到首个 reasoning delta（若存在）。
- `firstVisibleContentAt`：用户看到首个正文字符。
- `completedAt`：生成完成或停止。

由此分别计算：

- 本地前置耗时：`providerRequestStartedAt - sendPressedAt`。
- 网络/Provider 首事件耗时：`firstStreamEventAt - providerRequestStartedAt`。
- 用户感知 TTFT：`firstVisibleContentAt - sendPressedAt`。
- reasoning-to-visible gap：`firstVisibleContentAt - firstReasoningDeltaAt`。

### 8.2 必须记录的缓存字段

对 DeepSeek 原生响应解析并归一化：

- prompt tokens。
- completion tokens。
- `prompt_cache_hit_tokens`。
- `prompt_cache_miss_tokens`。
- cached token ratio。
- Provider 是否实际返回缓存字段。
- stable core hash、stable prefix hash、memory epoch。
- history message count、context trimming、turn interval 和 miss reason。

未返回缓存字段时必须记录为 `observed: false`，UI 显示“未观测”或“Provider 未返回”，不能显示为真实的 0 命中。

诊断记录只保存 hash、计数、耗时和版本，不额外复制私人 Prompt 正文。

## 9. 科学验证方案

### 9.1 基线与样本

实施前后使用相同设备、相同 DeepSeek endpoint、相同模型、相同 generation 参数和相同脚本化会话回放。冷启动与连续热会话分开统计，网络异常样本保留但单独标记。

至少分别采集：

- 新线程首轮。
- 同线程连续 10 轮。
- 仅情绪/关系变化的连续 10 轮。
- summary frontier 推进前后。
- 用户编辑 Confirmed 记忆后。
- 切换角色、模型和 branch 后。
- Thinking 开启和关闭两种路径（模型支持时）。

在合并后的实现计划中确定最终样本量。不得用单次手感或单个请求宣布优化成功。

### 9.2 性能门槛

- 不新增发送前远端模型调用。
- Fast Event Observer P95 小于 5ms。
- projection 增量更新 P95 小于 12ms。
- 相同测试条件下，连续热会话用户感知 TTFT P50 目标至少改善 15%。
- TTFT P95 不得回退超过 5%；若 Provider 网络波动导致无法判定，必须扩大样本或报告未验证，不能选择性删除慢样本。
- 本地前置阶段若占主要瓶颈，应单独优化；不能用 Provider 缓存掩盖本地 SQLite 或 prompt 编译问题。

### 9.3 缓存门槛

- 连续十轮只有情绪/关系变化时，`stablePrefixHash` 变化次数为 0。
- 相同稳定输入的序列化字节和 hash 必须确定一致。
- 连续会话的 DeepSeek hit tokens 应随可复用前缀增长；命中率不是硬性产品 KPI，但若没有增长，必须能由可观测字段解释原因。
- summary frontier、Confirmed 记忆、角色、模型、分支或 prompt version 发生真实变化时，允许并应记录预期失效。

### 9.4 人设、记忆与沉浸感门槛

- 相同角色回放集的人设违例率不得高于优化前基线。
- Confirmed 记忆召回、用户纠错和撤销测试不得回退。
- stable snapshot 与 dynamic retrieval 的重复 claim 数为 0。
- 动态 stance 在对应轮次生效，不得因缓存复用滞后一轮。
- correction / boundary 当前轮重复违反率不得上升。
- sibling branch、normal / Personal space 和不同角色之间的状态泄漏为 0。
- 缓存开关关闭时，Prompt 正确性和聊天行为必须保持一致；开关只控制 Provider 缓存元数据或策略。

## 10. 分阶段交付建议

### 阶段 0：合并后重新审计

- 确认最新 `main` 的情感、关系、不可变会话 artifact、Prompt compiler 和数据库结构。
- 对照本文列出已经解决、仍存在和因合并新增的问题。
- 重新定位准确文件、类型和测试命令。
- 检查工作树和现有测试，避免覆盖未合并或用户进行中的修改。

退出条件：形成基于最新代码的事实清单，不依赖本文件中的旧行号。

### 阶段 1：DeepSeek 指标可信化

- 请求 DeepSeek 流式 usage。
- 解析 DeepSeek hit/miss tokens。
- 区分未观测与真实零命中。
- 记录完整 TTFT 分段指标。
- 在会话用量界面展示可信状态，避免伪精确数字。

退出条件：可用真实请求解释 TTFT 和缓存命中，且不会记录 Prompt 正文。

### 阶段 2：稳定/动态陪伴边界

- 从 `memory_snapshot` 移出动态 companion 状态和未确认画像。
- 引入或复用 `companion_runtime` 动态 segment。
- 保持 Confirmed 记忆和稳定角色设置不变。
- 按 claim ID 去重稳定记忆与动态召回。
- 确保情绪/关系 projection version 只进入 generation snapshot 和诊断，不进入 stable hash 或 memory epoch。

退出条件：十轮纯情绪变化不改变 stable hash，情感 stance 仍逐轮生效。

### 阶段 3：Provider 历史连续性

- 审查合并后的 immutable envelope / generation artifact 能力。
- 确保下一轮重建前一轮 Provider 可见消息时保持完全一致。
- 明确编辑、重生成、分支切换和模型切换的失效边界。
- 保持停止、后台恢复和失败重试语义不变。

退出条件：同一连续会话的可复用前缀逐轮增长，变更边界处按设计失效。

### 阶段 4：真实回放与灰度

- 执行冷启动、热会话、长聊、情感变化、记忆修改和分支切换回放。
- 比较 TTFT P50/P95、人设违例、记忆正确性、动态 stance 时效和缓存字段。
- 通过本地/Provider kill switch 支持快速回退缓存策略，不回退 Prompt 正确性修复。

退出条件：达到性能与质量门槛，未验证项和 Provider 波动被明确记录。

## 11. 非目标

- 本阶段不实现服务端 AI 网关。
- 不实现私人陪伴回复的语义答案缓存。
- 不为追求缓存命中重写完整记忆系统。
- 不在缓存工作中顺带完成整套四维情感引擎。
- 不改变角色卡、分支、Personal space 和用户记忆治理的产品语义。
- 不用本地估算 Token 替代 Provider 报告的计费用量。

## 12. 实施前重新确认清单

全部代码合并到 `main` 后，编写实施计划前必须回答：

1. 情感系统哪些模块已经真实接入主聊天请求？
2. 当前动态 stance、关系 projection、时间和 OpenLoop 分别放在哪个 Prompt block？
3. immutable conversation artifact 是否已经保存 Provider 可见 envelope？
4. DeepSeek 当前模型和接口实际返回哪些 usage 字段？
5. 会话用量页面的字段来自 Provider、估算还是缺失值回退？
6. memory epoch 和 stable hash 当前由哪些输入组成？
7. summary frontier、编辑、重生成和分支切换如何影响历史序列？
8. 哪些新增功能尚未进入 `docs/feature-matrix.md`？
9. 最新 `pnpm typecheck`、`pnpm test` 和相关 Android 真机基线是否通过？

完成以上审计并由用户确认更新后的设计后，再编写逐文件、TDD 驱动的实施计划。
