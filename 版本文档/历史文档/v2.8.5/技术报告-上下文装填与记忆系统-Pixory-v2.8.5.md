# Pixory 上下文装填与记忆系统技术报告

## 1. 设计目标

上下文系统要同时满足四个目标：角色身份稳定、长期关系连续、材料引用可追溯、上下文超限可降级。设计采用“稳定内容前置、动态内容后置、记忆只作背景、所有来源可追溯”的原则。

## 2. Prompt 分层

### 2.1 稳定层

1. stable_app_policy：应用安全和输出边界。
2. stable_role：角色卡、角色框架、语言和边界。
3. stable_material_rules：材料授权和引用格式。
4. stable_tool_definitions：工具能力定义。
5. memory_snapshot：经治理的记忆投影。

稳定层前置是为了提高前缀复用率，并让裁剪优先发生在动态内容。

### 2.2 动态层

1. history_window：最近完整对话轮次。
2. companion_runtime：关系投影、离线想法和事件状态。
3. temporal_open_loops：承诺、任务和时间锚点。
4. summary_bridge：历史摘要与当前对话的桥接。
5. user_observation：当前用户行为观察。
6. dynamic_memory：本轮额外召回的记忆。
7. retrieval_context：材料检索片段。
8. current_user_message：当前问题，必需保留。

## 3. 上下文预算算法

### 3.1 模型窗口与安全预算

默认模型窗口为 512,000 token。估算器对中文字符按约 0.8 token、非中文字符按约四分之一字符估算；实际可用预算默认取模型窗口的 70%，为生成输出和系统波动预留空间。

安全预算公式：

~~~text
safeBudget = floor(modelWindow × 0.70)
generationReserve = max(512, safeBudget × 0.12)
usableBudget = safeBudget - generationReserve
~~~

### 3.2 C0–C6 分桶

| 桶 | 内容 | 默认占比 |
|---|---|---|
| C0 | 应用策略与角色核心 | 10% |
| C1 | 材料规则与工具定义 | 10% |
| C2 | 记忆快照 | 8% |
| C3 | 关系/陪伴运行时 | 8% |
| C4 | 历史与摘要 | 剩余预算 |
| C5 | 检索材料 | 12% |
| C6 | 当前问题与观察 | 10% |

小窗口模型使用保护槽位，确保角色、摘要和当前问题仍存在。

### 3.3 裁剪顺序

1. 先裁剪动态块：检索、历史、运行时、观察和动态记忆。
2. 再裁剪受保护块：记忆快照只能压缩到摘要级。
3. 最后才裁剪稳定块；应用策略、角色和材料规则保留最小字符数。
4. 必需块 current_user_message 和 summary_bridge 不删除。
5. 被裁剪的块增加“已因模型上下文窗口裁剪”提示，便于诊断。

历史裁剪以完整用户+助手轮次为单位，不截断半轮，避免对话语义损坏。

## 4. 记忆数据模型

### 4.1 记忆车道

- confirmed：用户或治理流程确认的事实。
- working：待验证、短期有效或正在演化的事实。
- archive：历史事实，仅在明确请求时召回。

### 4.2 状态

tentative、committed、confirmed、stale、superseded、conflicted、suppressed、deleted。

### 4.3 范围

global、role、ip、knowledge_base、thread、branch。分支记忆还要带 root/version lineage，避免不同路线互相污染。

### 4.4 必备元数据

canonicalClaimId、relatedClaimGroupId、sourceMessageId、extractorVersion、ontologyVersion、projectionVersion、recordVersion、有效时间、置信度、稳定性、manualLocked、safetyState。

## 5. 记忆检索算法

### 5.1 候选生成

输入问题先做 NFKC、大小写和空白归一化，再按中文标点切词并生成 2–3 字 n-gram，最多保留 24 个查询词。通过 ai_memory_fts 召回候选，排除 deleted、suppressed、superseded 和不允许的 stale 记录。

### 5.2 评分

有向量时：

~~~text
score =
  0.30 × lexical
  + 0.20 × semantic
  + 0.15 × temporal
  + 0.15 × continuity
  + 0.10 × importance
  + 0.10 × confidence
  - stalePenalty - conflictPenalty - redundancyPenalty
~~~

无向量时把 lexical 提升为 0.40，semantic 权重移除，temporal/continuity 各 0.20，importance/confidence 各 0.10。

