# Pixory 诊断与可观测性监测报告

## 1. 目标

监测体系用于回答四类问题：用户是否看到内容、生成是否及时、数据是否正确、异常是否泄露隐私。诊断系统服务于本地问题定位和用户主动反馈，不默认上传聊天正文。

## 2. 事件模型

每个诊断事件至少包含：

- traceId、parentSpanId、事件类别和类型；
- 开始时间、结束时间、duration；
- space、哈希后的 threadId、generationId；
- 请求 ID、应用启动 ID、屏幕/导航/刷新 ID；
- 结构化 payload、采集级别和版本。

线程标识只保存不可逆哈希，避免把业务主键直接写入诊断。

## 3. 隐私规则

### 3.1 禁止字段

API key、auth、cookie、secret、password、base64、prompt、content、reasoning、response、filename、path、URI 等字段默认丢弃。

### 3.2 脱敏规则

对 Bearer、sk- 和常见 API key 模式做正则替换；深度诊断也不允许记录完整提示词、回答、材料片段、恢复密钥或原文件路径。

### 3.3 空间边界

Personal 诊断只记录必要的性能计数和哈希关联，不把 Personal 正文发送到普通空间或共享缓存。用户可以关闭深度采集并清理本地诊断。

## 4. 采样与聚合

窗口采样包含 delta 数、字符数、渲染/布局次数、可见/挂载项、内容和视口高度、滚动状态、帧耗时、内存、裁剪窗口、generation/thread 匹配和异常标记。

窗口聚合计算计数总和、最后值、JS/UI 帧 p95、掉帧数量、内存峰值和线程匹配率。聚合器会识别以下空白屏嫌疑：

1. 有数据但 visible 或 mounted 为零。
2. 内容高度大于零但挂载项为零。
3. 正在生成但 UI commit 年龄达到约 250ms。
4. generation/thread 不匹配导致内容被过滤。

## 5. 指标目录

| 指标 | 单位 | 聚合 | 用途 |
|---|---|---|---|
| chat.firstUiVisibleMs | ms | p50/p95 | 首次可见体验 |
| chat.blankScreenDurationMs | ms | max/p95 | 空白屏定位 |
| chat.visibleItemCount | count | last | 列表是否有内容 |
| provider.firstByteMs | ms | p50/p95 | 提供商响应 |
| database.lockWaitMs | ms | p95 | SQLite 竞争 |
| runtime.memoryUsedMb | MB | max | 内存压力 |
| render.jsFrameP95 | ms | p95 | JS 性能 |
| cache.eligiblePrefixReuseRatio | ratio | average | 缓存可复用性 |
| generation.recoveryOutcome | enum | count | 恢复成功/失败 |
| retrieval.mode | enum | count | keyword/hybrid/skipped |

指标定义包含 schemaVersion、unit、aggregation 和 privacy 级别，便于未来迁移。

## 6. 生成监测

生成指标版本为 2，覆盖：

sendPressed、localPersistence、providerResolve、branch、memory、retrieval、history、promptBuild、requestSent、firstDelta、firstUiPatch、lastDelta、finalPersist、settled。

同时记录 provider/model/chatMode、fastPath、branch/history coverage、retrieval mode/partial/timedOut、memory epoch/projection/scorer/candidate/injected/model calls/cost、stable prefix tokens、prompt tokens、cached tokens、目标 FPS 和设备压力。

禁止记录 prompt text、system text、user text、response text、memory text、retrieved text、material text。

## 7. 保留、导出与清理

- 默认保留 7 天或最多 20,000 条事件。
- 高频窗口表可单独清理，不能阻塞主业务数据库。
- 标准导出包含时间、耗时、状态和计数；深度导出额外包含窗口采样、帧和缓存诊断，但仍遵循字段禁采集规则。
- 用户主动清理时，同时清理高密度窗口和临时诊断文件。

## 8. 告警与分级

| 级别 | 条件示例 | 处理 |
|---|---|---|
| P0 | Personal 越权、备份恢复破坏原文件 | 立即停止发布，保留现场 |
| P1 | 空白屏持续、生成恢复失败率显著升高 | 建立事件，回归最近版本 |
| P2 | p95 延迟、掉帧或锁等待超基线 | 纳入下一修复版本 |
| P3 | 单设备偶发异常 | 收集诊断后观察 |

监测只做事实记录，不把“疑似空白屏”直接判定为用户可见故障；必须结合屏幕状态和用户反馈确认。

## 9. 故障排查 Runbook

1. 按版本、时间和 generationId 查找事件。
2. 先看 firstUiVisible、firstByte、firstUiPatch 和 settled 的时间差。
3. 若空白屏嫌疑成立，检查 visible/mounted、内容高度、布局次数和 threadMatch。
4. 若生成中断，检查 persistence、recovery state、retry/continue 次数和 provider error。
5. 若材料缺失，检查 retrieval mode、scope、documentVersion 和超时标记。
6. 若 Personal 异常，检查 token 失效、数据库关闭和缓存清理事件。
7. 形成最小复现和回归用例后再关闭事件。

