# 日记、梦境、时间线卡片与 Android 启动图验收记录

> 日期：2026-08-09
>
> 范围：本轮用户确认的角色日记、角色梦境、聊天流固定锚点与 Android 12+ 启动图。
>
> 原则：每一项必须同时有真实实现入口和可执行验证；仅有界面、占位状态或字符串匹配不能单独视为完成。

## 1. 用户确认需求与实现闭环

| 需求 | 实际行为 | 主要实现 | 自动化证据 |
| --- | --- | --- | --- |
| 日记卡固定在触发消息之后 | 日记版本保存最终冻结来源消息 ID；时间线仅在来源 thread/branch 匹配且锚点消息已加载时，把卡片插到最后来源消息之后。未加载锚点时先隐藏，加载历史后再出现，不回退到列表底部 | `companionArtifactTimelineService.ts`、`AiChatScreen.tsx`、`diaryRepository.ts` | `companion-artifact-timeline-unit.test.cjs` |
| 梦境卡采用同一固定规则 | 梦境保存冻结来源 thread、branch、lineage 和消息 ID；生成中、失败及完成态均按来源锚点恢复，刷新和重新进入不漂移 | `companionArtifactTimelineService.ts`、`dreamRuntimeEvents.ts`、`dreamRepository.ts` | `companion-artifact-timeline-unit.test.cjs`、`companion-dream-repository-integration.test.cjs` |
| 日记手动和自动触发共用真实链路 | 手动确认、夜间自动触发和 Android wake 最终都进入 `prepareAndScheduleDiaryJob`，再由独立运行时执行；聊天页卸载不取消任务。Android receiver 使用短时 `dataSync` 前台服务启动 Headless JS；系统拒绝后台启动时不丢任务，留待前台协调恢复 | `diarySchedulerService.ts`、`diaryGenerationManager.ts`、`diaryRuntimeCoordinator.ts`、`DiaryAlarmService.kt` | `role-diary-scheduler-policy.test.cjs`、`role-diary-visibility-and-chat-entry-policy.test.cjs`、`chat-and-diary-runtime-completeness-policy.test.cjs` |
| 日记每天自动判断 | 北京时间 22:00 起按静默窗口判断；当天无消息但该角色最近真实互动不超过 24 小时，可生成无互动独白；超过 24 小时不回填。手动版本不会阻断当晚自动版本 | `diaryTypes.ts`、`diarySchedulerService.ts` | `role-diary-calendar-policy.test.cjs`、`role-diary-command-intent-policy.test.cjs` |
| 日记 30 轮兜底 | 只从当前采用分支读取 completed 的 user/assistant 完整问答；今日完整轮优先，不足 30 轮再用更早历史补齐。查询按完整轮向后走，较新的失败、生成中、system 或单边 user 消息不会挤掉历史完整轮 | `aiThreadRepository.listSnapshotCandidateMessages`、`buildDiaryConversationSnapshot` | `companion-conversation-snapshot-unit.test.cjs` |
| 日记消息带时间戳且不胡编 | Prompt 将内容拆成“今日直接证据”和“过往关系背景”，每条使用北京时间；无今日完整互动时明确告知模型，禁止把历史写成今天发生、禁止补写用户行为 | `diaryPromptService.ts`、`companionConversationSnapshotService.ts` | `role-diary-prompt-policy.test.cjs` |
| 日记重试内容可审计 | 任务冻结消息版本、角色快照、线程摘要、会话 system prompt、分支路由，并区分完整 job-context hash 与最终有效消息 hash；wake 到期时先解析当前采用分支再冻结真正生成任务 | `diarySnapshotContract.ts`、`diarySchedulerService.ts`、`diaryGenerationService.ts` | `role-diary-prompt-policy.test.cjs`、`role-diary-scheduler-policy.test.cjs` |
| 梦境有消息兜底 | 当前触发完整问答是受保护直接证据；再从同一 adopted branch 的较早完整问答补到最近 20 轮。只含 completed user/assistant，附北京时间；system/tool、未完成消息、未采用版本、兄弟分支和其他空间不进入 | `dreamService.ts`、`buildDreamConversationSnapshot`、`dreamPromptService.ts` | `companion-conversation-snapshot-unit.test.cjs`、`companion-dream-prompt-unit.test.cjs` |
| 梦境每天最多两次 | 限制对象是同一 physical space 内同一角色的自动成功梦境；北京时间每天最多 2 次，跨线程合并，normal/personal 物理隔离。预留保存北京日期，成功提交按实际完成日重新校验，因此午夜前预留、午夜后完成也不能形成当天第三次成功 | `dreamRepository.ts`、`dreamPolicy.ts` | `companion-dream-repository-integration.test.cjs`、`companion-dream-policy-unit.test.cjs` |
| 梦境失败不占冷却 | 进行中只占可释放预留；取消、模型不可用和最终失败释放预留，不增加每日成功数，也不更新 `lastDreamSuccessRound`。只有成功提交 artifact 才开始 50 完整轮冷却 | `dreamWorker.ts`、`dreamRepository.ts` | `companion-dream-repository-integration.test.cjs` |
| 跨日失败可直接重试 | 重试不要求再产生一个聊天轮；配额预留会滚动到新的北京时间日期，并与任务恢复 `pending` 放在同一个 SQLite 事务，任一步失败都会整体回滚，避免崩溃后留下占额但不可执行的任务 | `dreamRepository.reserveDreamQuotaInTransaction`、`retryDreamGeneration` | `companion-dream-repository-integration.test.cjs`、`companion-dream-recovery-unit.test.cjs` |
| 梦境失败重试与取消有响应 | 可重试失败复用原 seed、roll、冻结来源和种子内持久角色快照；来源变化时建立按当前消息冻结的手动替代任务；频率阻断、状态已变化和请求异常均在聊天页显示错误并重新加载卡片。生成中卡片提供“取消”，会中止活动请求、释放预留并刷新持久状态 | `dreamWorker.ts`、`dreamService.ts`、`DreamChatCard.tsx`、`AiChatScreen.tsx` | `companion-dream-recovery-unit.test.cjs`、`companion-dream-repository-integration.test.cjs` |
| 梦境不过度频繁 | 自动成功之间至少相隔 50 个幂等完整问答轮；同一连续场景只有一个 seed 和永久 roll；手动确认绕过自动日限额/冷却但仍幂等 | `dreamPolicy.ts`、`dreamRepository.ts`、`dreamService.ts` | `companion-dream-policy-unit.test.cjs`、`companion-dream-repository-integration.test.cjs` |
| 梦境生成不是空功能 | 候选门禁、结构化分类、持久 roll、独立生成 job、兼容一层代码围栏/短说明但对抽取对象严格校验的解析、最多两次自动重试、取消/晚到结果拦截、阅读页与显式 context opt-in 全部有落库或运行入口 | `src/ai/dream/`、`DreamReaderScreen.tsx`、`DreamDeckPager.tsx` | dream policy/prompt/recovery/repository tests |
| Android 12 启动图控制裁剪并保留外围装饰 | 透明正方形前景把核心气泡和图库、视频、相机、爱心、轨道、星点限制在系统安全区；背景使用一致的 `#4a7bf7`，五档 drawable 密度由同一 master 确定性生成 | `icons/splash_foreground.png`、`scripts/generate-android-splash-assets.cjs`、`app.json` | `android-icon-splash-policy.test.cjs`、Android resource/build 验证 |