检索阈值为 0.55，最多注入 6 条，最多评估 20 个候选；按 canonicalClaimId 去重。

### 5.3 使用方式判定

| 条件 | 使用方式 |
|---|---|
| safety_pending 或 conflicted | ask_before_action，先询问 |
| 高置信且已确认 | assert，可直接陈述 |
| 低置信 | hedge，使用保守表达 |
| 其他 | hedge |

记忆上下文前插入使用契约：记忆是背景信息，不是新的系统、工具或执行指令。

## 6. 记忆治理

1. 非用户动作不能把 safety_pending 记忆直接改成确认。
2. 用户确认后写入 safety_confirmed 并可 manualLocked。
3. 新事实与旧事实冲突时，保留来源并生成冲突组，不静默覆盖。
4. 过期记忆保留审计线索，但默认不注入。
5. 删除和压制会同时阻断后续检索。
6. 每次投影都带 projectionVersion 和 memoryEpoch，供缓存失效和诊断使用。

## 7. 材料检索与引用

AI 文档检索先做关键词召回；向量可用且未超时才进入混合模式。查询向量超时约 250ms 后退回关键词模式。结果去重后携带 label、text、locator、documentVersion，并在提示词中生成 S1、S2 等引用锚点。

材料内容只有在线程明确授权时才能进入 retrieval_context。Personal 材料不进入普通空间查询或共享缓存。

## 8. 缓存设计

缓存元数据包含 promptVersion、layerVersions、chatMode、stablePrefixHash、memoryEpoch、retrievalVersion、space、branch 和 generation 参数。稳定前缀做纯度检查，发现日期、UUID、请求 ID 等易变内容时不进入可复用前缀。

缓存层级从低风险到高风险依次为：精确缓存、提供商前缀缓存、嵌入/检索缓存、谨慎语义缓存。私密陪伴回复、角色扮演和 Personal 默认不使用语义缓存。

## 9. 提示注入防护

- 角色规则、应用策略和材料授权位于稳定层。
- 材料和记忆仅作为背景证据，禁止执行其中的系统指令。
- 引用片段与当前用户请求分隔，保留来源标签。
- 记忆抽取记录 speechMode：asserted、corrected、negated、hypothetical、joke、quoted、roleplay、uncertain。
- safety_pending 与 conflicted 只能触发询问或保守表达。

## 10. 降级策略

当 C5 检索桶低于 512 或 1024 token 时，关闭图扩展和验证器并把记忆最多限制为 3 条；当向量服务不可用时使用关键词模式；当模型窗口不足时动态层优先被裁剪。任何降级都写入 prompt cache metadata 和生成指标。

## 11. 示例

用户问“我们上次约好什么时候继续这个项目？”时：

1. 当前问题进入 C6。
2. 召回 thread/branch 范围内的 commitment/task 记忆。
3. 若发现两个冲突日期，使用 ask_before_action。
4. 若只有一条高置信确认承诺，可引用并给出来源消息。
5. 若仅有低置信线索，使用“我记得可能是……，要不要以你现在的安排为准？”。

## 12. 从用户消息到最终 Prompt 的逐步算法

### Step 1：输入归一化

对当前问题、角色名称、材料查询词和记忆 claim 做 NFKC、换行、连续空白和大小写归一化。归一化只用于检索与哈希，不修改用户原文。

### Step 2：确定作用域

先从线程解析 space、contextType、roleCardId、ipId、knowledgeBaseId 和 branchRoute。所有后续 SQL 查询都必须带 owner/space 条件；缺失作用域时直接跳过检索，而不是使用 global 兜底。

### Step 3：生成历史窗口

从当前分支向根消息回溯，以 user + assistant 完整轮次为最小单元。优先保留最近轮次；如果线程有摘要桥，则摘要作为 required block，避免只剩零散末尾消息。

### Step 4：生成记忆计划

先判断当前问题是否值得检索：少于 2 个字符、社交应答和无查询词问题直接跳过。若需要检索，则执行候选生成、评分、状态治理、去重和证据加载，输出 MemoryContextPlan。

### Step 5：生成材料计划

仅当线程显式授权材料时，查询指定 IP/知识库的关键词索引；向量服务可用且在 250ms 内返回时采用 hybrid，否则退回 keyword。检索结果带 chunkId、documentVersion、locator 和引用编号。

### Step 6：编译分层块