## 10. 监测局限

- 当前报告描述的是客户端本地诊断；服务端网关、跨设备聚合和长期趋势仓库尚未立项。
- 真实设备基线仍需补充，不能用开发机平均值代替 Android 设备 p95。
- 诊断导出必须由用户主动触发，默认不向第三方上传。

## 11. 诊断事件命名与关联规则

事件名称按 domain.action.stage 命名，例如 chat.message.persist、provider.first_byte、memory.plan.compiled、media.import.commit。每个事件必须尽量携带：

- traceId：一次用户操作或恢复流程；
- parentSpanId：父步骤；
- generationId：一次模型生成；
- threadHash：不可逆线程哈希；
- appLaunchId、screenId、navigationId、refreshId：定位 UI 生命周期；
- space：normal 或 personal，但不写入 Personal 正文；
- schemaVersion：事件字段版本。

如果某个步骤没有 generationId，例如图片导入，则使用 batchId 或 operationId，不能借用随机请求 ID 代替业务关联。

## 12. 采集层级

### 标准级

记录状态、耗时、计数、错误分类、空间类型和版本号。适合普通用户主动反馈，默认启用。

### 深度级

在标准级基础上增加窗口采样、布局、帧、缓存、预取和数据库等待信息。深度级仍然不包含提示词、回答正文、材料文本、文件名、路径和 URI，只建议在用户复现期间短时开启。

## 13. 诊断数据流水线

~~~text
业务服务
  → 结构化事件
  → 字段白名单
  → 敏感键丢弃
  → 正则脱敏
  → 本地批写
  → 窗口聚合
  → 保留清理
  → 用户主动导出 ZIP
~~~

批写与聊天最终落库不能互相嵌套事务；诊断失败不得阻塞消息、导入、备份或 Personal 锁定。

## 14. 指标计算口径

### 首个 UI 可见

从用户点击发送或页面进入事件开始，到第一个满足内容/骨架可见且非空白状态的 UI commit。不能把导航开始时间直接当作首屏完成。

### 首字节

从 Provider request sent 到收到第一个有效响应字节。连接建立、DNS、TLS 和模型排队可通过 provider span 进一步拆解。

### 空白屏持续时间

从第一次满足 blank-screen suspicion 到恢复可见内容或页面退出的持续时间。若只有一次采样，不报告为持续故障。

### 缓存复用率

eligiblePrefixReuseRatio = 可复用稳定前缀 token / 稳定前缀总 token。它不等于 Provider 实际命中率；实际命中仍以 provider 返回的 cached tokens 为准。

## 15. 告警阈值制定

阈值分为三类：

1. **硬安全阈值**：Personal 越权、敏感字段命中、备份校验失败，立即 P0。
2. **用户体验阈值**：首个 UI、空白屏、掉帧、生成恢复失败，根据设备分位数触发 P1/P2。
3. **趋势阈值**：同版本相对前一版本的 p95、错误率、缓存复用变化，连续多个窗口才升级。

没有足够样本量时只生成 observation，不升级为事故。阈值调整必须写入监测变更记录，不能只在代码里改数字。

## 16. 事故报告模板

~~~text
事件编号：
发现时间（北京时间）：
影响版本：
影响设备/Android 版本：
影响空间：普通 / Personal / 两者
用户可见症状：
首次异常指标：
traceId / generationId / batchId：
复现步骤：
根因假设：
已确认根因：
缓解措施：
修复提交：
回归用例：
剩余风险：
~~~

## 17. 隐私审计方法

1. 对标准和深度导出包执行敏感关键词扫描。
2. 检查压缩包文件名、目录名和 JSON 键是否含 path、filename、prompt、content、secret。
3. 检查 Personal 事件是否能由普通空间查询 API 读取。
4. 检查清理策略是否删除高密度窗口、临时导出和过期事件。
5. 检查异常对象序列化是否绕过字段白名单。

## 18. 诊断设计依据

### 18.1 不采集完整 Prompt

完整 Prompt 可能包含 Personal 内容、原始材料、角色私密设定和敏感配置。诊断使用层名称、版本、token 估算、哈希、裁剪标志、检索状态和时间点定位问题，在保证可复盘性的同时避免默认扩大敏感数据采集范围。需要内容级复现时，应由用户主动提供经过脱敏的最小样本。

### 18.2 诊断旁路原则

诊断系统属于旁路能力，采用独立批写和失败隔离。诊断写入失败不得回滚聊天消息、媒体导入或备份事务，也不得阻断 Personal 锁定；主业务只记录诊断不可用状态并继续按自身故障策略收敛。
