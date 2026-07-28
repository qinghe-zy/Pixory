# 角色日记代码准备包

> 状态：UI、内容、存储、提示词和本地调度通道已确认；本轮不接入云端网关。

## 1. 本轮范围与产品不变量

- 第一轮交付角色日记、离线独白和梦境的共同底座；本次先实现日记的完整数据链路、界面与调度契约。
- 每个物理 space 数据库内，同一 `roleCardId + diaryDate` 只有一篇当前日记。生成时只读取用户当时所在的 `thread + active branch`；跨线程重新生成替换当天 current-version，旧版仅保留撤销历史。该角色的其他 thread 仍可阅读同一当前日记，来源 thread 只用于追溯与重生成。
- 日记不默认进入上下文或记忆。用户在聊天卡片下选择“是”后，才以显式 `role_diary` 标签进入上下文，长期记忆仍走既有提炼规则。
- 模型与 provider 沿用当前会话配置，但日记是独立请求、独立 prompt、独立 token 预算和独立状态机，绝不能进入正常聊天 history。
- 当前主题选择先使用稳定随机：`stableHash(space + roleCardId + diaryDate) % 5`。同一天的重生成、续页和重新打开均不变；后续情绪或角色规则只替换 `resolveDiaryTheme()`，不迁移已有日记。

## 2. 已有素材与设计来源

| 用途 | 已落盘位置 | 约束 |
| --- | --- | --- |
| 聊天页日记卡片背景 | `assets/backgrounds/diary/` | 5 张 `2.6:1` 横幅，艺术字已烘入图片。 |
| 日记阅读页信纸 | `assets/backgrounds/diary-letter/` | 5 张 `1440×2080`、`9:13` JPEG；中央正文安全区保持近白。 |
| 交互原型 | `.superpowers/brainstorm/diary-card-20260728/content/diary-card-preview.html` | 卡片打开独立阅读页、三张可见叠纸、左右手势、当前页离场后回到第三槽位。 |
| 产品规则来源 | `docs/ai-chat-research/companion-inner-life-planning.md` | 触发窗口、当前版本、日记上下文和记忆选择的正式说明。 |

主题映射固定为：

```ts
export const diaryThemeAssets = {
  sage: { card: 'diary-sage-botanical.png', letter: 'diary-letter-sage-botanical.jpg' },
  rainwater: { card: 'diary-rainwater-blue.png', letter: 'diary-letter-rainwater-blue.jpg' },
  rose: { card: 'diary-pressed-rose.png', letter: 'diary-letter-pressed-rose.jpg' },
  lavender: { card: 'diary-lavender-vellum.png', letter: 'diary-letter-lavender-vellum.jpg' },
  celadon: { card: 'diary-celadon-ink.png', letter: 'diary-letter-celadon-ink.jpg' },
} as const;
```

正文字体在创建版本时稳定选择 `LXGW WenKai` 或 `ZCOOL XiaoWei`，并保存 `bodyFontKey`。整篇日记的所有页不得更换字体。

## 3. 正式页面与排版契约

### 聊天页

- 在 `AiChatScreen` 的消息流尾部插入当前 role 对应的已就绪日记卡片；同一 role 的各 thread 展示同一张角色-日期卡片。
- 卡片点击打开独立日记页；如果当前助手气泡仍在流式输出，日记先写库为 `ready_pending_presentation`，等流结束再显示。
- 卡片下只显示低视觉权重的上下文选择行：`是否将该日记纳入上下文？ 是 / 否`。

### 日记阅读页

- 无正文内部滚动。利用 `react-native-gesture-handler` 和 `react-native-reanimated` 只挂载 `current / next / third` 三张纸。
- 在进入页面前完成全文分页、所选主题信纸图片预解码和下一页内容挂载；翻页动画不执行数据库读写或模型调用。
- 分页按正文真实字体测量；完整段落优先，超长段落才在行边界拆开；不搬运、不回拉、不重复。
- 第 1 页顶部是星期和生成时间、左下是“写给今天”；历史条目左下为 `YYYY.MM.DD`。续页顶部 `CONTINUED`，左下精确日期；最后一页仍只保留日期。纸堆下方无白条、无点，仅居中 `N / M`。

### 内心独白时间线

- 在 `AiSessionConfigScreen` 增加“内心独白”入口，进入 `CompanionInnerLifeScreen`。
- 使用现有 `AiLightChip` 视觉语言提供 `日记 / 独白 / 梦境` 筛选；按时间倒序展示卡片。
- 当天使用 `TODAY · HH:mm`；跨日后使用 `YYYY.MM.DD`。

## 4. 数据和服务边界

新增 SQLite 表以 next schema migration 为准：