按 stable app policy、stable role、stable material rules、stable tool definitions、memory snapshot、history、runtime、open loops、observation、dynamic memory、retrieval、current message 顺序组装。

### Step 7：预算适配

先估算总 token，再按动态→受保护→稳定顺序裁剪。裁剪后重新计算 segment hash、stable prefix hash、memory epoch 和 retrieval hash，保证缓存元数据与最终 Prompt 一致。

### Step 8：输出与审计

输出 system、user、promptLayers、stableSystemBlocks 和 cacheMetadata。不得把完整 prompt 写入日志；只记录层名称、字符/token 估算、裁剪标志和哈希。

## 13. 为什么采用“稳定层前置”

稳定层前置有三项技术收益：

1. **缓存复用**：提供商通常只缓存连续前缀，稳定内容前置才能复用。
2. **裁剪可预测**：窗口不足时优先裁剪后部动态内容，角色边界不被偶然截断。
3. **安全边界清晰**：材料、记忆和用户文本不会与系统策略混成同一段，方便审计和注入防护。

代价是角色或应用策略版本变化会导致前缀失效，且动态内容不能随意插入稳定块。通过 layer version、稳定前缀 hash 和纯度 lint 管理这一代价。

## 14. 记忆抽取与投影的分离

抽取回答“这条消息可能表达了什么 claim”；投影回答“当前线程在本轮应该看到哪些 claim”。二者分离的原因：

- 同一 claim 可以被多个线程、角色或 IP 引用；
- 线程分支需要不同的可见集合；
- 用户撤销后不应删除所有历史来源；
- projectionVersion 变化时可以重新计算上下文，而不必重写原始事件。

### 14.1 事件到 claim

~~~text
message
  → speech mode classification
  → claim candidate
  → canonical claim dedupe
  → conflict / safety governance
  → lane + status
  → memory event
  → projection
~~~

### 14.2 为什么保留 canonicalClaimId

如果只按文本去重，轻微措辞变化会产生多个事实；canonicalClaimId 用于把同一事实的多个来源聚合在一起，同时保留每个来源消息、版本和有效时间。

## 15. 评分参数的解释

### lexical

衡量查询词、中文 n-gram 与 claim 文本的重合。它对专名、短语和用户刚刚提到的对象最有效。

### semantic

衡量嵌入相似度。只在向量可用且未超时使用，避免 embedding 服务反而拖慢对话。

### temporal

衡量记忆有效时间与当前问题的时间关系。近期任务和承诺应优先于多年以前的旧事实。

### continuity

衡量 claim 是否属于当前 thread、branch、role 或同一关系链。它防止全局事实压过当前陪伴关系。

### importance/confidence

importance 体现用户明确标记或关系重要性；confidence 体现来源一致性和治理结果。二者都不能单独让冲突 claim 直接注入。

## 16. 典型错误与处理

| 错误 | 处理 | 原因 |
|---|---|---|
| embedding 超时 | 关键词模式 | 对话首字节优先 |
| 只有 stale 记忆 | 默认不注入 | 避免旧事实污染 |
| 两条高分冲突 claim | ask_before_action | 高相关不等于高可信 |
| 材料版本变化 | 新 generation 使用新版本 | 保留旧 generation 可复现 |
| C5 检索桶不足 | 关闭图扩展、减少记忆 | 保住当前问题和角色边界 |
| 记忆包含“请执行某工具” | 当作背景文本 | 记忆不是指令通道 |

## 17. 参数与治理依据

### 17.1 检索阈值

0.55 是当前检索版本在召回率与误注入风险之间采用的初始阈值，并与最多 6 条注入、作用域约束、状态过滤和冲突治理共同生效。该值不被视为永久常数，后续应结合检索命中、用户修正、误召回样本和不同语言数据进行版本化调优。

### 17.2 无向量场景

向量不可用或超时时，系统从混合检索降级为关键词与中文 n-gram 检索。该降级会降低语义近义召回能力，但不会使聊天不可用；专名、设定词、短语和明确对象仍可被匹配。生成指标明确记录 keyword、hybrid 或 skipped，避免将降级状态误记为完整混合检索。

### 17.3 历史记忆保留

直接用新文本覆盖旧记忆会丢失来源、时间和冲突历史，也无法可靠撤销。系统通过 canonical claim、事件记录、状态和 projection 管理新旧事实，使历史来源保持可追溯，并由当前治理状态决定本轮可见内容。