## 2. 梦境实际发送给模型的消息

梦境不会把“最近若干条任意消息”直接发给模型。冻结包按以下顺序形成：

1. 当前采用 branch 中与触发有关的 completed 用户消息和 completed 助手回复，能组成完整问答时作为“当前触发证据”并受预算保护。
2. 同一 thread/branch 中更早的 completed 用户—助手完整问答，从新到旧补齐，总计最多 20 轮，作为“过往关系背景”。
3. 每条保留 ID、角色、原文和北京时间戳；模型 prompt 明确历史背景只能帮助理解关系气氛，不能冒充当前事件。
4. 不发送 system/tool、draft、queued、generating、failed、stopped、未采用版本、sibling branch、其他 space、日记/思绪/旧梦境正文。
5. 角色声音在创建 seed 时复制到持久字段 `seed.roleSnapshotJson`；之后即使线程会话配置或全局角色卡被编辑，同一任务及重试仍使用创建时快照。

## 3. 长流程验收路径

### 日记

`应用初始化/回前台 → 每角色选择最新有效会话 → 建立持久 wake → AlarmManager/前台补偿触发 → 重新解析当前 adopted branch → 判断北京时间、静默和 24h 条件 → 冻结 30 完整轮/角色/摘要/system prompt → 独立模型请求 → 事务保存版本和来源 → 运行时事件刷新 → 来源消息后插入卡片 → 阅读/上下文选择`

### 梦境

`完整问答落库 → 幂等角色轮次 → 本地候选/零成本排除 → 场景唯一 seed + 持久 roll/角色快照 → 结构化语义分类 → 带北京日期的原子配额预留 → 冻结 20 完整轮 → 独立生成/结构校验 → 提交前复核 branch、lineage、消息版本、取消状态与实际完成日配额 → 事务提交 artifact/成功计数 → 来源消息后替换卡片 → 阅读/显式 context opt-in`

## 4. 验证结果与环境记录

- 聚焦测试：87/87 通过，覆盖日记、梦境、时间线锚点、后台唤醒和启动图策略。
- 完整测试：981 项，966 通过、15 跳过、0 失败；TypeScript `pnpm typecheck` 与 `git diff --check` 通过。
- Android 资源处理：首次命令在工具等待窗口到时仍继续运行，随后从 Gradle daemon 日志确认 `BUILD SUCCESSFUL in 4m15s`，没有把超时误报成源码失败。
- Android debug APK：从深层 `.worktrees/companion-artifact-fixes` 构建时，Ninja 因 safe-area-context codegen 对象路径超过 Windows 260 字符失败；这是路径环境问题。
- `subst W:` 方案：Expo autolinking 无法从 `W:\android` 向上发现 `W:\package.json`，因此已明确废弃；最终原生构建必须在真正的短物理工作树完成。
- 最终 Android 构建：在真实短物理工作树执行 `gradlew clean`（`BUILD SUCCESSFUL in 1m24s`）和 `gradlew assembleDebug`（`BUILD SUCCESSFUL in 6m39s`，675 个任务）；原始 debug APK 为 100,198,667 bytes，SHA-256 `75B7A992456C3C54A3353559C4BE0E18088B3B779BE2924C7AFF6048A9A7D9FA`，并确认 APK 内含五档 `splashscreen_logo.png`。
- Android 设备验收：没有连接真机；API 35、1080×2400 模拟器可用。已有正式包签名不同，因此未卸载、未清除数据；只在临时工作树给 debug 包添加 `.smoke` 后缀平行安装并冷启动。
- 系统启动屏实测：冷启动帧四周和中心空白区均为精确 RGB `(74,123,247)` / `#4a7bf7`；前景可见内容边界约为 `449×388`，位于屏幕 `x=323..771, y=1003..1390`，核心聊天气泡以及图片、视频、爱心、轨道和星点装饰完整，没有触碰屏幕边缘或被系统遮罩切断。