```txt
companion_diaries
  id, roleCardId, diaryDate, currentVersionId,
  themeKey, bodyFontKey, status, sourceThreadId, sourceBranchRouteJson,
  sourceSnapshotHash, createdAt, updatedAt

companion_diary_versions
  id, diaryId, versionNumber, body, pageLayoutJson,
  generationModelSnapshotJson, sourceMessageIdsJson, sourceSummarySnapshot,
  sourceSnapshotHash, status, createdAt, supersededAt

companion_diary_jobs
  id, roleCardId, diaryDate, triggerKind, scheduledFor,
  sourceThreadId, sourceBranchRouteJson, status, idempotencyKey,
  attemptCount, nextRunAt, errorMessage, createdAt, updatedAt
```

建议新建模块：

```txt
src/ai/diary/diaryTypes.ts
src/ai/diary/diaryRepository.ts
src/ai/diary/diaryThemeService.ts
src/ai/diary/diaryPromptService.ts
src/ai/diary/diaryGenerationService.ts
src/ai/diary/diarySchedulerService.ts
src/ai/diary/diaryPaginationService.ts
src/ai/diary/diaryContextOptInService.ts
src/components/ai/DiaryChatCard.tsx
src/components/ai/DiaryDeckPager.tsx
src/screens/CompanionInnerLifeScreen.tsx
src/screens/DiaryReaderScreen.tsx
```

已有接入点：

```txt
src/database/schema.ts + src/database/db.ts     # migration 与双空间数据库
src/database/repositories/aiThreadRepository.ts # 有效消息、分支和时间戳
src/ai/aiChatService.ts                          # 当前模型解析与 prompt 预算模式
src/ai/aiContextSettings.ts                      # 用户配置的上下文轮数
src/ai/memory/contextCompiler.ts                 # 已确认 memory 注入边界
src/screens/AiChatScreen.tsx                     # 卡片、流结束后的投递与导航
src/screens/AiSessionConfigScreen.tsx            # 内心独白入口
App.tsx                                          # 新路由和回调
src/database/repositories/settingsRepository.ts  # 默认开启的全局日记开关
```

## 5. 日记 prompt 与上下文包

`DiaryPromptInput` 必须独立构建，顺序固定：

1. 角色卡快照、稳定人设和可用世界设定。
2. 当前分支的已有摘要与允许的角色状态。
3. 当天消息包：只取本地 `diaryDate` 内、状态 completed、当前 branch version 的消息，保留时间戳。
4. 当日消息限制为 `min(contextHistoryRoundLimit × 3, remainingDiaryTokenBudget)`；超过后截断最早消息，保留较新的当日消息及当天摘要。
5. 生成指令：第一人称、私密、有角色口吻；通常不超过 300 汉字；不可虚构用户对话、不可泄露模型或系统机制；无聊天日只写角色自洽的独白。

生成请求直接复用 `resolveThreadChatModel()` 的 provider/model 结果，但不写入 `ai_messages`，也不使用正常聊天的 streaming state。

## 6. 调度与可靠性边界

触发窗口与静默规则以 `companion-inner-life-planning.md` 为准。每个判断使用最后一条用户消息或已完成助手消息的较晚时间，并在 SQLite job 中持久化 source snapshot 与幂等 key。所有日期窗口都以 `Asia/Shanghai` 计算，不能随设备当前时区漂移。

“用户长期未打开，进入时日记卡片已经存在”不能依赖 React 页面计时器。Android 可用系统闹钟在应用不运行或设备休眠时触发后续工作，但非精确闹钟会受系统节电策略延迟；精确闹钟需要 Android 的特殊权限。正式实现需采用：

```txt
本地 DiaryJob 状态机
  + Android alarm/worker 触发
  + 冷启动校验与补偿
```

本轮选择纯本地实现：provider key 继续只保留在 SecureStore，日记上下文不上传，系统闹钟和后台 worker 都在设备内运行。首次开启角色日记时，只在 Android 按需请求精确闹钟所需的最小系统授权；拒绝后退回非精确闹钟与冷启动补偿。设备被强制停止、离线、关闭或厂商后台限制时不承诺绝对准时，job 保持待执行并在条件恢复后生成，绝不伪造完成卡片。

## 7. 实施前验收标准

- 同一角色同日跨线程重生成后只有一个 current 日记和一个可见卡片。
- 当天 20 轮聊天在用户设置 50 轮时全部进入日记包；当天 50 轮而设置 20 时最多 60 轮并优先保留后段。
- 日记模型、正文字体、主题在重开、翻页和重生成版本中均遵循持久化值。
- 正文不会重复、不会在翻页时空白或重新布局；正常设备上的首屏、下一页和第三页进入阅读页前已就绪。
- 选择“否”或不操作时，日记不出现在 prompt 与 memory extraction；选择“是”时以 `role_diary` 显式来源进入。
- 关闭“启用角色日记”后取消未执行 jobs，保留历史日记可读。
